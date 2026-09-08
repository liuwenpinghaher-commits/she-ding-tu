import { useStore } from "../state/store";
import { Whiteboard } from "./Whiteboard";
import { TableLook } from "./TableLook";
import { RelationLook } from "./RelationLook";
import { SubwayLook } from "./SubwayLook";
import { OccupancyLook } from "./OccupancyLook";
import { ProgressLook } from "./ProgressLook";
import { NarrativeLook } from "./NarrativeLook";
import { GraphLook } from "./GraphLook";

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
      {look === "关系" && <RelationLook />}
      {look === "讲述序" && <NarrativeLook />}
      {look === "连线" && <GraphLook />}
      {look === "白板" && <Whiteboard open />}
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
          {!sc.draft && (
            <button type="button" data-testid={`list-edit-${sc.id}`} onClick={() => void s.requestCanonEdit(sc.id)}>改这一场</button>
          )}
        </li>
      ))}
    </ul>
  );
}
