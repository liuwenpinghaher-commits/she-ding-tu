import type { Entity, PromiseOp, SceneCard } from "../canon/types.ts";

function entName(id: string, ents: Entity[]): string {
  return ents.find((e) => e.id === id || e.name === id)?.name || id;
}

export function desireLines(people: { name: string; profile?: Record<string, string> }[]): string[] {
  return people
    .map((p) => {
      const d = (p.profile?.desire || "").trim();
      return d ? `${p.name}想要${d}` : "";
    })
    .filter(Boolean);
}

export function clipPlayable(text: string, n = 80): string {
  const s = text.replace(/\s+/g, " ").trim();
  const chars = [...s];
  if (chars.length <= n) return s;
  return `${chars.slice(0, n).join("")}…`;
}

export function plantedPromiseIds(scenes: { promise_ops?: PromiseOp[] }[]): Set<string> {
  const out = new Set<string>();
  for (const sc of scenes) {
    for (const op of sc.promise_ops || []) {
      if (op.op === "plant" && op.promise_id) out.add(op.promise_id);
    }
  }
  return out;
}

export function threeQuestionLines(args: {
  intent: string;
  desires: string[];
  people: Entity[];
  scenes: SceneCard[];
  current: SceneCard | null;
}): { believe: string; from: string; want: string } {
  const want = args.desires.length ? args.desires.join("；") : (args.intent.trim() || "还没写这场要什么");
  const t0 = args.current?.clock_from ?? Number.POSITIVE_INFINITY;
  const earlier = [...args.scenes]
    .filter((sc) => !sc.draft && sc.clock_from < t0)
    .sort((a, b) => a.clock_from - b.clock_from || (a.commit_seq || 0) - (b.commit_seq || 0));
  const lastByPerson = new Map<string, { fact: string; from: string }>();
  const present = new Set(args.people.flatMap((p) => [p.id, p.name]));
  for (const sc of earlier) {
    for (const k of sc.knowledge_writes || []) {
      if (!present.has(k.person_id)) continue;
      const name = entName(k.person_id, args.people);
      const fact = (k.fact || "").trim();
      if (!fact) continue;
      lastByPerson.set(name, { fact, from: (sc.intent || sc.title || "").trim() || "上一场" });
    }
  }
  if (!lastByPerson.size) {
    return { believe: "还没写谁带着什么信念进场", from: "还没有上一场把信念写进知情", want };
  }
  return {
    believe: [...lastByPerson.entries()].map(([n, v]) => `${n}信「${v.fact}」`).join("；"),
    from: [...lastByPerson.entries()].map(([n, v]) => `${n}来自「${v.from}」`).join("；"),
    want,
  };
}
