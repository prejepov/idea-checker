import { useEffect, useState } from "react";
import type { NicheRun, RunReport, RunSummary } from "../../../shared/schema";
import { api } from "../api";
import { ErrorBox } from "./shared";

export function History(props: { onOpenNiche: (r: NicheRun) => void; onOpenRun: (r: RunReport) => void }) {
  const [niches, setNiches] = useState<RunSummary[] | null>(null);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listNiches(), api.listRuns()]).then(
      ([n, r]) => {
        setNiches(n);
        setRuns(r);
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  const open = (fn: () => Promise<void>) => () => {
    fn().catch((err: Error) => setError(err.message));
  };

  return (
    <section className="two-col">
      <ErrorBox error={error} />
      <div className="card">
        <h2>Niche searches</h2>
        <SummaryList
          items={niches}
          empty="No niche searches yet."
          onOpen={(id) => open(async () => props.onOpenNiche(await api.getNiche(id)))}
        />
      </div>
      <div className="card">
        <h2>Gap checks</h2>
        <SummaryList
          items={runs}
          empty="No gap checks yet."
          onOpen={(id) => open(async () => props.onOpenRun(await api.getRun(id)))}
        />
      </div>
    </section>
  );
}

function SummaryList(props: { items: RunSummary[] | null; empty: string; onOpen: (id: string) => () => void }) {
  if (props.items === null) return <p className="muted">Loading…</p>;
  if (props.items.length === 0) return <p className="muted">{props.empty}</p>;
  return (
    <ul className="history">
      {props.items.map((s) => (
        <li key={s.id}>
          <button className="link" onClick={props.onOpen(s.id)}>
            {s.title}
          </button>
          <div className="muted small">
            {new Date(s.createdAt).toLocaleString()} · {s.detail}
          </div>
        </li>
      ))}
    </ul>
  );
}
