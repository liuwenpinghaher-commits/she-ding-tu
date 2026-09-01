import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";
import { KIND_LABEL } from "./f10";

export function LibraryPage() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"group" | "table" | "gallery">("group");
  const [kind, setKind] = useState("");
  const [hasScene, setHasScene] = useState("");
  const [hasBio, setHasBio] = useState("");
  const [rels, setRels] = useState<Array<{ from: string; to: string }>>([]);
  const ents = s.state?.all_entities || s.state?.entities || [];
  useEffect(() => {
    api<{ relations?: Array<{ from: string; to: string }> }>("/api/setup-relations")
      .then((r) => setRels(r.relations || []))
      .catch(() => setRels([]));
  }, [s.state?.book]);
  const scenes = s.scenes;
  const pageIds = new Set((s.state?.entities || []).map((e) => e.id));

  const rows = useMemo(() => {
    return ents.filter((e) => {
      if (kind && e.kind !== kind) return false;
      const aliases = e.profile?.aliases || "";
      if (q && !e.name.includes(q) && !aliases.includes(q)) return false;
      const appears = scenes.filter((sc) =>
        sc.presences.some((p) => p.entity_id === e.id || p.entity_id === e.name) || sc.place_id === e.id || sc.place_id === e.name,
      );
      if (hasScene === "yes" && !appears.length) return false;
      if (hasScene === "no" && appears.length) return false;
      const bio = (e.profile?.setup || e.profile?.bio || "").trim();
      if (hasBio === "yes" && !bio) return false;
      if (hasBio === "no" && bio) return false;
      return true;
    }).map((e) => {
      const appears = scenes.filter((sc) =>
        sc.presences.some((p) => p.entity_id === e.id || p.entity_id === e.name) || sc.place_id === e.id || sc.place_id === e.name,
      );
      const cols = appears.map((sc) => sc.column_id);
      const first = cols[0];
      const last = cols[cols.length - 1];
      const firstIdx = (s.state?.columns || []).findIndex((c) => c.id === first);
      const lastIdx = (s.state?.columns || []).findIndex((c) => c.id === last);
      const relN = rels.filter((r) => r.from === e.id || r.to === e.id || r.from === e.name || r.to === e.name).length;
      return {
        e,
        count: appears.length,
        first: firstIdx >= 0 ? firstIdx + 1 : 0,
        last: lastIdx >= 0 ? lastIdx + 1 : 0,
        relN,
        bio: (e.profile?.setup || e.profile?.bio || "").trim(),
        aliases: e.profile?.aliases || "",
      };
    });
  }, [ents, kind, q, hasScene, hasBio, scenes, s.state?.columns, rels]);

  const groups = ["person", "place", "thing", "faction", "rule", "promise"];

  return (
    <div className="page" data-testid="library">
      <h1>设定库</h1>
      <p className="muted">左栏仍只列本页出场。这里看全书。</p>
      {ents.length === 0 && <p>还没有设定。去左栏新建。</p>}
      <div className="lib-toolbar">
        <input placeholder="搜名字与别称" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">全部类</option>
          {groups.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select value={hasScene} onChange={(e) => setHasScene(e.target.value)}>
          <option value="">出场不限</option>
          <option value="yes">有出场</option>
          <option value="no">没出场</option>
        </select>
        <select value={hasBio} onChange={(e) => setHasBio(e.target.value)}>
          <option value="">小传不限</option>
          <option value="yes">有小传</option>
          <option value="no">没小传</option>
        </select>
        <button type="button" className={view === "group" ? "on" : ""} onClick={() => setView("group")}>按类</button>
        <button type="button" className={view === "table" ? "on" : ""} onClick={() => setView("table")}>表格</button>
        <button type="button" className={view === "gallery" ? "on" : ""} onClick={() => setView("gallery")}>画廊</button>
      </div>
      {view === "group" && groups.map((k) => (
        <section key={k}>
          <h2>{KIND_LABEL[k]}</h2>
          <ul className="lib-cards">
            {rows.filter((r) => r.e.kind === k).map((r) => (
              <li key={r.e.id}>
                <button type="button" onClick={() => s.openDossier(r.e.name)}>
                  <span className={`kind-dot ${k}`} /> {r.e.name}
                  {r.aliases ? ` · ${r.aliases}` : ""} · 出场 {r.count}
                </button>
                {!pageIds.has(r.e.id) && <span className="muted">不在本页</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {view === "table" && (
        <table className="lib-table">
          <thead>
            <tr><th>名字</th><th>类</th><th>别称</th><th>出场几次</th><th>第一列</th><th>最后列</th><th>关系数</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id} onClick={() => s.openDossier(r.e.name)}>
                <td>{r.e.name}</td>
                <td>{KIND_LABEL[r.e.kind] || r.e.kind}</td>
                <td>{r.aliases}</td>
                <td>{r.count}</td>
                <td>{r.first || "—"}</td>
                <td>{r.last || "—"}</td>
                <td>{r.relN}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view === "gallery" && (
        <div className="grid">
          {rows.map((r) => (
            <article key={r.e.id} className="book-card" onClick={() => s.openDossier(r.e.name)}>
              <h2><span className={`kind-dot ${r.e.kind}`} /> {r.e.name}</h2>
              <p>{r.bio ? r.bio.split("\n").slice(0, 2).join(" ") : "还没写小传"}</p>
            </article>
          ))}
        </div>
      )}
      <button type="button" onClick={() => s.goBoard()}>回分场条</button>
    </div>
  );
}
