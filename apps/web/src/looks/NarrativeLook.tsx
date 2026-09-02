import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { loadFolders, saveFolders, type NarFolder } from "../shell/localPrefs";

export function NarrativeLook() {
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
  const dropOnFolder = (folderId: string, sceneId: string) => {
    persist(folders.map((x) => x.id === folderId
      ? { ...x, sceneIds: [...x.sceneIds.filter((i) => i !== sceneId), sceneId] }
      : { ...x, sceneIds: x.sceneIds.filter((i) => i !== sceneId) }));
  };
  return (
    <div className="narrative-list" data-testid="narrative-view">
      <p className="muted">拖卡片只改读序，不改故事时。幕/回是文件夹，不算进算出这一刻。</p>
      <div className="look-toolbar">
        <button
          type="button"
          data-testid="nar-add-act"
          onClick={() => persist([...folders, { id: `act-${Date.now()}`, title: `幕 ${folders.filter((f) => (f.kind || "act") === "act").length + 1}`, kind: "act", sceneIds: [] }])}
        >加幕</button>
        <button
          type="button"
          data-testid="nar-add-chapter"
          onClick={() => persist([...folders, { id: `ch-${Date.now()}`, title: `回 ${folders.filter((f) => f.kind === "chapter").length + 1}`, kind: "chapter", sceneIds: [] }])}
        >加回</button>
      </div>
      {folders.map((f) => (
        <section
          key={f.id}
          className={`nar-folder${f.kind === "chapter" ? " chapter" : ""}`}
          data-testid={`nar-folder-${f.id}`}
          data-kind={f.kind || "act"}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id) dropOnFolder(f.id, id);
          }}
        >
          <input
            data-testid={`nar-title-${f.id}`}
            value={f.title}
            onChange={(e) => persist(folders.map((x) => x.id === f.id ? { ...x, title: e.target.value } : x))}
          />
          {f.sceneIds.map((id) => ordered.find((sc) => sc.id === id)).filter((sc): sc is typeof ordered[number] => !!sc).map((sc) => (
            <article
              key={sc.id}
              className="narrative-card"
              draggable
              data-testid={`narrative-card-${sc.id}`}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", sc.id)}
              onClick={() => s.selectScene(sc.id, sc.draft)}
            >{sc.intent}</article>
          ))}
        </section>
      ))}
      <div data-testid="nar-loose">
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
            <button
              type="button"
              data-testid={`nar-telling-up-${sc.id}`}
              onClick={(e) => { e.stopPropagation(); if (i > 0) void s.reorderTelling(sc.id, i - 1); }}
            >上移读序</button>
          </article>
        ))}
      </div>
    </div>
  );
}
