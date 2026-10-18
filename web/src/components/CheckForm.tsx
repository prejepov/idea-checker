import { useState, type ChangeEvent, type FormEvent } from "react";
import { PAIN_TEMPLATES, painQuery, redditSearchUrl } from "../../../shared/reddit";
import type { RunReport } from "../../../shared/schema";
import { api, parseMoney } from "../api";
import { ErrorBox, Working } from "./shared";

export interface CheckPrefill {
  key: string;
  niche: string;
  topMonthlyRevenue: number | null;
  badgeSeen: boolean;
  fromNicheRun?: string;
}

export function CheckForm(props: {
  prefill: CheckPrefill | null;
  redditKeyMissing: boolean;
  onReport: (r: RunReport) => void;
}) {
  const p = props.prefill;
  const [niche, setNiche] = useState(p?.niche ?? "");
  const [reviews, setReviews] = useState("");
  const [redditText, setRedditText] = useState("");
  const [revenue, setRevenue] = useState(p?.topMonthlyRevenue?.toString() ?? "");
  const [price, setPrice] = useState("");
  const [badge, setBadge] = useState(p?.badgeSeen ?? false);
  const [minRevenue, setMinRevenue] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countParagraphs = (s: string) => (s.trim() ? s.trim().split(/\n\s*\n/).length : 0);
  const reviewCount = countParagraphs(reviews);
  const redditCount = countParagraphs(redditText);

  async function loadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setReviews(await file.text());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      props.onReport(
        await api.check({
          niche,
          reviewsText: reviews,
          redditText,
          etsy: { topMonthlyRevenue: parseMoney(revenue), price: parseMoney(price), badgeSeen: badge },
          minMonthlyRevenue: parseMoney(minRevenue) ?? 1000,
          ...(p?.fromNicheRun ? { fromNicheRun: p.fromNicheRun } : {}),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <form className="card form" onSubmit={submit}>
        <h2>Check a niche</h2>
        <p className="muted">
          A gap is validated when it shows up in Reddit, 3-star reviews and Google autocomplete, and Etsy proves
          people are buying (14:04).
        </p>
        <label>
          Niche
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="budget spreadsheet" required minLength={2} />
        </label>

        <label>
          3-star reviews from the top 3 listings{" "}
          <span className="muted">(aim for about 40; one per paragraph, or upload a CSV with a “text” column)</span>
          <textarea
            value={reviews}
            onChange={(e) => setReviews(e.target.value)}
            rows={8}
            placeholder={"Looks nice, but there's nowhere to track irregular income.\n\nSetup was confusing…"}
          />
        </label>
        <div className="row between">
          <span className="muted small">{reviewCount} review{reviewCount === 1 ? "" : "s"} detected</span>
          <label className="file">
            Upload .csv / .txt
            <input type="file" accept=".csv,.txt,text/plain,text/csv" onChange={loadFile} />
          </label>
        </div>

        <fieldset>
          <legend>Etsy demand (from Profittree or Etsy)</legend>
          <div className="row">
            <label>
              Top listing revenue / month
              <input value={revenue} onChange={(e) => setRevenue(e.target.value)} inputMode="numeric" placeholder="13990" />
            </label>
            <label>
              Its price
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="19.76" />
            </label>
            <label>
              Bar to pass
              <input value={minRevenue} onChange={(e) => setMinRevenue(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} />
            I saw “bought in the last 24 hours” on top listings
          </label>
        </fieldset>

        <details open={props.redditKeyMissing} className="reddit-manual">
          <summary>
            Reddit API not working? Paste threads instead
            {redditCount > 0 && ` (${redditCount} pasted)`}
          </summary>
          <p className="muted small">
            {props.redditKeyMissing ? "No Reddit API key is set, so Reddit is collected by hand. " : ""}
            Open each search, copy the posts where someone describes a problem nobody has solved (12:22), and paste
            them below, one post per paragraph.
          </p>
          <ul className="search-links" aria-label="Reddit searches">
            {PAIN_TEMPLATES.map((phrase) => (
              <li key={phrase}>
                {niche.trim().length >= 2 ? (
                  <a href={redditSearchUrl(niche, phrase)} target="_blank" rel="noreferrer">
                    {painQuery(niche, phrase)} ↗
                  </a>
                ) : (
                  <span className="muted">{`<niche> ${phrase}`} (enter a niche first)</span>
                )}
              </li>
            ))}
          </ul>
          <textarea
            aria-label="Pasted Reddit threads"
            value={redditText}
            onChange={(e) => setRedditText(e.target.value)}
            rows={5}
            placeholder="One post per paragraph"
          />
        </details>

        <button type="submit" disabled={loading}>
          {loading ? "Checking…" : "Run check"}
        </button>
      </form>
      {loading && (
        <Working
          steps={[
            'Searching Reddit for "I wish there was", "why is there no", "does anyone know how to"',
            "Collecting Google autocomplete",
            "Asking Claude to group the evidence into gaps",
          ]}
        />
      )}
      <ErrorBox error={error} />
    </section>
  );
}
