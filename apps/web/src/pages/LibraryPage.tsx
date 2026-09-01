import { useState } from "react";
import { useStore } from "../state/store";

export function LibraryPage() {
  const s = useStore();
  const [q, setQ] = useState("");
  const ents = (s.state?.all_entities || s.state?.entities || []).filter((e) =>
    !q || e.name.includes(q) || (e.profile?.aliases || "").includes(q)
  );
  const groups = ["person", "place", "thing", "faction", "rule", "promise"];
  const lab: Record<string, string> = { person: "人物", place: "地点", thing: "道具", faction: "组织", rule: "规则", promise: "伏笔" };
  return (
    <div className="page" data-testid="library">
      <h1>设定库</h1>
      <input placeholder="搜名字与别称" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map((k) => (
        <section key={k}>
          <h2>{lab[k]}</h2>
          <ul>
            {ents.filter((e) => e.kind === k).map((e) => (
              <li key={e.id}><button type="button" onClick={() => s.openDossier(e.name)}>{e.name}</button></li>
            ))}
          </ul>
        </section>
      ))}
      <button type="button" onClick={() => s.goBoard()}>回分场条</button>
    </div>
  );
}
