import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { DossierPage } from "./DossierPage";

export function Dialogs() {
  const s = useStore();
  const pending = s.state?.pending;
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => { setChoice(null); }, [pending?.op, pending?.suggestions?.map((x) => x.id).join(",")]);
  const [craftPremise, setCraftPremise] = useState(s.state?.craft?.premise || "");
  const [chaps, setChaps] = useState<{ title: string; start_column: string }[]>(s.state?.craft?.chapters || []);

  return (
    <>
      {s.banner && <div className="banner">{s.banner}</div>}
      {s.toast && <div className="toast">{s.toast}</div>}

      <dialog id="confirm-dlg" data-testid="confirm-change" open={!!pending}>
        <h3>确认变更</h3>
        <ul data-testid="impact-list">
          {(pending?.impacts || []).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        <div>
          {(pending?.suggestions || []).map((sg) => (
            <button
              key={sg.id}
              type="button"
              data-testid={`suggest-${sg.id}`}
              onClick={() => {
                if (sg.id === "cancel") s.cancelChange();
                else setChoice(sg.id);
              }}
            >{sg.label}</button>
          ))}
        </div>
        <button
          data-testid="confirm-ok"
          type="button"
          disabled={!choice}
          onClick={() => { if (choice) { s.confirmChange(choice); setChoice(null); } }}
        >确认变更</button>
        <button data-testid="confirm-cancel" type="button" onClick={() => { setChoice(null); s.cancelChange(); }}>取消</button>
      </dialog>

      {s.craftOpen && (
        <div className="dialog-back">
          <div className="dialog" data-testid="craft-dialog">
            <h3>书页</h3>
            <label>主脑 <input data-testid="craft-premise" value={craftPremise} onChange={(e) => setCraftPremise(e.target.value)} /></label>
            {chaps.map((ch, i) => (
              <div key={i}>
                <input data-testid={`craft-title-${i}`} value={ch.title} onChange={(e) => {
                  const n = [...chaps]; n[i] = { ...n[i], title: e.target.value }; setChaps(n);
                }} />
                <select data-testid={`craft-start-${i}`} value={ch.start_column} onChange={(e) => {
                  const n = [...chaps]; n[i] = { ...n[i], start_column: e.target.value }; setChaps(n);
                }}>
                  {(s.state?.columns || []).map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
                </select>
              </div>
            ))}
            <button data-testid="craft-add-chapter" type="button" onClick={() => setChaps([...chaps, { title: "", start_column: s.state?.columns[0]?.id || "col0" }])}>加一回</button>
            <button data-testid="craft-save" type="button" onClick={() => s.saveCraft({ ...s.state?.craft, premise: craftPremise, chapters: chaps })}>写入书页</button>
            <div data-testid="craft-msg">{s.craftMsg}</div>
            <button data-testid="craft-close" type="button" onClick={() => s.setCraftOpen(false)}>关闭</button>
          </div>
        </div>
      )}

      {s.exportOpen && (
        <div className="dialog-back">
          <div className="dialog">
            <h3>导出</h3>
            <p>这份文件改了不会写回正史。要改回来改分场条。</p>
            <p className="muted" data-testid="export-count">
              {s.exportOut
                ? `这次会导出 ${Math.max(0, (s.exportOut.match(/^## /gm) || []).length || (s.exportOut.match(/状态：/g) || []).length)} 场，其中 ${(s.exportOut.match(/状态：草稿/g) || []).length} 场是草稿`
                : "点导出看预览"}
            </p>
            <label><input type="checkbox" data-testid="export-include-drafts" checked={s.exportIncludeDrafts} onChange={(e) => s.setExportIncludeDrafts(e.target.checked)} /> 含草稿</label>
            <button data-testid="export-run" type="button" onClick={() => s.loadExport(s.exportIncludeDrafts)}>导出</button>
            <button
              data-testid="export-download"
              type="button"
              disabled={!s.exportOut}
              onClick={() => {
                const blob = new Blob([s.exportOut], { type: "text/markdown;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${s.state?.book || "设定图"}.md`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >下载 .md</button>
            <pre data-testid="export-out">{s.exportOut}</pre>
            <button data-testid="export-close" type="button" onClick={() => s.setExportOpen(false)}>关闭</button>
          </div>
        </div>
      )}

      {s.pasteOpen && (
        <div className="dialog-back">
          <div className="dialog" data-testid="paste-dialog">
            <h3>丢一段草稿</h3>
            <textarea data-testid="paste-text" className="grow" value={s.pasteText} onChange={(e) => s.setPasteText(e.target.value)} />
            <button data-testid="paste-run" type="button" onClick={s.runPaste}>拆开看</button>
            {(s.state?.paste_suggestions || []).map((p) => (
              <button key={p.id} type="button" data-testid={`paste-apply-${p.id}`} onClick={() => s.applyPaste(p.id)}>写入此框</button>
            ))}
            <button data-testid="paste-close" type="button" onClick={() => s.setPasteOpen(false)}>关闭</button>
          </div>
        </div>
      )}

      {s.delBookOpen && (
        <div className="dialog-back">
          <div className="dialog" data-testid="del-book">
            <h3>删除这本书</h3>
            <p>不能撤销。手打书名确认。</p>
            <input data-testid="del-book-type" value={s.delBookType} onChange={(e) => s.setDelBookType(e.target.value)} />
            <button data-testid="del-book-ok" type="button" disabled={s.delBookType !== s.delBookName} onClick={() => s.deleteBook(s.delBookName, s.delBookType)}>确认删除</button>
            <button type="button" onClick={() => s.setDelBookOpen()}>取消</button>
          </div>
        </div>
      )}
      {s.route.kind !== "dossier" && <DossierPage />}
    </>
  );
}
