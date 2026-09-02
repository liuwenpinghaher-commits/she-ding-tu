import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { formatClock } from "../lenses/window";
import { extraCount, isThinCard, personOnScene, primaryThread, threadColor } from "../lenses/threads";
import {
  barRect,
  clockToX,
  defaultViewport,
  depSatisfied,
  followMovedCount,
  intervalLabel,
  packRows,
  minutesFromDrag,
  pan,
  pxForScale,
  resizeSpan,
  shiftSpan,
  snapClock,
  tickStep,
  viewportFromTo,
  xToClock,
  zoom,
  type ScaleKind,
  type Viewport,
} from "./timelineGeom";
import { ageAtClock, lifespanRange, parseBornClock } from "./ages";
import { isLocked, itemColor, nestParent, setNest, toggleLock } from "../shell/localPrefs";
import type { SceneCard } from "../canon/types";

type GroupMode = "none" | "person" | "place" | "line" | "color";

const TL_VP = "setting-tl-vp";

export function TimelineView() {
  const s = useStore();
  const wrap = useRef<HTMLDivElement>(null);
  const echo = useRef(false);
  const [vp, setVp] = useState<Viewport>({ origin: 0, pxPerMinute: 1, width: 800 });
  const [panning, setPanning] = useState(false);
  const [group, setGroup] = useState<GroupMode>("none");
  const [compact, setCompact] = useState(false);
  const [showLife, setShowLife] = useState(false);
  const [showDeps, setShowDeps] = useState(true);
  const [measure, setMeasure] = useState<string | null>(null);
  const [measurePos, setMeasurePos] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragN, setDragN] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "canon">("all");
  const [fromRaw, setFromRaw] = useState("");
  const [toRaw, setToRaw] = useState("");
  const [tick, setTick] = useState(0);
  const [cardLines, setCardLines] = useState(2);
  const [showPlace, setShowPlace] = useState(true);
  const measureFrom = useRef<number | null>(null);
  const draggingNow = useRef(false);
  const book = s.state?.book || "";
  const cols = s.state?.columns || [];
  const craft = s.state?.craft;
  const ents = s.state?.all_entities || s.state?.entities || [];
  const catalog = s.state?.threads || [];
  const who = s.tabFilter?.who || s.q.who;
  const line = s.tabFilter?.line || s.q.line;
  const status = s.tabFilter?.status || statusFilter;

  const scenes = useMemo(() => {
    return s.scenes.filter((sc) => {
      if (status === "draft" && !sc.draft) return false;
      if (status === "canon" && sc.draft) return false;
      if (who && !personOnScene(sc, who, ents)) return false;
      if (line && line !== "__unlined__" && !sc.story_threads.some((t) => t.id === line || catalog.find((c) => c.id === t.id)?.name === line)) {
        return false;
      }
      return true;
    });
  }, [s.scenes, status, who, line, ents, catalog]);

  const span = useMemo(() => {
    const clocks = [
      ...cols.flatMap((c) => [c.clock_from, c.clock_to]),
      ...scenes.flatMap((sc) => [sc.clock_from, sc.clock_to]),
      60,
    ];
    return { min: Math.min(...clocks), max: Math.max(...clocks) };
  }, [cols, scenes]);

  useEffect(() => {
    const w = wrap.current?.clientWidth || 800;
    setVp(defaultViewport(span.min, span.max, w));
  }, [span.min, span.max, s.state?.book]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (e.metaKey || e.ctrlKey) {
        setVp((cur) => zoom(cur, e.deltaY < 0 ? 1.12 : 0.9, x));
      } else if (e.shiftKey) {
        setVp((cur) => pan(cur, -e.deltaY));
      } else {
        setVp((cur) => pan(cur, -e.deltaX || -e.deltaY));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      if (!s.splitLock) return;
      const d = (e as CustomEvent<{ origin: number; pxPerMinute: number }>).detail;
      echo.current = true;
      setVp((cur) => ({ ...cur, origin: d.origin, pxPerMinute: d.pxPerMinute }));
    };
    window.addEventListener(TL_VP, on);
    return () => window.removeEventListener(TL_VP, on);
  }, [s.splitLock]);

  useEffect(() => {
    if (!s.splitLock) return;
    if (echo.current) {
      echo.current = false;
      return;
    }
    window.dispatchEvent(new CustomEvent(TL_VP, { detail: { origin: vp.origin, pxPerMinute: vp.pxPerMinute } }));
  }, [vp.origin, vp.pxPerMinute, s.splitLock]);

  const goDate = useCallback(() => {
    const raw = window.prompt("跳到第几天几点（如 1 08:00）或分钟整数");
    if (!raw) return;
    const m = raw.match(/(\d+)\s+(\d{1,2}):(\d{2})/);
    let t = Number(raw);
    if (m) t = (Number(m[1]) - 1) * 1440 + Number(m[2]) * 60 + Number(m[3]);
    if (!Number.isFinite(t)) return;
    setVp((cur) => ({ ...cur, origin: t - (cur.width / cur.pxPerMinute) / 2 }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const t = s.selectedScene?.clock_from ?? Math.max(0, xToClock(vp.width / 2, vp));
        void s.createAtClock(t);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        goDate();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        const sc = s.selectedScene;
        if (!sc) return;
        setVp((cur) => ({ ...cur, origin: sc.clock_from - (cur.width / cur.pxPerMinute) / 4 }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goDate, s, vp.width, vp.pxPerMinute]);

  const ticks = useMemo(() => {
    const step = tickStep(vp.pxPerMinute);
    const start = Math.floor(vp.origin / step) * step;
    const end = xToClock(vp.width, vp) + step;
    const out: number[] = [];
    for (let t = start; t <= end; t += step) out.push(t);
    return out;
  }, [vp]);

  const lanes = useMemo(() => {
    if (group === "person") {
      const people = (s.state?.people || []).map((p) => ({ id: p.id, title: p.name }));
      const named = people.length ? people : [{ id: "none", title: "未分组" }];
      return named.map((p) => ({
        id: p.id,
        title: p.title,
        entityId: p.id === "none" ? "" : p.id,
        scenes: p.id === "none"
          ? scenes
          : scenes.filter((sc) => personOnScene(sc, p.id, ents) || personOnScene(sc, p.title, ents)),
      }));
    }
    if (group === "place") {
      const places = ents.filter((e) => e.kind === "place");
      return [
        ...places.map((p) => ({
          id: p.id,
          title: p.name,
          entityId: p.id,
          scenes: scenes.filter((sc) => sc.place_id === p.id || sc.place_id === p.name),
        })),
        { id: "noplace", title: "未标地点", entityId: "", scenes: scenes.filter((sc) => !sc.place_id) },
      ];
    }
    if (group === "line") {
      const lines = s.state?.threads || [];
      return [
        ...lines.map((t) => ({
          id: t.id,
          title: t.name,
          entityId: "",
          scenes: scenes.filter((sc) => sc.story_threads.some((x) => x.id === t.id)),
        })),
        { id: "unlined", title: "未归线", entityId: "", scenes: scenes.filter((sc) => !sc.story_threads.length) },
      ];
    }
    if (group === "color") {
      const colors = Array.from(new Set(scenes.map((sc) => threadColor(primaryThread(sc, catalog)))));
      return colors.map((c) => ({
        id: c,
        title: c,
        entityId: "",
        scenes: scenes.filter((sc) => threadColor(primaryThread(sc, catalog)) === c),
      }));
    }
    return [{ id: "all", title: "", entityId: "", scenes }];
  }, [group, scenes, s.state?.people, ents, s.state?.threads, catalog]);

  const onBlankDbl = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tl-bar")) return;
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, xToClock(e.clientX - rect.left, vp));
    const lane = (e.target as HTMLElement).closest(".tl-row-lane") as HTMLElement | null;
    const entityId = lane?.dataset.entity || "";
    void s.createAtClock(t).then((id) => {
      if (entityId && id) void s.addPresence(entityId, id);
    });
  };

  const barUnder = (clientX: number, clientY: number): SceneCard | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const bar = el?.closest("[data-tl-id]") as HTMLElement | null;
    const id = bar?.dataset.tlId;
    return scenes.find((x) => x.id === id) || null;
  };

  const startMove = (e: React.PointerEvent | React.MouseEvent, sc: SceneCard, edge?: "from" | "to") => {
    if ((e.target as HTMLElement).closest("button, .tl-tools")) return;
    if (draggingNow.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.altKey && e.shiftKey) {
      if (measureFrom.current == null) {
        measureFrom.current = sc.clock_from;
        setMeasure("再点另一场");
      } else {
        setMeasure(intervalLabel(measureFrom.current, sc.clock_from));
        measureFrom.current = null;
      }
      setMeasurePos({ x: e.clientX, y: e.clientY });
      return;
    }
    if (isLocked(book, sc.id)) {
      void s.selectScene(sc.id, sc.draft);
      return;
    }
    draggingNow.current = true;
    const startX = e.clientX;
    const origFrom = sc.clock_from;
    const origTo = sc.clock_to;
    const nest = e.metaKey || e.ctrlKey;
    const fromLane = (e.currentTarget as HTMLElement).closest(".tl-row-lane") as HTMLElement | null;
    const n = s.followDependents ? followMovedCount(s.scenes, sc) : 0;
    setDragN(n > 0 ? n : null);
    try {
      const pid = "pointerId" in e ? e.pointerId : undefined;
      if (pid != null) (e.currentTarget as HTMLElement).setPointerCapture(pid);
    } catch { /* ignore */ }
    const ppm = vp.pxPerMinute;
    let finished = false;
    const onMove = (ev: { clientX: number; shiftKey: boolean }) => {
      const dx = ev.clientX - startX;
      let delta = minutesFromDrag(dx, ppm);
      if (ev.shiftKey) delta = snapClock(origFrom + delta, tickStep(ppm)) - origFrom;
      if (edge) {
        const next = resizeSpan(origFrom, origTo, edge, edge === "from" ? origFrom + delta : origTo + delta);
        paintPreview(sc.id, next.from, next.to);
      } else {
        const next = shiftSpan(origFrom, origTo, delta);
        paintPreview(sc.id, next.from, next.to);
      }
    };
    const onUp = (ev: { clientX: number; clientY: number; shiftKey: boolean }) => {
      if (finished) return;
      finished = true;
      draggingNow.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragN(null);
      const dx = ev.clientX - startX;
      if (Math.abs(dx) < 4) {
        if (nest) {
          const over = barUnder(ev.clientX, ev.clientY);
          if (over && over.id !== sc.id) {
            setNest(book, sc.id, over.id);
            setTick((x) => x + 1);
          }
          return;
        }
        void s.selectScene(sc.id, sc.draft);
        return;
      }
      if (nest) {
        const over = barUnder(ev.clientX, ev.clientY);
        if (over && over.id !== sc.id) {
          setNest(book, sc.id, over.id);
          setTick((x) => x + 1);
        }
        return;
      }
      const lane = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest(".tl-row-lane") as HTMLElement | null;
      const entityId = lane?.dataset.entity;
      if (entityId && entityId !== fromLane?.dataset.entity) void s.addPresence(entityId, sc.id);
      let delta = minutesFromDrag(dx, ppm);
      if (ev.shiftKey) delta = snapClock(origFrom + delta, tickStep(ppm)) - origFrom;
      const next = edge
        ? resizeSpan(origFrom, origTo, edge, edge === "from" ? origFrom + delta : origTo + delta)
        : shiftSpan(origFrom, origTo, delta);
      void s.shiftSceneClock(sc.id, sc.draft, next.from, next.to);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const paintPreview = (id: string, from: number, to: number) => {
    const el = document.querySelector(`[data-tl-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    const r = barRect(from, to, vp);
    el.style.left = `${r.left}px`;
    el.style.width = `${r.width}px`;
  };

  const panStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tl-bar")) return;
    setPanning(true);
    const startX = e.clientX;
    const orig = vp;
    const onMove = (ev: MouseEvent) => setVp(pan(orig, ev.clientX - startX));
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const jumpContext = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = span.min + ratio * Math.max(1, span.max - span.min);
    setVp((cur) => ({ ...cur, origin: t - (cur.width / cur.pxPerMinute) / 2 }));
  };

  const applyScale = (kind: ScaleKind) => {
    setVp((cur) => {
      const center = xToClock(cur.width / 2, cur);
      const px = pxForScale(kind);
      return { ...cur, pxPerMinute: px, origin: center - cur.width / 2 / px };
    });
  };

  const exportPng = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(800, vp.width);
    canvas.height = Math.max(200, lanes.length * 88 + 60);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() || "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    lanes.forEach((lane, i) => {
      lane.scenes.forEach((sc) => {
        const r = barRect(sc.clock_from, sc.clock_to, vp);
        ctx.fillStyle = threadColor(primaryThread(sc, catalog)) || "#70B0F0";
        ctx.fillRect(r.left, 40 + i * 88, r.width, 28);
        ctx.fillStyle = "#333";
        ctx.font = "12px sans-serif";
        ctx.fillText(sc.intent || "未名场", r.left + 4, 58 + i * 88);
      });
    });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${book || "时间轴"}.png`;
    a.click();
  };

  const total = Math.max(1, span.max - span.min);
  const ctxLeft = ((vp.origin - span.min) / total) * 100;
  const ctxW = ((vp.width / vp.pxPerMinute) / total) * 100;

  const lifePeople = (s.state?.people || []).filter((p) => {
    if (who && p.id !== who && p.name !== who) return false;
    return showLife || !!who;
  });

  return (
    <div className="timeline-view" data-testid="timeline" ref={wrap}>
      <div className="view-header">
        <button type="button" className={!compact ? "on" : ""} onClick={() => setCompact(false)}>整卡</button>
        <button type="button" data-testid="tl-compact" className={compact ? "on" : ""} onClick={() => setCompact(true)}>只留标记</button>
        <label className="muted">卡行
          <select data-testid="tl-card-lines" value={cardLines} onChange={(e) => setCardLines(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="muted">
          <input type="checkbox" checked={showPlace} onChange={(e) => setShowPlace(e.target.checked)} />
          地点
        </label>
        <button type="button" data-testid="tl-life" className={showLife ? "on" : ""} onClick={() => setShowLife((v) => !v)}>寿命条</button>
        <button type="button" data-testid="tl-deps" className={showDeps ? "on" : ""} onClick={() => setShowDeps((v) => !v)}>依赖线</button>
        <button type="button" className={group === "none" ? "on" : ""} onClick={() => setGroup("none")}>不分</button>
        <button type="button" data-testid="tl-group-person" className={group === "person" ? "on" : ""} onClick={() => setGroup("person")}>按人</button>
        <button type="button" data-testid="tl-group-place" className={group === "place" ? "on" : ""} onClick={() => setGroup("place")}>按地点</button>
        <button type="button" data-testid="tl-group-line" className={group === "line" ? "on" : ""} onClick={() => setGroup("line")}>按逻辑线</button>
        <button type="button" data-testid="tl-group-color" className={group === "color" ? "on" : ""} onClick={() => setGroup("color")}>按色</button>
        <button type="button" data-testid="tl-fold-all" onClick={() => setCollapsed(Object.fromEntries(lanes.map((l) => [l.id, true])))}>全收</button>
        <button type="button" data-testid="tl-unfold-all" onClick={() => setCollapsed({})}>全开</button>
        <button type="button" data-testid="tl-scale-year" onClick={() => applyScale("year")}>年</button>
        <button type="button" data-testid="tl-scale-month" onClick={() => applyScale("month")}>月</button>
        <button type="button" data-testid="tl-scale-day" onClick={() => applyScale("day")}>日</button>
        <button type="button" data-testid="tl-scale-hour" onClick={() => applyScale("hour")}>时</button>
        <input
          type="range"
          data-testid="tl-scale-slider"
          min={0}
          max={100}
          value={Math.round((Math.log(Math.max(0.00004, vp.pxPerMinute)) - Math.log(0.00004)) / (Math.log(16) - Math.log(0.00004)) * 100)}
          onChange={(e) => {
            const t = Number(e.target.value) / 100;
            const px = Math.exp(Math.log(0.00004) + t * (Math.log(16) - Math.log(0.00004)));
            setVp((cur) => {
              const center = xToClock(cur.width / 2, cur);
              return { ...cur, pxPerMinute: px, origin: center - cur.width / 2 / px };
            });
          }}
        />
        <input data-testid="tl-from" placeholder="From" value={fromRaw} onChange={(e) => setFromRaw(e.target.value)} style={{ width: 72 }} />
        <input data-testid="tl-to" placeholder="To" value={toRaw} onChange={(e) => setToRaw(e.target.value)} style={{ width: 72 }} />
        <button
          type="button"
          data-testid="tl-from-to"
          onClick={() => {
            let a = Number(fromRaw);
            let b = Number(toRaw);
            if (!Number.isFinite(a) || !Number.isFinite(b)) return;
            if (a === b) b = a + 60;
            if (a > b) {
              const t = a;
              a = b;
              b = t;
            }
            setVp(viewportFromTo(a, b, vp.width));
          }}
        >套上</button>
        <button type="button" onClick={() => setVp((v) => zoom(v, 0.5, v.width / 2))}>拉远</button>
        <button type="button" onClick={() => setVp((v) => zoom(v, 2, v.width / 2))}>拉近</button>
        <button type="button" data-testid="tl-scale-book" onClick={() => setVp(defaultViewport(span.min, span.max, vp.width))}>全书</button>
        <button type="button" data-testid="tl-jump" onClick={goDate}>跳到某日</button>
        <button type="button" data-testid="tl-export-png" onClick={exportPng}>另存 PNG</button>
        <select data-testid="tl-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "draft" | "canon")}>
          <option value="all">草稿和正史</option>
          <option value="draft">只看草稿</option>
          <option value="canon">只看正史</option>
        </select>
        <label className="follow-toggle">
          <input
            type="checkbox"
            data-testid="tl-follow"
            checked={s.followDependents}
            onChange={(e) => s.setFollowDependents(e.target.checked)}
          />
          依赖跟着动
        </label>
        <button type="button" data-testid="tl-resolve-all" onClick={() => s.resolveAllClocks()}>按依赖排好</button>
        <button type="button" aria-label="窗口往左一屏" onClick={() => setVp((v) => pan(v, v.width * 0.8))}>‹</button>
        <button type="button" aria-label="窗口往右一屏" onClick={() => setVp((v) => pan(v, -v.width * 0.8))}>›</button>
        <span className="muted">⌘滚轮缩放 · Shift 平移 · 拖条改钟 · ⌥⇧测间隔 · ⌘拖嵌套</span>
      </div>
      {lifePeople.length > 0 && (
        <div className="tl-life" data-testid="tl-lifespan">
          {lifePeople.map((p) => {
            const born = parseBornClock(p.profile?.born_clock);
            const died = parseBornClock(p.profile?.died_clock);
            const range = lifespanRange(born, died, span.min, span.max);
            if (!range) return (
              <div key={p.id} className="muted">{p.name}：档案里填出生故事时才画寿命</div>
            );
            const r = barRect(range.from, range.to, vp);
            return (
              <div key={p.id} className="tl-life-row">
                <span>{p.name}</span>
                <i className="tl-life-bar" style={{ left: r.left, width: r.width }} />
              </div>
            );
          })}
        </div>
      )}
      <div className="tl-ruler" data-testid="tl-ruler">
        {ticks.map((t) => (
          <div key={t} className="tl-tick" style={{ left: clockToX(t, vp) }}>
            {formatClock(t, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)}
          </div>
        ))}
      </div>
      <div
        className={`tl-canvas${panning ? " panning" : ""}`}
        data-testid="tl-canvas"
        onDoubleClick={onBlankDbl}
        onMouseDown={panStart}
      >
        {ticks.map((t) => (
          <div key={`g${t}`} className="tl-gridline" style={{ left: clockToX(t, vp) }} />
        ))}
        {showDeps && (
          <svg className="tl-deps" data-testid="tl-dep-lines">
            {scenes.filter((sc) => sc.cause_beat).map((sc) => {
              const cause = s.scenes.find((x) => x.id === sc.cause_beat);
              if (!cause) return null;
              const a = barRect(cause.clock_from, cause.clock_to, vp);
              const b = barRect(sc.clock_from, sc.clock_to, vp);
              const ok = depSatisfied(cause.clock_to, sc.clock_from);
              const y1 = 20;
              const y2 = 48;
              return (
                <line
                  key={`${cause.id}-${sc.id}`}
                  x1={a.left + a.width}
                  y1={y1}
                  x2={b.left}
                  y2={y2}
                  className={ok ? "ok" : "bad"}
                />
              );
            })}
          </svg>
        )}
        {lanes.map((lane) => {
          const rows = packRows(collapsed[lane.id] ? [] : lane.scenes);
          const maxRow = Math.max(0, ...rows.values(), 0);
          const laneH = collapsed[lane.id] ? 32 : 20 + (maxRow + 1) * 76;
          return (
          <div
            key={lane.id}
            className="tl-row-lane"
            style={{ height: laneH }}
            data-entity={lane.entityId || undefined}
            data-testid={lane.title ? `tl-lane-${lane.title}` : "tl-lane"}
            onDragOver={(e) => { if (lane.entityId) e.preventDefault(); }}
            onDrop={(e) => {
              if (!lane.entityId) return;
              e.preventDefault();
              const raw = e.dataTransfer.getData("text/plain");
              if (!raw || raw.startsWith("presence:")) return;
              const sc = scenes.find((x) => x.id === raw);
              if (sc) void s.addPresence(lane.entityId, sc.id);
              else void s.addPresence(raw);
            }}
          >
            {lane.title && (
              <div className="tl-lane-title">
                <button
                  type="button"
                  data-testid={`tl-fold-${lane.title}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [lane.id]: !c[lane.id] }))}
                >{collapsed[lane.id] ? "▸" : "▾"} {lane.title}</button>
              </div>
            )}
            {!collapsed[lane.id] && lane.scenes.map((sc) => {
              const r = barRect(sc.clock_from, sc.clock_to, vp);
              const th = primaryThread(sc, catalog);
              const extra = extraCount(sc);
              const on = s.selectedScene?.id === sc.id;
              const thin = isThinCard(sc, s.line, s.q.who, catalog, ents);
              const unlined = !sc.story_threads?.length;
              const point = sc.clock_to - sc.clock_from <= 1;
              const nested = !!nestParent(book, sc.id);
              const locked = isLocked(book, sc.id);
              const ageBits = (s.state?.people || []).filter((p) => sc.presences.some((x) => x.entity_id === p.id || x.entity_id === p.name)).map((p) => {
                const born = parseBornClock(p.profile?.born_clock);
                if (born == null) return null;
                return `${p.name}${ageAtClock(sc.clock_from, born)}`;
              }).filter(Boolean);
              return (
                <article
                  key={`${sc.id}-${tick}`}
                  data-tl-id={sc.id}
                  data-testid={`card-${sc.id}`}
                  className={`tl-bar card${compact || point ? " marker" : ""}${point ? " point" : ""}${sc.draft ? " draft" : " canon"}${on ? " selected" : ""}${thin ? " thin" : ""}${nested ? " nested" : ""}${locked ? " locked" : ""}`}
                  style={{ left: r.left, width: point ? 14 : r.width, top: 12 + (rows.get(sc.id) ?? 0) * 72 + (nested ? 8 : 0) }}
                  onPointerDown={(e) => startMove(e, sc)}
                  onMouseDown={(e) => startMove(e, sc)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, .tl-tools, .tl-edge")) return;
                    void s.selectScene(sc.id, sc.draft);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const raw = e.dataTransfer.getData("text/plain");
                    if (raw && !raw.startsWith("presence:")) void s.addPresence(raw, sc.id);
                  }}
                >
                  <span
                    className={`band${unlined ? " unlined" : ""}`}
                    data-testid={unlined ? "band-unlined" : "thread-band"}
                    style={{ background: itemColor(book, sc.id) || threadColor(th) }}
                  />
                  {!compact && !point && (
                    <>
                      <div className="tl-bar-title" data-testid="card-title" style={{ WebkitLineClamp: cardLines }}>{sc.intent || sc.title || "未名场"}</div>
                      <div className="tl-bar-meta">
                        {formatClock(sc.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)}
                        {extra > 0 ? ` +${extra}` : ""}
                        {sc.draft ? " · 草稿" : ""}
                        {locked ? " · 锁定" : ""}
                        {ageBits.length ? ` · ${ageBits.join("、")}` : ""}
                        {showPlace && sc.place_id ? ` · ${sc.place_id}` : ""}
                      </div>
                    </>
                  )}
                  <div className="tl-tools">
                    <button type="button" data-testid={`tl-copy-${sc.id}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => s.createNear(sc.id, "copy")}>复制</button>
                    <button type="button" data-testid={`tl-above-${sc.id}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => s.createNear(sc.id, "above")}>在上建</button>
                    <button type="button" data-testid={`tl-below-${sc.id}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => s.createNear(sc.id, "below")}>在下建</button>
                    <button type="button" data-testid={`tl-lock-${sc.id}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => { toggleLock(book, sc.id); setTick((x) => x + 1); }}>{locked ? "解锁" : "锁定"}</button>
                  </div>
                  {dragN != null && on && <span className="tl-follow-n" data-testid="tl-follow-n">还将移动 {dragN} 场</span>}
                  <span className="tl-edge from" onPointerDown={(e) => startMove(e, sc, "from")} onMouseDown={(e) => startMove(e, sc, "from")} />
                  <span className="tl-edge to" onPointerDown={(e) => startMove(e, sc, "to")} onMouseDown={(e) => startMove(e, sc, "to")} />
                </article>
              );
            })}
          </div>
          );
        })}
        {scenes.length === 0 && <p className="muted" style={{ padding: 24 }}>还没有场。双击空白处建草稿。</p>}
        {measure && (
          <div className="tl-measure" data-testid="tl-measure" style={{ left: measurePos.x, top: 8 }}>{measure}</div>
        )}
      </div>
      <div className="tl-context" data-testid="tl-span" onClick={jumpContext}>
        <div className="tl-context-win" style={{ left: `${Math.max(0, ctxLeft)}%`, width: `${Math.min(100, Math.max(2, ctxW))}%` }} />
      </div>
    </div>
  );
}
