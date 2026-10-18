import type {
  CheckRequest,
  Health,
  NicheRequest,
  NicheRun,
  NicheUpdate,
  RunReport,
  RunSummary,
} from "../../shared/schema";

type CheckInput = Partial<CheckRequest> & Pick<CheckRequest, "niche">;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; issues?: Array<{ path: unknown[]; message: string }> };
  if (!res.ok) {
    const issues = json.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error([json.error ?? `HTTP ${res.status}`, issues].filter(Boolean).join(" - "));
  }
  return json as T;
}

export const api = {
  health: () => call<Health>("GET", "/api/health"),
  findNiches: (req: Partial<NicheRequest> & Pick<NicheRequest, "category">) => call<NicheRun>("POST", "/api/niches", req),
  updateNiches: (id: string, update: NicheUpdate) => call<NicheRun>("PATCH", `/api/niches/${id}`, update),
  getNiche: (id: string) => call<NicheRun>("GET", `/api/niches/${id}`),
  listNiches: () => call<RunSummary[]>("GET", "/api/niches"),
  check: (req: CheckInput) => call<RunReport>("POST", "/api/check", req),
  getRun: (id: string) => call<RunReport>("GET", `/api/runs/${id}`),
  listRuns: () => call<RunSummary[]>("GET", "/api/runs"),
};

export const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "-"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** "13,990" or "$13,990" -> 13990; blank -> null. */
export function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
