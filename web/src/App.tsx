import { useEffect, useState } from "react";
import type { Health, NicheRun, RunReport } from "../../shared/schema";
import { api } from "./api";
import { CheckForm, type CheckPrefill } from "./components/CheckForm";
import { History } from "./components/History";
import { NicheFinder } from "./components/NicheFinder";
import { Report } from "./components/Report";

type Tab = "niche" | "check" | "history";

export function App() {
  const [tab, setTab] = useState<Tab>("niche");
  const [health, setHealth] = useState<Health | null>(null);
  const [nicheRun, setNicheRun] = useState<NicheRun | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [prefill, setPrefill] = useState<CheckPrefill | null>(null);

  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, []);

  function checkNiche(p: CheckPrefill) {
    setPrefill(p);
    setReport(null);
    setTab("check");
  }

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Idea Checker</h1>
          <p className="muted">Find a niche, then check its gaps against Reddit, reviews and Google.</p>
        </div>
        <HealthBanner health={health} />
      </header>

      <nav className="tabs" role="tablist">
        <TabButton id="niche" current={tab} onSelect={setTab}>1. Find a niche</TabButton>
        <TabButton id="check" current={tab} onSelect={setTab}>2. Check a niche</TabButton>
        <TabButton id="history" current={tab} onSelect={setTab}>History</TabButton>
      </nav>

      <main>
        {tab === "niche" && <NicheFinder run={nicheRun} onRun={setNicheRun} onCheck={checkNiche} />}
        {tab === "check" && (
          <>
            <CheckForm
              key={prefill?.key ?? "blank"}
              prefill={prefill}
              redditKeyMissing={health !== null && !health.mock && !health.keys.reddit}
              onReport={setReport}
            />
            {report && <Report report={report} />}
          </>
        )}
        {tab === "history" && (
          <History
            onOpenNiche={(run) => {
              setNicheRun(run);
              setTab("niche");
            }}
            onOpenRun={(r) => {
              setPrefill(null);
              setReport(r);
              setTab("check");
            }}
          />
        )}
      </main>
    </div>
  );
}

function TabButton(props: { id: Tab; current: Tab; onSelect: (t: Tab) => void; children: string }) {
  const selected = props.id === props.current;
  return (
    <button role="tab" aria-selected={selected} className={selected ? "tab active" : "tab"} onClick={() => props.onSelect(props.id)}>
      {props.children}
    </button>
  );
}

function HealthBanner({ health }: { health: Health | null }) {
  if (!health) return <span className="chip bad">API not reachable</span>;
  if (health.mock) return <span className="chip warn">Mock mode: sample data, no network</span>;
  return (
    <div className="chips">
      <span className="chip">{health.model}</span>
      <span className={health.keys.anthropic ? "chip good" : "chip bad"}>Claude key {health.keys.anthropic ? "set" : "missing"}</span>
      <span className={health.keys.reddit ? "chip good" : "chip warn"}>Reddit key {health.keys.reddit ? "set" : "missing"}</span>
    </div>
  );
}
