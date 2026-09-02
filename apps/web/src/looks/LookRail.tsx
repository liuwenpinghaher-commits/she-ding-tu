import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { Whiteboard } from "./Whiteboard";
import { TableLook } from "./TableLook";
import { RelationLook } from "./RelationLook";
import { SubwayLook } from "./SubwayLook";
import { OccupancyLook } from "./OccupancyLook";
import { ProgressLook } from "./ProgressLook";
import { loadFolders, saveFolders, type NarFolder } from "../shell/localPrefs";

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
