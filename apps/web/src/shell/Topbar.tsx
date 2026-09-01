import { useState } from "react";
import { useStore } from "../state/store";

export function Topbar() {
  const s = useStore();
  const book = s.state?.book || "";
  const n = s.state?.n ?? 1;
  const [name, setName] = useState("");
  return (
    <header className="topbar">
      <span className="brand">设定图</span>
      <span>›</span>
      <select
        data-testid="book-list"
        aria-label="切换书"
        value={book}
        onChange={(e) => { if (e.target.value) s.openBook(e.target.value); }}
      >
        <option value="">选书</option>
        {s.books.books.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <input data-testid="book-name" placeholder="书名" value={name} onChange={(e) => setName(e.target.value)} />
      <button data-testid="create-book" type="button" onClick={() => name.trim() && s.createBook(name.trim())}>创建书</button>
      <button data-testid="open-book" type="button" onClick={() => name.trim() && s.openBook(name.trim())}>打开书</button>
      <span data-testid="book-label">{book}</span>
      <button data-testid="open-shelf" type="button" onClick={s.goShelf}>书架</button>
      <button data-testid="open-craft" type="button" disabled={!book} onClick={() => s.setCraftOpen(true)}>书页</button>
      <button data-testid="prev" type="button" aria-label="窗口往左一列" disabled={(s.state?.window_start || 0) <= 0} onClick={() => s.setWindow({ start: Math.max(0, (s.state?.window_start || 0) - 1) })}>‹</button>
      <button data-testid="minus" type="button" aria-label="本页少显示一列" disabled={n <= 1} onClick={() => s.setWindow({ n: n - 1 })}>−</button>
      <span className="col-count">本页 <span data-testid="col-count">{n}</span> / <span id="col-total">{s.state?.columns.length || 1}</span> 列</span>
      <button data-testid="plus" type="button" aria-label="本页多显示一列" disabled={n >= 6} onClick={() => s.setWindow({ n: n + 1 })}>+</button>
      <button data-testid="next" type="button" aria-label="窗口往右一列" disabled={(s.state?.window_start || 0) + n >= (s.state?.columns.length || 1)} onClick={() => s.setWindow({ start: (s.state?.window_start || 0) + 1 })}>›</button>
      <button data-testid="density-sparse" type="button" onClick={() => s.setWindow({ density: "sparse" })}>疏</button>
      <button data-testid="density-mid" type="button" onClick={() => s.setWindow({ density: "mid" })}>中</button>
      <button data-testid="density-dense" type="button" onClick={() => s.setWindow({ density: "dense" })}>密</button>
      <input data-testid="intent" placeholder="本场任务" value={s.intent} onChange={(e) => s.setIntent(e.target.value)} />
      <input data-testid="place-id" placeholder="本场地点" value={s.placeId} onChange={(e) => s.setPlaceId(e.target.value)} />
      <button
        data-testid="write-next"
        className="primary"
        type="button"
        disabled={!s.intent.trim()}
        title={!s.intent.trim() ? "没有本场任务不准写下一场" : "写下一场"}
        onClick={s.writeNext}
      >写下一场</button>
      <button data-testid="add-parallel" type="button" onClick={s.writeParallel}>在本列再写一场</button>
      <button data-testid="add-column" type="button" onClick={s.addColumn}>加列</button>
      <details id="look-menu" data-testid="look-menu">
        <summary>看法</summary>
        <button type="button" data-look="进度" data-testid="open-progress" onClick={() => s.setLook("进度")}>支线进度</button>
        <button type="button" data-look="轨迹" data-testid="open-track" onClick={() => s.setLook("轨迹")}>支线轨迹</button>
        <button type="button" data-look="出场" data-testid="look-occupancy" onClick={() => s.setLook("出场")}>出场</button>
        <button type="button" data-look="关系" data-testid="look-relations" onClick={() => s.setLook("关系")}>关系</button>
        <button type="button" data-testid="open-whiteboard" onClick={() => s.setLook("白板")}>白板</button>
      </details>
      <button data-testid="open-timeline" type="button" onClick={() => s.setLook(s.look === "时间轴" ? null : "时间轴")}>时间轴</button>
      <button data-testid="open-library" type="button" onClick={s.goLibrary}>设定库</button>
      <button data-testid="open-cmd" type="button" title="命令面板 ⌘K">/</button>
      <select data-testid="person-lens" aria-label="只看谁" defaultValue="">
        <option value="">只看某人</option>
        {(s.state?.people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <details id="more-menu" data-testid="more-menu">
        <summary>更多</summary>
        <button data-testid="remove-column" type="button" onClick={s.removeColumn}>减列</button>
        <button data-testid="merge-columns" type="button" onClick={s.mergeColumns}>合并列</button>
        <button data-testid="swap-columns" type="button" onClick={s.swapColumns}>换列位置</button>
        <button data-testid="ellipsis" type="button" onClick={s.makeEllipsis}>省略场</button>
        <button data-testid="occupancy" type="button" onClick={() => s.setLook("出场")}>出场</button>
        <button data-testid="open-table" type="button" onClick={() => s.setLook("总表")}>总表</button>
        <button data-testid="relations" type="button" onClick={() => s.setLook("关系")}>关系</button>
        <button data-testid="reading-order" type="button" aria-pressed={s.state?.reading_order ? "true" : "false"} onClick={s.toggleReadingOrder}>按读序排</button>
        <button data-testid="export" type="button" onClick={() => { s.setExportOpen(true); s.loadExport(s.exportIncludeDrafts); }}>导出</button>
        <button data-testid="paste" type="button" onClick={() => s.setPasteOpen(true)}>丢一段草稿</button>
        <button data-testid="plant-promise" type="button">埋伏笔</button>
      </details>
      {book && (
        <span data-testid="thread-strip" className="thread-strip">
          {(s.state?.threads || []).map((t) => (
            <button key={t.id} type="button" data-testid={`thread-${t.name}`} onClick={() => s.setLine(s.line === t.name ? null : t.name)}>{t.name}</button>
          ))}
          <button type="button" data-testid="thread-unlined" onClick={() => s.setLine(s.line === "__unlined__" ? null : "__unlined__")}>未归线</button>
          <button type="button" data-testid="thread-all" onClick={() => s.setLine(null)}>显示全部</button>
        </span>
      )}
    </header>
  );
}
