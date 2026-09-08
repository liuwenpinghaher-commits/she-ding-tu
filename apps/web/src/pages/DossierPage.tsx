import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { KIND_LABEL, keysFor, testIdFor } from "./f10";

export function DossierPage({ mode = "dialog" }: { mode?: "dialog" | "side" | "full" }) {
  const s = useStore();
  const payload = s.dossierPayload;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [relKind, setRelKind] = useState("member");
  const [relTarget, setRelTarget] = useState("");
  const [relErr, setRelErr] = useState("");
  const [expand, setExpand] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const p = payload?.profile || {};
    const next: Record<string, string> = { ...p };
    if (p.speech && !p.voice) next.voice = p.speech;
    setFields(next);
  }, [payload?.id, payload?.profile]);

  if (!s.dossierOpen && mode === "dialog") return null;
  if (s.dossierLoading && !payload) {
    const loading = (
      <div className={`dossier-body${mode === "full" ? " full" : ""}`} data-testid="dossier-loading">
        <p>正在打开</p>
      </div>
    );
    if (mode === "full") return <div className="page dossier-full">{loading}</div>;
    if (mode === "side") return <div className="look-rail show dossier-side">{loading}</div>;
    return (
      <div className="dialog-back">
        <div className="dialog">{loading}</div>
      </div>
    );
  }
  const kind = payload?.kind || "person";
  const keys = keysFor(kind);
  const shown = keys.filter((k) => expand || k.always || (fields[k.key] || "").trim());
  const hiddenN = keys.length - shown.length;

  const body = (
    <div className={`dossier-body${mode === "full" ? " full" : ""}`} data-testid="dossier">
      <h2>{s.dossierName || payload?.name}</h2>
      <p className="muted">{KIND_LABEL[kind] || kind} · 改这一场去分场条。不能在档案写入正史。</p>
      <div className="scene-open">
        <button type="button" onClick={() => s.setOpen(null)}>就地</button>
        <button type="button" onClick={() => s.setOpen("side")}>侧开</button>
        <button type="button" onClick={() => {
          const book = s.state?.book;
          const name = s.dossierName || payload?.name;
          if (book && name) location.hash = `#/b/${encodeURIComponent(book)}/e/${encodeURIComponent(name)}`;
        }}>整页</button>
      </div>
      {saved && <p className="toast-inline">{saved}</p>}
      <section>
        <h3>基本设定</h3>
        {shown.map((k) => (
          <label key={k.key}>{k.label}
            <input
              data-testid={testIdFor(k.key)}
              value={fields[k.key] || ""}
              onChange={(e) => setFields({ ...fields, [k.key]: e.target.value })}
            />
          </label>
        ))}
        {hiddenN > 0 && (
          <button type="button" onClick={() => setExpand(true)}>展开全部（还有 {hiddenN} 个空键）</button>
        )}
        {expand && hiddenN === 0 && (
          <button type="button" onClick={() => setExpand(false)}>收起空键</button>
        )}
        <button data-testid="dossier-save" type="button" onClick={() => {
          const out = { ...fields, speech: fields.voice || fields.speech || "" };
          s.saveDossier(out).then(() => {
            setSaved("已存。这是身份，从故事起点就成立，不用写入正史");
            setTimeout(() => setSaved(""), 2000);
          });
        }}>存</button>
      </section>
      <section>
        <h3>从故事起点就成立</h3>
        <div>
          <select data-testid="rel-kind" value={relKind} onChange={(e) => { setRelKind(e.target.value); setRelErr(""); }}>
            <option value="related">和…有关系</option>
            <option value="member">属于</option>
            <option value="holds">拿着</option>
            <option value="contains">在…之内</option>
          </select>
          <input data-testid="rel-target" value={relTarget} onChange={(e) => setRelTarget(e.target.value)} placeholder="对方名字" />
          <button data-testid="rel-add" type="button" onClick={() => {
            s.addRel(relKind, relTarget).then(() => { setRelTarget(""); setRelErr(""); }).catch((e: Error) => setRelErr(e.message || "这两类不能这样连"));
          }}>加一条关系</button>
        </div>
        {relErr && <p className="err">{relErr}</p>}
        <p className="muted">想说「从某场起才这样」：那不是设定，是戏。去那一场写本场变化。</p>
        <div data-testid="dossier-rels">
          {s.dossierRels.length === 0 && <p className="muted">还没有从故事起点就成立的关系</p>}
          {s.dossierRels.map((r) => <div key={r.id}>{r.from} {r.kind} {r.to}</div>)}
        </div>
      </section>
      <section>
        <h3>场上变过（只读）</h3>
        {(payload?.relations_from_scenes || []).length === 0 && <p className="muted">还没有场上变过的关系</p>}
        {(payload?.relations_from_scenes || []).map((r, i) => (
          <button
            key={i}
            type="button"
            className="ghost"
            onClick={() => {
              if (r.beat_id) {
                const sc = s.scenes.find((x) => x.id === r.beat_id);
                s.setDossierOpen(false);
                if (sc) s.selectScene(sc.id, sc.draft);
                s.goBoard();
              }
            }}
          >{r.label || r.kind} {r.other}{r.beat_id ? " · 跳那场" : ""}</button>
        ))}
      </section>
      <section>
        <h3>出场（只读）</h3>
        {(payload?.appearances || payload?.beats || []).length === 0 && <p className="muted">还没上过场</p>}
        {(payload?.appearances || payload?.beats || []).map((a) => (
          <button
            key={a.id}
            type="button"
            className="ghost"
            data-testid={`dossier-beat-${a.id}`}
            onClick={() => {
              s.setDossierOpen(false);
              s.selectScene(a.id, a.status === "draft");
              s.goBoard();
            }}
          >{a.intent || a.id} · {a.status === "draft" ? "草稿" : "正史"}</button>
        ))}
      </section>
      <section>
        <h3>删设定</h3>
        {(payload?.appearances || payload?.beats || []).length > 0 ? (
          <p className="err" data-testid="dossier-del-block">已挂在场上，不能从设定里删。先从分场条拿掉。上面每场可跳。</p>
        ) : (
          <button
            type="button"
            data-testid="dossier-del"
            onClick={() => {
              const name = s.dossierName || payload?.name;
              if (name) s.deleteEntity(name).catch((e: Error) => setRelErr(e.message || "删不了"));
            }}
          >删设定</button>
        )}
      </section>
      <section>
        <h3>情状 / 他知道什么 / 相关伏笔（只读）</h3>
        {(payload?.windows_readonly || []).map((w, i) => (
          <p key={i}>{w.attr} → {w.value}</p>
        ))}
        {(payload?.knows_readonly || []).map((k) => <p key={k}>{k}</p>)}
        {(payload?.wrong_beliefs_readonly || []).map((k) => <p key={k}>{k}</p>)}
        {(payload?.promises_readonly || []).map((p) => <p key={p.id || p.name}>{p.name} · {p.status}</p>)}
      </section>
      <button data-testid="dossier-close" type="button" onClick={() => {
        s.setDossierOpen(false);
        if (mode !== "dialog") s.goBoard();
      }}>关闭</button>
    </div>
  );

  if (mode === "full") return <div className="page dossier-full">{body}</div>;
  if (mode === "side") return <div className="look-rail show dossier-side">{body}</div>;
  return (
    <div className="dialog-back">
      <div className="dialog">{body}</div>
    </div>
  );
}
