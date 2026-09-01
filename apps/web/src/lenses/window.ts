export const N_MIN = 1;
export const N_MAX = 6;
export const N_DEFAULT = 4;

export function clampN(n: number): number {
  if (!Number.isFinite(n)) return N_DEFAULT;
  return Math.min(N_MAX, Math.max(N_MIN, Math.round(n)));
}

export function windowSlice<T>(cols: T[], start: number, n: number): T[] {
  const s = Math.max(0, Math.min(start, Math.max(0, cols.length - 1)));
  return cols.slice(s, s + clampN(n));
}

export function formatClock(t: number, originLabel?: string, originMinute?: number): string {
  const start = originMinute && originMinute > 0 ? originMinute : parseHm(originLabel || "");
  const abs = start + t;
  const day = (abs >= 0 ? Math.floor(abs / 1440) : Math.floor(abs / 1440)) + 1;
  const of = ((abs % 1440) + 1440) % 1440;
  const hh = String(Math.floor(of / 60)).padStart(2, "0");
  const mm = String(of % 60).padStart(2, "0");
  return `第${day}天 ${hh}:${mm}`;
}

function parseHm(label: string): number {
  const m = label.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
