import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { isPaused, threadSpan } from "../lenses/threads";
import {
  ATTRS,
  FIELD_LABEL,
  PROMISE_OPS,
  attrLabel,
  deltaLine,
  knowLine,
  methodStore,
  promiseIllegal,
  promiseLine,
} from "./human";
import { formatClock } from "../lenses/window";
import { ageAtClock, parseBornClock } from "../board/ages";
import { AEON_SWATCHES } from "../lenses/threads";
import {
  addCustomColor,
  customColors,
  isLocked,
  itemColor,
  loadConstraints,
  setConstraint,
  setItemColor,
  toggleLock,
} from "../shell/localPrefs";
import type { Entity } from "../canon/types";

export function ScenePage() {
  const s = useStore();
  const [ignoreSug, setIgnoreSug] = useState(false);
  const [, setLockTick] = useState(0);
  const draft = !!s.state?.selected;
  const canonId = s.state?.selected_canon || "";
  const canon = !draft && !!(s.state?.committed || []).some((b) => b.id === canonId);
  const chrome = s.sceneChrome;
  const scene = s.selectedScene;
  const deltas = scene?.deltas || [];
  const knows = scene?.knowledge_writes || [];
  const pops = scene?.promise_ops || [];
  const ents = s.state?.all_entities || s.state?.entities || [];
  const craft = s.state?.craft;
  const present = presentOn(scene, ents);
  const peopleHere = present.filter((e) => e.kind === "person");
  const warn = (s.state?.warnings || []).filter((w) => w.beat_id === scene?.id);
  const blocking = warn.filter((w) => /strict|promise_/.test(w.code));
  const yellow = warn.length > 0 && !blocking.length;

  const commitWhy = !draft
    ? "没有选中的草稿，不能写入正史"
    : !s.intent.trim()
      ? "没有本场任务，不能写入正史"
      : blocking.length
        ? blocking.map((w) => w.message).join("；")
        : yellow
          ? `有 ${warn.length} 处标黄，仍然可以写入`
          : "点了才进历史。不能撤销。";

  const commitDisabled = !draft || !s.intent.trim() || blocking.length > 0 || s.committing;
  const locked = canon && !s.editingCanon;
  const sit = s.sit;
  const sideRaw = s.sidebar || "";
  const clockProbe = /t=\d/.test(sideRaw) ? sideRaw : (s.state?.world ? `t=${s.state.world.t}` : "");
  const sideLooksLikeClock = /^(这一列故事时间 )?t=/.test(sideRaw.trim());
  const sidebarText = !sideRaw || sideLooksLikeClock ? "本场规定情境" : sideRaw;

  return (
    <aside className={`right-rail scene-${chrome}`}>
      <div data-testid="sidebar" className="muted">{sidebarText}</div>
      <div data-testid="moment-col" className="probe" aria-hidden="true">{clockProbe || sideRaw}</div>
      <div data-testid="moment-body" className="probe" aria-hidden="true">{clockProbe || sideRaw}</div>
      <div data-testid="knows-list" className="probe" aria-hidden="true">{JSON.stringify(s.state?.world?.knows || {})}</div>

      <details className="acc" open>
        <summary>场页</summary>
      <section data-testid="sit-blocks" className="sit-blocks">
        <div data-testid="sit-task"><strong>本场任务</strong> {s.intent || sit.intent || "还没有"}</div>
        <div data-testid="sit-shift"><strong>上场转折</strong> {sit.last_value_shift || "还没有"}</div>
        <div data-testid="sit-world"><strong>世界账</strong> {sit.stakes.length ? sit.stakes.join("；") : "还没有"}</div>
        <div data-testid="sit-people"><strong>人物账</strong> {[...sit.knowledge_gaps, ...sit.wrong_beliefs].join("；") || "还没有"}</div>
        <div data-testid="sit-reader"><strong>读者账</strong> {[...sit.reader_knows, ...sit.reader_irony].slice(0, 8).join("；") || "还没有"}</div>
        <div data-testid="sit-promises"><strong>未收伏笔</strong> {sit.open_promises.length ? sit.open_promises.map((p) => p.name).join("、") : "没有未收的"}</div>
      </section>
      {!ignoreSug && (
        <div data-testid="promise-suggest">
          建议本场对伏笔做哪一件
          <button type="button" data-testid="ignore-suggest" onClick={() => setIgnoreSug(true)}>忽略</button>
        </div>
      )}
      <div className="scene-open">
        <button type="button" data-testid="scene-dock" onClick={() => s.setOpen(null)}>就地</button>
        <button type="button" data-testid="scene-side" onClick={() => s.setOpen("side")}>侧开</button>
        <button type="button" data-testid="scene-full" onClick={() => s.setOpen("full")}>整页</button>
      </div>
      </details>

      <details className="acc" open>
        <summary>时间</summary>
      {scene && (
        <div data-testid="scene-clock" className="muted">
          {formatClock(scene.clock_from, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)}
          {" – "}
          {formatClock(scene.clock_to, craft?.clock_origin_label, craft?.clock_origin_minute, craft?.clock_format)}
          <label className="follow-toggle">
            <input
              type="checkbox"
              data-testid="clock-lock"
              checked={isLocked(s.state?.book || "", scene.id)}
              onChange={() => { toggleLock(s.state?.book || "", scene.id); setLockTick((n) => n + 1); }}
            />
            日期锁定
          </label>
        </div>
      )}
      {scene && <ColorBlock book={s.state?.book || ""} sceneId={scene.id} onChange={() => setLockTick((n) => n + 1)} />}
      {scene && (
        <GapBlock
          book={s.state?.book || ""}
          sceneId={scene.id}
          others={s.scenes.filter((x) => x.id !== scene.id)}
          onChange={() => setLockTick((n) => n + 1)}
        />
      )}
      <div data-testid="scene-ages">
        {peopleHere.map((p) => {
          const born = parseBornClock(p.profile?.born_clock);
          if (born == null || !scene) return null;
          return <span key={p.id}>{p.name}这场{ageAtClock(scene.clock_from, born)} </span>;
        })}
      </div>
      </details>

      <details className="acc" open>
        <summary>因果</summary>
      <div className="field">
        <label>因为哪一场
          <input list="cause-list" data-testid="cause-beat" value={s.causeBeat} onChange={(e) => s.setCauseBeat(e.target.value)} />
          <datalist id="cause-list">
            {s.scenes.filter((x) => x.id !== scene?.id).map((x) => (
              <option key={x.id} value={x.id}>{x.intent || x.id}</option>
            ))}
          </datalist>
        </label>
        <div data-testid="caused-by" className="muted">{s.causedBy || "还没有导致哪几场"}</div>
        <label>读序 <input data-testid="telling-ord" value={s.tellingOrd} onChange={(e) => s.setTellingOrd(e.target.value)} /></label>
        <button data-testid="set-telling" type="button" onClick={s.setTelling}>标读序</button>
        <label>当众 <input type="radio" name="vis" data-testid="vis-public" checked={!s.visPrivate} onChange={() => s.setVisPrivate(false)} /></label>
        <label>私下 <input type="radio" name="vis" data-testid="vis-private" checked={s.visPrivate} onChange={() => s.setVisPrivate(true)} /></label>
        <input data-testid="visible-to" placeholder="私下谁会看见，逗号分隔" value={s.visibleTo} onChange={(e) => s.setVisibleTo(e.target.value)} />
        <p className="muted">本场默认谁会看见：{peopleHere.map((p) => p.name).join("、") || "还没有人在场"}</p>
      </div>
      <ThreadBlock />
      </details>

      <details className="acc" open>
        <summary>账目</summary>
      <DeltaBlock present={present} ents={ents} deltas={deltas} clockFrom={scene?.clock_from || 0} originLabel={craft?.clock_origin_label} originMinute={craft?.clock_origin_minute} format={craft?.clock_format} />
      <KnowBlock people={peopleHere} ents={ents} knows={knows} deltas={deltas} />
      <PromiseBlock pops={pops} />
      </details>
      <div className="field">
        {locked && <p className="muted">这场已是正史。要点「改这一场」才动。第几次写入正史不会重编号。</p>}
        <label>场次 <input data-testid="scene-title" value={s.sceneTitle} readOnly={locked} onChange={(e) => s.setSceneTitle(e.target.value)} /></label>
      </div>
      <div className="field">
        <div className="field-head"><span>价值转折</span><button type="button" data-testid="talk-shift" onClick={() => s.runTalk("value_shift", s.valueShift)}>讨论</button></div>
        <input data-testid="value-shift" value={s.valueShift} readOnly={locked} onChange={(e) => s.setValueShift(e.target.value)} placeholder="价值转折" />
      </div>
      <div data-testid="tracks" />
      <GrowField label="动作" testid="do-text" talkId="talk-do" field="do_text" value={s.doText} onChange={s.setDoText} ents={ents} locked={locked} />
      <GrowField label="对白" testid="say-text" talkId="talk-say" field="say_text" value={s.sayText} onChange={s.setSayText} ents={ents} locked={locked} />
      <GrowField label="内心" testid="think-text" talkId="talk-think" field="think_text" value={s.thinkText} onChange={s.setThinkText} ents={ents} locked={locked} />
      <span className={`save-dot${s.saveStatus === "保存中" ? " saving" : s.saveStatus === "已存" ? " saved" : ""}`} data-testid="save-dot">{s.saveStatus}</span>
      <div data-testid="knowledge-warn" className={yellow ? "" : "hidden"}>{yellow ? "有标黄，仍可写入正史" : ""}</div>
      {(s.discussOpen || s.discussDraft) && (
        <div data-testid="discuss-panel">
          <p className="muted">正在讨论：{FIELD_LABEL[s.talkPending?.field || ""] || s.talkPending?.field || "这一格"} · {scene?.intent || ""}</p>
          <p className="muted">讨论不是历史</p>
          <div data-testid="discuss-draft">{s.discussDraft}</div>
          {s.fillChunks && (
            <div className="fill-chunks">
              {s.fillChunks.do_text && <button type="button" data-testid="fill-apply-do" onClick={() => s.applyFillPart("do_text")}>用动作</button>}
              {s.fillChunks.say_text && <button type="button" data-testid="fill-apply-say" onClick={() => s.applyFillPart("say_text")}>用对白</button>}
              {s.fillChunks.think_text && <button type="button" data-testid="fill-apply-think" onClick={() => s.applyFillPart("think_text")}>用内心</button>}
            </div>
          )}
          <button data-testid="write-box" type="button" disabled={!s.talkPending && !s.fillPending} onClick={s.writeBox}>写入此框</button>
        </div>
      )}
      <button data-testid="talk" type="button" onClick={() => s.runTalk("intent", s.intent)}>讨论</button>
      <PlanBlock />
      <button data-testid="fill-fake" type="button" disabled={!s.intent.trim()} title={!s.intent.trim() ? "先写一行本场任务" : "模型填这一场"} onClick={s.fillFake}>假模型填场</button>
      <p className="muted" data-testid="commit-why">{s.committing ? "正在写入…" : commitWhy}</p>
      <button
        data-testid="commit"
        className={`primary${yellow ? " warn" : ""}`}
        type="button"
        disabled={commitDisabled}
        title={commitWhy}
        onClick={s.commit}
      >{s.committing ? "正在写入…" : "写入正史"}</button>
      <button
        data-testid="revise"
        type="button"
        disabled={!canon}
        onClick={() => { if (s.editingCanon) s.revise(); else s.setEditingCanon(true); }}
      >{s.editingCanon ? "写入这次改动" : "改这一场"}</button>
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

function presentOn(scene: { presences: { entity_id: string }[]; place_id?: string | null } | null, ents: Entity[]): Entity[] {
  if (!scene) return [];
  const ids = new Set(scene.presences.map((p) => p.entity_id));
  if (scene.place_id) ids.add(scene.place_id);
  return ents.filter((e) => ids.has(e.id) || ids.has(e.name));
}

function ColorBlock({ book, sceneId, onChange }: { book: string; sceneId: string; onChange: () => void }) {
  const current = itemColor(book, sceneId);
  const extra = customColors(book);
  return (
    <div className="swatches" data-testid="item-colors">
      <span className="muted">条目色</span>
      {AEON_SWATCHES.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.name}
          data-testid={`swatch-${c.name}`}
          className={`swatch${current === c.hex ? " on" : ""}`}
          style={{ background: c.hex }}
          onClick={() => { setItemColor(book, sceneId, c.hex); onChange(); }}
        />
      ))}
      {extra.map((hex) => (
        <button
          key={hex}
          type="button"
          className={`swatch${current === hex ? " on" : ""}`}
          style={{ background: hex }}
          onClick={() => { setItemColor(book, sceneId, hex); onChange(); }}
        />
      ))}
      <input
        type="color"
        data-testid="swatch-custom"
        aria-label="自定义色"
        onChange={(e) => {
          addCustomColor(book, e.target.value);
          setItemColor(book, sceneId, e.target.value);
          onChange();
        }}
      />
    </div>
  );
}

