import type { EvidenceItem, GapLabel, RunReport, ScoredGap, SourceKind } from "../../../shared/schema";
import { money } from "../api";
import { MomentView, SourceChips } from "./shared";

const LABEL: Record<GapLabel, { text: string; cls: string }> = {
  validated: { text: "Validated", cls: "good" },
  promising: { text: "Promising", cls: "warn" },
  weak: { text: "Weak", cls: "" },
  unsupported: { text: "Unsupported", cls: "bad" },
};

const SOURCE_BADGE: Array<{ kind: SourceKind; letter: string; name: string }> = [
  { kind: "reddit", letter: "R", name: "Reddit" },
  { kind: "review", letter: "V", name: "Reviews" },
  { kind: "autocomplete", letter: "G", name: "Google autocomplete" },
];

export function Report({ report }: { report: RunReport }) {
  const byId = new Map(report.evidence.map((e) => [e.id, e]));
  const validated = report.gaps.filter((g) => g.label === "validated").length;
  return (
    <section className="card" aria-label="Report">
      <div className="report-head">
        <div>
          <h2>Gaps for “{report.niche}”</h2>
          <p className="muted small">
            {new Date(report.createdAt).toLocaleString()} · {report.evidence.length} evidence items
            {report.usage && report.usage.model !== "mock"
              ? ` · ${report.usage.model}, ${report.usage.input_tokens.toLocaleString()} in / ${report.usage.output_tokens.toLocaleString()} out tokens`
              : ""}
          </p>
        </div>
        <span className={`chip ${report.etsyGatePass ? "good" : "bad"}`}>
          Etsy demand {report.etsyGatePass ? "proven" : "not proven"}: top {money(report.etsy.topMonthlyRevenue)}/mo
          {report.etsy.badgeSeen ? ", 24h badge seen" : ""} (bar {money(report.minMonthlyRevenue)})
        </span>
      </div>
      <SourceChips sources={report.sources} />

      {report.gaps.length === 0 ? (
        <p className="muted">No gaps found. Add reviews, or check that the sources returned anything.</p>
      ) : (
        <p>
          <strong>{validated}</strong> validated of {report.gaps.length} gaps.
          {!report.etsyGatePass && " Nothing can be Validated until Etsy demand is proven."}
        </p>
      )}

      <div className="gaps">
        {report.gaps.map((g, i) => (
          <GapCard key={`${g.title}-${i}`} gap={g} byId={byId} />
        ))}
      </div>
    </section>
  );
}

function GapCard({ gap, byId }: { gap: ScoredGap; byId: Map<string, EvidenceItem> }) {
  const label = LABEL[gap.label];
  return (
    <article className="gap" aria-label={gap.title}>
      <header>
        <span className={`chip ${label.cls}`}>{label.text}</span>
        <span className="badges" aria-label={`${gap.sourcesHit} of 3 sources`}>
          {SOURCE_BADGE.map((b) => (
            <span key={b.kind} className={gap.sources.includes(b.kind) ? "badge on" : "badge"} title={b.name}>
              {b.letter}
            </span>
          ))}
        </span>
        {gap.lowMoat && <span className="chip bad">Low moat: {gap.canva20.reason}</span>}
      </header>
      <h3>{gap.title}</h3>
      <p>{gap.problem}</p>
      <p>
        <strong>Fix:</strong> {gap.fix}
      </p>
      <MomentView moment={gap.moment} />
      {gap.droppedEvidenceIds.length > 0 && (
        <p className="small warn-text">
          {gap.droppedEvidenceIds.length} cited id{gap.droppedEvidenceIds.length === 1 ? "" : "s"} didn’t exist and{" "}
          {gap.droppedEvidenceIds.length === 1 ? "was" : "were"} ignored ({gap.droppedEvidenceIds.join(", ")}).
        </p>
      )}
      <details>
        <summary>Evidence ({gap.validEvidenceIds.length})</summary>
        <ul className="evidence">
          {gap.validEvidenceIds.map((id) => {
            const e = byId.get(id)!;
            return (
              <li key={id}>
                <code>{id}</code> <span className="muted small">{e.subreddit ?? e.source}</span>
                <blockquote>{e.text}</blockquote>
                {e.url && (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    Open thread
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}
