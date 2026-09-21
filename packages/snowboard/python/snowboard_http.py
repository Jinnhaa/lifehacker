#!/usr/bin/env python3
"""Read-only Snowboard assignment collector using only the Python standard library."""

from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Iterable
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
from zoneinfo import ZoneInfo


ASSIGNMENT_PATH = "/mod/assign/view.php"
QUIZ_PATH = "/mod/quiz/view.php"
COURSE_PATH = "/course/view.php"
DUE_LABELS = ("due date", "마감 일시", "종료 일시", "제출 종료 일시", "제출 마감")
STATUS_LABELS = ("submission status", "completion status", "제출 상태", "제출 여부", "완료 상태")
SNOWBOARD_TIMEZONE = ZoneInfo("Asia/Seoul")


def normalized_text(value: str) -> str:
    return " ".join(value.split()).strip()


def query_id(url: str, expected_path: str) -> str | None:
    parsed = urlparse(url)
    if not parsed.path.endswith(expected_path):
        return None
    values = parse_qs(parsed.query).get("id", [])
    return values[0].strip() if values and values[0].strip() else None


class LoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.forms: list[dict[str, object]] = []
        self._current: dict[str, object] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "form":
            self._current = {"action": values.get("action") or "", "method": (values.get("method") or "post").lower(), "inputs": []}
        elif tag == "input" and self._current is not None and values.get("name"):
            inputs = self._current["inputs"]
            assert isinstance(inputs, list)
            inputs.append(values)

    def handle_endtag(self, tag: str) -> None:
        if tag == "form" and self._current is not None:
            self.forms.append(self._current)
            self._current = None

    def login_form(self) -> dict[str, object] | None:
        for form in self.forms:
            inputs = form["inputs"]
            assert isinstance(inputs, list)
            if any(value.get("type", "text").lower() == "password" for value in inputs):
                return form
        return None


@dataclass(frozen=True)
class Link:
    url: str
    text: str
    attrs: dict[str, str]


class LinkParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.links: list[Link] = []
        self._href: str | None = None
        self._attrs: dict[str, str] = {}
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        values = {key: value for key, value in attrs if value is not None}
        self._href = values.get("href")
        self._attrs = values
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            self.links.append(Link(urljoin(self.base_url, self._href), normalized_text("".join(self._text)), self._attrs))
            self._href = None
            self._attrs = {}
            self._text = []


class AssignmentDetailParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title_parts: list[str] = []
        self.activity_title_parts: list[str] = []
        self.rows: list[tuple[list[str], list[str]]] = []
        self._in_h1 = False
        self._in_h2 = False
        self._in_row = False
        self._cell_parts: list[str] | None = None
        self._cells: list[str] = []
        self._timestamps: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "h1":
            self._in_h1 = True
        if tag == "h2":
            self._in_h2 = True
        if tag == "tr":
            self._in_row = True
            self._cells = []
            self._timestamps = []
        if self._in_row and tag in ("th", "td"):
            self._cell_parts = []
        if self._in_row:
            timestamp = values.get("data-timestamp")
            if timestamp:
                self._timestamps.append(timestamp)
            if tag == "time" and values.get("datetime"):
                self._timestamps.append(values["datetime"] or "")

    def handle_data(self, data: str) -> None:
        if self._in_h1:
            self.title_parts.append(data)
        if self._in_h2:
            self.activity_title_parts.append(data)
        if self._cell_parts is not None:
            self._cell_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "h1":
            self._in_h1 = False
        if tag == "h2":
            self._in_h2 = False
        if self._in_row and tag in ("th", "td") and self._cell_parts is not None:
            self._cells.append(normalized_text("".join(self._cell_parts)))
            self._cell_parts = None
        if tag == "tr" and self._in_row:
            self.rows.append((self._cells, self._timestamps))
            self._in_row = False

    @property
    def title(self) -> str | None:
        value = normalized_text("".join(self.activity_title_parts)) or normalized_text("".join(self.title_parts))
        return value or None

    def due_at(self) -> datetime | None:
        for cells, timestamps in self.rows:
            label = cells[0].casefold() if cells else ""
            if any(candidate in label for candidate in DUE_LABELS):
                for value in timestamps:
                    parsed = parse_machine_datetime(value)
                    if parsed is not None:
                        return parsed
                if len(cells) >= 2:
                    parsed = parse_display_datetime(cells[1])
                    if parsed is not None:
                        return parsed
        return None

    def source_status(self) -> dict[str, str]:
        result: dict[str, str] = {}
        for cells, _timestamps in self.rows:
            if len(cells) < 2:
                continue
            label = cells[0].casefold()
            if any(candidate in label for candidate in STATUS_LABELS):
                result[cells[0]] = cells[1]
        return result


