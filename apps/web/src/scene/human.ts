import type { Delta, Entity, KnowledgeWrite, PromiseItem, PromiseOp } from "../canon/types";
import { formatClock } from "../lenses/window";

export function entName(id: string, ents: Entity[]): string {
  return ents.find((e) => e.id === id || e.name === id)?.name || id;
}

export const ATTRS: Record<string, { label: string; attrs: { value: string; label: string }[] }> = {
  person: {
    label: "人物",
    attrs: [
      { value: "where", label: "在哪" },
      { value: "holder", label: "拿着" },
      { value: "injured", label: "受伤" },
      { value: "member", label: "属于" },
      { value: "status", label: "状态" },
    ],
  },
  place: {
    label: "地点",
    attrs: [
      { value: "status", label: "状态" },
      { value: "access", label: "进出" },
    ],
  },
  thing: {
    label: "道具",
    attrs: [
      { value: "holder", label: "在谁手上" },
      { value: "where", label: "在哪" },
      { value: "status", label: "状态" },
    ],
  },
  faction: {
    label: "组织",
    attrs: [
      { value: "member", label: "成员" },
      { value: "leader", label: "首领" },
      { value: "status", label: "状态" },
    ],
  },
};

export function attrLabel(attr: string): string {
  for (const g of Object.values(ATTRS)) {
    const hit = g.attrs.find((a) => a.value === attr);
    if (hit) return hit.label;
  }
  return attr;
}

export function deltaLine(
  d: Delta,
  ents: Entity[],
  originLabel?: string,
  originMinute?: number,
  format?: string,
): string {
  const who = entName(d.entity_id, ents);
  const when = formatClock(d.clock_from, originLabel, originMinute, format);
  const val = entName(d.value, ents);
  if (d.attr === "holder") return `${who} 从 ${when} 起 在 ${val} 手上`;
  if (d.attr === "where") return `${who} 从 ${when} 起 在 ${val}`;
  return `${who} 的${attrLabel(d.attr)} 从 ${when} 起 是 ${val}`;
}

export function certLabel(c?: string): string {
  if (c === "wrong") return "信错";
  if (c === "suspects") return "怀疑";
  return "知道";
}

export function methodLabel(m?: string | null): string {
  if (m === "see" || m === "看见") return "看见";
  if (m === "hear" || m === "听见") return "听见";
  if (m === "told" || m === "被告诉") return "被告诉";
  if (m === "infer" || m === "推断") return "推断";
  if (m === "find" || m === "发现") return "发现";
  return "";
}

export function methodStore(m: string): string {
  if (m === "看见") return "see";
  if (m === "听见") return "hear";
  if (m === "被告诉") return "told";
  if (m === "推断") return "infer";
  if (m === "发现") return "find";
  return m;
}

export function knowLine(k: KnowledgeWrite, ents: Entity[]): string {
  const who = entName(k.person_id, ents);
  const how = methodLabel(k.method);
  const src = k.source_person ? entName(k.source_person, ents) : "";
  if (k.certainty === "wrong") {
    const actual = k.truth_value || "未知";
    const told = how === "被告诉" && src ? ` · 被${src}告诉` : how ? ` · ${how}` : "";
    return `${who} 信错 ${k.fact}（实际：${actual}）${told}`;
  }
  const told = how === "被告诉" && src ? ` · 被${src}告诉` : how ? ` · ${how}` : "";
  return `${who} ${certLabel(k.certainty)} ${k.fact}${told}`;
}

export const PROMISE_OPS = [
  { value: "plant", label: "埋设" },
  { value: "advance", label: "推进" },
  { value: "payoff", label: "兑现" },
  { value: "discard", label: "作废" },
];

export function promiseOpLabel(op: string): string {
  return PROMISE_OPS.find((x) => x.value === op)?.label || op;
}

export function promiseLine(op: PromiseOp, items: PromiseItem[], ents: Entity[]): string {
  const name = items.find((p) => p.id === op.promise_id)?.name
    || ents.find((e) => e.id === op.promise_id || e.name === op.promise_id)?.name
    || op.promise_id;
  return `${name} 在这一场 ${promiseOpLabel(op.op)}`;
}

function applyPromise(
  st: Map<string, string>,
  row: PromiseOp,
): string | null {
  const now = st.get(row.promise_id);
  const name = row.promise_id;
  if (row.op === "plant") {
    if (now === "paid" || now === "discarded") return `「${name}」已经收了，不能再埋`;
    st.set(row.promise_id, "open");
    return null;
  }
  if (row.op === "advance") {
    if (now !== "open") return `「${name}」没在收着，不能推进`;
    return null;
  }
  if (row.op === "payoff") {
    if (now !== "open") return `「${name}」没埋着，不能兑现`;
    st.set(row.promise_id, "paid");
    return null;
  }
  if (row.op === "discard") {
    if (now !== "open") return `「${name}」没在收着，不能作废`;
    st.set(row.promise_id, "discarded");
    return null;
  }
  return null;
}

export function promiseIllegal(
  op: string,
  promiseId: string,
  world: PromiseItem[],
  already: PromiseOp[],
): string | null {
  const st = new Map(world.map((p) => [p.id, p.status]));
  for (const row of already) applyPromise(st, row);
  return applyPromise(st, { promise_id: promiseId, op });
}

export function sceneHeading(sc: { intent?: string | null; title?: string | null }): string {
  const intent = (sc.intent || "").trim();
  if (intent) return intent;
  const title = (sc.title || "").trim();
  if (title && title !== "下一场") return title;
  return "还没写这场要办成什么";
}

export const FIELD_LABEL: Record<string, string> = {
  intent: "这场要办成什么",
  value_shift: "这场前后，什么变了",
  do_text: "动作",
  say_text: "对白",
  think_text: "内心",
};
