import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { Modal } from "../pages/Modal";
import { readThemeFromDom, THEME_EVENT, toggleTheme, type Theme } from "./theme";

type Item = { group: string; label: string; run: () => void; hint?: string; kw?: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [theme, setTheme] = useState<Theme>(readThemeFromDom);
  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setTheme(next);
    };
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  const goShelf = s.goShelf;
  const goLibrary = s.goLibrary;
  const goSettings = s.goSettings;
  const setLook = s.setLook;
  const addColumn = s.addColumn;
  const removeColumn = s.removeColumn;
  const setExportOpen = s.setExportOpen;
  const loadExport = s.loadExport;
  const setPasteOpen = s.setPasteOpen;
  const setLine = s.setLine;
  const openDossier = s.openDossier;
  const setSplit = s.setSplit;
  const createAtClock = s.createAtClock;
  const workspaceTab = s.workspaceTab;
  const splitTab = s.splitTab;
  const selectedScene = s.selectedScene;
  const threads = s.state?.threads;
  const promises = s.state?.promises;
  const allEntities = s.state?.all_entities;
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      { group: "跳", label: "书架", kw: "书单 列表 回家", hint: "G", run: () => goShelf() },
      { group: "跳", label: "设定库", kw: "档案 全书", run: () => goLibrary() },
      { group: "跳", label: "书的设定", kw: "主脑 回目", run: () => goSettings() },
      { group: "写", label: "写下一场", kw: "n 本场任务", hint: "N", run: () => document.querySelector<HTMLInputElement>("[data-testid=intent]")?.focus() },
      { group: "看", label: "时间轴", kw: "t 标尺", hint: "T", run: () => setLook("时间轴") },
      { group: "看", label: "分场条", kw: "等宽 写厚", run: () => setLook("分场条") },
      { group: "看", label: "讲述序", kw: "读序 叙事", run: () => setLook("讲述序") },
      { group: "看", label: "轨迹", kw: "地铁", run: () => setLook("轨迹") },
      { group: "看", label: "出场", kw: "矩阵", run: () => setLook("出场") },
      { group: "看", label: "关系", kw: "格", run: () => setLook("关系") },
      { group: "看", label: "连线图", kw: "连线 知情 同场", run: () => setLook("连线") },
      { group: "看", label: "进度", kw: "支线", run: () => setLook("进度") },
      { group: "看", label: "总表", run: () => setLook("总表") },
      { group: "看", label: "列表", run: () => setLook("列表") },
      { group: "看", label: "白板", run: () => setLook("白板") },
      { group: "看", label: "分屏", kw: "并排", run: () => setSplit(splitTab ? null : (workspaceTab === "时间轴" ? "分场条" : "时间轴")) },
      { group: "跳", label: "跳到某日", kw: "钟 j", hint: "⌘J", run: () => document.querySelector<HTMLButtonElement>("[data-testid=tl-jump]")?.click() },
      { group: "写", label: "在时间轴建场", kw: "n 草稿", hint: "⌘N", run: () => { const t = selectedScene?.clock_from ?? 0; void createAtClock(t); } },
      { group: "结构", label: "加列", kw: "加一场 往后", run: () => addColumn() },
      { group: "结构", label: "减列", run: () => removeColumn() },
      { group: "书", label: "导出", kw: "markdown md", run: () => { setExportOpen(true); loadExport(true); } },
      { group: "书", label: "丢一段草稿", kw: "粘贴 拆开", run: () => setPasteOpen(true) },
      { group: "书", label: theme === "light" ? "切到暗色" : "切到亮色", kw: "主题 亮色 暗色 浅色 白天 theme", run: () => toggleTheme() },
    ];
    for (const t of threads || []) {
      out.push({ group: "跳", label: `过滤「${t.name}」`, hint: "只改看法，不是写下一场", kw: "逻辑线 支线", run: () => setLine(t.name) });
    }
    const seen = new Set<string>();
    for (const p of (promises || [])) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      out.push({ group: "跳", label: `伏笔「${p.name}」`, hint: "不是逻辑线", kw: "埋 兑", run: () => openDossier(p.name) });
    }
    for (const e of (allEntities || []).filter((x) => x.kind === "promise")) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({ group: "跳", label: `伏笔「${e.name}」`, hint: "不是逻辑线", kw: "埋 兑", run: () => openDossier(e.name) });
    }
    return out;
  }, [goShelf, goLibrary, goSettings, setLook, addColumn, removeColumn, setExportOpen, loadExport, setPasteOpen, setLine, openDossier, setSplit, createAtClock, workspaceTab, splitTab, selectedScene, threads, promises, allEntities, theme]);
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
      const tag = (e.target as HTMLElement)?.tagName;
      const inPalette = !!(e.target as HTMLElement)?.closest?.("[data-testid=cmd-palette]");
      if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
        if (tag === "INPUT" && !inPalette) return;
        e.preventDefault();
        setHi((i) => (shown.length ? (i + 1) % shown.length : 0));
      } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
        if (tag === "INPUT" && !inPalette) return;
        e.preventDefault();
        setHi((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
      } else if (e.key === "Enter") {
        if (!inPalette) return;
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
    <Modal open onClose={onClose} testid="cmd-palette">
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
    </Modal>
  );
}