function GapBlock({
  book,
  sceneId,
  others,
  onChange,
}: {
  book: string;
  sceneId: string;
  others: { id: string; intent: string }[];
  onChange: () => void;
}) {
  const row = loadConstraints(book).find((c) => c.laterId === sceneId);
  return (
    <label className="muted">
      在上场结束后隔
      <select
        data-testid="clock-gap-earlier"
        value={row?.earlierId || ""}
        onChange={(e) => { setConstraint(book, sceneId, e.target.value || null, row?.gap || 1440); onChange(); }}
      >
        <option value="">无约束</option>
        {others.map((x) => (
          <option key={x.id} value={x.id}>{x.intent || x.id}</option>
        ))}
      </select>
      <input
        data-testid="clock-gap-min"
        type="number"
        min={0}
        className="tl-bound"
        value={row?.gap ?? 0}
        onChange={(e) => { setConstraint(book, sceneId, row?.earlierId || others[0]?.id || null, Number(e.target.value) || 0); onChange(); }}
      />
      分钟
    </label>
  );
}

function PlanBlock() {
  const s = useStore();
  return (
    <section data-testid="plan-block">
      <button type="button" data-testid="plan-suggest" disabled={!s.intent.trim()} onClick={s.planSuggest}>建议这一段怎么铺</button>
      {s.planNotice && <p className="muted" data-testid="plan-notice">{s.planNotice}</p>}
      {(s.planBones || []).map((b, i) => (
        <article key={i} className="book-card" data-testid={`plan-bone-${i}`}>
          <p>{b.serial ? "串" : "并"} · {b.intent}</p>
          {b.presence?.length ? <p className="muted">谁在：{b.presence.join("、")}</p> : null}
          {b.necessity ? <p>{b.necessity}</p> : null}
        </article>
      ))}
      {s.planBones.length > 0 && (
        <div>
          <button type="button" data-testid="plan-apply-tail" onClick={() => s.planApply("tail")}>落在最后（预场草稿）</button>
          <button type="button" data-testid="plan-apply-mid" onClick={() => s.planApply("mid")}>落在中间</button>
          <p className="muted">插在中间须先确认变更。建议不进模型填下一场。</p>
        </div>
      )}
    </section>
  );
}

