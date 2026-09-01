import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { formatClock } from "../lenses/window";
import { Whiteboard } from "./Whiteboard";

export function LookRail() {
  const s = useStore();
  const look = s.look;
  const cols = s.state?.columns || [];
  const craft = s.state?.craft;
  const [occ, setOcc] = useState<{
    columns?: { id: string }[];
    cells?: { name: string; column: string; present?: boolean; draft?: boolean }[];
  } | null>(null);
  const [progress, setProgress] = useState<unknown>(null);
  const [track, setTrack] = useState<unknown>(null);

  useEffect(() => {
    if (look === "出场") {
      api("/api/occupancy").then((x) => setOcc(x as typeof occ)).catch(() => setOcc(null));
    }
    if (look === "进度") {
      api("/api/threads/progress").then(setProgress).catch(() => setProgress(null));
    }
    if (look === "轨迹" && s.line) {
      const t = (s.state?.threads || []).find((x) => x.name === s.line);
      if (t) api(`/api/threads/${t.id}/track`).then(setTrack).catch(() => setTrack(null));
    }
  }, [look, s.line, s.state?.threads]);

  return (
    <>
      <div id="timeline" data-testid="timeline" className={`look-rail${look === "时间轴" ? " show" : ""}`}>
        <button type="button" data-testid="tl-back" onClick={() => s.setLook(null)}>收起</button>
        <div>时间轴 · 分场条仍在</div>
        <div data-testid="tl-span">
        {cols.map((c) => {
          const has = s.scenes.some((sc) => sc.column_id === c.id);
          return (
            <div
              key={c.id}
              onClick={() => { const sc = s.scenes.find((x) => x.column_id === c.id); if (sc) { s.selectScene(sc.id, sc.draft); s.setLook(null); } }}
              onDragStart={(e) => e.preventDefault()}
            >
              第 {cols.indexOf(c) + 1} 列 {formatClock(c.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute)}
              {has ? "" : " 没有戏"}
            </div>
          );
        })}
        </div>
        <p className="muted">拖条改钟去分场条拖列，确认变更后才生效。</p>
      </div>
      <div id="table-view" data-testid="table-view" className={`look-rail${look === "总表" ? " show" : ""}`}>
        <button type="button" data-testid="table-back" onClick={() => s.setLook(null)}>收起</button>
        <table>
          <thead><tr><th>场</th><th>状态</th></tr></thead>
          <tbody data-testid="table-body">
            {s.scenes.map((sc) => (
              <tr key={sc.id} onClick={() => { s.selectScene(sc.id, sc.draft); s.setLook(null); }}>
                <td>{sc.intent}</td>
                <td>{sc.draft ? "草稿" : "正史"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-testid="look-progress" className={`look-rail${look === "进度" ? " show" : ""}`}>
        <button type="button" data-testid="progress-back" onClick={() => s.setLook(null)}>收起</button>
        <pre>{JSON.stringify(progress, null, 2)}</pre>
      </div>
      <div data-testid="look-track" className={`look-rail${look === "轨迹" ? " show" : ""}`}>
        <button type="button" onClick={() => s.setLook(null)}>收起</button>
        <pre>{JSON.stringify(track, null, 2)}</pre>
      </div>
      <div data-testid="flyout" className={`look-rail${look === "出场" ? " show" : ""}`}>
        <button type="button" data-testid="flyout-close" onClick={() => s.setLook(null)}>收起</button>
        <p className="muted">改在场回分场条拖标记</p>
        {(occ?.columns || []).length > 0 && Array.from(new Set((occ?.cells || []).map((c) => c.name))).map((name) => (
          <div key={name}>
            {name}
            {(occ?.columns || []).map((col, i) => {
              const cell = (occ?.cells || []).find((x) => x.name === name && x.column === col.id);
              const on = !!(cell?.present || cell?.draft);
              return (
                <button
                  key={col.id}
                  type="button"
                  data-testid={`occ-${name}-col${i}`}
                  onClick={() => { s.setLook(null); s.jumpTooth(i); }}
                >{on ? "●" : "○"}</button>
              );
            })}
          </div>
        ))}
      </div>
      <div data-testid="look-relations-panel" className={`look-rail${look === "关系" ? " show" : ""}`}>
        <button type="button" onClick={() => s.setLook(null)}>收起</button>
        <p>关系图只读。拖边改正史：改设定关系去档案页，改戏里发生的去那一场。</p>
      </div>
      <Whiteboard open={look === "白板"} />
    </>
  );
}
