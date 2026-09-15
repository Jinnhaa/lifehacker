import unittest
from datetime import datetime, timezone
from email.message import Message
from urllib.parse import parse_qs

from snowboard_http import (
    CourseIdentity,
    Link,
    SnowboardSession,
    normalize_assignment,
    normalize_academic_schedule,
    normalize_quiz,
    parse_courses,
    parse_quiz_activities,
    select_regular_courses,
)


class FakeResponse:
    def __init__(self, body: str, url: str) -> None:
        self._body = body.encode()
        self._url = url
        self.headers = Message()
        self.headers["Content-Type"] = "text/html; charset=utf-8"

    def read(self) -> bytes:
        return self._body

    def geturl(self) -> str:
        return self._url


class FakeOpener:
    def __init__(self) -> None:
        self.requests = []

    def open(self, request, timeout=0):
        self.requests.append(request)
        if request.data is None:
            return FakeResponse('<form action="/login/index.php" method="post"><input type="hidden" name="logintoken" value="csrf"><input name="username"><input type="password" name="password"></form>', request.full_url)
        fields = parse_qs(request.data.decode())
        if fields != {"logintoken": ["csrf"], "username": ["student"], "password": ["secret"]}:
            raise AssertionError(fields)
        return FakeResponse('<a href="/login/logout.php">Logout</a>', "https://snowboard.sookmyung.ac.kr/my/")


class SnowboardHttpTest(unittest.TestCase):
    def test_login_posts_hidden_token_and_credentials_through_one_session(self):
        opener = FakeOpener()
        session = SnowboardSession("https://snowboard.sookmyung.ac.kr/", opener)
        session.login("student", "secret")
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(opener.requests[1].full_url, "https://snowboard.sookmyung.ac.kr/login/index.php")

    def test_selects_only_configured_current_regular_course_identities(self):
        courses = parse_courses('''
          <div class="course course-type-R"><a href="/course/view.php?id=101"><h4 class="coursename"><span class="badge badge-period" title="2026-08-31 ~ 2026-12-21">진행중</span>Database Systems</h4></a></div>
          <div class="course course-type-CMS_E"><a href="/course/view.php?id=202"><h4 class="coursename"><span class="badge badge-period">진행중</span>법정교육</h4></a></div>
          <div class="course course-type-CMS_E"><a href="/course/view.php?id=303"><h4 class="coursename"><span class="badge badge-period">진행중</span>e-Class</h4></a></div>
        ''', "https://snowboard.sookmyung.ac.kr/")
        selected = select_regular_courses(courses, {"101"})
        self.assertEqual([(course.course_id, course.title) for course in selected], [("101", "Database Systems")])
        self.assertEqual(selected[0].period, "2026-08-31 ~ 2026-12-21")

    def test_normalizes_assignment_detail_machine_timestamp_and_source_status(self):
        course = CourseIdentity("101", "Database Systems", "https://snowboard.sookmyung.ac.kr/course/view.php?id=101")
        link = Link("https://snowboard.sookmyung.ac.kr/mod/assign/view.php?id=9001", "Report", {})
        html = '''
          <h1>Database Report</h1>
          <table>
            <tr><th>Due date</th><td><span data-timestamp="1790107140">display text</span></td></tr>
            <tr><th>Submission status</th><td>Not submitted</td></tr>
          </table>
        '''
        item = normalize_assignment(course, link, html, datetime(2026, 9, 14, tzinfo=timezone.utc), "2026-2")
        self.assertEqual(item["sourceItemId"], "9001")
        self.assertEqual(item["title"], "Database Report")
        self.assertEqual(item["workContextHint"], "Database Systems")
        self.assertEqual(item["rawPayload"]["submissionSourceData"], {"Submission status": "Not submitted"})
        self.assertTrue(str(item["officialDeadline"]).endswith("Z"))

    def test_normalizes_actual_snowboard_assignment_heading_and_korean_deadline(self):
        course = CourseIdentity("101", "Database Systems", "https://snowboard.sookmyung.ac.kr/course/view.php?id=101")
        link = Link("https://snowboard.sookmyung.ac.kr/mod/assign/view.php?id=9002", "index title", {})
        html = '''
          <h1 class="course-title">Database Systems</h1>
          <h2>Normalization Report</h2>
          <table class="generaltable">
            <tr><th>제출 여부</th><td>제출 안 함</td></tr>
            <tr><th>종료 일시</th><td>2026-09-22 23:59</td></tr>
          </table>
        '''
        item = normalize_assignment(course, link, html, datetime(2026, 9, 14, tzinfo=timezone.utc), "2026-2")
        self.assertEqual(item["title"], "Normalization Report")
        self.assertEqual(item["officialDeadline"], "2026-09-22T14:59:00Z")
        self.assertEqual(item["rawPayload"]["submissionSourceData"], {"제출 여부": "제출 안 함"})

    def test_marks_only_authoritative_assignment_submission_as_completed(self):
        course = CourseIdentity("101", "Database Systems", "https://snowboard.sookmyung.ac.kr/course/view.php?id=101")
        link = Link("https://snowboard.sookmyung.ac.kr/mod/assign/view.php?id=9003", "Report", {})
        html = '''<h2>Report</h2><table><tr><th>제출 여부</th><td>제출 완료</td></tr><tr><th>종료 일시</th><td>2026-09-22 23:59</td></tr></table>'''
        item = normalize_assignment(course, link, html, datetime(2026, 9, 14, tzinfo=timezone.utc), "2026-2")
        self.assertEqual(item["status"], "completed")
        self.assertEqual(item["externalType"], "assignment")

    def test_normalizes_quiz_deadline_and_exam_window_from_actual_course_card(self):
        html = '''
          <li id="module-2036323" class="activity quiz modtype_quiz">
            <div><a href="/mod/quiz/view.php?id=2036323"><span class="instancename">온라인 퀴즈 (1회)</span></a>
            <span>기간 제한 없음 ~ 2026-09-21 23:59:00</span></div>
          </li>
          <li id="module-2043640" class="activity quiz modtype_quiz">
            <div><span class="instancename">중간고사 퀴즈</span><span>2026-10-15 13:30:00 ~ 2026-10-15 14:45:00</span></div>
          </li>
        '''
        activities = parse_quiz_activities(html, "https://snowboard.sookmyung.ac.kr/")
        self.assertEqual([activity.module_id for activity in activities], ["2036323", "2043640"])
        course = CourseIdentity("101", "Algorithms", "https://snowboard.sookmyung.ac.kr/course/view.php?id=101")
        quiz = normalize_quiz(course, activities[0], '<div class="quizattempt">바로 퀴즈에 응시</div>', datetime(2026, 9, 15, tzinfo=timezone.utc), "2026-2")
        self.assertIsNotNone(quiz)
        self.assertEqual(quiz["officialDeadline"], "2026-09-21T14:59:00Z")
        self.assertEqual(quiz["status"], "open")
        schedule = normalize_academic_schedule(course, activities[1], datetime(2026, 9, 15, tzinfo=timezone.utc), "2026-2")
        self.assertIsNotNone(schedule)
        self.assertEqual(schedule["start"], "2026-10-15T04:30:00Z")
        self.assertEqual(schedule["end"], "2026-10-15T05:45:00Z")


if __name__ == "__main__":
    unittest.main()
