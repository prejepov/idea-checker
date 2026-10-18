import { useEffect, useState } from "react";
import type { Moment, SourceStatus } from "../../../shared/schema";

export function SourceChips({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="chips" aria-label="Sources">
      {sources.map((s) => (
        <span
          key={s.source}
          className={`chip ${s.status === "ok" ? "good" : s.status === "skipped" ? "warn" : "bad"}`}
          title={s.message}
        >
          {s.source}: {s.status === "ok" ? s.count : s.status}
          {s.message && s.status !== "ok" ? ` (${s.message})` : ""}
        </span>
      ))}
    </div>
  );
}

export function MomentView({ moment }: { moment: Moment }) {
  return (
    <dl className="moment">
      <dt>Who</dt>
      <dd>{moment.who}</dd>
      <dt>Where</dt>
      <dd>{moment.where}</dd>
      <dt>On screen</dt>
      <dd>{moment.screen}</dd>
      <dt>Next</dt>
      <dd>{moment.next_action}</dd>
    </dl>
  );
}

/** Honest progress: lists what the server is doing and how long it's taken, without pretending to know the current step. */
export function Working({ steps }: { steps: string[] }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="working" role="status">
      <div className="spinner" aria-hidden />
      <div>
        <strong>Working… {seconds}s</strong>
        <ul>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="muted">Claude usually takes 20–90 seconds.</p>
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}
