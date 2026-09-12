import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { formatClock } from "../lenses/window";
import { KIND_LABEL } from "../pages/f10";

type Occ = {
  columns?: { id: string }[];
  entities?: { id: string; name: string; kind: string }[];
  cells?: { name: string; kind?: string; column: string; present?: boolean; draft?: boolean }[];
};

export function OccupancyLook({ open, embedded }: { open: boolean; embedded?: boolean }) {
  const s = useStore();
  const [occ, setOcc] = useState<Occ | null>(null);
  const [kind, setKind] = useState("");
  const cols = s.state?.columns || [];
  const craft = s.state?.craft;
  useEffect(() => {
    if (open) api("/api/occupancy").then((x) => setOcc(x as Occ)).catch(() => setOcc(null));
  }, [open, s.scenes.length]);

  const names = Array.from(new Set((occ?.cells || []).map((c) => c.name)));
  const entities = occ?.entities || names.map((name) => ({
    id: name, name, kind: (occ?.cells || []).find((c) => c.name === name)?.kind || "person",
  }));
  const groups = ["person", "place", "thing", "faction", "promise", "rule"];
  const shown = entities.filter((e) => !kind || e.kind === kind);
  const colIds = occ?.columns?.length ? occ.columns.map((c) => c.id) : cols.map((c) => c.id);

  return (
    <div data-testid="flyout" className={embedded ? "" : `look-rail${open ? " show" : ""}`}>
      {!embedded && <button type="button" data-testid="flyout-close" onClick={() => s.setLook("时间轴")}>收起</button>}
      {embedded && <button type="button" data-testid="flyout-close" onClick={() => s.setLook("分场条")}>回分场条</button>}
      <p className="muted">改在场回分场条拖标记，或去关系格点。格上不画逻辑线色。</p>
      {entities.length === 0 && <p>先建人物或地点</p>}
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">全部类</option>
        {groups.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <div className="occ-matrix" data-testid="occ-matrix">
        <div className="occ-head">
          <span />
          {colIds.map((id, i) => {
            const col = cols.find((c) => c.id === id);
            const ellipsis = s.scenes.some((sc) => sc.column_id === id && sc.kind === "ellipsis");
            return (
              <span key={id} className={ellipsis ? "ellipsis" : ""}>
                第 {i + 1} 列
                <br />
                <span className="muted">{col ? formatClock(col.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format) : ""}</span>
              </span>
            );
          })}
        </div>
        {shown.map((e) => (
          <div key={e.id} className="occ-row">
            <span><span className={`kind-dot ${e.kind}`} /> {e.name}</span>
            {colIds.map((id, i) => {
              const cell = (occ?.cells || []).find((x) => x.name === e.name && x.column === id);
              const on = !!(cell?.present);
              const draft = !!(cell?.draft);
              const mentioned = !on && !draft && s.scenes.some((sc) => {
                if (sc.column_id !== id) return false;
                const blob = `${sc.intent || ""}${sc.do_text || ""}${sc.say_text || ""}${sc.think_text || ""}`;
                return blob.includes(e.name);
              });
              const label = on ? "在场" : draft ? "草稿在场" : mentioned ? "只被提到" : "不在场";
              return (
                <button
                  key={id}
                  type="button"
                  className={`occ-cell${on ? " solid" : draft || mentioned ? " hollow" : ""}`}
                  data-testid={`occ-${e.name}-col${i}`}
                  title={label}
                  onClick={() => {
                    const here = s.scenes.find((sc) => sc.column_id === id);
                    const idx = cols.findIndex((c) => c.id === id);
                    if (!embedded) s.setLook("时间轴");
                    s.jumpTooth(idx >= 0 ? idx : i);
                    if (here) s.selectScene(here.id, here.draft);
                  }}
                >{on ? "●" : draft || mentioned ? "○" : ""}</button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
