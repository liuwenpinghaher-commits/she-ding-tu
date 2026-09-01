import type { SceneCard, StoryThread } from "../canon/types";

export const MAIN_COLOR = "#C4A46A";
export const BRANCH_COLORS = ["#3D8A8A", "#4A6FA5", "#B56A3C", "#7A5A8A", "#5A7A42", "#A85A6A"];
export const UNLINED = "#6E6A64";

export function threadColor(t: StoryThread | undefined): string {
  if (!t) return UNLINED;
  if (t.type === "主线") return MAIN_COLOR;
  return BRANCH_COLORS[(t.color ?? 0) % 6];
}

export function primaryThread(scene: SceneCard, catalog: StoryThread[]): StoryThread | undefined {
  const ids = scene.story_threads || [];
  if (!ids.length) return undefined;
  const main = ids
    .map((x) => catalog.find((t) => t.id === x.id))
    .find((t) => t && t.type === "主线");
  if (main) return main;
  return catalog.find((t) => t.id === ids[0].id);
}

/** 过滤：线上完整卡，线外薄条。不藏场。草稿场参与。 */
export function isOnLine(scene: SceneCard, lineId: string | null, catalog: StoryThread[]): boolean {
  if (!lineId) return true;
  if (lineId === "__unlined__") return !scene.story_threads?.length;
  const t = catalog.find((x) => x.id === lineId || x.name === lineId);
  if (!t) return scene.story_threads?.some((s) => s.id === lineId) ?? false;
  return scene.story_threads?.some((s) => s.id === t.id) ?? false;
}

export function lineNameOf(lineId: string | null, catalog: StoryThread[]): string {
  if (!lineId) return "";
  if (lineId === "__unlined__") return "未归线";
  return catalog.find((t) => t.id === lineId || t.name === lineId)?.name || lineId;
}