def parse_machine_datetime(value: str) -> datetime | None:
    text = value.strip()
    if not text:
        return None
    if re.fullmatch(r"\d{9,12}", text):
        return datetime.fromtimestamp(int(text), tz=timezone.utc)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def parse_display_datetime(value: str) -> datetime | None:
    text = normalized_text(value)
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M"):
        try:
            parsed = datetime.strptime(text, pattern)
        except ValueError:
            continue
        return parsed.replace(tzinfo=SNOWBOARD_TIMEZONE).astimezone(timezone.utc)
    return None


@dataclass(frozen=True)
class CourseIdentity:
    course_id: str
    title: str
    url: str
    course_type: str | None = None
    period: str | None = None


@dataclass(frozen=True)
class QuizActivity:
    module_id: str
    title: str
    url: str | None
    text: str


@dataclass(frozen=True)
class LectureProgress:
    module_id: str
    title: str
    completed: bool
    estimated_minutes: int


class CourseCardParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.courses: list[CourseIdentity] = []
        self._depth = 0
        self._course_type: str | None = None
        self._url: str | None = None
        self._title_parts: list[str] = []
        self._in_title = False
        self._suppressed_title_depth = 0
        self._period: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if self._depth == 0 and tag == "div" and "course" in classes:
            self._depth = 1
            self._course_type = "R" if "course-type-R" in classes else "CMS_E" if "course-type-CMS_E" in classes else None
            self._url = None
            self._title_parts = []
            self._period = None
            return
        if self._depth == 0:
            return
        if tag not in ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"):
            self._depth += 1
        if tag == "a" and query_id(values.get("href") or "", COURSE_PATH):
            self._url = urljoin(self.base_url, values.get("href") or "")
        if tag == "h4" and "coursename" in classes:
            self._in_title = True
        if self._in_title and "badge-period" in classes:
            self._suppressed_title_depth = self._depth
            self._period = values.get("title") or self._period

    def handle_data(self, data: str) -> None:
        if self._in_title and self._suppressed_title_depth == 0:
            self._title_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._depth == 0:
            return
        if self._suppressed_title_depth == self._depth:
            self._suppressed_title_depth = 0
        if tag == "h4" and self._in_title:
            self._in_title = False
        self._depth -= 1
        if self._depth == 0:
            course_id = query_id(self._url or "", COURSE_PATH)
            title = normalized_text("".join(self._title_parts))
            if course_id and self._url and title:
                self.courses.append(CourseIdentity(course_id, title, self._url, self._course_type, self._period))


def parse_courses(html: str, base_url: str) -> list[CourseIdentity]:
    parser = CourseCardParser(base_url)
    parser.feed(html)
    return parser.courses


def parse_course_links(html: str, base_url: str) -> list[CourseIdentity]:
    parser = LinkParser(base_url)
    parser.feed(html)
    by_id: dict[str, CourseIdentity] = {}
    for link in parser.links:
        course_id = link.attrs.get("data-courseid") or query_id(link.url, COURSE_PATH)
        if course_id and link.text:
            by_id.setdefault(course_id, CourseIdentity(course_id, link.text, link.url))
    return list(by_id.values())


def select_regular_courses(courses: Iterable[CourseIdentity], regular_course_ids: set[str]) -> list[CourseIdentity]:
    selected = [course for course in courses if course.course_id in regular_course_ids and course.course_type == "R"]
    found = {course.course_id for course in selected}
    missing = regular_course_ids - found
    if missing:
        raise RuntimeError(f"Configured regular course IDs were not found in Snowboard: {', '.join(sorted(missing))}")
    return selected


