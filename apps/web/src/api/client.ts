/** 只发命令、读 /api/*，无业务真源。 */

export function humanizeError(msg: string): string {
  if (/SETTING_LLM_API_KEY|缺.*API_KEY/i.test(msg)) return "没配模型密钥，可以手写动作。";
  if (/SETTING_LLM_BASE_URL/i.test(msg)) return "没配模型服务，可以手写动作。";
  if (/503|SERVICE_UNAVAILABLE/i.test(msg) && /model|llm|密钥|模型/i.test(msg)) {
    return "没配模型密钥，可以手写动作。";
  }
  return msg;
}

async function readError(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as { message?: string };
    return humanizeError(j.message || t || r.statusText);
  } catch {
    return humanizeError(t || r.statusText);
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
