/** 本书本地偏好：日期锁定、嵌套、讲述序文件夹。不算世界上为真。 */

type Kv = Pick<Storage, "getItem" | "setItem">;

const memory = new Map<string, string>();
const memoryKv: Kv = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => { memory.set(k, String(v)); },
};

function store(): Kv {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* 无痕 */
  }
  return memoryKv;
}

export function loadJson<T>(key: string, fallback: T, kv: Kv = store()): T {
  try {
    const raw = kv.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown, kv: Kv = store()): void {
  try {
    kv.setItem(key, JSON.stringify(value));
  } catch {
    /* 无痕 */
  }
}

export function lockKey(book: string): string {
  return `setting-clock-lock:${book}`;
}

export function nestKey(book: string): string {
  return `setting-nest:${book}`;
}

export function folderKey(book: string): string {
  return `setting-nar-folders:${book}`;
}

export function isLocked(book: string, sceneId: string): boolean {
  const ids = loadJson<string[]>(lockKey(book), []);
  return ids.includes(sceneId);
}

export function toggleLock(book: string, sceneId: string): boolean {
  const ids = loadJson<string[]>(lockKey(book), []);
  const next = ids.includes(sceneId) ? ids.filter((x) => x !== sceneId) : [...ids, sceneId];
  saveJson(lockKey(book), next);
  return next.includes(sceneId);
}

export function nestParent(book: string, sceneId: string): string | null {
  const map = loadJson<Record<string, string>>(nestKey(book), {});
  return map[sceneId] || null;
}

export function setNest(book: string, childId: string, parentId: string | null): void {
  const map = loadJson<Record<string, string>>(nestKey(book), {});
  if (!parentId || parentId === childId) delete map[childId];
  else map[childId] = parentId;
  saveJson(nestKey(book), map);
}

export function colorKey(book: string): string {
  return `setting-item-color:${book}`;
}

export function customColorKey(book: string): string {
  return `setting-custom-colors:${book}`;
}

export function constraintKey(book: string): string {
  return `setting-clock-gap:${book}`;
}

export type GapPref = { laterId: string; earlierId: string; gap: number };

export function itemColor(book: string, id: string): string | null {
  const map = loadJson<Record<string, string>>(colorKey(book), {});
  return map[id] || null;
}

export function setItemColor(book: string, id: string, hex: string | null): void {
  const map = loadJson<Record<string, string>>(colorKey(book), {});
  if (!hex) delete map[id];
  else map[id] = hex;
  saveJson(colorKey(book), map);
}

export function customColors(book: string): string[] {
  return loadJson<string[]>(customColorKey(book), []);
}

export function addCustomColor(book: string, hex: string): string[] {
  const next = [...new Set([...customColors(book), hex])].slice(-12);
  saveJson(customColorKey(book), next);
  return next;
}

export function loadConstraints(book: string): GapPref[] {
  return loadJson<GapPref[]>(constraintKey(book), []);
}

export function saveConstraints(book: string, rows: GapPref[]): void {
  saveJson(constraintKey(book), rows);
}

export function setConstraint(book: string, laterId: string, earlierId: string | null, gap: number): GapPref[] {
  const rest = loadConstraints(book).filter((c) => c.laterId !== laterId);
  const next = !earlierId || earlierId === laterId ? rest : [...rest, { laterId, earlierId, gap: Math.max(0, gap) }];
  saveConstraints(book, next);
  return next;
}

export type NarFolder = { id: string; title: string; sceneIds: string[]; kind?: "act" | "chapter" };

export function loadFolders(book: string): NarFolder[] {
  return loadJson<NarFolder[]>(folderKey(book), []);
}

export function saveFolders(book: string, folders: NarFolder[]): void {
  saveJson(folderKey(book), folders);
}
