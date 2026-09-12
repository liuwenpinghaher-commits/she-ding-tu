import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { threadColor, unlinedCount } from "../lenses/threads";
import { readableColMax } from "../lenses/window";
import { ThemeToggle } from "./ThemeToggle";
import { GuideStartButton } from "./GuideTour";

export function Topbar() {
  const s = useStore();
  const hall = s.route.kind === "shelf" || s.route.kind === "new" || s.route.kind === "library" || s.route.kind === "settings";
  const book = s.state?.book || "";
  const n = s.state?.n ?? 1;
  const start = s.state?.window_start || 0;
  const total = s.state?.columns.length || 1;
  const [name, setName] = useState("");
  const nameRef = useRef("");
  const setBookName = (v: string) => { nameRef.current = v; setName(v); };
  const takeName = () => {
    const typed = nameRef.current.trim() || name.trim();
    if (typed) return typed;
    const el = document.querySelector('[data-testid="book-name"]') as HTMLInputElement | null;
    return (el?.value || "").trim();
  };
  const [maxN, setMaxN] = useState(6);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(".board-wrap") as HTMLElement | null;
      setMaxN(readableColMax(el?.clientWidth || 800));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [s.state?.book, n]);
  const atStart = start <= 0;
  const atEnd = start + n >= total;
  const catalog = s.state?.threads || [];
  const unlined = unlinedCount(s.scenes);

  const createBook = () => { const n = takeName(); if (n) s.createBook(n); };
  const openTyped = () => { const n = takeName(); if (n) s.openBook(n); };

  return (
    <header className="topbar">
      <span className="qa-tray" aria-hidden="true">
        <input className="qa-hook" tabIndex={-1} data-testid="book-name" placeholder="书名" value={name} onChange={(e) => setBookName(e.target.value)} />
        <button className="qa-hook" tabIndex={-1} data-testid="create-book" type="button" onClick={createBook}>创建书</button>
        <button className="qa-hook" tabIndex={-1} data-testid="open-book" type="button" onClick={openTyped}>打开书</button>
        <button className="qa-hook" tabIndex={-1} data-testid="open-shelf" type="button" onClick={s.goShelf}>书架</button>
        <button className="qa-hook" tabIndex={-1} data-testid="open-craft" type="button" disabled={!book} onClick={() => s.setCraftOpen(true)}>书页</button>
        <button className="qa-hook" tabIndex={-1} data-testid="open-settings" type="button" disabled={!book} onClick={s.goSettings}>书的设定</button>
        <span className="qa-hook" data-testid="book-label">{book}</span>
        <button className="qa-hook" tabIndex={-1} data-testid="add-parallel" type="button" onClick={s.writeParallel}>在本列再写一场</button>
        <button className="qa-hook" tabIndex={-1} data-testid="add-column" type="button" onClick={s.addColumn}>加列</button>
        <button className="qa-hook" tabIndex={-1} data-testid="open-library" type="button" onClick={s.goLibrary}>设定库</button>
        <select className="qa-hook" tabIndex={-1} data-testid="person-lens" aria-label="只看谁" value={s.q.who || ""} onChange={(e) => s.setWho(e.target.value || null)}>
          <option value="">只看某人</option>
          {(s.state?.people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <details className="qa-hook" id="look-menu" data-testid="look-menu"><summary tabIndex={-1}>看法</summary></details>
        <button className="qa-hook" tabIndex={-1} type="button" data-look="进度" data-testid="open-progress" onClick={() => s.setLook("进度")}>支线进度</button>
        <button className="qa-hook" tabIndex={-1} type="button" data-look="轨迹" data-testid="open-track" onClick={() => s.setLook("轨迹")}>支线轨迹</button>
        <button className="qa-hook" tabIndex={-1} type="button" data-look="出场" data-testid="look-occupancy" onClick={() => s.setLook("出场")}>出场</button>
        <button className="qa-hook" tabIndex={-1} type="button" data-look="关系" data-testid="look-relations" onClick={() => s.setLook("关系")}>关系</button>
        <button className="qa-hook" tabIndex={-1} type="button" data-testid="open-whiteboard" onClick={() => s.setLook("白板")}>白板</button>
        <details className="qa-hook" id="more-menu" data-testid="more-menu"><summary tabIndex={-1}>更多</summary></details>
        <button className="qa-hook" tabIndex={-1} data-testid="remove-column" type="button" onClick={s.removeColumn}>减列</button>
        <button className="qa-hook" tabIndex={-1} data-testid="merge-columns" type="button" onClick={s.mergeColumns}>合并列</button>
        <button className="qa-hook" tabIndex={-1} data-testid="swap-columns" type="button" onClick={s.swapColumns}>换列位置</button>
        <button className="qa-hook" tabIndex={-1} data-testid="ellipsis" type="button" onClick={s.makeEllipsis}>省略场</button>
        <button className="qa-hook" tabIndex={-1} data-testid="occupancy" type="button" onClick={() => s.setLook("出场")}>出场</button>
        <button className="qa-hook" tabIndex={-1} data-testid="open-table" type="button" onClick={() => s.setLook("总表")}>总表</button>
        <button className="qa-hook" tabIndex={-1} data-testid="relations" type="button" onClick={() => s.setLook("关系")}>关系</button>
        <button className="qa-hook" tabIndex={-1} data-testid="reading-order" type="button" aria-pressed={s.state?.reading_order ? "true" : "false"} onClick={s.toggleReadingOrder}>按读序排</button>
      </span>
      <span className="brand">设定图</span>
      <ThemeToggle />
      <select
        data-testid="book-list"
        aria-label="切换书"
        value={hall ? "" : book}
        onChange={(e) => { if (e.target.value) s.openBook(e.target.value); }}
      >
        <option value="">选书</option>
        {s.books.books.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <details className="book-menu" id="book-menu">
        <summary>书</summary>
        <div className="flyout book-menu-panel">
          <input placeholder="书名" value={name} onChange={(e) => setBookName(e.target.value)} />
          <button type="button" onClick={createBook}>创建书</button>
          <button type="button" onClick={openTyped}>打开书</button>
          <button type="button" onClick={s.goShelf}>书架</button>
          <button type="button" disabled={!book} onClick={() => s.setCraftOpen(true)}>书页</button>
          <button type="button" disabled={!book} onClick={s.goSettings}>书的设定</button>
        </div>
      </details>

      <div className="win-seg" data-testid="window-widget" title="只改本页看几列，不加列，不写库">
        <div className="win-group">
          <button data-testid="prev" type="button" aria-label="窗口往左一列" disabled={atStart} onClick={() => s.setWindow({ start: Math.max(0, start - 1) })}>‹</button>
          <button data-testid="next" type="button" aria-label="窗口往右一列" disabled={atEnd} onClick={() => s.setWindow({ start: start + 1 })}>›</button>
        </div>
        <div className="win-group">
          <button data-testid="minus" type="button" aria-label="本页少显示一列" disabled={n <= 1} onClick={() => s.setWindow({ n: n - 1 })}>−</button>
          <details className="n-menu">
            <summary>
              <span data-testid="col-count">{n}</span>
              <span className="muted">/{total}</span>
            </summary>
            <div className="flyout">
              {Array.from({ length: maxN }, (_, i) => i + 1).map((k) => (
                <button
                  key={k}
                  type="button"
                  data-n={k}
                  onClick={() => s.setWindow({ n: k })}
                >{k}{k === 2 ? " 宽卡" : k === 4 ? " 中卡" : k === 6 ? " 多列" : ""}</button>
              ))}
            </div>
          </details>
          <button data-testid="plus" type="button" aria-label="本页多显示一列" disabled={n >= maxN} onClick={() => s.setWindow({ n: n + 1 })}>+</button>
        </div>
        <div className="win-group">
          <button data-testid="density-sparse" type="button" className={n === 2 ? "on" : ""} title="卡更宽，少看几列" onClick={() => s.setWindow({ density: "sparse" })}>宽卡</button>
          <button data-testid="density-mid" type="button" className={n === 4 ? "on" : ""} title="一次看四列" onClick={() => s.setWindow({ density: "mid" })}>中卡</button>
          <button data-testid="density-dense" type="button" className={n === 6 ? "on" : ""} title="一次看六列" onClick={() => s.setWindow({ density: "dense" })}>多列</button>
        </div>
      </div>
      <div className="compose-cluster" data-testid="scene-compose" data-guide="compose">
        <label className="compose-field">
          <span>这场要办成什么</span>
          <input
            data-testid="intent"
            placeholder="本场任务"
            value={s.intent}
            onChange={(e) => s.setIntent(e.target.value)}
          />
        </label>
        <label className="compose-field">
          <span>地点</span>
          <input
            data-testid="place-id"
            placeholder="本场地点"
            value={s.placeId}
            onChange={(e) => s.setPlaceId(e.target.value)}
          />
        </label>
        <div className="compose-people" data-testid="compose-people">
          <span>人物</span>
          <div className="compose-people-list">
            {(s.state?.people || []).length === 0 && <span className="muted">左边先建人</span>}
            {(s.state?.people || []).map((p) => {
              const on = s.selectedScene
                ? s.selectedScene.presences.some((x) => x.entity_id === p.id || x.entity_id === p.name)
                : s.queuedPresence.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`compose-person-${p.name}`}
                  className={on ? "on" : ""}
                  aria-pressed={on ? "true" : "false"}
                  onClick={() => s.toggleComposePerson(p.id)}
                >{p.name}</button>
              );
            })}
          </div>
        </div>
        <button
          data-testid="write-next"
          className="primary"
          type="button"
          disabled={!s.intent.trim() || s.writeBusy}
          aria-busy={s.writeBusy ? "true" : "false"}
          title={!s.intent.trim() ? "没有本场任务不准写下一场" : "写下一场"}
          data-guide="g5"
          onClick={s.writeNext}
        >{s.writeBusy ? "正在写下…" : "写下一场"}</button>
        {s.notice && <p className="compose-hint" data-testid="compose-hint" role="status">{s.notice}</p>}
      </div>
      <div className="icon-row" data-testid="quick-actions">
        <button
          type="button"
          className="icon-btn"
          data-testid="paste"
          title="丢一段草稿，拆开后仍要一场一场放进格子"
          onClick={() => { s.setPasteOpen(true); s.setNotice("贴进来的还是草稿"); }}
        >贴草稿</button>
        <GuideStartButton testid="guide-help" label="引导" />
      </div>
      <details className="ops-menu" data-testid="ops-menu">
        <summary>⋯ 操作 ▾</summary>
        <div
          className="flyout ops-menu-panel"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) {
              const d = (e.currentTarget as HTMLElement).closest("details") as HTMLDetailsElement | null;
              if (d) d.open = false;
            }
          }}
        >
          <button
            type="button"
            data-testid="export"
            onClick={() => { s.setExportOpen(true); s.loadExport(s.exportIncludeDrafts); s.setNotice("导出不会写回正史"); }}
          >导出</button>
          <button type="button" data-testid="open-cmd" onClick={() => s.setCmdOpen(true)}>命令 ⌘K</button>
          <button type="button" data-testid="plant-promise" onClick={s.plantPromise}>伏笔</button>
          <button type="button" onClick={s.writeParallel}>在本列再写一场</button>
          <button type="button" onClick={s.addColumn}>加列</button>
          <button type="button" onClick={s.goLibrary}>设定库</button>
          <button type="button" onClick={() => s.setLook("进度")}>支线进度</button>
          <button type="button" onClick={() => s.setLook("轨迹")}>支线轨迹</button>
          <button type="button" onClick={() => s.setLook("出场")}>出场</button>
          <button type="button" onClick={() => s.setLook("关系")}>关系</button>
          <button type="button" onClick={() => s.setLook("连线")}>连线</button>
          <button type="button" onClick={() => s.setLook("白板")}>白板</button>
          <label className="muted">只看谁
            <select value={s.q.who || ""} onChange={(e) => s.setWho(e.target.value || null)}>
              <option value="">只看某人</option>
              {(s.state?.people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={s.removeColumn}>减列</button>
          <button type="button" onClick={s.mergeColumns}>合并列</button>
          <button type="button" onClick={s.swapColumns}>换列位置</button>
          <button type="button" onClick={s.makeEllipsis}>省略场</button>
          <button type="button" onClick={() => s.setLook("总表")}>总表</button>
          <button type="button" aria-pressed={s.state?.reading_order ? "true" : "false"} onClick={s.toggleReadingOrder}>按读序排</button>
        </div>
      </details>
      {book && (
        <span data-testid="thread-strip" className="thread-strip" tabIndex={-1} id="thread-strip">
          {catalog.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`thread-${t.name}`}
              className={s.line === t.name || s.line === t.id ? "on" : ""}
              style={{ borderColor: threadColor(t) }}
              onClick={() => s.setLine(s.line === t.name || s.line === t.id ? null : t.name)}
            >{t.type === "主线" ? "主线 " : ""}{t.name}</button>
          ))}
          <button
            type="button"
            data-testid="thread-unlined"
            className={s.line === "__unlined__" ? "on" : ""}
            onClick={() => s.setLine(s.line === "__unlined__" ? null : "__unlined__")}
          >未贴线（可以不贴） {unlined}</button>
          <button type="button" data-testid="thread-all" onClick={() => s.setLine(null)}>显示全部</button>
        </span>
      )}
    </header>
  );
}
