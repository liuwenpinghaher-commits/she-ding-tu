import { useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";

export function TableLook() {
  const s = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [fresh, setFresh] = useState("");

  const toggle = (id: string) => {
    setPicked((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  return (
    <div id="table-view" data-testid="table-view">
      <button type="button" data-testid="table-back" onClick={() => s.setLook("时间轴")}>回时间轴</button>
      <p className="muted">草稿和正史都能改格。勾几场再点批量标读序，即时生效，⌘Z 可撤。</p>
      <div className="look-toolbar">
        <button
          type="button"
          data-testid="table-batch-telling"
          disabled={!picked.length}
          onClick={() => void s.batchTelling(picked)}
        >按勾选顺序标读序</button>
      </div>
      <table className="lib-table">
        <thead>
          <tr>
            <th />
            <th>场</th>
            <th>动作</th>
            <th>地点</th>
            <th>这场前后什么变了</th>
            <th>状态</th>
            <th>读序</th>
          </tr>
        </thead>
        <tbody data-testid="table-body">
          {s.scenes.map((sc) => (
            <tr key={`${sc.id}-${sc.intent}-${sc.telling_ord}-${sc.do_text || ""}`} onClick={() => s.selectScene(sc.id, sc.draft)}>
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  data-testid={`table-check-${sc.id}`}
                  checked={picked.includes(sc.id)}
                  onChange={() => toggle(sc.id)}
                />
              </td>
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
              <td>
                <input
                  data-testid={`table-do-${sc.id}`}
                  defaultValue={sc.do_text || ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (sc.do_text || "")) void s.patchSceneField(sc.id, sc.draft, { do_text: v });
                  }}
                />
              </td>
              <td>
                <input
                  data-testid={`table-place-${sc.id}`}
                  defaultValue={sc.place_id || ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (sc.place_id || "")) void s.patchSceneField(sc.id, sc.draft, { place_id: v });
                  }}
                />
              </td>
              <td>
                <input
                  data-testid={`table-shift-${sc.id}`}
                  defaultValue={sc.value_shift || ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (sc.value_shift || "")) void s.patchSceneField(sc.id, sc.draft, { value_shift: v });
                  }}
                />
              </td>
              <td>{sc.draft ? "草稿" : "正史"}</td>
              <td>
                <input
                  data-testid={`table-telling-${sc.id}`}
                  defaultValue={sc.telling_ord ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    if (n === sc.telling_ord) return;
                    void s.patchSceneField(sc.id, sc.draft, { telling_ord: n });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="look-toolbar">
        <input
          data-testid="table-new-intent"
          placeholder="表底新建：本场任务"
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
        />
        <button
          type="button"
          data-testid="table-new"
          disabled={!fresh.trim()}
          onClick={async () => {
            const intent = fresh.trim();
            if (!intent) return;
            await api("/api/write-next", { method: "POST", body: JSON.stringify({ intent }) });
            setFresh("");
            await s.refresh();
          }}
        >新建草稿</button>
      </div>
    </div>
  );
}
