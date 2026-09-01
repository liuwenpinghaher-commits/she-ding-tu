import { useState } from "react";
import { useStore } from "../state/store";
import { formatOpened } from "../lenses/window";

export function ShelfPage() {
  const s = useStore();
  const items = [...(s.books.items || s.books.books.map((name) => ({
    name, premise: "", columns: 1, committed: 0, drafts: 0, opened_at: 0, last_intent: "",
  })))].sort((a, b) => (b.opened_at || 0) - (a.opened_at || 0) || b.name.localeCompare(a.name));
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="page" data-testid="shelf">
      <h1>书架</h1>
      {items.length === 0 && (
        <div className="empty-shelf">
          <p>还没有书。从这里开始写第一本</p>
          <button className="primary big" type="button" data-testid="shelf-new" onClick={s.goNew}>新建书</button>
        </div>
      )}
      {items.length > 0 && (
        <>
          <button type="button" data-testid="shelf-new" onClick={s.goNew}>新建书</button>
          <div className="grid" data-testid="shelf-grid">
            {items.map((b) => (
              <article key={b.name} className="book-card" onClick={() => s.openBook(b.name)}>
                <h2>{b.name}</h2>
                <p>{b.premise || "还没写主脑"}</p>
                <p data-testid={`shelf-progress-${b.name}`}>
                  {b.committed === 0 && b.drafts === 0
                    ? "还没有场"
                    : `写到第 ${Math.max(1, b.columns)} 列${b.last_intent ? ` · ${b.last_intent}` : ""}`}
                </p>
                <p>正史 {b.committed} · 草稿 {b.drafts} · {b.columns || 1} 列</p>
                <p className="muted">上次打开 {formatOpened(b.opened_at)}</p>
                <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => s.openBook(b.name)}>打开</button>
                  <details
                    open={menu === b.name}
                    onToggle={(e) => setMenu((e.target as HTMLDetailsElement).open ? b.name : null)}
                  >
                    <summary>⋯</summary>
                    <button type="button" onClick={() => s.openBook(b.name)}>打开</button>
                    <button type="button" onClick={() => s.openBookTo(b.name, "settings")}>书的设定</button>
                    <button type="button" onClick={() => s.openBookTo(b.name, "export")}>导出</button>
                    <button type="button" data-testid={`shelf-del-${b.name}`} onClick={() => s.setDelBookOpen(b.name)}>删书</button>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
