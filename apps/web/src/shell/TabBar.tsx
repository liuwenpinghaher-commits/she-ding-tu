import { useEffect, useMemo, useState } from "react";
import {
  WORKSPACE_TABS,
  addTabInstance,
  closeTabInstance,
  loadTabInstances,
  overflowTabs,
  persistTabInstances,
  renameTabInstance,
  splitMate,
  type TabInstance,
  type WorkspaceTab,
} from "./workspaceTabs";
import { useStore } from "../state/store";

export function TabBar() {
  const s = useStore();
  const book = s.state?.book || "";
  const currentKind = s.workspaceTab;
  const split = s.splitTab;
  const [tabs, setTabs] = useState<TabInstance[]>(() => loadTabInstances(book));
  const [editing, setEditing] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [visibleCap, setVisibleCap] = useState(8);

  useEffect(() => {
    setTabs(loadTabInstances(book));
  }, [book]);

  useEffect(() => {
    const onResize = () => {
      const w = document.querySelector(".tab-bar")?.clientWidth || 800;
      setVisibleCap(Math.max(3, Math.floor(w / 88)));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const currentId = useMemo(() => {
    const match = tabs.find((t) => t.kind === currentKind && t.id === currentKind)
      || tabs.find((t) => t.kind === currentKind);
    return match?.id || tabs[0]?.id || "分场条";
  }, [tabs, currentKind]);

  const { shown, more } = overflowTabs(tabs, visibleCap, currentId);

  const persist = (next: TabInstance[]) => {
    setTabs(next);
    persistTabInstances(book, next);
  };

  const activate = (tab: TabInstance) => {
    s.setTabFilter(tab.filter || null);
    s.setLook(tab.kind);
  };

  return (
    <div className="tab-bar" data-testid="tab-bar">
      {shown.map((tab) => (
        <span key={tab.id} className="tab-item">
          {editing === tab.id ? (
            <input
              autoFocus
              defaultValue={tab.title}
              data-testid={`tab-rename-${tab.id}`}
              onBlur={(e) => {
                persist(renameTabInstance(tabs, tab.id, e.target.value));
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <button
              type="button"
              data-testid={
                tab.kind === "时间轴" && tab.id === "时间轴"
                  ? "open-timeline"
                  : tab.id === tab.kind
                    ? `tab-${tab.kind}`
                    : `tab-${tab.id}`
              }
              className={tab.kind === "讲述序" ? "narrative" : ""}
              aria-current={tab.kind === currentKind && tab.id === currentId ? "page" : undefined}
              onClick={() => activate(tab)}
              onDoubleClick={() => setEditing(tab.id)}
              title={tab.kind === "时间轴" ? "可选看法，按旧世界生成。双击改名" : "双击改名"}
            >{tab.title}{tab.kind === "时间轴" ? <span className="tab-legacy" data-testid="tl-legacy" aria-hidden="true">按旧世界生成</span> : null}</button>
          )}
          <button
            type="button"
            className="tab-x"
            data-testid={`tab-close-${tab.id}`}
            disabled={tabs.length <= 1}
            aria-label={`关掉${tab.title}`}
            onClick={() => {
              const next = closeTabInstance(tabs, tab.id);
              persist(next);
              if (tab.id === currentId) s.setLook(next[0].kind);
            }}
          >×</button>
        </span>
      ))}
      {more.length > 0 && (
        <details className="tab-more" data-testid="tab-overflow">
          <summary>更多</summary>
          <div className="tab-add-menu">
            {more.map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={tab.id === tab.kind ? `tab-${tab.kind}` : `tab-${tab.id}`}
                onClick={() => activate(tab)}
              >{tab.title}</button>
            ))}
          </div>
        </details>
      )}
      <details className="tab-more" data-testid="tab-add" open={addOpen} onToggle={(e) => setAddOpen((e.target as HTMLDetailsElement).open)}>
        <summary>+</summary>
        <div className="tab-add-menu">
          {WORKSPACE_TABS.map((kind) => (
            <button
              key={kind}
              type="button"
              data-testid={`tab-add-${kind}`}
              onClick={() => {
                persist(addTabInstance(tabs, kind));
                s.setLook(kind);
                setAddOpen(false);
              }}
            >再开{kind}</button>
          ))}
        </div>
      </details>
      <button
        type="button"
        data-testid="split-view"
        aria-pressed={split ? "true" : "false"}
        onClick={() => s.setSplit(split ? null : splitMate(currentKind))}
      >{split ? "关分屏" : "分屏"}</button>
      {split && (
        <label className="follow-toggle">
          <input
            type="checkbox"
            data-testid="split-lock"
            checked={s.splitLock}
            onChange={(e) => s.setSplitLock(e.target.checked)}
          />
          锁滚
        </label>
      )}
    </div>
  );
}

export function isTab(v: string | null): v is WorkspaceTab {
  return (WORKSPACE_TABS as readonly string[]).includes(v || "");
}
