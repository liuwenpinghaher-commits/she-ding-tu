import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { DossierPage } from "./DossierPage";
import { Modal } from "./Modal";

function delBookImpacts(s: ReturnType<typeof useStore>): string[] {
  const name = s.delBookName;
  const item = (s.books.items || []).find((b) => b.name === name);
  const open = s.state?.book === name;
  const committed = open ? (s.state?.committed || []).length : (item?.committed ?? 0);
  const drafts = open ? (s.state?.drafts || []).length : (item?.drafts ?? 0);
  const cols = open ? (s.state?.columns || []).length : (item?.columns ?? 0);
  const last = open
    ? (s.state?.committed || []).at(-1)?.intent || (s.state?.drafts || []).at(-1)?.draft.intent
    : item?.last_intent;
  const out: string[] = [];
  if (committed) out.push(`正史 ${committed} 场会一起删掉`);
  else out.push("这本书还没有正史");
  if (drafts) out.push(`草稿 ${drafts} 场会一起删掉`);
  if (cols) out.push(`${cols} 列时间结构会一起删掉`);
  if (last) out.push(`最后一场「${last}」会没`);
  out.push("不能撤销，书架上也不再有这本书");
  return out;
}

export function Dialogs() {
  const s = useStore();
  const pending = s.state?.pending;
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => { setChoice(null); }, [pending?.op, pending?.suggestions?.map((x) => x.id).join(",")]);
  const [craftPremise, setCraftPremise] = useState(s.state?.craft?.premise || "");
  const [craftMemo, setCraftMemo] = useState(s.state?.craft?.structure_memo || "");
  const [chaps, setChaps] = useState<{ title: string; start_column: string }[]>(s.state?.craft?.chapters || []);

  return (
    <>
      {s.banner && <div className="banner">{s.banner}</div>}
      {s.toast && (
        <div className="toast" data-testid="undo-toast" role="status">
          {s.toast}
          {s.undoStack.length > 0 && (
            <button type="button" data-testid="toast-undo" onClick={() => s.undo()}>撤销</button>
          )}
        </div>
      )}

      <Modal open={!!pending} onClose={() => { setChoice(null); void s.cancelChange(); }} testid="confirm-change">
        <h3>确认变更</h3>
        <p className="muted" data-testid="confirm-explain">这些列的故事时间会改，后面已正史场要重查穿帮。Narra 此刻未改。选一种办法</p>
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
          className="primary"
          type="button"
          disabled={!choice}
          onClick={() => { if (choice) { s.confirmChange(choice); setChoice(null); } }}
        >确认变更</button>
        <button data-testid="confirm-cancel" type="button" onClick={() => { setChoice(null); void s.cancelChange(); }}>取消</button>
      </Modal>

      <Modal open={s.craftOpen} onClose={() => s.setCraftOpen(false)}>
          <div data-testid="craft-dialog">
            <h3>书页</h3>
            <label>主脑 <input data-testid="craft-premise" value={craftPremise} onChange={(e) => setCraftPremise(e.target.value)} /></label>
            <p className="muted" data-testid="craft-memo-why">结构备忘是工具箱，不挡写入、不进规定情境、不指定写哪一场。</p>
            <label>可选结构备忘
              <textarea
                data-testid="craft-memo"
                className="grow"
                rows={4}
                value={craftMemo}
                onChange={(e) => setCraftMemo(e.target.value)}
                placeholder="三幕或七步可勾在这里。永不进算出这一刻。"
              />
            </label>
            <button
              type="button"
              data-testid="craft-memo-3act"
              onClick={() => {
                if (craftMemo.trim()) return;
                setCraftMemo("第一幕：\n第二幕：\n第三幕：");
              }}
            >填入三幕提纲</button>
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
            <button data-testid="craft-save" className="primary" type="button" onClick={() => s.saveCraft({ ...s.state?.craft, premise: craftPremise, chapters: chaps, structure_memo: craftMemo })}>写入书页</button>
            {chaps.map((ch, i) => (
              <button
                key={`compose-${i}`}
                data-testid={`compose-chapter-${i}`}
                type="button"
                disabled={s.composeBusy || !ch.title}
                onClick={() => s.composeChapter(ch.title)}
              >{s.composeBusy ? "正在拼…" : `拼「${ch.title || "未名回"}」（不写回正史）`}</button>
            ))}
            <div data-testid="craft-msg">{s.craftMsg}</div>
            <div data-testid="compose-msg">{s.composeMsg}</div>
            {s.composeOut ? <pre data-testid="compose-out">{s.composeOut}</pre> : null}
            <button data-testid="craft-close" type="button" onClick={() => s.setCraftOpen(false)}>关闭</button>
          </div>
      </Modal>

      <Modal open={s.exportOpen} onClose={() => s.setExportOpen(false)}>
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
      </Modal>

      <Modal open={s.pasteOpen} onClose={() => s.setPasteOpen(false)}>
          <div data-testid="paste-dialog">
            <h3>丢一段草稿</h3>
            <p className="muted">建议落到哪一场哪一格。点「写入此框」才进草稿，写入正史仍须另点。</p>
            <textarea data-testid="paste-text" className="grow" placeholder="贴一段，拆开后仍要一场一场放进格子" value={s.pasteText} onChange={(e) => s.setPasteText(e.target.value)} />
            <button data-testid="paste-run" type="button" onClick={s.runPaste}>拆开看</button>
            {(s.state?.paste_suggestions || []).map((row) => {
              const field = row.field === "say_text" ? "对白" : row.field === "think_text" ? "内心" : row.field === "intent" ? "本场任务" : row.field === "value_shift" ? "价值转折" : "动作";
              const snippet = (row.text || "").replace(/\s+/g, " ").slice(0, 24);
              const where = row.target_label || "当前草稿";
              return (
                <button
                  key={row.id}
                  type="button"
                  data-testid={`paste-apply-${row.id}`}
                  onClick={() => s.applyPaste(row.id)}
                >写入此框 · {where} · {field}：{snippet}{row.text.length > 24 ? "…" : ""}</button>
              );
            })}
            <button data-testid="paste-close" type="button" onClick={() => s.setPasteOpen(false)}>关闭</button>
          </div>
      </Modal>

      {!!s.deleteDraftAsk && (
      <Modal open onClose={s.cancelDeleteDraft} testid="delete-draft-confirm">
            <h3>丢掉这场草稿？</h3>
            <p>只删草稿，正史不动。不能从这里恢复。</p>
            <button data-testid="delete-draft-ok" className="primary" type="button" onClick={() => void s.confirmDeleteDraft()}>确认丢掉</button>
            <button data-testid="delete-draft-cancel" type="button" onClick={s.cancelDeleteDraft}>取消</button>
      </Modal>
      )}
      <Modal open={s.delBookOpen} onClose={() => s.setDelBookOpen()} testid="del-book">
            <h3>删除这本书</h3>
            <p>不能撤销。手打书名确认。</p>
            <ul data-testid="del-book-impacts">
              {delBookImpacts(s).map((t) => <li key={t}>{t}</li>)}
            </ul>
            <input data-testid="del-book-type" value={s.delBookType} onChange={(e) => s.setDelBookType(e.target.value)} />
            <button data-testid="del-book-ok" type="button" disabled={s.delBookType !== s.delBookName} onClick={() => s.deleteBook(s.delBookName, s.delBookType)}>确认删除</button>
            <button type="button" onClick={() => s.setDelBookOpen()}>取消</button>
      </Modal>
      {s.route.kind !== "dossier" && <DossierPage />}
    </>
  );
}
