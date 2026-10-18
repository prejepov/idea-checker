import { useState, type FormEvent } from "react";
import type { NicheCandidate, NicheGate, NicheRun } from "../../../shared/schema";
import { api, money, parseMoney } from "../api";
import type { CheckPrefill } from "./CheckForm";
import { ErrorBox, MomentView, SourceChips, Working } from "./shared";

const GATE_TEXT: Record<NicheGate, { label: string; cls: string }> = {
  pass: { label: "Pass", cls: "good" },
  pending: { label: "Needs number", cls: "" },
  "fail-revenue": { label: "Below bar", cls: "bad" },
  "fail-moat": { label: "Easy to copy", cls: "bad" },
};

interface Draft {
  revenue: string;
  badge: boolean;
}

const draftsFrom = (run: NicheRun): Record<string, Draft> =>
  Object.fromEntries(
    run.candidates.map((c) => [c.id, { revenue: c.topMonthlyRevenue?.toString() ?? "", badge: c.badgeSeen }]),
  );

export function NicheFinder(props: { run: NicheRun | null; onRun: (r: NicheRun) => void; onCheck: (p: CheckPrefill) => void }) {
  const { run } = props;
  const [category, setCategory] = useState(run?.category ?? "spreadsheet");
  const [minRevenue, setMinRevenue] = useState(String(run?.minMonthlyRevenue ?? 500));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(run ? draftsFrom(run) : {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function show(r: NicheRun) {
    setDrafts(draftsFrom(r));
    setMinRevenue(String(r.minMonthlyRevenue));
    props.onRun(r);
  }

  async function find(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      show(await api.findNiches({ category, minMonthlyRevenue: parseMoney(minRevenue) ?? 500 }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!run) return;
    setError(null);
    setSaving(true);
    try {
      show(
        await api.updateNiches(run.id, {
          minMonthlyRevenue: parseMoney(minRevenue) ?? run.minMonthlyRevenue,
          candidates: run.candidates.map((c) => ({
            id: c.id,
            topMonthlyRevenue: parseMoney(drafts[c.id]?.revenue ?? ""),
            badgeSeen: drafts[c.id]?.badge ?? false,
          })),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { revenue: "", badge: false, ...d[id], ...patch } }));

  return (
    <section>
      <form className="card form" onSubmit={find}>
        <h2>Find a niche</h2>
        <p className="muted">
          Start broad: search the category, not the product (1:28). Claude suggests sub-niches from Google
          autocomplete and related subreddits. You add the real numbers from Profittree.
        </p>
        <div className="row">
          <label>
            Category
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="spreadsheet" required minLength={2} />
          </label>
          <label>
            Minimum top-seller revenue / month
            <input value={minRevenue} onChange={(e) => setMinRevenue(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Finding…" : "Find niches"}
        </button>
      </form>

      {loading && <Working steps={["Collecting Google autocomplete phrases", "Searching related subreddits", "Asking Claude for sub-niches"]} />}
      <ErrorBox error={error} />

      {run && !loading && (
        <div className="card">
          <div className="report-head">
            <h2>Niches for “{run.category}”</h2>
            <SourceChips sources={run.sources} />
          </div>
          <ol className="howto">
            <li>For each row, copy the Etsy term into Profittree (free) or Etsy.</li>
            <li>Type the top listing’s monthly revenue, and tick the box if you saw “bought in the last 24 hours”.</li>
            <li>
              Save numbers. Rows under {money(run.minMonthlyRevenue)}/month are dropped. In the video, $40/month means no demand (1:40).
            </li>
          </ol>

          <div className="table-wrap">
            <table className="niches">
              <thead>
                <tr>
                  <th>Sub-niche</th>
                  <th>Etsy term</th>
                  <th>30-second moment</th>
                  <th>Top $/month</th>
                  <th>24h badge</th>
                  <th>Gate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {run.candidates.map((c) => (
                  <NicheRow
                    key={c.id}
                    c={c}
                    draft={drafts[c.id] ?? { revenue: "", badge: false }}
                    onDraft={(p) => setDraft(c.id, p)}
                    onCheck={() =>
                      props.onCheck({
                        key: `${run.id}-${c.id}`,
                        niche: c.name,
                        topMonthlyRevenue: c.topMonthlyRevenue,
                        badgeSeen: c.badgeSeen,
                        fromNicheRun: run.id,
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="row end">
            <button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save numbers"}
            </button>
          </div>

          <details>
            <summary>
              Inputs Claude used ({run.phrases.length} phrases,{" "}
              {run.redditPurgedAt ? "subreddit list removed after 30 days" : `${run.subreddits.length} subreddits`})
            </summary>
            <div className="two-col">
              <ul>
                {run.phrases.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <ul>
                {run.subreddits.map((s) => (
                  <li key={s.name}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>{" "}
                    <span className="muted">({s.subscribers.toLocaleString()})</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function NicheRow(props: { c: NicheCandidate; draft: Draft; onDraft: (p: Partial<Draft>) => void; onCheck: () => void }) {
  const { c, draft } = props;
  const gate = GATE_TEXT[c.gate];
  const [copied, setCopied] = useState(false);
  return (
    <tr data-testid={`niche-${c.id}`} className={c.gate.startsWith("fail") ? "dimmed" : undefined}>
      <td>
        <strong>{c.name}</strong>
        <div className="muted small">{c.buyer}</div>
        <div className="muted small">{c.why}</div>
      </td>
      <td>
        <code>{c.etsy_search_term}</code>{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            void navigator.clipboard?.writeText(c.etsy_search_term).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </td>
      <td>
        <MomentView moment={c.moment} />
        {c.canva20.copyable && <div className="small bad-text">Canva in 20 min: {c.canva20.reason}</div>}
      </td>
      <td>
        <input
          aria-label={`Top monthly revenue for ${c.name}`}
          className="money"
          value={draft.revenue}
          onChange={(e) => props.onDraft({ revenue: e.target.value })}
          inputMode="numeric"
          placeholder="e.g. 13990"
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`24h badge seen for ${c.name}`}
          checked={draft.badge}
          onChange={(e) => props.onDraft({ badge: e.target.checked })}
        />
      </td>
      <td>
        <span className={`chip ${gate.cls}`}>{gate.label}</span>
      </td>
      <td>
        {c.gate === "pass" && (
          <button type="button" onClick={props.onCheck}>
            Check this niche →
          </button>
        )}
      </td>
    </tr>
  );
}
