import { useState } from "react";
import { useStore } from "../state/store";
import { BRANCH_COLORS } from "../lenses/threads";
import { ProgressLook } from "./ProgressLook";

export function SubwayLook() {
  const s = useStore();
  const [mode, setMode] = useState<"person" | "line">("person");
  const [showProg, setShowProg] = useState(false);
  const people = s.state?.people || [];
  const lines = s.state?.threads || [];
  const scenes = [...s.scenes].sort((a, b) => a.clock_from - b.clock_from);
  const min = scenes[0]?.clock_from ?? 0;
  const max = scenes[scenes.length - 1]?.clock_to ?? 60;
  const span = Math.max(1, max - min);
  const tracks = mode === "person"
    ? people.map((p, i) => ({
      id: p.id,
      title: p.name,
      color: BRANCH_COLORS[i % BRANCH_COLORS.length],
      scenes: scenes.filter((sc) => sc.presences.some((x) => x.entity_id === p.id || x.entity_id === p.name)),
    }))
    : lines.map((ln, i) => ({
      id: ln.id,
      title: ln.name,
      color: BRANCH_COLORS[i % BRANCH_COLORS.length],
      scenes: scenes.filter((sc) => sc.story_threads.some((t) => t.id === ln.id)),
    }));

  return (
    <div className="subway" data-testid="look-track">
      <div className="look-toolbar" role="group" aria-label="轨迹">
        <button type="button" data-testid="subway-mode-person" className={mode === "person" ? "on" : ""} onClick={() => setMode("person")}>按人</button>
        <button type="button" data-testid="subway-mode-line" className={mode === "line" ? "on" : ""} onClick={() => setMode("line")}>按逻辑线</button>
        <button type="button" data-testid="subway-layout-progress" aria-pressed={showProg} className={showProg ? "on" : ""} onClick={() => setShowProg((v) => !v)}>进度</button>
      </div>
      <p className="muted">拖到另一轨会加上在场或贴上这条线，不离开原轨。</p>
      {tracks.map((tr) => (
        <div key={tr.id} className="subway-row" data-testid={`subway-lane-${tr.title}`}>
          <div className="subway-name">{tr.title}</div>
          <div
            className="subway-line"
            data-testid={`subway-drop-${tr.id}`}
            style={{ background: tr.color }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (!id) return;
              if (mode === "person") void s.addPresence(tr.id, id);
              else void s.attachThread(tr.id, "推进", id);
            }}
          >
            {tr.scenes.map((sc) => (
              <button
                key={sc.id}
                type="button"
                className="subway-node"
                draggable
                data-testid={`subway-node-${sc.id}`}
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
      {tracks.length === 0 && <p>{mode === "person" ? "先建人物。" : "先贴逻辑线。"}</p>}
      {showProg && <ProgressLook open embedded />}
    </div>
  );
}
