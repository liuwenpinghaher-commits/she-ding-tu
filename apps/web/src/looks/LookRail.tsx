import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { formatClock, clockDay } from "../lenses/window";
import { extraCount, primaryThread, threadColor } from "../lenses/threads";
import { KIND_LABEL } from "../pages/f10";
import { Whiteboard } from "./Whiteboard";
import type { Column } from "../canon/types";

type Occ = {
  columns?: { id: string }[];
  entities?: { id: string; name: string; kind: string }[];
  cells?: { name: string; kind?: string; column: string; present?: boolean; draft?: boolean }[];
};

type Progress = {
  lines?: { id: string; name: string; type?: string }[];
  chapters?: string[];
  cells?: { line: string; chapter: string; count: number; beat_id?: string; column_id?: string }[];
  unassigned?: number;
};

type RelGraph = {
  person?: string;
  nodes?: { id: string; name: string; kind: string }[];
  edges?: { from: string; to: string; rel: string; label: string }[];
};

export function LookRail() {
  const s = useStore();
  const look = s.look;
  return (
    <>
      <TimelineLook open={look === "时间轴"} />
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
      <ProgressLook open={look === "进度"} />
      <TrackLook open={look === "轨迹"} />
      <OccupancyLook open={look === "出场"} />
      <RelationsLook open={look === "关系"} />
      <Whiteboard open={look === "白板"} />
    </>
  );
}

