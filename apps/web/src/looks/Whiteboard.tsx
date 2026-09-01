import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

type Card = { id: string; beatId: string; x: number; y: number; label: string };

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
      setCards(raw ? JSON.parse(raw) as Card[] : []);
    } catch {
      setCards([]);
    }
  }, [book]);

  useEffect(() => {
    if (!book) return;
    localStorage.setItem(key(book), JSON.stringify(cards));
  }, [book, cards]);

  if (!open) return null;

  return (
    <div className="look-rail show" data-testid="whiteboard">
      <div>
        <strong>白板</strong>
        <span className="muted"> 灵感层，不进正史，不算进算出这一刻。</span>
        <button type="button" data-testid="wb-back" onClick={() => s.setLook(null)}>收起</button>
        <button
          type="button"
          data-testid="wb-add"
          onClick={() => {
            const sc = s.selectedScene;
            if (!sc) return;
            setCards((cs) => cs.some((c) => c.beatId === sc.id) ? cs : [...cs, { id: `w${Date.now()}`, beatId: sc.id, x: 40 + cs.length * 16, y: 40 + cs.length * 16, label: sc.intent }]);
          }}
        >引用当前场</button>
        <button
          type="button"
          data-testid="wb-add-page"
          onClick={() => {
            setCards((cs) => {
              const have = new Set(cs.map((c) => c.beatId));
              const extra = s.scenes.filter((sc) => !have.has(sc.id)).map((sc, i) => ({
                id: `w${Date.now()}-${i}`,
                beatId: sc.id,
                x: 24 + ((cs.length + i) % 4) * 140,
                y: 36 + Math.floor((cs.length + i) / 4) * 72,
                label: sc.intent,
              }));
              return [...cs, ...extra];
            });
          }}
        >引用本页的场</button>
      </div>
      <p className="muted">挪卡片不改列序、不改钟、不写入正史。</p>
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
            className="wb-card"
            data-testid={`wb-card-${c.beatId}`}
            style={{ left: c.x, top: c.y }}
            onMouseDown={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              drag.current = { id: c.id, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
            }}
            onClick={() => {
              if (drag.current?.moved) return;
              const sc = s.scenes.find((x) => x.id === c.beatId);
              if (sc) {
                s.selectScene(sc.id, sc.draft);
                s.setLook(null);
              }
            }}
          >
            {c.label || c.beatId}
          </div>
        ))}
      </div>
    </div>
  );
}
