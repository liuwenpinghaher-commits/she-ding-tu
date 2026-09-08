import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useStore } from "../state/store";

type SetupRel = { id: string; kind: string; from: string; to: string };

type EdgeKind = "知情" | "同场" | "关系";

/** 选中人才画的只读连线图。改边仍走确认变更 / 改这一场。 */
export function GraphLook() {
  const s = useStore();
  const people = s.state?.people || [];
  const who = s.q.who || s.state?.lens_person || "";
  const selected = people.find((p) => p.id === who || p.name === who) || null;
  const [rels, setRels] = useState<SetupRel[]>([]);

  useEffect(() => {
    api<{ relations?: SetupRel[] }>("/api/setup-relations")
      .then((r) => setRels(r.relations || []))
      .catch(() => setRels([]));
  }, [s.state?.book]);

  const edges = useMemo(() => {
    if (!selected) return [] as { to: string; kind: EdgeKind; label: string }[];
    const out: { to: string; kind: EdgeKind; label: string }[] = [];
    const seen = new Set<string>();
    const push = (to: string, kind: EdgeKind, label: string) => {
      const k = `${kind}:${to}`;
      if (seen.has(k) || to === selected.id) return;
      seen.add(k);
      out.push({ to, kind, label });
    };
    for (const sc of s.scenes) {
      const here = sc.presences.some((p) => p.entity_id === selected.id || p.entity_id === selected.name);
      if (!here) continue;
      for (const p of sc.presences) {
        const other = people.find((x) => x.id === p.entity_id || x.name === p.entity_id);
        if (other && other.id !== selected.id) push(other.id, "同场", sc.intent || "同场");
      }
    }
    const knows = s.state?.world?.knows || {};
    const mine = knows[selected.id] || knows[selected.name] || [];
    for (const [pid, facts] of Object.entries(knows)) {
      if (pid === selected.id || pid === selected.name) continue;
      const overlap = (facts || []).some((f) => mine.includes(f));
      if (overlap || (facts || []).some((f) => f.includes(selected.name))) {
        const other = people.find((x) => x.id === pid || x.name === pid);
        if (other) push(other.id, "知情", "知情");
      }
    }
    for (const fact of mine) {
      const other = people.find((x) => fact.includes(x.name) && x.id !== selected.id);
      if (other) push(other.id, "知情", "知情");
    }
    for (const r of rels) {
      if (r.from === selected.id || r.from === selected.name) push(r.to, "关系", r.kind);
      if (r.to === selected.id || r.to === selected.name) push(r.from, "关系", r.kind);
    }
    return out;
  }, [selected, s.scenes, s.state?.world?.knows, people, rels]);

  const nodes = useMemo(() => {
    if (!selected) return [];
    const ids = new Set([selected.id, ...edges.map((e) => e.to)]);
    return people.filter((p) => ids.has(p.id) || ids.has(p.name));
  }, [selected, edges, people]);

  if (!selected) {
    return (
      <div data-testid="graph-view" className="graph-view">
        <p className="muted">选中一个人物才画连线。只读，改边仍走确认变更。</p>
      </div>
    );
  }

  const w = 640;
  const h = 420;
  const cx = w / 2;
  const cy = h / 2;
  const others = nodes.filter((n) => n.id !== selected.id);
  const placed = others.map((n, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(others.length, 1) - Math.PI / 2;
    return { ...n, x: cx + Math.cos(ang) * 150, y: cy + Math.sin(ang) * 120 };
  });

  return (
    <div data-testid="graph-view" className="graph-view">
      <p className="muted">以「{selected.name}」为心。知情 / 同场 / 关系只读。改边去分场条或确认变更。</p>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} data-testid="graph-svg">
        {edges.map((e) => {
          const to = placed.find((n) => n.id === e.to || n.name === e.to);
          if (!to) return null;
          const color = e.kind === "知情" ? "#8A5A0C" : e.kind === "同场" ? "#4665E1" : "#3B7D4F";
          return (
            <g
              key={`${e.kind}-${e.to}`}
              data-testid={`graph-edge-${e.kind}-${e.to}`}
              onClick={() => s.setNotice("只读。改边去分场条或确认变更。")}
            >
              <line x1={cx} y1={cy} x2={to.x} y2={to.y} stroke={color} strokeWidth={2} />
              <text x={(cx + to.x) / 2} y={(cy + to.y) / 2 - 6} fontSize={11} fill={color}>{e.kind}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={28} fill="#4665E1" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={12}>{selected.name}</text>
        {placed.map((n) => (
          <g key={n.id} data-testid={`graph-node-${n.id}`}>
            <circle cx={n.x} cy={n.y} r={22} fill="#EEF1F4" stroke="#C9CED6" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fill="#1C2024">{n.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
