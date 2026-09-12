import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

type Card =
  | { id: string; kind: "scene"; beatId: string; x: number; y: number; label: string }
  | { id: string; kind: "note"; x: number; y: number; text: string };

function asCard(raw: unknown): Card | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.kind === "note" || (!c.beatId && typeof c.text === "string")) {
    return { id: String(c.id), kind: "note", x: Number(c.x) || 0, y: Number(c.y) || 0, text: String(c.text || "") };
  }
  if (c.beatId || c.kind === "scene") {
    return { id: String(c.id), kind: "scene", beatId: String(c.beatId), x: Number(c.x) || 0, y: Number(c.y) || 0, label: String(c.label || "") };
  }
  return null;
}

function key(book: string) {
  return `setting-whiteboard:${book}`;
}

export function Whiteboard({ open }: { open: boolean }) {
  const s = useStore();
  const book = s.state?.book || "";
  const [cards, setCards] = useState<Card[]>([]);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!book) return;
    try {
      const raw = localStorage.getItem(key(book));
      const parsed = raw ? JSON.parse(raw) as unknown[] : [];
      setCards(parsed.map(asCard).filter((c): c is Card => !!c));
    } catch {
      setCards([]);
    }
  }, [book]);

  useEffect(() => {
    if (!book) return;
    localStorage.setItem(key(book), JSON.stringify(cards));
  }, [book, cards]);

  if (!open) return null;

  const jump = (beatId: string, look: "时间轴" | "分场条") => {
    const sc = s.scenes.find((x) => x.id === beatId);
    if (sc) s.selectScene(sc.id, sc.draft);
    s.setLook(look);
  };

  return (
    <div className="look-rail show" data-testid="whiteboard">
      <div>
        <strong>白板</strong>
        <span className="muted"> 灵感层，不进正史，不算进算出这一刻。</span>
        <button type="button" data-testid="wb-back" onClick={() => s.setLook("分场条")}>回分场条</button>
        <button
          type="button"
          data-testid="wb-add"
          onClick={() => {
            const sc = s.selectedScene;
            if (!sc) return;
            setCards((cs) => cs.some((c) => c.kind === "scene" && c.beatId === sc.id) ? cs : [...cs, { id: `w${Date.now()}`, kind: "scene", beatId: sc.id, x: 40 + cs.length * 16, y: 40 + cs.length * 16, label: sc.intent }]);
          }}
        >引用当前场</button>
        <button
          type="button"
          data-testid="wb-add-page"
          onClick={() => {
            setCards((cs) => {
              const have = new Set(cs.filter((c) => c.kind === "scene").map((c) => c.beatId));
              const extra = s.scenes.filter((sc) => !have.has(sc.id)).map((sc, i) => ({
                id: `w${Date.now()}-${i}`,
                kind: "scene" as const,
                beatId: sc.id,
                x: 24 + ((cs.length + i) % 4) * 140,
                y: 36 + Math.floor((cs.length + i) / 4) * 72,
                label: sc.intent,
              }));
              return [...cs, ...extra];
            });
          }}
        >引用本页的场</button>
        <button
          type="button"
          data-testid="wb-add-note"
          onClick={() => setCards((cs) => [...cs, { id: `n${Date.now()}`, kind: "note", x: 80, y: 80, text: "便笺" }])}
        >加便笺</button>
      </div>
      <p className="muted">挪卡片不改列序、不改钟、不写入正史。从这里拿掉不等于删场。</p>
      <div
        className="whiteboard"
        onMouseMove={(e) => {
          if (!drag.current) return;
          const d = drag.current;
          d.moved = true;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setCards((cs) => cs.map((c) => c.id === d.id ? { ...c, x: e.clientX - rect.left - d.dx, y: e.clientY - rect.top - d.dy } : c));
        }}
        onMouseUp={() => { drag.current = null; }}
      >
        {cards.map((c) => (
          <div
            key={c.id}
            className={`wb-card${c.kind === "note" ? " note" : ""}`}
            data-testid={c.kind === "scene" ? `wb-card-${c.beatId}` : `wb-note-${c.id}`}
            style={{ left: c.x, top: c.y }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest("button, textarea")) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              drag.current = { id: c.id, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
            }}
            onClick={() => {
              if (drag.current?.moved) return;
              if (c.kind === "scene") jump(c.beatId, "时间轴");
            }}
          >
            {c.kind === "note" ? (
              <textarea
                data-testid={`wb-note-text-${c.id}`}
                value={c.text}
                onChange={(e) => setCards((cs) => cs.map((x) => x.id === c.id && x.kind === "note" ? { ...x, text: e.target.value } : x))}
              />
            ) : (
              <>
                <div>{c.label || c.beatId}</div>
                <div className="look-toolbar">
                  <button type="button" data-testid={`wb-jump-tl-${c.beatId}`} onClick={(e) => { e.stopPropagation(); jump(c.beatId, "时间轴"); }}>时间轴</button>
                  <button type="button" data-testid={`wb-jump-sb-${c.beatId}`} onClick={(e) => { e.stopPropagation(); jump(c.beatId, "分场条"); }}>分场条</button>
                </div>
              </>
            )}
            <button
              type="button"
              className="wb-x"
              data-testid={`wb-remove-${c.kind === "scene" ? c.beatId : c.id}`}
              aria-label="从白板拿掉"
              onClick={(e) => {
                e.stopPropagation();
                setCards((cs) => cs.filter((x) => x.id !== c.id));
              }}
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
