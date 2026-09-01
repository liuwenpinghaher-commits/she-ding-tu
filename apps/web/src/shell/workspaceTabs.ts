export const WORKSPACE_TABS = [
  "时间轴",
  "分场条",
  "总表",
  "关系",
  "轨迹",
  "列表",
  "讲述序",
  "白板",
] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

/** 出场 / 进度不是页签栏上的主枚，但是同一套中栏看法。 */
export const EXTRA_LOOKS = ["出场", "进度"] as const;
export type AnyLook = WorkspaceTab | (typeof EXTRA_LOOKS)[number];

export const DEFAULT_TAB: WorkspaceTab = "时间轴";

export function isWorkspaceTab(v: string | null | undefined): v is WorkspaceTab {
  return !!v && (WORKSPACE_TABS as readonly string[]).includes(v);
}

export function isAnyLook(v: string | null | undefined): v is AnyLook {
  return isWorkspaceTab(v) || (!!v && (EXTRA_LOOKS as readonly string[]).includes(v));
}

export function readTab(book: string, stored: string | null, hashLook: string | null): AnyLook {
  void book;
  if (isWorkspaceTab(hashLook)) return hashLook;
  if (isWorkspaceTab(stored)) return stored;
  return DEFAULT_TAB;
}

export function readExtraLook(hashLook: string | null | undefined): (typeof EXTRA_LOOKS)[number] | null {
  if (hashLook && (EXTRA_LOOKS as readonly string[]).includes(hashLook)) {
    return hashLook as (typeof EXTRA_LOOKS)[number];
  }
  return null;
}

export function tabStorageKey(book: string): string {
  return `setting-tab:${book}`;
}

export function splitMate(tab: AnyLook): WorkspaceTab {
  return tab === "时间轴" ? "分场条" : "时间轴";
}

export function persistTab(
  book: string,
  tab: AnyLook,
  storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (!book) return;
  try {
    storage?.setItem(tabStorageKey(book), tab);
  } catch {
    /* 无痕 */
  }
}

export function loadStoredTab(
  book: string,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): string | null {
  if (!book) return null;
  try {
    return storage?.getItem(tabStorageKey(book)) ?? null;
  } catch {
    return null;
  }
}

export type TabFilter = {
  who?: string;
  line?: string;
  status?: "all" | "draft" | "canon";
};

export type TabInstance = {
  id: string;
  kind: WorkspaceTab;
  title: string;
  filter?: TabFilter;
};

export function defaultTabInstances(): TabInstance[] {
  return [{ id: "时间轴", kind: "时间轴", title: "时间轴" }];
}

export function tabsStorageKey(book: string): string {
  return `setting-tabs:${book}`;
}

export function loadTabInstances(
  book: string,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): TabInstance[] {
  if (!book) return defaultTabInstances();
  try {
    const raw = storage?.getItem(tabsStorageKey(book));
    if (!raw) return defaultTabInstances();
    const parsed = JSON.parse(raw) as TabInstance[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultTabInstances();
    return parsed.filter((t) => isWorkspaceTab(t.kind));
  } catch {
    return defaultTabInstances();
  }
}

export function persistTabInstances(
  book: string,
  tabs: TabInstance[],
  storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (!book) return;
  try {
    storage?.setItem(tabsStorageKey(book), JSON.stringify(tabs));
  } catch {
    /* 无痕 */
  }
}

export function addTabInstance(tabs: TabInstance[], kind: WorkspaceTab, filter?: TabFilter): TabInstance[] {
  const n = tabs.filter((t) => t.kind === kind).length;
  const inst: TabInstance = {
    id: n === 0 ? kind : `${kind}-${Date.now()}`,
    kind,
    title: n === 0 ? kind : `${kind} ${n + 1}`,
    filter,
  };
  return [...tabs, inst];
}

export function closeTabInstance(tabs: TabInstance[], id: string): TabInstance[] {
  if (tabs.length <= 1) return tabs;
  const next = tabs.filter((t) => t.id !== id);
  return next.length ? next : tabs;
}

export function renameTabInstance(tabs: TabInstance[], id: string, title: string): TabInstance[] {
  const name = title.trim();
  if (!name) return tabs;
  return tabs.map((t) => (t.id === id ? { ...t, title: name } : t));
}

/** 挤不下的从末尾进「更多」，当前枚和前几枚留在栏上。 */
export function overflowTabs(tabs: TabInstance[], visible: number, currentId: string): {
  shown: TabInstance[];
  more: TabInstance[];
} {
  const cap = Math.max(1, visible);
  if (tabs.length <= cap) return { shown: tabs, more: [] };
  const current = tabs.find((t) => t.id === currentId);
  const rest = tabs.filter((t) => t.id !== currentId);
  const keep = rest.slice(0, cap - (current ? 1 : 0));
  const more = rest.slice(cap - (current ? 1 : 0));
  return { shown: current ? [...keep, current] : keep, more };
}
