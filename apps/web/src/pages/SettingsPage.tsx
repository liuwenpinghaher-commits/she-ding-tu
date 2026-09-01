import { useState } from "react";
import { useStore } from "../state/store";

export function SettingsPage() {
  const s = useStore();
  const c = s.state?.craft;
  const [premise, setPremise] = useState(c?.premise || "");
  const [label, setLabel] = useState(c?.clock_origin_label || "第一天 20:00");
  const [chapters, setChapters] = useState(c?.chapters || []);
  return (
    <div className="page" data-testid="book-settings">
      <h1>书的设定</h1>
      <section>
        <h2>这本书</h2>
        <p>{s.state?.book}</p>
        <label>主脑 <input value={premise} onChange={(e) => setPremise(e.target.value)} onBlur={() => s.saveCraft({ ...c, premise })} /></label>
      </section>
      <section>
        <h2>故事时间</h2>
        <label>起点 <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => s.saveCraft({ ...c, clock_origin_label: label })} /></label>
      </section>
      <section>
        <h2>章界与回目</h2>
        {chapters.length === 0 && <p className="muted">还没有回目。进度看法会按每 10 列一段</p>}
        {chapters.map((ch, i) => (
          <div key={i}>{ch.title} · {ch.start_column}</div>
        ))}
        <button type="button" onClick={() => setChapters([...chapters, { title: "新回", start_column: s.state?.columns[0]?.id || "col0" }])}>加一回</button>
      </section>
      <section>
        <h2>导出偏好</h2>
        <p>默认含草稿，标清正史 / 草稿。改了不会写回正史。</p>
      </section>
      <section>
        <h2>危险区</h2>
        <button type="button" onClick={() => s.state?.book && s.setDelBookOpen(s.state.book)}>删除这本书</button>
      </section>
      <button type="button" onClick={() => s.goBoard()}>回分场条</button>
    </div>
  );
}
