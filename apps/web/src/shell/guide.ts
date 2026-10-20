/** 引导主线 G0–G9；G10/G11 占位可续加。不算世界上为真。 */

import { loadJson, saveJson } from "./localPrefs.ts";

export type GuideId = "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8" | "G9" | "G10" | "G11";

export type GuideStatus = "idle" | "running" | "skipped" | "done";

export type GuideStep = {
  id: GuideId;
  title: string;
  bubble: string;
  /** 逗号分隔选择器，先命中且可见者钉气泡。禁止 qa-hook。 */
  anchor: string;
  /** false = 占位，主线走完不算这一步。 */
  main?: boolean;
};

export type GuidePersist = {
  status: GuideStatus;
  index: number;
};

export const GUIDE_KEY = "sdt-guide-v1";

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "G0",
    title: "门厅认路",
    bubble: "这是你的书单。打开一本继续写，或新建一本。",
    anchor: "[data-testid=shelf-new], [data-guide=g0], [data-testid=shelf]",
  },
  {
    id: "G1",
    title: "建一本只要两格的书",
    bubble: "先起个书名。下面『起点对应分钟』可以先不管。",
    anchor: "[data-testid=nb-name], [data-guide=g1]",
  },
  {
    id: "G2",
    title: "告诉你现在在哪",
    bubble: "中间是这场戏的桌子。左边是人/地，右边是这场的细账。上面『写下一场』是唯一主按钮。",
    anchor: "[data-guide=g2], [data-testid=stripboard], [data-testid=board-wrap]",
  },
  {
    id: "G3",
    title: "没戏也能建人、建地",
    bubble: "左边是这本书里的人。先建『阿福』，类型选人物，点新建。再建模『渡口』。",
    anchor: "[data-guide=g3], [data-testid=ent-name], [data-testid=left-rail]",
  },
  {
    id: "G4",
    title: "写下本场任务",
    bubble: "本场任务先写谁想要什么。写成一句，例如『阿福想把刀藏住』。",
    anchor: "[data-guide=compose], [data-testid=intent]",
  },
  {
    id: "G5",
    title: "点写下一场",
    bubble: "点它。会多出一张草稿。还不是历史，改坏了能丢掉。",
    anchor: "[data-guide=g5], [data-testid=write-next]",
  },
  {
    id: "G6",
    title: "把人拖到块上",
    bubble: "把阿福拖到这张卡上。贴在卡上的名字 = 这场在的人。",
    anchor: ".card.draft, [data-guide=g6], [data-testid=stripboard]",
  },
  {
    id: "G7",
    title: "填动作，或让模型先填",
    bubble: "写他做了什么。对白和心里想的可空。也可以点『模型填这一场』，满意再点写入此框。",
    anchor: "[data-guide=g7], [data-testid=do-text], [data-testid=fill-live]",
  },
  {
    id: "G8",
    title: "定稿",
    bubble: "点它，这场才变成后面能用的历史。没点之前，下一场当它没发生。",
    anchor: "[data-guide=g8], [data-testid=commit]",
  },
  {
    id: "G9",
    title: "第二场 + 点名字看他知道什么",
    bubble: "第二场让阿莲来找东西。点卡上的阿福，看他此刻知道什么——刀在抽屉，阿莲不该知道。",
    anchor: "[data-testid^=chip-], [data-guide=g9], [data-testid=card-title], [data-guide=compose]",
  },
  {
    id: "G10",
    title: "回退一次",
    bubble: "写坏了：撤销刚才那条变化，或丢掉这张草稿。定稿过的场不能当草稿丢，要另走删历史。",
    anchor: "[data-testid=delete-draft]",
    main: false,
  },
  {
    id: "G11",
    title: "导出",
    bubble: "导出是给人看的稿。改这个文件不会写回书里。",
    anchor: "[data-testid=export]",
    main: false,
  },
];

export const GUIDE_MAIN = GUIDE_STEPS.filter((s) => s.main !== false);

const listeners = new Set<() => void>();

export function subscribeGuide(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function loadGuide(): GuidePersist {
  const raw = loadJson<Partial<GuidePersist>>(GUIDE_KEY, { status: "idle", index: 0 });
  const status: GuideStatus = raw.status === "running" || raw.status === "skipped" || raw.status === "done" ? raw.status : "idle";
  const index = Math.max(0, Math.min(GUIDE_MAIN.length - 1, Number(raw.index) || 0));
  return { status, index };
}

export function saveGuide(next: GuidePersist) {
  saveJson(GUIDE_KEY, next);
  emit();
}

export function startGuide() {
  saveGuide({ status: "running", index: 0 });
}

export function skipGuide() {
  const cur = loadGuide();
  saveGuide({ status: "skipped", index: cur.index });
}

export function finishGuide() {
  saveGuide({ status: "done", index: GUIDE_MAIN.length - 1 });
}

export function nextGuide() {
  const cur = loadGuide();
  if (cur.status !== "running") return;
  if (cur.index >= GUIDE_MAIN.length - 1) {
    finishGuide();
    return;
  }
  saveGuide({ status: "running", index: cur.index + 1 });
}

export function prevGuide() {
  const cur = loadGuide();
  if (cur.status !== "running") return;
  saveGuide({ status: "running", index: Math.max(0, cur.index - 1) });
}

export function currentStep(): GuideStep | null {
  const cur = loadGuide();
  if (cur.status !== "running") return null;
  return GUIDE_MAIN[cur.index] || null;
}

export function isQaHook(el: Element): boolean {
  return !!(el.closest(".qa-hook, .qa-tray, .probe") || el.classList.contains("qa-hook"));
}

export function findGuideAnchor(selector: string, root: ParentNode = document): HTMLElement | null {
  for (const part of selector.split(",")) {
    const sel = part.trim();
    if (!sel) continue;
    let nodes: HTMLElement[] = [];
    try {
      nodes = [...root.querySelectorAll(sel)] as HTMLElement[];
    } catch {
      continue;
    }
    for (const el of nodes) {
      if (isQaHook(el)) continue;
      if (el.hidden || el.closest("[hidden]")) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) continue;
      return el;
    }
  }
  return null;
}
