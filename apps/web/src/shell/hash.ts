export type Route =
  | { kind: "shelf" }
  | { kind: "new" }
  | { kind: "board"; book: string }
  | { kind: "library"; book: string }
  | { kind: "settings"; book: string }
  | { kind: "export"; book: string }
  | { kind: "dossier"; book: string; entity: string }
  | { kind: "scene"; book: string; scene: string };

export interface BoardQuery {
  look: string | null;
  line: string | null;
  s: string | null;
  n: number | null;
  start: number | null;
  who: string | null;
  open: string | null;
}

export function parseHash(hash: string): { route: Route; q: BoardQuery } {
  const raw = (hash || "#/").replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const q = new URLSearchParams(qs || "");
  const boardQ: BoardQuery = {
    look: q.get("look"),
    line: q.get("line"),
    s: q.get("s"),
    n: q.get("n") ? Number(q.get("n")) : null,
    start: q.get("start") ? Number(q.get("start")) : null,
    who: q.get("who"),
    open: q.get("open"),
  };
  if (parts.length === 0) return { route: { kind: "shelf" }, q: boardQ };
  if (parts[0] === "new") return { route: { kind: "new" }, q: boardQ };
  if (parts[0] === "b" && parts[1]) {
    const book = decodeURIComponent(parts[1]);
    if (parts[2] === "library") return { route: { kind: "library", book }, q: boardQ };
    if (parts[2] === "settings") return { route: { kind: "settings", book }, q: boardQ };
    if (parts[2] === "export") return { route: { kind: "export", book }, q: boardQ };
    if (parts[2] === "e" && parts[3]) {
      return { route: { kind: "dossier", book, entity: decodeURIComponent(parts[3]) }, q: boardQ };
    }
    if (parts[2] === "s" && parts[3]) {
      return { route: { kind: "scene", book, scene: decodeURIComponent(parts[3]) }, q: boardQ };
    }
    return { route: { kind: "board", book }, q: boardQ };
  }
  return { route: { kind: "shelf" }, q: boardQ };
}

export function boardHash(
  book: string,
  q: Partial<BoardQuery> = {},
): string {
  const p = new URLSearchParams();
  if (q.look) p.set("look", q.look);
  if (q.line) p.set("line", q.line);
  if (q.s) p.set("s", q.s);
  if (q.n != null) p.set("n", String(q.n));
  if (q.start != null) p.set("start", String(q.start));
  if (q.who) p.set("who", q.who);
  if (q.open) p.set("open", q.open);
  const qs = p.toString();
  return `#/b/${encodeURIComponent(book)}/board${qs ? `?${qs}` : ""}`;
}

export function writeHash(next: string) {
  if (location.hash === next) return;
  history.replaceState(null, "", next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