function ThreadBlock() {
  const s = useStore();
  const [threadPick, setThreadPick] = useState("");
  const [threadRole, setThreadRole] = useState("推进");
  const [threadNew, setThreadNew] = useState("");
  const [threadType, setThreadType] = useState("支线");
  const scene = s.selectedScene;
  const threads = scene?.story_threads || [];
  const catalog = s.state?.threads || [];
  return (
    <div data-testid="scene-threads">
      {threads.length === 0 && <span>未归线</span>}
      {threads.map((t) => {
        const name = catalog.find((x) => x.id === t.id)?.name || t.id;
        const span = scene ? threadSpan(s.scenes, t.id) : null;
        const enter = scene && span?.first === scene.id;
        const exit = scene && span?.last === scene.id;
        const pause = scene ? isPaused(scene, t.id) : false;
        return (
          <div key={t.id} data-testid={`scene-thread-${name}`}>
            {name} · {t.role || "推进"}
            {enter ? " · 从这里起" : ""}
            {exit ? " · 收到这里" : ""}
            {pause ? " · 暂停" : ""}
          </div>
        );
      })}
      <p className="muted">入线 / 出线是推出来的，不用填。贴线不是写下一场。</p>
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
  );
}

function GrowField({
  label, testid, talkId, field, value, onChange, ents, locked,
}: {
  label: string; testid: string; talkId: string; field: string; value: string; onChange: (v: string) => void; ents: Entity[]; locked?: boolean;
}) {
  const s = useStore();
  const rows = Math.max(3, value.split("\n").length);
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <button type="button" data-testid={talkId} onClick={() => s.runTalk(field, value)}>讨论</button>
      </div>
      <textarea
        data-testid={testid}
        className="grow"
        rows={rows}
        value={value}
        readOnly={!!locked}
        placeholder={label}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (/(^|\s)\/$/.test(v)) s.setSlashField(field);
          else if (s.slashField === field) s.setSlashField(null);
        }}
      />
      {s.mentionOpen && s.mentionField === field && (
        <div className="mention-pop" data-testid={field === "do_text" ? "mention-pop" : `mention-pop-${field}`}>
          {ents.filter((e) => e.name.includes(s.mentionQ || "")).map((e) => (
            <button key={e.id} type="button" data-testid={`mention-${e.name}`} onClick={() => {
              const next = value.replace(/@([^\s@]*)$/, e.name);
              onChange(next);
              if (s.state?.selected) s.addPresence(e.id);
              s.clearMention();
            }}>{e.name}</button>
          ))}
        </div>
      )}
      {s.slashField === field && (
        <div className="slash-pop" data-testid="slash-pop">
          <button type="button" onClick={() => { s.setSlashField(null); s.setCmd("delta"); }}>加一条本场变化</button>
          <button type="button" onClick={() => { s.setSlashField(null); s.setCmd("know"); }}>加一条知情</button>
          <button type="button" onClick={() => { s.setSlashField(null); s.setCmd("promise"); }}>对伏笔做一件</button>
          <button type="button" onClick={() => { s.setSlashField(null); s.runTalk(field, value.replace(/(^|\s)\/$/, "$1").trimEnd()); }}>讨论这一格</button>
          <button type="button" onClick={() => { s.setSlashField(null); s.makeEllipsis(); }}>插省略</button>
        </div>
      )}
    </div>
  );
}

