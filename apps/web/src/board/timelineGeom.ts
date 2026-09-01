export type Viewport = {
  origin: number;
  pxPerMinute: number;
  width: number;
};

export type ScaleKind = "hour" | "day" | "month" | "year";

const SCALE_UNIT: Record<ScaleKind, number> = {
  hour: 60,
  day: 1440,
  month: 43200,
  year: 525600,
};

export function clampScale(pxPerMinute: number): number {
  return Math.min(16, Math.max(0.00004, pxPerMinute));
}

/** 让一格（时/日/月/年）大约占 96 像素。 */
export function pxForScale(kind: ScaleKind): number {
  return clampScale(96 / SCALE_UNIT[kind]);
}

export function snapClock(clock: number, step: number): number {
  if (step <= 1) return Math.max(0, Math.round(clock));
  return Math.max(0, Math.round(clock / step) * step);
}

/** 把 From–To 铺满当前宽度。 */
export function viewportFromTo(from: number, to: number, width: number): Viewport {
  const a = Math.min(from, to);
  const b = Math.max(from + 1, to);
  return defaultViewport(a, b, width);
}

export function followMovedCount(
  all: { id: string; clock_from: number; clock_to: number }[],
  sc: { id: string; clock_to: number },
): number {
  return all.filter((x) => x.id !== sc.id && x.clock_from >= sc.clock_to).length;
}

export function depSatisfied(causeTo: number, from: number): boolean {
  return from >= causeTo;
}

export function clockToX(clock: number, vp: Viewport): number {
  return (clock - vp.origin) * vp.pxPerMinute;
}

export function xToClock(x: number, vp: Viewport): number {
  return Math.round(vp.origin + x / vp.pxPerMinute);
}

export function barRect(from: number, to: number, vp: Viewport): { left: number; width: number } {
  const left = clockToX(from, vp);
  const width = Math.max(8, clockToX(to, vp) - left);
  return { left, width };
}

export function zoom(vp: Viewport, factor: number, centerX: number): Viewport {
  const clockAtCenter = xToClock(centerX, vp);
  const pxPerMinute = clampScale(vp.pxPerMinute * factor);
  return {
    ...vp,
    pxPerMinute,
    origin: clockAtCenter - centerX / pxPerMinute,
  };
}

export function pan(vp: Viewport, dx: number): Viewport {
  return { ...vp, origin: vp.origin - dx / vp.pxPerMinute };
}

export function shiftSpan(from: number, to: number, delta: number): { from: number; to: number } {
  const dur = Math.max(1, to - from);
  const nf = Math.max(0, from + delta);
  return { from: nf, to: nf + dur };
}

export function resizeSpan(
  from: number,
  to: number,
  edge: "from" | "to",
  newClock: number,
): { from: number; to: number } {
  if (edge === "from") {
    return { from: Math.max(0, Math.min(newClock, to - 1)), to };
  }
  return { from, to: Math.max(from + 1, newClock) };
}

export function intervalLabel(a: number, b: number): string {
  const d = Math.abs(b - a);
  if (d < 60) return `隔了${d}分钟`;
  if (d < 1440) {
    const h = Math.floor(d / 60);
    const m = d % 60;
    return m ? `隔了${h}个时辰又${m}分` : `隔了${h}个时辰`;
  }
  const days = Math.floor(d / 1440);
  const rest = d % 1440;
  return rest ? `隔了${days}天又${Math.floor(rest / 60)}个时辰` : `隔了${days}天`;
}

export function defaultViewport(minClock: number, maxClock: number, width: number): Viewport {
  const span = Math.max(60, maxClock - minClock);
  const pad = span * 0.08;
  const origin = minClock - pad;
  return {
    origin,
    pxPerMinute: clampScale(width / (span + pad * 2)),
    width,
  };
}

export function tickStep(pxPerMinute: number): number {
  if (pxPerMinute >= 4) return 15;
  if (pxPerMinute >= 1.5) return 60;
  if (pxPerMinute >= 0.4) return 180;
  if (pxPerMinute >= 0.12) return 1440;
  return 10080;
}

/** 同一行里重叠的场往下错开，互不挡。 */
export type ClockScene = {
  id: string;
  clock_from: number;
  clock_to: number;
  cause_beat?: string | null;
};

/** 上场依赖：后面的场开始不得早于上场结束。 */
export type GapConstraint = {
  laterId: string;
  earlierId: string;
  gap: number;
};

export function resolveDependencyClocks(
  scenes: ClockScene[],
  constraints: GapConstraint[] = [],
): ClockScene[] {
  const map = new Map(scenes.map((s) => [s.id, { ...s }]));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    for (const s of map.values()) {
      if (s.cause_beat) {
        const cause = map.get(s.cause_beat);
        if (cause && s.clock_from < cause.clock_to) {
          const d = cause.clock_to - s.clock_from;
          s.clock_from += d;
          s.clock_to += d;
          changed = true;
        }
      }
      for (const c of constraints) {
        if (c.laterId !== s.id) continue;
        const earlier = map.get(c.earlierId);
        if (!earlier) continue;
        const need = earlier.clock_to + Math.max(0, c.gap);
        if (s.clock_from < need) {
          const d = need - s.clock_from;
          s.clock_from += d;
          s.clock_to += d;
          changed = true;
        }
      }
    }
  }
  return [...map.values()];
}

export function clockDiffs(before: ClockScene[], after: ClockScene[]): { id: string; from: number; to: number }[] {
  const orig = new Map(before.map((s) => [s.id, s]));
  return after
    .filter((s) => {
      const o = orig.get(s.id);
      return !!o && (o.clock_from !== s.clock_from || o.clock_to !== s.clock_to);
    })
    .map((s) => ({ id: s.id, from: s.clock_from, to: s.clock_to }));
}

export function packRows(scenes: { id: string; clock_from: number; clock_to: number }[]): Map<string, number> {
  const sorted = [...scenes].sort((a, b) => a.clock_from - b.clock_from || a.clock_to - b.clock_to);
  const rowEnd: number[] = [];
  const map = new Map<string, number>();
  for (const sc of sorted) {
    let row = rowEnd.findIndex((end) => sc.clock_from >= end);
    if (row < 0) {
      row = rowEnd.length;
      rowEnd.push(sc.clock_to);
    } else {
      rowEnd[row] = sc.clock_to;
    }
    map.set(sc.id, row);
  }
  return map;
}
