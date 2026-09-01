import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import type { BookCraft } from "../canon/types";

export function SettingsPage() {
  const s = useStore();
  const c = s.state?.craft;
  const [premise, setPremise] = useState(c?.premise || "");
  const [label, setLabel] = useState(c?.clock_origin_label || "第一天 20:00");
  const [minute, setMinute] = useState(String(c?.clock_origin_minute || 0));
  const [tick, setTick] = useState(String(c?.minutes_per_tick || 1));
  const [format, setFormat] = useState(c?.clock_format || "day_clock");
  const [chapters, setChapters] = useState(c?.chapters || []);
  const [exportDraft, setExportDraft] = useState(c?.export_include_draft !== false);
  const [exportOrder, setExportOrder] = useState(c?.export_order || "story");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setPremise(c?.premise || "");
    setLabel(c?.clock_origin_label || "第一天 20:00");
    setMinute(String(c?.clock_origin_minute || 0));
    setTick(String(c?.minutes_per_tick || 1));
    setFormat(c?.clock_format || "day_clock");
    setChapters(c?.chapters || []);
    setExportDraft(c?.export_include_draft !== false);
    setExportOrder(c?.export_order || "story");
  }, [c?.premise, c?.clock_origin_label, c?.clock_origin_minute, c?.minutes_per_tick, c?.clock_format, c?.export_include_draft, c?.export_order, c?.chapters]);

  const persist = (patch: Partial<BookCraft>) => {
    const next: BookCraft = {
      ...c,
      premise,
      clock_origin_label: label,
      clock_origin_minute: Number(minute) || 0,
      minutes_per_tick: Number(tick) || 1,
      clock_format: format,
      chapters,
      export_include_draft: exportDraft,
      export_order: exportOrder,
      ...patch,
    };
    s.saveCraft(next).then(() => {
      setSaved("已存");
      setTimeout(() => setSaved(""), 1500);
    });
  };

  return (
    <div className="page" data-testid="book-settings">
      <h1>书的设定</h1>
      {saved && <p className="toast-inline">{saved}</p>}
      <section>
        <h2>这本书</h2>
        <p>{s.state?.book}</p>
        <p className="muted">改书名只改显示，目录名不变。目前目录名就是书名。</p>
        <label>主脑 <input value={premise} onChange={(e) => setPremise(e.target.value)} onBlur={() => persist({ premise })} /></label>
        <p className="muted">
          写到第 {s.state?.columns.length || 1} 列
          {s.scenes.length ? ` · 最后一场 ${s.scenes[s.scenes.length - 1]?.intent || ""}` : " · 还没有场"}
        </p>
      </section>
      <section>
        <h2>故事时间</h2>
        <label>起点标签 <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => persist({ clock_origin_label: label })} /></label>
        <label>起点对应分钟 <input value={minute} onChange={(e) => setMinute(e.target.value)} onBlur={() => persist({ clock_origin_minute: Number(minute) || 0 })} /></label>
        <label>一格多少分钟 <input value={tick} onChange={(e) => setTick(e.target.value)} onBlur={() => persist({ minutes_per_tick: Number(tick) || 1 })} /></label>
        <label>显示格式
          <select value={format} onChange={(e) => { setFormat(e.target.value); persist({ clock_format: e.target.value }); }}>
            <option value="day_clock">第几天几点</option>
            <option value="label">只显示标签</option>
            <option value="minutes">显示分钟数</option>
          </select>
        </label>
        <p className="muted">改显示格式只改怎么画钟，不动库里的分钟整数，不算进算出这一刻。</p>
      </section>
      <section>
        <h2>章界与回目</h2>
        {chapters.length === 0 && <p className="muted">还没有回目。进度看法会按每 10 列一段</p>}
        {chapters.map((ch, i) => (
          <div
            key={i}
            className="chap-row"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isNaN(from) || from === i) return;
              const n = [...chapters];
              const [moved] = n.splice(from, 1);
              n.splice(i, 0, moved);
              setChapters(n);
              persist({ chapters: n });
            }}
          >
            <input
              value={ch.title}
              placeholder="回目名"
              onChange={(e) => {
                const n = [...chapters];
                n[i] = { ...n[i], title: e.target.value };
                setChapters(n);
              }}
              onBlur={() => persist({ chapters })}
            />
            <select
              value={ch.start_column}
              onChange={(e) => {
                const n = [...chapters];
                n[i] = { ...n[i], start_column: e.target.value };
                setChapters(n);
                persist({ chapters: n });
              }}
            >
              {(s.state?.columns || []).map((col, idx) => (
                <option key={col.id} value={col.id}>第 {idx + 1} 列</option>
              ))}
            </select>
            <button type="button" onClick={() => {
              const n = chapters.filter((_, j) => j !== i);
              setChapters(n);
              persist({ chapters: n });
            }}>删</button>
          </div>
        ))}
        <button type="button" onClick={() => {
          const n = [...chapters, { title: "新回", start_column: s.state?.columns[0]?.id || "col0" }];
          setChapters(n);
          persist({ chapters: n });
        }}>加一回</button>
      </section>
      <section>
        <h2>导出偏好</h2>
        <label>
          <input type="checkbox" checked={exportDraft} onChange={(e) => { setExportDraft(e.target.checked); persist({ export_include_draft: e.target.checked }); }} />
          默认含草稿，必须标清正史 / 草稿
        </label>
        <label>默认顺序
          <select value={exportOrder} onChange={(e) => { setExportOrder(e.target.value); persist({ export_order: e.target.value }); }}>
            <option value="story">按故事序</option>
            <option value="telling">按读序</option>
          </select>
        </label>
        <p>这份文件改了不会写回正史。要改回来改分场条。</p>
      </section>
      <section>
        <h2>危险区</h2>
        <button type="button" onClick={() => s.state?.book && s.setDelBookOpen(s.state.book)}>删除这本书</button>
      </section>
      <button type="button" onClick={() => s.goBoard()}>回分场条</button>
    </div>
  );
}
