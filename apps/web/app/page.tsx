import { HomeCommandCenter } from "../components/home-command-center";

export default function HomePage() {
  return <>
    <p role="note" style={{ margin: 0, padding: "10px 16px", background: "#fff3cd", color: "#513d08", textAlign: "center" }}>
      미리보기 · 예시 데이터입니다. 집중·완료·계획 변경은 저장되지 않습니다.
    </p>
    <HomeCommandCenter />
  </>;
}
