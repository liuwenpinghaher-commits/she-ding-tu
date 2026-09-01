import type { SceneCard, StoryThread } from "../canon/types";

export const AEON_SWATCHES: { name: string; hex: string }[] = [
  { name: "天蓝", hex: "#70B0F0" },
  { name: "叶绿", hex: "#90C080" },
  { name: "玫粉", hex: "#D06090" },
  { name: "藕紫", hex: "#B090F0" },
  { name: "青灰", hex: "#89B558" },
  { name: "珊瑚", hex: "#DF627A" },
];

export const BRANCH_COLORS = AEON_SWATCHES.map((s) => s.hex);

export function threadColor(t: StoryThread | undefined): string {
  if (!t) return "var(--unlined)";
  const slot = ((t.color ?? 0) % BRANCH_COLORS.length + BRANCH_COLORS.length) % BRANCH_COLORS.length;
  return BRANCH_COLORS[slot];
}

export function primaryThread(scene: SceneCard, catalog: StoryThread[]): StoryThread | undefined {
  const ids = scene.story_threads || [];
  if (!ids.length) return undefined;
  const found = ids
    .map((x) => catalog.find((t) => t.id === x.id))
    .filter((t): t is StoryThread => !!t);
  const main = found.find((t) => t.type === "主线");
  if (main) return main;
  return found[0] || catalog.find((t) => t.id === ids[0].id);
}

/** 过滤某条线时，这场若挂了该线，色带临时改成被滤的那条。 */
export function bandThread(
  scene: SceneCard,
  catalog: StoryThread[],
  filterLine: string | null,
): StoryThread | undefined {
  if (filterLine && filterLine !== "__unlined__") {
    const t = catalog.find((x) => x.id === filterLine || x.name === filterLine);
    if (t && scene.story_threads?.some((s) => s.id === t.id)) return t;
  }
  return primaryThread(scene, catalog);
}

export function extraCount(scene: SceneCard): number {
  const n = scene.story_threads?.length || 0;
  return n > 1 ? n - 1 : 0;
}

export function threadRole(scene: SceneCard, threadId: string): string {
  return scene.story_threads?.find((t) => t.id === threadId)?.role || "推进";
}

export function isPaused(scene: SceneCard, threadId: string): boolean {
  return threadRole(scene, threadId) === "暂停";
}

/** 过滤：线上完整卡，线外薄条。不藏场。草稿场参与。 */
export function isOnLine(scene: SceneCard, lineId: string | null, catalog: StoryThread[]): boolean {
  if (!lineId) return true;
  if (lineId === "__unlined__") return !scene.story_threads?.length;
  const t = catalog.find((x) => x.id === lineId || x.name === lineId);
  if (!t) return scene.story_threads?.some((s) => s.id === lineId) ?? false;
  return scene.story_threads?.some((s) => s.id === t.id) ?? false;
}

export function personOnScene(
  scene: SceneCard,
  who: string | null,
  entities: { id: string; name: string }[],
): boolean {
  if (!who) return true;
  const match = (id: string) => id === who || entities.some((e) => (e.id === who || e.name === who) && (e.id === id || e.name === id));
  if (scene.presences.some((p) => match(p.entity_id))) return true;
  if (scene.place_id && match(scene.place_id)) return true;
  return false;
}

/** 完整卡：过逻辑线且过人物透镜。否则薄条，不藏。 */
export function isThinCard(
  scene: SceneCard,
  line: string | null,
  who: string | null,
  catalog: StoryThread[],
  entities: { id: string; name: string }[],
): boolean {
  if (line && !isOnLine(scene, line, catalog)) return true;
  if (who && !personOnScene(scene, who, entities)) return true;
  return false;
}

export function unlinedCount(scenes: SceneCard[]): number {
  return scenes.filter((s) => !s.story_threads?.length).length;
}

export interface ThreadSpan {
  first: string;
  last: string;
}

/** 入 / 出不存栏：按故事时升序，同列再 commit_seq。暂停不打断仍挂着。 */
export function threadSpan(scenes: SceneCard[], threadId: string): ThreadSpan | null {
  const on = scenes
    .filter((s) => s.story_threads?.some((t) => t.id === threadId))
    .slice()
    .sort((a, b) => {
      if (a.clock_from !== b.clock_from) return a.clock_from - b.clock_from;
      return (a.commit_seq || 0) - (b.commit_seq || 0);
    });
  if (!on.length) return null;
  return { first: on[0].id, last: on[on.length - 1].id };
}

export function hoverLines(
  scene: SceneCard,
  catalog: StoryThread[],
): { name: string; type: string; role: string; color: string }[] {
  return (scene.story_threads || []).map((row) => {
    const t = catalog.find((x) => x.id === row.id);
    return {
      name: t?.name || row.id,
      type: t?.type === "主线" ? "主线" : "支线",
      role: row.role || "推进",
      color: threadColor(t),
    };
  });
}