def assignment_links(html: str, base_url: str) -> list[Link]:
    parser = LinkParser(base_url)
    parser.feed(html)
    by_id: dict[str, Link] = {}
    for link in parser.links:
        assignment_id = query_id(link.url, ASSIGNMENT_PATH)
        if assignment_id:
            by_id.setdefault(assignment_id, link)
    return list(by_id.values())


class QuizActivityParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.activities: list[QuizActivity] = []
        self._depth = 0
        self._module_id: str | None = None
        self._title_parts: list[str] = []
        self._text_parts: list[str] = []
        self._url: str | None = None
        self._in_title = False
        self._suppressed_title_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if self._depth == 0 and tag == "li" and "activity" in classes and "quiz" in classes:
            raw_id = values.get("id") or ""
            self._module_id = raw_id.removeprefix("module-") if raw_id.startswith("module-") else None
            self._title_parts = []
            self._text_parts = []
            self._url = None
            self._depth = 1
            return
        if self._depth == 0:
            return
        if tag not in ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"):
            self._depth += 1
        if tag == "a" and query_id(values.get("href") or "", QUIZ_PATH):
            self._url = urljoin(self.base_url, values.get("href") or "")
        if tag == "span" and "instancename" in classes:
            self._in_title = True
        if self._in_title and "accesshide" in classes:
            self._suppressed_title_depth = self._depth

    def handle_data(self, data: str) -> None:
        if self._depth:
            self._text_parts.append(data)
        if self._in_title and self._suppressed_title_depth == 0:
            self._title_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._depth == 0:
            return
        if self._suppressed_title_depth == self._depth:
            self._suppressed_title_depth = 0
        if tag == "span" and self._in_title and self._suppressed_title_depth == 0:
            self._in_title = False
        self._depth -= 1
        if self._depth == 0 and self._module_id:
            title = normalized_text("".join(self._title_parts))
            if title:
                self.activities.append(QuizActivity(self._module_id, title, self._url, normalized_text("".join(self._text_parts))))


def parse_quiz_activities(html: str, base_url: str) -> list[QuizActivity]:
    parser = QuizActivityParser(base_url)
    parser.feed(html)
    by_id: dict[str, QuizActivity] = {}
    for activity in parser.activities:
        by_id.setdefault(activity.module_id, activity)
    return list(by_id.values())


class LectureProgressParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.lectures: list[LectureProgress] = []
        self._depth = 0
        self._module_id: str | None = None
        self._title_parts: list[str] = []
        self._title_depth = 0
        self._completed: bool | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if self._depth == 0 and tag == "li" and "activity" in classes and "modtype_xncommons" in classes:
            raw_id = values.get("id") or ""
            self._module_id = raw_id.removeprefix("module-") if raw_id.startswith("module-") else None
            self._title_parts = []
            self._completed = None
            self._depth = 1
            return
        if self._depth == 0:
            return
        if tag not in ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"):
            self._depth += 1
        if tag == "span" and "instancename" in classes:
            self._title_depth = self._depth
        title = normalized_text(values.get("title") or "")
        if "badge-completion-auto-y" in classes or title.casefold().startswith("완료함:"):
            self._completed = True
        elif "badge-completion-auto-n" in classes or title.casefold().startswith("완료하지 못함:"):
            self._completed = False

    def handle_data(self, data: str) -> None:
        if self._depth and self._title_depth:
            self._title_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._depth == 0:
            return
        if tag == "span" and self._title_depth == self._depth:
            self._title_depth = 0
        self._depth -= 1
        if self._depth == 0 and self._module_id and self._completed is not None:
            title = normalized_text("".join(self._title_parts))
            duration = re.search(r"(\d+)\s*분(?:\s*(\d+)\s*초)?", title)
            estimated_minutes = int(duration.group(1)) + (1 if duration.group(2) and int(duration.group(2)) > 0 else 0) if duration else 30
            self.lectures.append(LectureProgress(self._module_id, title, self._completed, estimated_minutes))
            self._module_id = None


