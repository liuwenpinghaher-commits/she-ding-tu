import { useState } from "react";
import { useStore } from "../state/store";

export function ScenePage() {
  const s = useStore();
  const draft = !!s.state?.selected;
  const canon = !!s.state?.selected_canon;
  const [deltaEnt, setDeltaEnt] = useState("");
  const [deltaAttr, setDeltaAttr] = useState("");
  const [deltaVal, setDeltaVal] = useState("");
  const [deltaFrom, setDeltaFrom] = useState("0");
  const [knowWho, setKnowWho] = useState("");
  const [knowFact, setKnowFact] = useState("");
  const [knowCert, setKnowCert] = useState("knows");
  const [knowTruth, setKnowTruth] = useState("");
  const [threadPick, setThreadPick] = useState("");
  const [threadRole, setThreadRole] = useState("推进");
  const [threadNew, setThreadNew] = useState("");
  const [threadType, setThreadType] = useState("支线");
  const scene = s.selectedScene;
  const threads = scene?.story_threads || [];
  const catalog = s.state?.threads || [];
  const deltas = scene?.deltas || [];
  const knows = scene?.knowledge_writes || [];
  const ents = s.state?.all_entities || s.state?.entities || [];

  return (
    <aside className="right-rail">
      <div data-testid="sidebar" className="muted">{s.sidebar || (s.state?.world ? `t=${s.state.world.t}` : "本场规定情境")}</div>
      <div data-testid="moment-col" className="muted">{s.sidebar.includes("t=") ? s.sidebar : (s.state?.world ? `t=${s.state.world.t}` : "")}</div>
      <div data-testid="moment-body">{s.sidebar.includes("t=") ? s.sidebar : (s.state?.world ? `t=${s.state.world.t}` : s.sidebar)}</div>
      <div data-testid="knows-list">{JSON.stringify(s.state?.world?.knows || {})}</div>
      <div data-testid="promise-suggest">
        建议本场对伏笔做哪一件
        <button type="button" data-testid="ignore-suggest">忽略</button>
      </div>
      <div className="field">
        <label>场次 <input data-testid="scene-title" value={s.sceneTitle} onChange={(e) => s.setSceneTitle(e.target.value)} /></label>
        <label>因为哪一场 <input data-testid="cause-beat" value={s.causeBeat} onChange={(e) => s.setCauseBeat(e.target.value)} /></label>
        <div data-testid="caused-by" className="muted">{s.causedBy}</div>
        <label>读序 <input data-testid="telling-ord" value={s.tellingOrd} onChange={(e) => s.setTellingOrd(e.target.value)} /></label>
        <button data-testid="set-telling" type="button" onClick={s.setTelling}>标读序</button>
        <label>当众 <input type="radio" name="vis" data-testid="vis-public" checked={!s.visPrivate} onChange={() => s.setVisPrivate(false)} /></label>
        <label>私下 <input type="radio" name="vis" data-testid="vis-private" checked={s.visPrivate} onChange={() => s.setVisPrivate(true)} /></label>
        <input data-testid="visible-to" placeholder="私下谁会看见，逗号分隔" value={s.visibleTo} onChange={(e) => s.setVisibleTo(e.target.value)} />
      </div>
      <div data-testid="scene-threads">
        {threads.length === 0 && <span>未归线</span>}
        {threads.map((t) => {
          const name = catalog.find((x) => x.id === t.id)?.name || t.id;
          return <div key={t.id} data-testid={`scene-thread-${name}`}>{name} · {t.role || "推进"}</div>;
        })}
        <select data-testid="thread-pick" value={threadPick} onChange={(e) => setThreadPick(e.target.value)}>
          <option value="">选一条线</option>
          {catalog.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select data-testid="thread-role" value={threadRole} onChange={(e) => setThreadRole(e.target.value)}>
          <option value="推进">推进</option>
          <option value="旁及">旁及</option>
          <option value="暂停">暂停</option>
        </select>
        <button type="button" data-testid="thread-attach" onClick={() => threadPick && s.attachThread(threadPick, threadRole)}>贴上这条线</button>
        <input data-testid="thread-new-name" placeholder="新支线名" value={threadNew} onChange={(e) => setThreadNew(e.target.value)} />
        <select data-testid="thread-new-type" value={threadType} onChange={(e) => setThreadType(e.target.value)}>
          <option value="支线">支线</option>
          <option value="主线">主线</option>
        </select>
        <button type="button" data-testid="thread-create" onClick={() => threadNew.trim() && s.createThread(threadNew.trim(), threadType)}>新建逻辑线</button>
      </div>
      <div className="field">
        <div className="field-head"><span>价值转折</span><button type="button" data-testid="talk-shift" onClick={() => s.runTalk("value_shift", s.valueShift)}>讨论</button></div>
        <input data-testid="value-shift" value={s.valueShift} onChange={(e) => s.setValueShift(e.target.value)} placeholder="价值转折" />
      </div>
      <div data-testid="tracks" />
      <div className="field" style={{ position: "relative" }}>
        <div className="field-head"><span>动作</span><button type="button" data-testid="talk-do" onClick={() => s.runTalk("do_text", s.doText)}>讨论</button></div>
        <textarea data-testid="do-text" className="grow" value={s.doText} onChange={(e) => s.setDoText(e.target.value)} placeholder="动作" />
        {s.mentionOpen && (
          <div className="mention-pop" data-testid="mention-pop">
            {ents.filter((e) => e.name.includes(s.mentionQ || "")).map((e) => (
              <button key={e.id} type="button" data-testid={`mention-${e.name}`} onClick={() => {
                const next = s.doText.replace(/@([^\s@]*)$/, e.name);
                s.setDoText(next);
                if (s.state?.selected) s.addPresence(e.id);
              }}>{e.name}</button>
            ))}
          </div>
        )}
      </div>
      <textarea data-testid="say-text" className="grow" value={s.sayText} onChange={(e) => s.setSayText(e.target.value)} placeholder="对白" />
      <textarea data-testid="think-text" className="grow" value={s.thinkText} onChange={(e) => s.setThinkText(e.target.value)} placeholder="内心" />
      <span className="save-dot" data-testid="save-dot" />
      <div data-testid="knowledge-warn" className="hidden" />
      <div>
        <input data-testid="delta-ent" placeholder="谁/什么" value={deltaEnt} onChange={(e) => setDeltaEnt(e.target.value)} />
        <input data-testid="delta-attr" placeholder="哪一样" value={deltaAttr} onChange={(e) => setDeltaAttr(e.target.value)} />
        <input data-testid="delta-val" placeholder="变成什么" value={deltaVal} onChange={(e) => setDeltaVal(e.target.value)} />
        <input data-testid="delta-from" placeholder="从何时" value={deltaFrom} onChange={(e) => setDeltaFrom(e.target.value)} />
        <button data-testid="add-delta" type="button" onClick={() => { s.addDelta(deltaEnt, deltaAttr, deltaVal, Number(deltaFrom) || 0); setDeltaEnt(""); setDeltaVal(""); }}>加上</button>
        <div data-testid="delta-list">{deltas.map((d, i) => <div key={i}>{d.entity_id} {d.attr} {d.value}</div>)}</div>
      </div>
      <div>
        <input data-testid="know-who" placeholder="谁" value={knowWho} onChange={(e) => setKnowWho(e.target.value)} />
        <input data-testid="know-fact" placeholder="知道什么" value={knowFact} onChange={(e) => setKnowFact(e.target.value)} />
        <select data-testid="know-cert" value={knowCert} onChange={(e) => setKnowCert(e.target.value)}>
          <option value="knows">知道</option>
          <option value="wrong">信错</option>
          <option value="suspects">怀疑</option>
        </select>
        {knowCert === "wrong" && <input data-testid="know-truth" placeholder="实际是什么" value={knowTruth} onChange={(e) => setKnowTruth(e.target.value)} />}
        <button data-testid="add-know" type="button" onClick={() => { s.addKnow(knowWho, knowFact, knowCert, knowTruth); setKnowWho(""); setKnowFact(""); }}>加上</button>
        <div data-testid="know-write-list">{knows.map((k, i) => <div key={i}>{k.person_id} {k.fact}</div>)}</div>
      </div>
      {(s.discussOpen || s.discussDraft) && (
        <div data-testid="discuss-panel">
          <div data-testid="discuss-draft">{s.discussDraft}</div>
          <button data-testid="write-box" type="button" disabled={!s.talkPending && !s.fillPending} onClick={s.writeBox}>写入此框</button>
        </div>
      )}
      <button data-testid="talk" type="button" onClick={() => s.runTalk("intent", s.intent)}>讨论</button>
      <button data-testid="fill-fake" type="button" onClick={s.fillFake}>假模型填场</button>
      <button data-testid="commit" className="primary" type="button" disabled={!draft} onClick={s.commit}>写入正史</button>
      <button data-testid="revise" type="button" disabled={!canon} onClick={s.revise}>改这一场</button>
      <div data-testid="revise-msg">{s.reviseMsg}</div>
      <button data-testid="delete-canon" type="button" disabled={!canon} onClick={s.deleteCanon}>删已正史</button>
      {s.presencePicker && (
        <div>
          {ents.filter((e) => e.kind === "person").map((e) => (
            <button key={e.id} type="button" data-testid={`presence-${e.name}`} onClick={() => s.addPresence(e.id)}>{e.name}</button>
          ))}
        </div>
      )}
    </aside>
  );
}
