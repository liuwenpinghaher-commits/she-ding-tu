import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";

type Item = { group: string; label: string; run: () => void; hint?: string; kw?: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      { group: "跳", label: "书架", kw: "书单 列表 回家", hint: "G", run: () => s.goShelf() },
      { group: "跳", label: "设定库", kw: "档案 全书", run: () => s.goLibrary() },
      { group: "跳", label: "书的设定", kw: "主脑 回目", run: () => s.goSettings() },
      { group: "写", label: "写下一场", kw: "n 本场任务", hint: "N", run: () => document.querySelector<HTMLInputElement>("[data-testid=intent]")?.focus() },
      { group: "看", label: "时间轴", kw: "t 标尺", hint: "T", run: () => s.setLook("时间轴") },
      { group: "看", label: "出场", kw: "矩阵", run: () => s.setLook("出场") },
      { group: "看", label: "关系", kw: "连线", run: () => s.setLook("关系") },
      { group: "看", label: "进度", kw: "支线", run: () => s.setLook("进度") },
      { group: "看", label: "总表", run: () => s.setLook("总表") },
      { group: "看", label: "白板", run: () => s.setLook("白板") },
      { group: "结构", label: "加列", kw: "加一场 往后", run: () => s.addColumn() },
      { group: "结构", label: "减列", run: () => s.removeColumn() },
      { group: "书", label: "导出", kw: "markdown md", run: () => { s.setExportOpen(true); s.loadExport(true); } },
      { group: "书", label: "丢一段草稿", kw: "粘贴 拆开", run: () => s.setPasteOpen(true) },
    ];
    for (const t of s.state?.threads || []) {
      out.push({ group: "跳", label: `过滤「${t.name}」`, hint: "只改看法，不是写下一场", kw: "逻辑线 支线", run: () => s.setLine(t.name) });
    }
    const seen = new Set<string>();
    for (const p of (s.state?.promises || [])) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      out.push({ group: "跳", label: `伏笔「${p.name}」`, hint: "不是逻辑线", kw: "埋 兑", run: () => s.openDossier(p.name) });
    }
    for (const e of (s.state?.all_entities || []).filter((x) => x.kind === "promise")) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({ group: "跳", label: `伏笔「${e.name}」`, hint: "不是逻辑线", kw: "埋 兑", run: () => s.openDossier(e.name) });
    }
    return out;
  }, [s]);
  const shown = items.filter((it) => {
    const needle = q.trim();
    if (!needle) return true;
    return it.label.includes(needle) || it.group.includes(needle) || (it.hint || "").includes(needle) || (it.kw || "").includes(needle);
  });
  useEffect(() => {
    if (!open) setQ("");
    setHi(0);
  }, [open, q]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
        e.preventDefault();
        setHi((i) => (shown.length ? (i + 1) % shown.length : 0));
      } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
        e.preventDefault();
        setHi((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = shown[hi];
        if (it) { it.run(); onClose(); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, shown, hi, onClose]);
  if (!open) return null;
  const groups = ["跳", "写", "看", "结构", "书"];
  let idx = -1;
  return (
    <div className="dialog-back" data-testid="cmd-palette" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>命令</h3>
        <input autoFocus placeholder="搜" value={q} onChange={(e) => setQ(e.target.value)} data-testid="cmd-q" />
        {shown.length === 0 && <p className="muted" data-testid="cmd-empty">没有这条命令</p>}
        {groups.map((g) => {
          const rows = shown.filter((it) => it.group === g);
          if (!rows.length) return null;
          return (
            <section key={g}>
              <h4>{g}</h4>
              {rows.map((it) => {
                idx += 1;
                const active = idx === hi;
                const i = idx;
                return (
                  <button
                    key={it.label}
                    type="button"
                    className={`ghost${active ? " on" : ""}`}
                    data-testid={active ? "cmd-active" : "cmd-item"}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => { it.run(); onClose(); }}
                  >{it.label}{it.hint ? ` · ${it.hint}` : ""}</button>
                );
              })}
            </section>
          );
        })}
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
