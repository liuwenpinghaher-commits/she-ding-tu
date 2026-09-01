import { useRef, useState } from "react";
import { useStore } from "../state/store";
import {
  bandThread,
  extraCount,
  hoverLines,
  isPaused,
  isThinCard,
  threadColor,
  threadSpan,
} from "../lenses/threads";
import { formatClock, windowSlice } from "../lenses/window";
import type { SceneCard, StoryThread } from "../canon/types";

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
  const who = s.q.who;
  const ents = s.state?.all_entities || s.state?.entities || [];
  const density = n;
  const craft = s.state?.craft;
  const warnings = s.state?.warnings || [];
  const coverage = s.state?.coverage || [];
  const visibleFull = s.scenes.filter(
    (sc) => visible.some((c) => c.id === sc.column_id) && !isThinCard(sc, line, who, catalog, ents),
  );
  const showBanner = !!s.q.line && visibleFull.length === 0 && s.scenes.some((sc) => visible.some((c) => c.id === sc.column_id));
  const [hover, setHover] = useState<number | null>(null);
  const chapStarts = new Set((craft?.chapters || []).map((ch) => ch.start_column));
  const winDrag = useRef<{ i: number; start: number; x: number; moved: boolean } | null>(null);

  return (
    <div className="board-wrap">
      {showBanner && (
        <div className="filter-banner" data-testid="filter-banner">
          这条线上的场不在本页这几列。‹ › 或点细条跳到最近一场。
          <button type="button" onClick={() => s.setLine(null)}>显示全部</button>
        </div>
      )}
      <div id="minimap" className="minimap" data-testid="minimap">
        <span data-testid="mini-chapters">{(craft?.chapters || []).map((c) => c.title).join(" ")}</span>
        {cols.map((c, i) => {
          const onLine = line
            ? s.scenes.some((sc) => sc.column_id === c.id && !isThinCard(sc, line, null, catalog, ents))
            : false;
          const here = s.scenes.filter((sc) => sc.column_id === c.id);
          const clock = formatClock(c.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format);
          return (
            <button
              key={c.id}
              type="button"
              className={`${toothClass(c, s.scenes, s.state?.promises || [])}${i >= start && i < start + n ? " mini-window" : ""}${onLine ? " on-line" : ""}${chapStarts.has(c.id) ? " chap" : ""}`}
              data-testid={`tooth-${i}`}
              title={`第 ${i + 1} 列 ${clock}${here.length ? " · " + here.map((sc) => sc.intent || "未名场").join("、") : " · 空场次"}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => { if (e.key === "Enter") s.jumpTooth(i); }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                winDrag.current = { i, start, x: e.clientX, moved: false };
                const onMove = (ev: MouseEvent) => {
                  if (!winDrag.current) return;
                  if (Math.abs(ev.clientX - winDrag.current.x) > 4) winDrag.current.moved = true;
                };
                const onUp = (ev: MouseEvent) => {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                  const d = winDrag.current;
                  winDrag.current = null;
                  if (!d) return;
                  if (!d.moved) {
                    s.jumpTooth(i);
                    return;
                  }
                  const delta = Math.round((ev.clientX - d.x) / 12);
                  const maxStart = Math.max(0, cols.length - n);
                  const next = Math.max(0, Math.min(maxStart, d.start + delta));
                  if (next !== d.start) void s.setWindow({ start: next });
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
              onClick={(e) => {
                if (winDrag.current?.moved) e.preventDefault();
              }}
            />
          );
        })}
        {hover != null && cols[hover] && (
          <span className="tooth-tip" data-testid="tooth-tip">
            第 {hover + 1} 列 · {formatClock(cols[hover].clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)}
            {" · "}
            {s.scenes.filter((sc) => sc.column_id === cols[hover].id).map((sc) => sc.intent || "未名场").join("、") || "空场次"}
          </span>
        )}
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
              <div className="muted">{formatClock(c.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)}</div>
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
              {here.map((sc) => (
                <SceneCardView
                  key={sc.id}
                  sc={sc}
                  catalog={catalog}
                  line={line}
                  who={who}
                  ents={ents}
                  density={density}
                  selected={s.selectedScene?.id === sc.id}
                  warn={warnings.find((w) => w.beat_id === sc.id)}
                  scenes={s.scenes}
                  labelOf={(id) => ents.find((e) => e.id === id || e.name === id)?.name || id}
                  onSelect={() => s.selectScene(sc.id, sc.draft)}
                  onDrop={async (id) => {
                    if (id.startsWith("presence:")) return;
                    await s.addPresence(id, sc.draft ? sc.id : undefined);
                  }}
                />
              ))}
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

function SceneCardView({
  sc,
  catalog,
  line,
  who,
  ents,
  density,
  selected,
  warn,
  scenes,
  labelOf,
  onSelect,
  onDrop,
}: {
  sc: SceneCard;
  catalog: StoryThread[];
  line: string | null;
  who: string | null;
  ents: { id: string; name: string }[];
  density: number;
  selected: boolean;
  warn?: { code: string };
  scenes: SceneCard[];
  labelOf: (id: string) => string;
  onSelect: () => void;
  onDrop: (id: string) => void | Promise<void>;
}) {
  const thin = isThinCard(sc, line, who, catalog, ents);
  const th = bandThread(sc, catalog, line);
  const extra = extraCount(sc);
  const unlined = !sc.story_threads?.length;
  const color = threadColor(th);
  const span = th ? threadSpan(scenes, th.id) : null;
  const enter = !!span && span.first === sc.id;
  const exit = !!span && span.last === sc.id;
  const pause = th ? isPaused(sc, th.id) : false;
  const names = hoverLines(sc, catalog);
  const [tip, setTip] = useState(false);
  const tri = density >= 5;
  const store = useStore();
  const chipDrag = useRef(false);

  return (
    <article
      className={`card ${sc.draft ? "draft" : "canon"}${sc.kind === "ellipsis" ? " ellipsis" : ""}${thin ? " thin" : ""}${selected ? " selected" : ""}${line && !thin ? " on-line" : ""}`}
      data-testid={sc.draft ? `draft-${sc.id}` : `card-${sc.id}`}
      onClick={onSelect}
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) await onDrop(id);
      }}
    >
      <span
        className={`band${unlined ? " unlined" : ""}`}
        data-testid={unlined ? "band-unlined" : "thread-band"}
        style={{ background: color, opacity: thin ? 0.35 : 1 }}
      />
      {enter && <span className={`fold in${tri ? " tri" : ""}`} data-testid="fold-in" title="从这里起" />}
      {exit && <span className={`fold out${tri ? " tri" : ""}`} data-testid="fold-out" title="收到这里" />}
      {pause && <span className="fold pause" data-testid="fold-pause" title="暂停" />}
      {!thin && (
        <>
          <div data-testid="card-title">{sc.title && sc.title !== "下一场" ? sc.title : "未名场"}</div>
          <div>{sc.intent}</div>
          {density <= 4 && (
            <div className="line-meta">
              {th && density <= 4 && <span className="line-name" style={{ color }}>{th.name}</span>}
              {extra > 0 && (
                <span
                  className="plus-n"
                  data-testid="thread-plus"
                  onMouseEnter={() => setTip(true)}
                  onMouseLeave={() => setTip(false)}
                  onFocus={() => setTip(true)}
                  onBlur={() => setTip(false)}
                  tabIndex={0}
                >
                  +{extra}
                  {tip && (
                    <span className="line-tip">
                      {names.map((x) => (
                        <span key={x.name}>{x.name} · {x.type} · {x.role}</span>
                      ))}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          {density >= 5 && extra > 0 && (
            <span className="plus-n" data-testid="thread-plus">+{extra}</span>
          )}
          {density <= 4 && warn?.code === "empty_value_shift" && <div data-testid="unwritten-shift">未写转折</div>}
          {density <= 2 && sc.do_text && <div data-testid="card-do">{sc.do_text}</div>}
          {density <= 2 && sc.say_text && <div data-testid="card-say">{sc.say_text}</div>}
          {density <= 2 && sc.think_text && <div data-testid="card-think">{sc.think_text}</div>}
          {density >= 5 && warn && <span data-testid="warn-dot">·</span>}
          <div>
            {sc.presences.map((p) => {
              const name = labelOf(p.entity_id);
              const on = store.selectedChip?.entityId === p.entity_id && store.selectedChip.sceneId === sc.id;
              return (
                <span
                  key={p.entity_id}
                  className={`chip${on ? " on" : ""}`}
                  data-testid={`chip-${name}`}
                  draggable
                  onClick={(e) => {
                    e.stopPropagation();
                    if (chipDrag.current) { chipDrag.current = false; return; }
                    store.setSelectedChip({ entityId: p.entity_id, sceneId: sc.id, draft: sc.draft });
                    store.openDossier(name);
                  }}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    chipDrag.current = true;
                    e.dataTransfer.setData("text/plain", `presence:${p.entity_id}:${sc.id}:${sc.draft ? "1" : "0"}`);
                  }}
                  onDragEnd={() => { window.setTimeout(() => { chipDrag.current = false; }, 0); }}
                >{name}</span>
              );
            })}
          </div>
        </>
      )}
    </article>
  );
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
