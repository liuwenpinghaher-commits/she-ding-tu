import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { ageAtClock, parseBornClock } from "../board/ages";
import { intervalLabel } from "../board/timelineGeom";
import { OccupancyLook } from "./OccupancyLook";

type SetupRel = { id: string; kind: string; from: string; to: string; note?: string };

export function RelationLook() {
  const [mode, setMode] = useState<"scene" | "people">("scene");
  const [showOcc, setShowOcc] = useState(false);
  return (
    <div data-testid="rel-view">
      <div className="look-toolbar" role="group" aria-label="关系格">
        <button type="button" data-testid="rel-mode-scene" className={mode === "scene" ? "on" : ""} onClick={() => setMode("scene")}>场×人</button>
        <button type="button" data-testid="rel-mode-people" className={mode === "people" ? "on" : ""} onClick={() => setMode("people")}>人×人</button>
        <button type="button" data-testid="rel-layout-occ" aria-pressed={showOcc} className={showOcc ? "on" : ""} onClick={() => setShowOcc((v) => !v)}>出场表</button>
      </div>
      {mode === "scene" ? <ScenePersonGrid /> : <PersonPersonGrid />}
      {showOcc && <OccupancyLook open embedded />}
    </div>
  );
}

function ScenePersonGrid() {
  const s = useStore();
  const people = s.state?.people || [];
  const scenes = s.scenes;
  return (
    <div>
      <p className="muted">点格给这场加上或拿掉在场。格内年龄、间隔只读。</p>
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
                    >
                      {on ? "在" : "·"}
                      {age ? <span className="muted" data-testid={`rel-age-${sc.id}-${p.id}`}> {age}</span> : null}
                      {gap ? <span className="muted" data-testid={`rel-gap-${sc.id}-${p.id}`}> {gap}</span> : null}
                    </button>
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

function PersonPersonGrid() {
  const s = useStore();
  const people = s.state?.people || [];
  const [rels, setRels] = useState<SetupRel[]>([]);
  const load = () => {
    api<{ relations?: SetupRel[] }>("/api/setup-relations")
      .then((r) => setRels(r.relations || []))
      .catch(() => setRels([]));
  };
  useEffect(() => { load(); }, [s.state?.book, people.length]);

  const linked = (a: string, b: string) =>
    rels.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));

  return (
    <div>
      <p className="muted">点格加上或拿掉从故事起点就成立的关系。不算进算出这一刻。</p>
      <table className="rel-grid" data-testid="rel-people-grid">
        <thead>
          <tr>
            <th />
            {people.map((p) => <th key={p.id}>{p.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {people.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              {people.map((col) => {
                if (row.id === col.id) {
                  return <td key={col.id} className="muted">—</td>;
                }
                const hit = linked(row.id, col.id);
                return (
                  <td key={col.id} className={hit ? "on" : ""}>
                    <button
                      type="button"
                      data-testid={`rel-people-${row.id}-${col.id}`}
                      onClick={async () => {
                        if (hit) {
                          await api(`/api/entities/${encodeURIComponent(row.id)}/relations/${encodeURIComponent(hit.id)}`, { method: "DELETE" });
                        } else {
                          await api(`/api/entities/${encodeURIComponent(row.id)}/relations`, {
                            method: "POST",
                            body: JSON.stringify({ kind: "related", target: col.id }),
                          });
                        }
                        load();
                      }}
                    >{hit ? "有" : "·"}</button>
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