function DeltaBlock({
  present, ents, deltas, clockFrom, originLabel, originMinute, format,
}: {
  present: Entity[];
  ents: Entity[];
  deltas: import("../canon/types").Delta[];
  clockFrom: number;
  originLabel?: string;
  originMinute?: number;
  format?: string;
}) {
  const s = useStore();
  const [deltaEnt, setDeltaEnt] = useState("");
  const [deltaAttr, setDeltaAttr] = useState("");
  const [deltaVal, setDeltaVal] = useState("");
  const [deltaFrom, setDeltaFrom] = useState(String(clockFrom));
  const [hint, setHint] = useState("");
  const picked = ents.find((e) => e.id === deltaEnt || e.name === deltaEnt);
  const inScene = present.some((e) => e.id === picked?.id || e.name === picked?.name);
  const attrs = ATTRS[picked?.kind || ""]?.attrs || [{ value: "status", label: "状态" }, { value: "holder", label: "在谁手上" }, { value: "where", label: "在哪" }];
  const valPeople = deltaAttr === "holder" || deltaAttr === "member" || deltaAttr === "leader";
  const valPlace = deltaAttr === "where";
  return (
    <section data-testid="delta-block">
      <h3>本场变化</h3>
      {deltas.length === 0 && <p className="muted">还没有本场变化</p>}
      <div data-testid="delta-list" tabIndex={0}>
        {deltas.map((d, i) => (
          <div key={i}>{deltaLine(d, ents, originLabel, originMinute, format)} · {d.entity_id} {d.attr} {d.value}</div>
        ))}
      </div>
      {s.undoStack.length > 0 && (
        <button type="button" data-testid="undo" onClick={() => s.undo()}>撤销本场变化</button>
      )}
      <input list="delta-ent-list" data-testid="delta-ent" placeholder="谁/什么" value={deltaEnt} onChange={(e) => { setDeltaEnt(e.target.value); setHint(""); }} />
      <datalist id="delta-ent-list">{present.map((e) => <option key={e.id} value={e.name} />)}</datalist>
      {picked && !inScene && (
        <p className="err">
          不在场
          <button type="button" onClick={() => s.addPresence(picked.id)}>先加进在场</button>
        </p>
      )}
      <input list="delta-attr-list" data-testid="delta-attr" placeholder="哪一样" value={deltaAttr} onChange={(e) => setDeltaAttr(e.target.value)} />
      <datalist id="delta-attr-list">{attrs.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</datalist>
      <input list="delta-val-list" data-testid="delta-val" placeholder="变成什么" value={deltaVal} onChange={(e) => setDeltaVal(e.target.value)} />
      <datalist id="delta-val-list">
        {valPeople && ents.filter((e) => e.kind === "person").map((e) => <option key={e.id} value={e.name} />)}
        {valPlace && ents.filter((e) => e.kind === "place").map((e) => <option key={e.id} value={e.name} />)}
      </datalist>
      <input data-testid="delta-from" placeholder="从何时" value={deltaFrom} onChange={(e) => setDeltaFrom(e.target.value)} />
      <button data-testid="add-delta" type="button" onClick={() => {
        if (!deltaEnt.trim() || !deltaAttr.trim() || !deltaVal.trim()) return;
        s.addDelta(deltaEnt, deltaAttr, deltaVal, Number(deltaFrom) || clockFrom);
        setHint("");
        setDeltaEnt(""); setDeltaVal("");
      }}>加上</button>
      {hint && <p className="err">{hint}</p>}
      <p className="muted">{deltaAttr ? attrLabel(deltaAttr) : "选哪一样。伏笔不走这里。"}</p>
    </section>
  );
}

function KnowBlock({
  people, ents, knows, deltas,
}: {
  people: Entity[];
  ents: Entity[];
  knows: import("../canon/types").KnowledgeWrite[];
  deltas: import("../canon/types").Delta[];
}) {
  const s = useStore();
  const [knowWho, setKnowWho] = useState("");
  const [knowFact, setKnowFact] = useState("");
  const [knowCert, setKnowCert] = useState("knows");
  const [knowTruth, setKnowTruth] = useState("");
  const [knowMethod, setKnowMethod] = useState("see");
  const [knowSrc, setKnowSrc] = useState("");
  const facts = useMemo(() => {
    const out = deltas.map((d) => deltaLine(d, ents));
    return out;
  }, [deltas, ents]);
  return (
    <section data-testid="know-block">
      <h3>知情</h3>
      <div data-testid="know-write-list">
        {knows.map((k, i) => <div key={i}>{knowLine(k, ents)} · {k.person_id} {k.fact}</div>)}
      </div>
      <input list="know-who-list" data-testid="know-who" placeholder="谁" value={knowWho} onChange={(e) => setKnowWho(e.target.value)} />
      <datalist id="know-who-list">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <input list="know-fact-list" data-testid="know-fact" placeholder="知道什么" value={knowFact} onChange={(e) => setKnowFact(e.target.value)} />
      <datalist id="know-fact-list">{facts.map((f) => <option key={f} value={f} />)}</datalist>
      <select data-testid="know-cert" value={knowCert} onChange={(e) => setKnowCert(e.target.value)}>
        <option value="knows">知道</option>
        <option value="wrong">信错</option>
        <option value="suspects">怀疑</option>
      </select>
      {knowCert === "wrong" && <input data-testid="know-truth" placeholder="实际是什么" value={knowTruth} onChange={(e) => setKnowTruth(e.target.value)} />}
      <select data-testid="know-method" value={knowMethod} onChange={(e) => setKnowMethod(e.target.value)}>
        <option value="see">看见</option>
        <option value="hear">听见</option>
        <option value="told">被告诉</option>
        <option value="infer">推断</option>
        <option value="find">发现</option>
      </select>
      {knowMethod === "told" && (
        <input data-testid="know-src" placeholder="谁告诉的" value={knowSrc} onChange={(e) => setKnowSrc(e.target.value)} />
      )}
      <button data-testid="add-know" type="button" onClick={() => {
        if (knowCert === "wrong" && !knowTruth.trim()) return;
        if (knowMethod === "told" && !knowSrc.trim()) return;
        s.addKnow(knowWho, knowFact, knowCert, knowTruth, methodStore(knowMethod === "told" ? "被告诉" : knowMethod), knowMethod === "told" ? knowSrc : undefined);
        setKnowWho(""); setKnowFact(""); setKnowTruth("");
      }}>加上</button>
    </section>
  );
}

function PromiseBlock({ pops }: { pops: import("../canon/types").PromiseOp[] }) {
  const s = useStore();
  const [pid, setPid] = useState("");
  const [op, setOp] = useState("plant");
  const [err, setErr] = useState("");
  const items = s.state?.promises || [];
  const ents = (s.state?.all_entities || []).filter((e) => e.kind === "promise");
  const names = [...items.map((p) => ({ id: p.id, name: p.name })), ...ents.map((e) => ({ id: e.id, name: e.name }))];
  const uniq = names.filter((n, i) => names.findIndex((x) => x.id === n.id || x.name === n.name) === i);
  return (
    <section data-testid="promise-ops">
      <h3>伏笔四件事</h3>
      <p className="muted">跟贴逻辑线不是同一件事。逻辑线不管伏笔。</p>
      {uniq.length === 0 && <p className="muted">这本书还没有伏笔。去设定新建。</p>}
      {pops.map((p, i) => <div key={i}>{promiseLine(p, items, ents)}</div>)}
      <select data-testid="promise-pick" value={pid} onChange={(e) => { setPid(e.target.value); setErr(""); }}>
        <option value="">选一条伏笔</option>
        {uniq.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select data-testid="promise-op" value={op} onChange={(e) => { setOp(e.target.value); setErr(""); }}>
        {PROMISE_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button data-testid="promise-add" type="button" onClick={() => {
        if (!pid) return;
        const bad = promiseIllegal(op, pid, items, pops);
        if (bad) { setErr(bad); return; }
        s.addPromiseOp(pid, op);
        setErr("");
      }}>加上</button>
      {err && <p className="err" data-testid="promise-err">{err}</p>}
    </section>
  );
}
