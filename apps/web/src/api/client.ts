/** 只发命令、读 /api/*，无业务真源。 */

async function readError(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as { message?: string };
    return j.message || t || r.statusText;
  } catch {
    return t || r.statusText;
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) throw new Error(await readError(r));
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await r.json()) as T;
  return (await r.text()) as T;
}

export async function apiText(path: string): Promise<string> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await readError(r));
  return r.text();
}
