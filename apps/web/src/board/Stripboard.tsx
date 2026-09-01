import { useStore } from "../state/store";
import { isOnLine, primaryThread, threadColor, UNLINED } from "../lenses/threads";
import { formatClock, windowSlice } from "../lenses/window";
import type { SceneCard } from "../canon/types";

function toothClass(
  col: { id: string; clock_from: number; clock_to: number },
  scenes: SceneCard[],
  promises: { status?: string; deadline_clock?: number | null }[],
): string {
  const here = scenes.filter((s) => s.column_id === col.id);
  const due = promises.some((p) => {
    const d = p.deadline_clock;
    if (d == null) return false;
    if (p.status && p.status !== "open") return false;
    return d >= col.clock_from && d <= col.clock_to;
  });
  let cls = "tooth";
  if (!here.length) cls += " empty";
  else if (here.some((s) => s.kind === "ellipsis")) cls += " ellipsis";
  else if (here.some((s) => !s.draft)) cls += " canon";
  else cls += " draft";
  if (due) cls += " debt";
  return cls;
}

export function Stripboard() {
  const s = useStore();
  const cols = s.state?.columns || [];
  const start = s.state?.window_start || 0;
  const n = s.state?.n || 1;
  const visible = windowSlice(cols, start, n);
  const catalog = s.state?.threads || [];
  const line = s.line;
  const density = n;
  const craft = s.state?.craft;
  const warnings = s.state?.warnings || [];
  const coverage = s.state?.coverage || [];

  return (
    <div className="board-wrap">
      {s.q.line && !s.scenes.some((sc) => isOnLine(sc, s.q.line, catalog) && visible.some((c) => c.id === sc.column_id) && !isThin(sc, s.q.line, catalog)) && (
        <div className="filter-banner" data-testid="filter-banner">这条线上的场不在本页这几列。‹ › 或点细条跳到最近一场。</div>
      )}
      <div id="minimap" className="minimap" data-testid="minimap">
        <span data-testid="mini-chapters">{(craft?.chapters || []).map((c) => c.title).join(" ")}</span>
        {cols.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`${toothClass(c, s.scenes, s.state?.promises || [])}${i >= start && i < start + n ? " mini-window" : ""}`}
            data-testid={`tooth-${i}`}
            onClick={() => s.jumpTooth(i)}
          />
        ))}
        <span data-testid="mini-window" className="mini-window" aria-hidden="false" />
      </div>
      <div id="ruler" className="ruler" data-testid="ruler">
        {visible.map((c, i) => {
          const cov = coverage.find((x) => x.column_id === c.id);
          return (
            <div
              key={c.id}
              className="ruler-col"
              data-testid={`ruler-col-${start + i}`}
              onClick={() => s.setSidebar(`这一列故事时间 t=${c.clock_from}–${c.clock_to}`)}
            >
              <div>第 {start + i + 1} 列</div>
              <div className="muted">{formatClock(c.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute)}</div>
              <span data-testid={`track-${c.id}-person`} className={`track-dot${cov?.person ? " on" : ""}`} />
              <span data-testid={`track-${c.id}-place`} className={`track-dot${cov?.place ? " on" : ""}`} />
            </div>
          );
        })}
      </div>
      <div id="cols" className="stripboard" data-testid="stripboard">
        {visible.map((c, i) => {
          const here = s.scenes.filter((sc) => sc.column_id === c.id);
          return (
            <div key={c.id} className="col" data-col-id={c.id} data-testid={i === 0 ? "column-0" : `column-${start + i}`}>
              {here.map((sc) => {
                const thin = isThin(sc, line, catalog);
                const warn = warnings.find((w) => w.beat_id === sc.id);
                const th = primaryThread(sc, catalog);
                return (
                  <article
                    key={sc.id}
                    className={`card ${sc.draft ? "draft" : "canon"}${sc.kind === "ellipsis" ? " ellipsis" : ""}${thin ? " thin" : ""}${s.selectedScene?.id === sc.id ? " selected" : ""}`}
                    data-testid={sc.draft ? `draft-${sc.id}` : `card-${sc.id}`}
                    onClick={() => s.selectScene(sc.id, sc.draft)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      if (id) s.addPresence(id, sc.draft ? sc.id : undefined);
                    }}
                  >
                    <span className="band" style={{ background: th ? threadColor(th) : UNLINED }} />
                    {!thin && (
                      <>
                        <div data-testid="card-title">{sc.title && sc.title !== "下一场" ? sc.title : "未名场"}</div>
                        <div>{sc.intent}</div>
                        {density <= 4 && warn?.code === "empty_value_shift" && <div data-testid="unwritten-shift">未写转折</div>}
                        {density <= 2 && sc.do_text && <div data-testid="card-do">{sc.do_text}</div>}
                        {density <= 2 && sc.say_text && <div data-testid="card-say">{sc.say_text}</div>}
                        {density <= 2 && sc.think_text && <div data-testid="card-think">{sc.think_text}</div>}
                        {density >= 5 && warn && <span data-testid="warn-dot">·</span>}
                        <div>
                          {sc.presences.map((p) => {
                            const label = (s.state?.all_entities || s.state?.entities || []).find((e) => e.id === p.entity_id || e.name === p.entity_id)?.name || p.entity_id;
                            return <span key={p.entity_id} className="chip" data-testid={`chip-${label}`}>{label}</span>;
                          })}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
              <div
                className="col-handle"
                data-testid={`col-handle-${i}`}
                onMouseDown={(ev) => startDrag(ev, c, s.invade)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isThin(sc: SceneCard, line: string | null, catalog: import("../canon/types").StoryThread[]): boolean {
  if (!line) return false;
  return !isOnLine(sc, line, catalog);
}

function startDrag(
  ev: React.MouseEvent,
  col: { id: string; clock_from: number; clock_to: number },
  invade: (id: string, to: number) => void,
) {
  ev.preventDefault();
  ev.stopPropagation();
  const startX = ev.clientX;
  const oldTo = col.clock_to;
  const dur = Math.max(1, col.clock_to - col.clock_from);
  const colEl = document.querySelector(`.col[data-col-id="${col.id}"]`);
  const w = colEl?.getBoundingClientRect().width || 160;
  const handle = ev.currentTarget as HTMLElement;
  const onMove = (e: MouseEvent) => {
    handle.style.transform = `translateX(${e.clientX - startX}px)`;
  };
  const onUp = (e: MouseEvent) => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    handle.style.transform = "";
    const dx = e.clientX - startX;
    if (Math.abs(dx) < 4) return;
    const newTo = Math.round(oldTo + (dx / w) * dur);
    invade(col.id, newTo);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
