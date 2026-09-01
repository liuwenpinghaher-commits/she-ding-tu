import { useStore } from "../state/store";

export function ShelfPage() {
  const s = useStore();
  const items = s.books.items || s.books.books.map((name) => ({
    name, premise: "", columns: 1, committed: 0, drafts: 0, opened_at: 0,
  }));
  return (
    <div className="page" data-testid="shelf">
      <h1>书架</h1>
      {items.length === 0 && (
        <div>
          <p>还没有书。从这里开始写第一本</p>
          <button className="primary" type="button" data-testid="shelf-new" onClick={s.goNew}>新建书</button>
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
                <p>正史 {b.committed} · 草稿 {b.drafts} · {b.columns} 列</p>
                <p className="muted">{b.opened_at ? new Date(b.opened_at).toLocaleString() : "还没打开过"}</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); s.openBook(b.name); }}>打开</button>
                <button type="button" data-testid={`shelf-del-${b.name}`} onClick={(e) => { e.stopPropagation(); s.setDelBookOpen(b.name); }}>删书</button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