function TimelineLook({ open }: { open: boolean }) {
  const s = useStore();
  const cols = s.state?.columns || [];
  const craft = s.state?.craft;
  const [scale, setScale] = useState<"book" | "chapter" | "day">("book");
  const [block, setBlock] = useState("");
  const hasOrigin = !!(craft?.clock_origin_label || (craft?.clock_origin_minute && craft.clock_origin_minute > 0));
  const total = Math.max(1, cols.reduce((a, c) => a + Math.max(1, c.clock_to - c.clock_from), 0));
  const chapters = craft?.chapters || [];

  const groups = useMemo(() => {
    if (scale === "chapter") {
      if (!chapters.length) return [{ title: "还没有回目", cols }];
      return chapters.map((ch, i) => {
        const from = cols.findIndex((c) => c.id === ch.start_column);
        const next = chapters[i + 1];
        const to = next ? cols.findIndex((c) => c.id === next.start_column) : cols.length;
        return { title: ch.title || `第${i + 1}回`, cols: cols.slice(Math.max(0, from), to < 0 ? cols.length : to) };
      });
    }
    if (scale === "day") {
      const map = new Map<number, Column[]>();
      for (const c of cols) {
        const d = clockDay(c.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute);
        const arr = map.get(d) || [];
        arr.push(c);
        map.set(d, arr);
      }
      return [...map.entries()].map(([d, cs]) => ({ title: hasOrigin ? `第${d}天` : `${d}`, cols: cs }));
    }
    return [{ title: "全书", cols }];
  }, [scale, cols, chapters, craft?.clock_origin_label, craft?.clock_origin_minute, hasOrigin]);

  return (
    <div id="timeline" data-testid="timeline" className={`look-rail${open ? " show" : ""}`}>
      <button type="button" data-testid="tl-back" onClick={() => s.setLook(null)}>收起</button>
      <div>时间轴 · 分场条仍在</div>
      <div className="scale-row">
        <button type="button" data-testid="tl-scale-book" className={scale === "book" ? "on" : ""} onClick={() => setScale("book")}>按全书</button>
        <button type="button" data-testid="tl-scale-chapter" className={scale === "chapter" ? "on" : ""} onClick={() => setScale("chapter")}>按回目</button>
        <button type="button" data-testid="tl-scale-day" className={scale === "day" ? "on" : ""} onClick={() => setScale("day")}>按天</button>
      </div>
      {!hasOrigin && <p className="muted">去书的设定定故事时间起点。现在刻度只显示分钟整数，不假装「第几天」。</p>}
      {scale === "chapter" && !chapters.length && <p className="muted">按回目：去书的设定加回目。</p>}
      {cols.length === 0 && <p>还没有场</p>}
      <div data-testid="tl-span" className="tl-span">
        {groups.map((g) => (
          <div key={g.title} className="tl-group">
            <div className="muted">{g.title}</div>
            <div className="tl-row">
              {g.cols.map((c) => {
                const here = s.scenes.filter((sc) => sc.column_id === c.id);
                const has = here.length > 0;
                const ellipsis = here.some((sc) => sc.kind === "ellipsis");
                const dur = Math.max(1, c.clock_to - c.clock_from);
                const th = here[0] ? primaryThread(here[0], s.state?.threads || []) : undefined;
                const extra = here[0] ? extraCount(here[0]) : 0;
                const i = cols.indexOf(c);
                return (
                  <div
                    key={c.id}
                    className={`tl-seg${ellipsis ? " ellipsis" : ""}${!has ? " empty" : ""}`}
                    style={{ flex: dur / total }}
                    draggable
                    onDragStart={(e) => {
                      e.preventDefault();
                      setBlock("改故事时间去分场条拖列，确认变更后才生效。");
                    }}
                    onClick={() => {
                      const sc = here[0];
                      if (sc) {
                        s.selectScene(sc.id, sc.draft);
                        s.setLook(null);
                      } else {
                        s.jumpTooth(i);
                        s.setLook(null);
                      }
                    }}
                  >
                    {th && <span className="band" style={{ background: threadColor(th), width: 4 }} />}
                    {extra > 0 && <span className="plus-n">+{extra}</span>}
                    第 {i + 1} 列 {hasOrigin
                      ? formatClock(c.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)
                      : `${c.clock_from}分`}
                    {has ? "" : " 空场次"}
                    {ellipsis ? " 省略" : ""}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" data-testid="tl-block">拖条改钟去分场条拖列，确认变更后才生效。{block}</p>
    </div>
  );
}

function OccupancyLook({ open }: { open: boolean }) {
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
    <div data-testid="flyout" className={`look-rail${open ? " show" : ""}`}>
      <button type="button" data-testid="flyout-close" onClick={() => s.setLook(null)}>收起</button>
      <p className="muted">改在场回分场条拖标记。格上不画逻辑线色。</p>
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
              const label = on ? "在场" : draft ? "草稿在场" : "";
              return (
                <button
                  key={id}
                  type="button"
                  className={`occ-cell${on ? " solid" : draft ? " hollow" : ""}`}
                  data-testid={`occ-${e.name}-col${i}`}
                  title={label || "不在场"}
                  onClick={() => {
                    const here = s.scenes.find((sc) => sc.column_id === id);
                    const idx = cols.findIndex((c) => c.id === id);
                    s.setLook(null);
                    s.jumpTooth(idx >= 0 ? idx : i);
                    if (here) s.selectScene(here.id, here.draft);
                  }}
                >{on ? "●" : draft ? "○" : ""}</button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RelationsLook({ open }: { open: boolean }) {
  const s = useStore();
  const [who, setWho] = useState(s.q.who || "");
  const [graph, setGraph] = useState<RelGraph | null>(null);
  const [setup, setSetup] = useState<Array<{ other_name?: string; other?: string; label?: string; kind: string }>>([]);
  const [fromScenes, setFromScenes] = useState<Array<{ other: string; beat_id?: string; label?: string }>>([]);
  const [block, setBlock] = useState("");
  const people = s.state?.people || [];

  useEffect(() => {
    if (!open) return;
    const person = who || s.q.who || "";
    if (!person) {
      setGraph(null);
      return;
    }
    api(`/api/relations?person=${encodeURIComponent(person)}`)
      .then((x) => setGraph(x as RelGraph))
      .catch(() => setGraph(null));
    api<{
      relations_setup?: Array<{ other_name?: string; other?: string; label?: string; kind: string }>;
      relations_from_scenes?: Array<{ other: string; beat_id?: string; label?: string }>;
    }>(`/api/dossier/${encodeURIComponent(person)}`)
      .then((d) => {
        setSetup(d.relations_setup || []);
        setFromScenes(d.relations_from_scenes || []);
      })
      .catch(() => { setSetup([]); setFromScenes([]); });
  }, [open, who, s.q.who]);

  const center = who || s.q.who || graph?.person || "";
  const nodes = graph?.nodes || [];
  const others = nodes.filter((n) => n.id !== center && n.name !== center);

  return (
    <div data-testid="look-relations-panel" className={`look-rail${open ? " show" : ""}`}>
      <button type="button" onClick={() => s.setLook(null)}>收起</button>
      <p>关系图只读。拖边改正史：改设定关系去档案页，改戏里发生的去那一场。</p>
      <label>看谁
        <select data-testid="rel-who" value={center} onChange={(e) => { setWho(e.target.value); s.setWho(e.target.value || null); }}>
          <option value="">先选一个人</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {!center && <p>先选一个人</p>}
      {center && (
        <div
          className="rel-canvas"
          data-testid="rel-canvas"
          onDragStart={(e) => {
            e.preventDefault();
            setBlock("改设定关系去档案页，改戏里发生的去那一场。");
          }}
        >
          <button
            type="button"
            className="rel-node center"
            onClick={() => s.openDossier(people.find((p) => p.id === center)?.name || center)}
          >{people.find((p) => p.id === center)?.name || center}</button>
          {others.map((n, i) => {
            const ang = (i / Math.max(1, others.length)) * Math.PI * 2;
            const x = 50 + Math.cos(ang) * 38;
            const y = 50 + Math.sin(ang) * 38;
            const dashed = fromScenes.find((r) => r.other === n.id || r.other === n.name);
            const solid = setup.find((r) => r.other === n.id || r.other_name === n.name);
            const faint = graph?.edges?.find((e) => e.to === n.id || e.to === n.name);
            const cls = solid ? "solid" : dashed ? "dashed" : "faint";
            return (
              <button
                key={n.id}
                type="button"
                className={`rel-node ${cls}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                title={solid?.label || dashed?.label || faint?.rel || n.name}
                onClick={() => {
                  if (dashed?.beat_id) {
                    const sc = s.scenes.find((x) => x.id === dashed.beat_id);
                    s.setLook(null);
                    if (sc) s.selectScene(sc.id, sc.draft);
                  } else {
                    s.openDossier(n.name);
                  }
                }}
              >{n.name}{solid ? ` · ${solid.label || solid.kind}` : dashed ? " · 场上变过" : faint ? " · 同场" : ""}</button>
            );
          })}
        </div>
      )}
      {block && <p className="err">{block}</p>}
    </div>
  );
}

function ProgressLook({ open }: { open: boolean }) {
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
    <div data-testid="look-progress" className={`look-rail${open ? " show" : ""}`}>
      <button type="button" data-testid="progress-back" onClick={() => s.setLook(null)}>收起</button>
      {noChap && <p className="muted">还没有回目，列按每 10 列一段。去书的设定加回目。</p>}
      <p className="muted">未归线 {progress?.unassigned ?? 0} 场。点格跳到该回第一条属于该线的场。不能在这里写下一场。</p>
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
                      draggable
                      onDragStart={(e) => e.preventDefault()}
                      onClick={() => {
                        if (!cell?.beat_id) return;
                        const sc = s.scenes.find((x) => x.id === cell.beat_id);
                        s.setLook(null);
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

function TrackLook({ open }: { open: boolean }) {
  const s = useStore();
  const [track, setTrack] = useState<{ beats?: Array<{ id: string; intent: string; canon?: boolean }> } | null>(null);
  useEffect(() => {
    if (open && s.line) {
      const t = (s.state?.threads || []).find((x) => x.name === s.line || x.id === s.line);
      if (t) api(`/api/threads/${t.id}/track`).then((x) => setTrack(x as typeof track)).catch(() => setTrack(null));
    }
  }, [open, s.line, s.state?.threads]);
  return (
    <div data-testid="look-track" className={`look-rail${open ? " show" : ""}`}>
      <button type="button" onClick={() => s.setLook(null)}>收起</button>
      {!(s.line) && <p>先点顶上一条逻辑线。</p>}
      <ul>
        {(track?.beats || []).map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => {
              const sc = s.scenes.find((x) => x.id === b.id);
              s.setLook(null);
              if (sc) s.selectScene(sc.id, sc.draft);
            }}>{b.intent} · {b.canon ? "正史" : "草稿"}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

