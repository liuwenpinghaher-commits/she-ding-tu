/** 档案「出生故事时」：分钟整数，或「第 N 天」。 */

export function parseBornClock(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const day = t.match(/第\s*(\d+)\s*天/);
  if (day) return (Number(day[1]) - 1) * 1440;
  return null;
}

export function ageAtClock(clock: number, born: number): string {
  const d = clock - born;
  if (d < 0) return "还未出生";
  if (d < 1440) return `${d}分钟大`;
  const days = Math.floor(d / 1440);
  if (days < 365) return `${days}天大`;
  return `${Math.floor(days / 365)}岁`;
}

export function lifespanRange(
  born: number | null,
  died: number | null,
  spanMin: number,
  spanMax: number,
): { from: number; to: number } | null {
  if (born == null && died == null) return null;
  return {
    from: born ?? spanMin,
    to: died ?? spanMax,
  };
}
