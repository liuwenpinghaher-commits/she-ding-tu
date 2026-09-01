import { useState } from "react";
import { useStore } from "../state/store";

const KINDS = [
  ["person", "人物"],
  ["place", "地点"],
  ["thing", "道具"],
  ["faction", "组织"],
  ["rule", "规则"],
  ["promise", "伏笔"],
];

export function LeftRail() {
  const s = useStore();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("person");
  const [expand, setExpand] = useState(false);
  const [desire, setDesire] = useState("");
  const [secret, setSecret] = useState("");
  const [speech, setSpeech] = useState("");
  const pageIds = new Set((s.state?.entities || []).map((e) => e.id));
  return (
    <aside id="rail" className="left-rail" data-testid="left-rail">
      <input data-testid="ent-search" type="search" placeholder="搜全书人物、地点、规则…" value={s.searchQ} onChange={(e) => s.setSearchQ(e.target.value)} aria-label="搜全书" />
      <div>
        <button id="rail-create" type="button" data-testid="rail-create" onClick={() => setExpand((v) => !v)}>新建</button>
        <button data-testid="do-search" type="button" onClick={s.search}>搜</button>
      </div>
      <input data-testid="ent-name" placeholder="名字" value={name} onChange={(e) => setName(e.target.value)} />
      <select data-testid="ent-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
      </select>
      {expand && (
        <>
          <input data-testid="ent-desire" placeholder="欲望" value={desire} onChange={(e) => setDesire(e.target.value)} />
          <input data-testid="ent-secret" placeholder="秘密" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <input data-testid="ent-speech" placeholder="说话方式" value={speech} onChange={(e) => setSpeech(e.target.value)} />
        </>
      )}
      <button data-testid="new-entity" type="button" onClick={() => {
        if (!name.trim()) return;
        const profile: Record<string, string> = {};
        if (desire.trim()) profile.desire = desire.trim();
        if (secret.trim()) profile.secret = secret.trim();
        if (speech.trim()) { profile.voice = speech.trim(); profile.speech = speech.trim(); }
        s.addEntity(kind, name.trim(), Object.keys(profile).length ? profile : undefined);
        setName(""); setDesire(""); setSecret(""); setSpeech("");
      }}>新建</button>
      <ul data-testid="search-hits">
        {s.searchEmpty && <li data-testid="search-empty">没有这个名字</li>}
        {s.searchHits.map((e) => (
          <li
            key={e.id}
            data-testid={`hit-${e.name}`}
            draggable={e.kind !== "rule"}
            onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
            onClick={() => s.openDossier(e.name)}
          >
            {e.name}
            {!pageIds.has(e.id) && <span data-testid={`off-page-${e.name}`}>不在本页</span>}
          </li>
        ))}
      </ul>
      <ul data-testid="ent-list">
        {(s.state?.entities || []).map((e) => (
          <li
            key={e.id}
            className="ent"
            data-testid={`ent-${e.name}`}
            draggable={e.kind !== "rule"}
            onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
            onClick={() => s.openDossier(e.name)}
          >
            {e.name}
          </li>
        ))}
      </ul>
    </aside>
  );
}
