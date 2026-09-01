import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { formatClock } from "../lenses/window";
import { KIND_LABEL } from "../pages/f10";
import { Whiteboard } from "./Whiteboard";
import { loadFolders, saveFolders, type NarFolder } from "../shell/localPrefs";
import { ageAtClock, parseBornClock } from "../board/ages";
import { intervalLabel } from "../board/timelineGeom";

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

export function LookRail({ embedded, tab }: { embedded?: boolean; tab?: string }) {
  const s = useStore();
  const look = embedded ? (tab || "") : (s.look || "");
  const pane = embedded ? "workspace-pane" : "look-rail show";
  return (
    <div className={pane}>
      {look === "总表" && <TableLook />}
      {look === "列表" && <ListLook />}
      {look === "进度" && <ProgressLook open embedded={!!embedded} />}
      {look === "轨迹" && <SubwayLook />}
      {look === "出场" && <OccupancyLook open embedded={!!embedded} />}
      {look === "关系" && <><RelationGrid /><OccupancyLook open embedded={!!embedded} /></>}
      {look === "讲述序" && <NarrativeLook />}
      {look === "白板" && <Whiteboard open />}
    </div>
  );
}

function TableLook() {
  const s = useStore();
  return (
    <div id="table-view" data-testid="table-view">
      <button type="button" data-testid="table-back" onClick={() => s.setLook("时间轴")}>回时间轴</button>
      <p className="muted">改格即时写入这一场。批量改读序也即时，⌘Z 撤钟不撤格。</p>
      <table className="lib-table">
        <thead><tr><th>场</th><th>状态</th><th>故事时</th><th>读序</th></tr></thead>
        <tbody data-testid="table-body">
          {s.scenes.map((sc) => (
            <tr key={sc.id} onClick={() => s.selectScene(sc.id, sc.draft)}>
              <td>
                {sc.intent}
                <input
                  data-testid={`table-intent-${sc.id}`}
                  defaultValue={sc.intent}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== sc.intent) void s.patchSceneField(sc.id, sc.draft, { intent: v });
                  }}
                />
              </td>
              <td>{sc.draft ? "草稿" : "正史"}</td>
              <td>{sc.clock_from}–{sc.clock_to}</td>
              <td>
                <input
                  defaultValue={sc.telling_ord ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    void s.patchSceneField(sc.id, sc.draft, { telling_ord: n });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListLook() {
  const s = useStore();
  return (
    <ul data-testid="list-view">
      {s.scenes.map((sc) => (
        <li key={sc.id}>
          <button type="button" onClick={() => s.selectScene(sc.id, sc.draft)}>
            {sc.intent} · {sc.draft ? "草稿" : "正史"}
          </button>
          <input
            data-testid={`list-intent-${sc.id}`}
            defaultValue={sc.intent}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== sc.intent) void s.patchSceneField(sc.id, sc.draft, { intent: v });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function NarrativeLook() {
  const s = useStore();
  const book = s.state?.book || "";
  const [folders, setFolders] = useState(() => loadFolders(book));
  useEffect(() => { setFolders(loadFolders(book)); }, [book]);
  const ordered = [...s.scenes].sort((a, b) => (a.telling_ord ?? a.clock_from) - (b.telling_ord ?? b.clock_from));
  const inFolder = new Set(folders.flatMap((f) => f.sceneIds));
  const loose = ordered.filter((sc) => !inFolder.has(sc.id));
  const persist = (next: NarFolder[]) => {
    setFolders(next);
    saveFolders(book, next);
  };
  return (
    <div className="narrative-list" data-testid="narrative-view">
      <p className="muted">拖卡片只改读序，不改故事时。幕/回是文件夹，不算进算出这一刻。</p>
      <button
        type="button"
        data-testid="nar-add-act"
        onClick={() => persist([...folders, { id: `act-${Date.now()}`, title: `幕 ${folders.length + 1}`, sceneIds: [] }])}
      >加幕</button>
      {folders.map((f) => (
        <section
          key={f.id}
          className="nar-folder"
          data-testid={`nar-folder-${f.id}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (!id) return;
            persist(folders.map((x) => x.id === f.id
              ? { ...x, sceneIds: [...x.sceneIds.filter((i) => i !== id), id] }
              : { ...x, sceneIds: x.sceneIds.filter((i) => i !== id) }));
          }}
        >
          <input
            value={f.title}
            onChange={(e) => persist(folders.map((x) => x.id === f.id ? { ...x, title: e.target.value } : x))}
          />
          {f.sceneIds.map((id) => ordered.find((sc) => sc.id === id)).filter((sc): sc is typeof ordered[number] => !!sc).map((sc) => (
            <article
              key={sc.id}
              className="narrative-card"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", sc.id)}
              onClick={() => s.selectScene(sc.id, sc.draft)}
            >{sc.intent}</article>
          ))}
        </section>
      ))}
      {loose.map((sc, i) => (
        <article
          key={sc.id}
          className="narrative-card"
          draggable
          data-testid={`narrative-card-${sc.id}`}
          onDragStart={(e) => e.dataTransfer.setData("text/plain", sc.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = e.dataTransfer.getData("text/plain");
            if (!from || from === sc.id) return;
            void s.reorderTelling(from, i);
          }}
          onClick={() => s.selectScene(sc.id, sc.draft)}
        >
          <div>{i + 1}. {sc.intent}</div>
          <div className="muted">读序 {sc.telling_ord ?? "—"}</div>
        </article>
      ))}
    </div>
  );
}

function RelationGrid() {
  const s = useStore();
  const people = s.state?.people || [];
  const scenes = s.scenes;
  return (
    <div>
      <p className="muted">点格给这场加上或拿掉在场。正史拿掉走同一套在场接口。</p>
      <table className="rel-grid" data-testid="look-relations-panel">
        <thead>
          <tr>
            <th />
            {people.map((p) => <th key={p.id}>{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {scenes.map((sc) => (
            <tr key={sc.id}>
              <td><button type="button" onClick={() => s.selectScene(sc.id, sc.draft)}>{sc.intent}</button></td>
              {people.map((p) => {
                const on = sc.presences.some((x) => x.entity_id === p.id || x.entity_id === p.name);
                const born = parseBornClock(p.profile?.born_clock);
                const age = on && born != null ? ageAtClock(sc.clock_from, born) : "";
                const gap = on && sc.cause_beat
                  ? (() => {
                    const cause = scenes.find((x) => x.id === sc.cause_beat);
                    return cause ? intervalLabel(cause.clock_to, sc.clock_from) : "";
                  })()
                  : "";
                return (
                  <td key={p.id} className={on ? "on" : ""}>
                    <button
                      type="button"
                      data-testid={`rel-cell-${sc.id}-${p.id}`}
                      onClick={() => on
                        ? s.removePresence(p.id, sc.id, sc.draft)
                        : s.addPresence(p.id, sc.id)}
                    >{on ? (age || gap || "在") : "·"}</button>
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

function SubwayLook() {
  const s = useStore();
  const people = s.state?.people || [];
  const scenes = [...s.scenes].sort((a, b) => a.clock_from - b.clock_from);
  const min = scenes[0]?.clock_from ?? 0;
  const max = scenes[scenes.length - 1]?.clock_to ?? 60;
  const span = Math.max(1, max - min);
  return (
    <div className="subway" data-testid="look-track">
      <p className="muted">轨是人，交叉是同场。拖到另一轨会加上在场。</p>
      {people.map((p, i) => (
        <div key={p.id} className="subway-row">
          <div className="subway-name">{p.name}</div>
          <div
            className="subway-line"
            style={{ background: ["#70B0F0", "#90C080", "#D06090", "#B090F0"][i % 4] }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) void s.addPresence(p.id, id);
            }}
          >
            {scenes.filter((sc) => sc.presences.some((x) => x.entity_id === p.id)).map((sc) => (
              <button
                key={sc.id}
                type="button"
                className="subway-node"
                draggable
                title={sc.intent}
                style={{ left: `${((sc.clock_from - min) / span) * 100}%`, color: "inherit" }}
                onClick={() => s.selectScene(sc.id, sc.draft)}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("text/plain", sc.id);
                }}
              />
            ))}
          </div>
        </div>
      ))}
      {people.length === 0 && <p>先建人物。</p>}
    </div>
  );
}

function OccupancyLook({ open, embedded }: { open: boolean; embedded?: boolean }) {
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
      {embedded && <button type="button" data-testid="flyout-close" onClick={() => s.setLook("时间轴")}>回时间轴</button>}
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

function ProgressLook({ open, embedded }: { open: boolean; embedded?: boolean }) {
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