def parse_lecture_progress(html: str) -> list[LectureProgress]:
    parser = LectureProgressParser()
    parser.feed(html)
    by_id: dict[str, LectureProgress] = {}
    for lecture in parser.lectures:
        by_id.setdefault(lecture.module_id, lecture)
    return list(by_id.values())


class QuizDetailParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._capture_depth = 0
        self._parts: list[str] = []
        self._row_depth = 0
        self._row_parts: list[str] = []
        self.rows: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = (dict(attrs).get("class") or "").split()
        if tag == "div" and any(value in classes for value in ("quizattempt", "quizattemptsummary")):
            self._capture_depth = 1
        elif self._capture_depth:
            self._capture_depth += 1
        if tag == "tr":
            self._row_depth = 1
            self._row_parts = []
        elif self._row_depth:
            self._row_depth += 1

    def handle_data(self, data: str) -> None:
        if self._capture_depth:
            self._parts.append(data)
        if self._row_depth:
            self._row_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._capture_depth:
            self._capture_depth -= 1
        if self._row_depth:
            self._row_depth -= 1
            if self._row_depth == 0:
                self.rows.append(normalized_text("".join(self._row_parts)))

    def completed(self) -> bool:
        evidence = [normalized_text("".join(self._parts)), *self.rows]
        exact_phrases = ("응시 완료", "시도 완료", "상태 완료됨", "state finished", "status finished")
        return any(any(phrase in value.casefold() for phrase in exact_phrases) for value in evidence)


