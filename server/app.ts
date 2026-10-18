import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import { CheckRequest, NicheRequest, NicheUpdate, type Health, type RunSummary } from "../shared/schema";
import { AnalysisError } from "./analyze/claude";
import { PipelineError, runCheck, runNicheFinder, updateNicheRun, type Deps } from "./pipeline";

export function createApp(deps: Deps, health: Health, opts: { staticDir?: string } = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json(health);
  });

  // ---- Stage 1: Niche Finder ----
  app.post("/api/niches", async (req, res) => {
    res.json(await runNicheFinder(deps, NicheRequest.parse(req.body)));
  });

  app.patch("/api/niches/:id", async (req, res) => {
    const run = await updateNicheRun(deps, req.params.id, NicheUpdate.parse(req.body));
    if (!run) return void res.status(404).json({ error: "Niche run not found" });
    res.json(run);
  });

  app.get("/api/niches", async (_req, res) => {
    const runs = await deps.store.listNiches();
    const summaries: RunSummary[] = runs.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      title: r.category,
      detail: `${r.candidates.filter((c) => c.gate === "pass").length} passing of ${r.candidates.length} candidates`,
    }));
    res.json(summaries);
  });

  app.get("/api/niches/:id", async (req, res) => {
    const run = await deps.store.getNiche(req.params.id);
    if (!run) return void res.status(404).json({ error: "Niche run not found" });
    res.json(run);
  });

  // ---- Stage 2: Gap Checker ----
  app.post("/api/check", async (req, res) => {
    res.json(await runCheck(deps, CheckRequest.parse(req.body)));
  });

  app.get("/api/runs", async (_req, res) => {
    const runs = await deps.store.listRuns();
    const summaries: RunSummary[] = runs.map((r) => {
      const validated = r.gaps.filter((g) => g.label === "validated").length;
      const promising = r.gaps.filter((g) => g.label === "promising").length;
      return {
        id: r.id,
        createdAt: r.createdAt,
        title: r.niche,
        detail: `${validated} validated, ${promising} promising, ${r.gaps.length} gaps`,
      };
    });
    res.json(summaries);
  });

  app.get("/api/runs/:id", async (req, res) => {
    const run = await deps.store.getRun(req.params.id);
    if (!run) return void res.status(404).json({ error: "Run not found" });
    res.json(run);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve the built web app if present (npm run build).
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    if (err instanceof ZodError) {
      return void res.status(400).json({ error: "Invalid request", issues: err.issues });
    }
    if (err instanceof AnalysisError || err instanceof PipelineError) {
      return void res.status(502).json({ error: err.message });
    }
    if (err instanceof SyntaxError) {
      return void res.status(400).json({ error: "Body is not valid JSON" });
    }
    console.error(err);
    res.status(500).json({ error: "Unexpected server error" });
  });

  return app;
}
