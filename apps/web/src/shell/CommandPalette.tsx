import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";

type Item = { group: string; label: string; run: () => void; hint?: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      { group: "跳", label: "书架", run: () => s.goShelf() },
      { group: "跳", label: "设定库", run: () => s.goLibrary() },
      { group: "跳", label: "书的设定", run: () => s.goSettings() },
      { group: "写", label: "写下一场", hint: "先写本场任务", run: () => document.querySelector<HTMLInputElement>("[data-testid=intent]")?.focus() },
      { group: "看", label: "时间轴", run: () => s.setLook("时间轴") },
      { group: "看", label: "出场", run: () => s.setLook("出场") },
      { group: "看", label: "关系", run: () => s.setLook("关系") },
      { group: "看", label: "进度", run: () => s.setLook("进度") },
      { group: "看", label: "总表", run: () => s.setLook("总表") },
      { group: "看", label: "白板", run: () => s.setLook("白板") },
      { group: "结构", label: "加列", run: () => s.addColumn() },
      { group: "结构", label: "减列", run: () => s.removeColumn() },
      { group: "书", label: "导出", run: () => { s.setExportOpen(true); s.loadExport(true); } },
      { group: "书", label: "丢一段草稿", run: () => s.setPasteOpen(true) },
    ];
    for (const t of s.state?.threads || []) {
      out.push({ group: "跳", label: `过滤「${t.name}」`, hint: "只改看法，不是写下一场", run: () => s.setLine(t.name) });
    }
    const seen = new Set<string>();
    for (const p of (s.state?.promises || [])) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      out.push({ group: "跳", label: `伏笔「${p.name}」`, hint: "不是逻辑线", run: () => s.openDossier(p.name) });
    }
    for (const e of (s.state?.all_entities || []).filter((x) => x.kind === "promise")) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({ group: "跳", label: `伏笔「${e.name}」`, hint: "不是逻辑线", run: () => s.openDossier(e.name) });
    }
    return out;
  }, [s]);
  const shown = items.filter((it) => !q.trim() || it.label.includes(q.trim()) || it.group.includes(q.trim()));
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  if (!open) return null;
  const groups = ["跳", "写", "看", "结构", "书"];
  return (
    <div className="dialog-back" data-testid="cmd-palette" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>命令</h3>
        <input autoFocus placeholder="搜" value={q} onChange={(e) => setQ(e.target.value)} data-testid="cmd-q" />
        {groups.map((g) => {
          const rows = shown.filter((it) => it.group === g);
          if (!rows.length) return null;
          return (
            <section key={g}>
              <h4>{g}</h4>
              {rows.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  className="ghost"
                  onClick={() => { it.run(); onClose(); }}
                >{it.label}{it.hint ? ` · ${it.hint}` : ""}</button>
              ))}
            </section>
          );
        })}
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