class SnowboardSession:
    def __init__(self, base_url: str, opener=None) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.opener = opener or build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def get_text(self, path_or_url: str) -> tuple[str, str]:
        url = urljoin(self.base_url, path_or_url)
        response = self.opener.open(Request(url, headers={"User-Agent": "AmberHQ-Snowboard/1.0"}), timeout=30)
        return decode_response(response), response.geturl()

    def login(self, username: str, password: str) -> None:
        html, login_url = self.get_text("login/index.php")
        parser = LoginFormParser()
        parser.feed(html)
        form = parser.login_form()
        if form is None:
            raise RuntimeError("Snowboard login form was not found")
        inputs = form["inputs"]
        assert isinstance(inputs, list)
        fields = {
            value["name"]: value.get("value", "")
            for value in inputs
            if value.get("name") and value.get("type", "text").lower() in ("hidden", "submit")
        }
        username_name = next((value["name"] for value in inputs if value.get("name") and value.get("type", "text").lower() in ("text", "email")), "username")
        password_name = next((value["name"] for value in inputs if value.get("name") and value.get("type", "text").lower() == "password"), "password")
        fields[username_name] = username
        fields[password_name] = password
        action = urljoin(login_url, str(form["action"]) or login_url)
        request = Request(action, data=urlencode(fields).encode("utf-8"), headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AmberHQ-Snowboard/1.0"})
        response = self.opener.open(request, timeout=30)
        result = decode_response(response)
        verification = LoginFormParser()
        verification.feed(result)
        if verification.login_form() is not None or "loginerrors" in result.casefold():
            raise RuntimeError("Snowboard authentication failed")


def decode_response(response) -> str:
    content_type = response.headers.get_content_charset() if getattr(response, "headers", None) else None
    return response.read().decode(content_type or "utf-8", errors="replace")


def normalize_assignment(course: CourseIdentity, link: Link, detail_html: str, observed_at: datetime, current_term: str) -> dict[str, object]:
    assignment_id = query_id(link.url, ASSIGNMENT_PATH)
    if assignment_id is None:
        raise ValueError("Assignment link has no stable id")
    parser = AssignmentDetailParser()
    parser.feed(detail_html)
    due_at = parser.due_at()
    source_status = parser.source_status()
    completed = assignment_completed(source_status)
    title = parser.title or link.text
    if not title:
        raise ValueError(f"Assignment {assignment_id} has no title")
    version_payload = {"title": title, "officialDeadline": due_at.isoformat() if due_at else None, "sourceStatus": source_status}
    source_version = hashlib.sha256(json.dumps(version_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {
        "source": "snowboard",
        "externalType": "assignment",
        "sourceItemId": assignment_id,
        "sourceVersion": source_version,
        "sourceUrl": link.url,
        "observedAt": observed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "title": title,
        "officialDeadline": due_at.isoformat().replace("+00:00", "Z") if due_at else None,
        "workContextHint": course.title,
        "objectiveHint": None,
        "status": "completed" if completed else "open",
        "taskSemantics": "clear",
        "rawPayload": {
            "courseId": course.course_id,
            "courseTitle": course.title,
            "currentTerm": current_term,
            "submissionSourceData": source_status,
            "sourceUrl": link.url,
        },
    }


def assignment_completed(source_status: dict[str, str]) -> bool:
    completed_values = ("제출 완료", "submitted for grading", "submitted")
    return any(normalized_text(value).casefold() in completed_values for value in source_status.values())


def activity_datetimes(value: str) -> list[datetime]:
    matches = re.findall(r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?", value)
    return [parsed for match in matches if (parsed := parse_display_datetime(match)) is not None]


def normalize_quiz(course: CourseIdentity, activity: QuizActivity, detail_html: str | None, observed_at: datetime, current_term: str) -> dict[str, object] | None:
    dates = activity_datetimes(activity.text)
    if not dates:
        return None
    detail = QuizDetailParser()
    if detail_html is not None:
        detail.feed(detail_html)
    completed = detail.completed()
    official_deadline = dates[-1]
    source_status = {"completion": "completed" if completed else "open"}
    version_payload = {"title": activity.title, "officialDeadline": official_deadline.isoformat(), "sourceStatus": source_status}
    source_url = activity.url or f"{course.url}#module-{activity.module_id}"
    return {
        "source": "snowboard",
        "externalType": "quiz",
        "sourceItemId": activity.module_id,
        "sourceVersion": hashlib.sha256(json.dumps(version_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
        "sourceUrl": source_url,
        "observedAt": observed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "title": activity.title,
        "officialDeadline": official_deadline.isoformat().replace("+00:00", "Z"),
        "workContextHint": course.title,
        "objectiveHint": None,
        "status": "completed" if completed else "open",
        "taskSemantics": "clear",
        "rawPayload": {
            "itemType": "quiz",
            "courseId": course.course_id,
            "courseTitle": course.title,
            "currentTerm": current_term,
            "completionSourceData": source_status,
            "sourceUrl": source_url,
        },
    }


def normalize_academic_schedule(course: CourseIdentity, activity: QuizActivity, observed_at: datetime, current_term: str) -> dict[str, object] | None:
    title = activity.title.casefold()
    if not any(value in title for value in ("중간고사", "기말고사", "midterm", "final exam")):
        return None
    dates = activity_datetimes(activity.text)
    if len(dates) < 2:
        return None
    start, end = dates[-2], dates[-1]
    version_payload = {"title": activity.title, "start": start.isoformat(), "end": end.isoformat()}
    source_url = activity.url or f"{course.url}#module-{activity.module_id}"
    return {
        "source": "snowboard",
        "externalType": "academic_schedule",
        "externalId": activity.module_id,
        "externalVersion": hashlib.sha256(json.dumps(version_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
        "sourceUrl": source_url,
        "observedAt": observed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "title": activity.title,
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "timeZone": "Asia/Seoul",
        "courseId": course.course_id,
        "courseTitle": course.title,
        "currentTerm": current_term,
    }


def current_regular_courses(session: SnowboardSession, regular_course_ids: set[str]) -> list[CourseIdentity]:
    dashboard, _ = session.get_text("")
    return select_regular_courses(parse_courses(dashboard, session.base_url), regular_course_ids)


def collect_assignments(session: SnowboardSession, regular_course_ids: set[str], current_term: str, observed_at: datetime) -> list[dict[str, object]]:
    courses = current_regular_courses(session, regular_course_ids)
    course_by_id = {course.course_id: course for course in courses}
    upcoming, _ = session.get_text("calendar/view.php?view=upcoming")
    candidates: dict[str, tuple[CourseIdentity, Link, str | None]] = {}
    for course in courses:
        index_html, _ = session.get_text(f"mod/assign/index.php?id={course.course_id}")
        for link in assignment_links(index_html, session.base_url):
            assignment_id = query_id(link.url, ASSIGNMENT_PATH)
            if assignment_id:
                candidates.setdefault(assignment_id, (course, link, None))
    for link in assignment_links(upcoming, session.base_url):
        assignment_id = query_id(link.url, ASSIGNMENT_PATH)
        if assignment_id is None or assignment_id in candidates:
            continue
        detail, _ = session.get_text(link.url)
        detail_courses = parse_course_links(detail, session.base_url)
        course = next((course_by_id[value.course_id] for value in detail_courses if value.course_id in course_by_id), None)
        if course is not None:
            candidates[assignment_id] = (course, link, detail)
    results: list[dict[str, object]] = []
    for course, link, prefetched_detail in candidates.values():
        detail = prefetched_detail if prefetched_detail is not None else session.get_text(link.url)[0]
        results.append(normalize_assignment(course, link, detail, observed_at, current_term))
    for course in courses:
        course_html, _ = session.get_text(course.url)
        for activity in parse_quiz_activities(course_html, session.base_url):
            detail = session.get_text(activity.url)[0] if activity.url is not None else None
            quiz = normalize_quiz(course, activity, detail, observed_at, current_term)
            if quiz is not None:
                results.append(quiz)
    return results


def collect_academic_schedules(session: SnowboardSession, regular_course_ids: set[str], current_term: str, observed_at: datetime) -> list[dict[str, object]]:
    schedules: list[dict[str, object]] = []
    for course in current_regular_courses(session, regular_course_ids):
        course_html, _ = session.get_text(course.url)
        for activity in parse_quiz_activities(course_html, session.base_url):
            schedule = normalize_academic_schedule(course, activity, observed_at, current_term)
            if schedule is not None:
                schedules.append(schedule)
    return schedules


def collect_course_progress(session: SnowboardSession, regular_course_ids: set[str], observed_at: datetime) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for course in current_regular_courses(session, regular_course_ids):
        course_html, _ = session.get_text(course.url)
        lectures = parse_lecture_progress(course_html)
        remaining = [lecture for lecture in lectures if not lecture.completed]
        result.append({
            "courseId": course.course_id,
            "courseTitle": course.title,
            "completedLectureCount": sum(1 for lecture in lectures if lecture.completed),
            "remainingLectureCount": len(remaining),
            "remainingLectureMinutes": sum(lecture.estimated_minutes for lecture in remaining),
            "observedAt": observed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
    return result


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect read-only Snowboard assignments as canonical intake JSON")
    parser.add_argument("--base-url", default="https://snowboard.sookmyung.ac.kr/")
    parser.add_argument("--current-term", required=True)
    parser.add_argument("--regular-course-ids", required=True)
    parser.add_argument("--discover-courses", action="store_true")
    parser.add_argument("--discover-academic-schedules", action="store_true")
    parser.add_argument("--discover-course-progress", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    username = os.environ.get("SNOWBOARD_USERNAME", "").strip()
    password = os.environ.get("SNOWBOARD_PASSWORD", "")
    course_ids = {value.strip() for value in args.regular_course_ids.split(",") if value.strip()}
    if not username or not password:
        raise RuntimeError("SNOWBOARD_USERNAME and SNOWBOARD_PASSWORD are required")
    if not course_ids:
        raise RuntimeError("At least one regular Snowboard course ID is required")
    session = SnowboardSession(args.base_url)
    session.login(username, password)
    if args.discover_courses:
        dashboard, _ = session.get_text("")
        courses = select_regular_courses(parse_courses(dashboard, session.base_url), course_ids)
        json.dump([
            {
                "courseId": course.course_id,
                "title": course.title,
                "url": course.url,
                "courseType": course.course_type,
                "period": course.period,
            }
            for course in courses
        ], sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if args.discover_academic_schedules:
        schedules = collect_academic_schedules(session, course_ids, args.current_term, datetime.now(timezone.utc))
        json.dump(schedules, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if args.discover_course_progress:
        progress = collect_course_progress(session, course_ids, datetime.now(timezone.utc))
        json.dump(progress, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    items = collect_assignments(session, course_ids, args.current_term, datetime.now(timezone.utc))
    json.dump(items, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as error:
        print(f"Snowboard intake failed: {error}", file=sys.stderr)
        raise SystemExit(1)
