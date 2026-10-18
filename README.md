# Idea Checker

Finds and validates digital-product niches, following Richard Yu's method ([video](https://www.youtube.com/watch?v=e_YFwITLNNE)):

1. **Find a niche** (his Phase 1, 0:58–3:56)
   - Type a broad category ("spreadsheet"). Claude suggests 8–12 sub-niches from Google autocomplete and related subreddits.
   - For each one you get the buyer's 30-second moment and a Canva-20 moat check.
   - You type in the top seller's monthly revenue from Profittree. Anything under the bar, or easy to copy in Canva, is dropped.
2. **Check a niche** (his Phase 2, 11:35–14:20)
   - The app collects Reddit posts with "I wish there was" / "why is there no" / "does anyone know how to" phrasing, plus Google autocomplete.
   - You paste about 40 three-star reviews.
   - Claude groups everything into gaps, and each gap is scored by how many sources back it.

**Claude never sets the score.** It only cites evidence ids. The server drops any id that doesn't exist and counts the sources itself (`server/analyze/score.ts`).

| Label | Meaning |
|---|---|
| Validated | Reddit + reviews + autocomplete all agree, **and** Etsy demand is proven (top seller ≥ the bar, or the "bought in last 24h" badge) |
| Promising | 2 of 3 sources, or 3 of 3 without proven Etsy demand |
| Weak | 1 source |

## Setup
```bash
npm install
npx playwright install chromium   # only needed for the e2e tests
cp .env.example .env
```
Then fill in `.env`:
- **`ANTHROPIC_API_KEY`**: create one at https://console.anthropic.com. It's billed per use and separate from a Claude subscription. A run costs roughly $0.10–$0.30 on `claude-opus-5-5`.
- **`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`**:
  1. Go to https://www.reddit.com/prefs/apps → "create another app…" → type **script**.
  2. Use any redirect URI (e.g. `http://localhost:8080`).
  3. The id is under the app name; the secret is labeled "secret".
  4. Also set `REDDIT_USER_AGENT` with your Reddit username.

  Without Reddit keys the app still runs: Reddit shows as *skipped*, and you can paste threads by hand in the check form.

Check the sources without spending anything on Claude:
```bash
npm run smoke:sources -- "budget spreadsheet"
```

## Run
```bash
npm run dev        # live: http://localhost:5173 (API on :3001)
npm run dev:mock   # sample data: no keys, no network, no cost
```
Runs are saved as JSON in `data/niches/` and `data/runs/`, and listed on the History tab.

## Test
```bash
npm run typecheck
npm run lint
npm run test:unit   # unit + API tests (mock mode)
npm run test:e2e    # Playwright: niche → check → report → history, against the mock server
```

## Layout
```
shared/schema.ts            zod schemas shared by server and web (incl. what Claude must return)
server/sources/             reddit.ts (OAuth app-only), autocomplete.ts (unofficial endpoint), pasted.ts (reviews/threads)
server/analyze/             prompt.ts, claude.ts (structured outputs + refusal fallback), score.ts, mock.ts
server/pipeline.ts          the two stages; a failing source becomes a status line, not a failed run
server/app.ts, main.ts      Express routes; serves dist/web after `npm run build`
web/src/                    React app: NicheFinder, CheckForm, Report, History
fixtures/                   mock-mode data + sample reviews (made-up test data)
```

## Notes
- **Etsy:** nothing is scraped (it's against Etsy's terms). Reviews and revenue numbers are entered by hand.
- **Google autocomplete** uses an unofficial endpoint at low volume (about 300 ms between requests). If it gets blocked, that source shows an error and the run carries on.
- **Reddit text is untrusted.** Prompts tell Claude to treat it as data, and our own tags are neutralized inside it.
