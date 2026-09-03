import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";

type Progress = {
  lines?: { id: string; name: string; type?: string }[];
  chapters?: string[];
  cells?: { line: string; chapter: string; count: number; beat_id?: string; column_id?: string }[];
  unassigned?: number;
};

export function ProgressLook({ open, embedded }: { open: boolean; embedded?: boolean }) {
  const s = useStore();
  const [progress, setProgress] = useState<Progress | null>(null);
  const craft = s.state?.craft;
  useEffect(() => {
    if (open) api("/api/threads/progress").then((x) => setProgress(x as Progress)).catch(() => setProgress(null));
  }, [open, s.scenes.length]);
  const chapters = progress?.chapters || [];
  const noChap = !craft?.chapters?.length;
  const lines = progress?.lines || s.state?.threads || [];

  return (
    <div data-testid="look-progress" className={embedded ? "" : `look-rail${open ? " show" : ""}`}>
      <button type="button" data-testid="progress-back" onClick={() => s.setLook("时间轴")}>回时间轴</button>
      {noChap && <p className="muted">还没有回目，列按每 10 列一段。去书的设定加回目。</p>}
      <p className="muted">还没贴线（可以不贴） {progress?.unassigned ?? 0} 场。点格跳到该回第一条属于该线的场。不能在这里写下一场。</p>
      <table className="prog-table">
        <thead>
          <tr>
            <th>线</th>
            {chapters.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => (
            <tr key={ln.id}>
              <td>{ln.name}{ln.type === "主线" ? " · 主线" : ""}</td>
              {chapters.map((ch) => {
                const cell = (progress?.cells || []).find((x) => x.line === ln.id && x.chapter === ch);
                return (
                  <td key={ch}>
                    <button
                      type="button"
                      className="ghost"
                      data-testid={cell ? `prog-${ln.name}-${ch}` : undefined}
                      draggable
                      onDragStart={(e) => e.preventDefault()}
                      onClick={() => {
                        if (!cell?.beat_id) return;
                        const sc = s.scenes.find((x) => x.id === cell.beat_id);
                        s.setLook("时间轴");
                        if (cell.column_id) {
                          const idx = (s.state?.columns || []).findIndex((c) => c.id === cell.column_id);
                          if (idx >= 0) s.jumpTooth(idx);
                        }
                        if (sc) s.selectScene(sc.id, sc.draft);
                      }}
                    >{cell?.count ? `${cell.count}` : ""}</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
