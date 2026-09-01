export const N_MIN = 1;
/** 疏/中/密仍是 2/4/6；上限按卡上标题还能读，不再写死 6。 */
export const N_MAX = 6;
export const N_CEILING = 24;
export const N_DEFAULT = 4;
export const TITLE_MIN_PX = 104;

export function readableColMax(boardWidth: number): number {
  if (!Number.isFinite(boardWidth) || boardWidth <= 0) return N_MAX;
  return Math.min(N_CEILING, Math.max(N_MIN, Math.floor(boardWidth / TITLE_MIN_PX)));
}

export function clampN(n: number, max = N_MAX): number {
  if (!Number.isFinite(n)) return N_DEFAULT;
  const hi = Math.min(N_CEILING, Math.max(N_MIN, max));
  return Math.min(hi, Math.max(N_MIN, Math.round(n)));
}

export function windowSlice<T>(cols: T[], start: number, n: number): T[] {
  const s = Math.max(0, Math.min(start, Math.max(0, cols.length - 1)));
  return cols.slice(s, s + clampN(n, N_CEILING));
}

export function formatClock(t: number, originLabel?: string, originMinute?: number, format?: string): string {
  const fmt = (format || "").trim() || "day_clock";
  if (fmt === "minutes") return `${t}分`;
  if (fmt === "label") {
    const lab = (originLabel || "").trim();
    if (!lab) return `${t}分`;
    return t === 0 ? lab : `${lab} +${t}分`;
  }
  const start = originMinute && originMinute > 0 ? originMinute : parseHm(originLabel || "");
  const abs = start + t;
  const day = Math.floor(abs / 1440) + 1;
  const of = ((abs % 1440) + 1440) % 1440;
  const hh = String(Math.floor(of / 60)).padStart(2, "0");
  const mm = String(of % 60).padStart(2, "0");
  return `第${day}天 ${hh}:${mm}`;
}

export function clockDay(t: number, originLabel?: string, originMinute?: number): number {
  const start = originMinute && originMinute > 0 ? originMinute : parseHm(originLabel || "");
  return Math.floor((start + t) / 1440) + 1;
}

export function formatOpened(ts: number): string {
  if (!ts) return "还没打开过";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "还没打开过";
  return d.toLocaleString("zh-CN");
}



function parseHm(label: string): number {
  const m = label.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
