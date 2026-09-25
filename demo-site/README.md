# SIH26108 — offline demo site

The ManakSetu dashboard, deployable to Vercel with **no backend**.

It is not a copy of the dashboard: `vite.config.js` builds `../frontend/src`
directly and swaps only two modules.

- `src/api.demo.js` replaces `frontend/src/api.js`. Every call is answered from
  `public/fixtures/`, recorded from the real API handlers and pipeline — real
  stage timings, citations, confidence, compliance reports and catalogue
  records. A request the recording does not cover is refused with a message
  saying so, never answered with something invented.
- `src/DemoQueryScreen.jsx` replaces the query screen, adding example queries in
  **English, Hindi, Marathi and Tamil**. A non-English example shows the English
  query it is matched on; those translations are pre-recorded (the real system
  does not translate yet). Free-typed text shows a note, because only recorded
  examples can run. The document tab takes pasted text only; the upload
  dropzone is removed.

- `src/DocsScreen.jsx` adds a **Docs** screen to the sidebar: the problem
  statement, the solution, what is different, how it works, KPIs, requirement
  coverage, stack, limitations and roadmap, told mostly through diagrams and
  interactive pieces (output previews, a typical-AI vs ManakSetu toggle, an
  animated pipeline, and a critic explainer). It is passed in through `App`'s
  `extraScreens` prop, so the dashboard itself is unchanged. Corpus figures are
  read from the recorded stats. The evaluation figures are copied from
  `data/logs/eval-scoped.json`, and the critic explainer copies the confidence
  formula from `backend/pipeline/critic.py`; update both by hand when those
  change.

- `src/Tour.jsx` is a guided tour for evaluators. It opens on the first visit,
  is remembered in `localStorage`, and can be replayed from the **?** button in
  the bottom-right corner. It moves between screens by clicking the dashboard's
  own buttons, so if a nav label or tab name changes, update it in `STEPS`.

## What is recorded

| Screen | Offline behaviour |
|---|---|
| New Query → Text Input | the five example queries, streamed stage by stage in ~6 s (true seconds still shown) |
| New Query → Tender Document | the sample tender, via "Load sample tender", at every cap |
| Dashboard | corpus stats and the latest 2,000 ingestion log events |
| Standards Graph | the full in-scope graph; search runs in the browser over its standards; every node opens its recorded catalogue record |
| Settings | shown as in the dashboard; results are the ones recorded with default settings |
| Docs | static documentation; demo-only, not in the live dashboard |

## Run locally

    npm install
    npm run dev

## Deploy to Vercel

From this directory:

    npx vercel --prod

Or from the Vercel dashboard: **New Project** -> import the repo -> set
**Root Directory** to `demo-site`, and keep **Include files outside the root
directory** enabled (the build reads `../frontend/src`). `vercel.json` sets the
Vite build.

## Refreshing the recording

From the repo root, with the backend environment and a model key available:

    python scripts/capture_demo_fixtures.py

That rewrites `public/fixtures/` (runs, sample-tender reports, stats, logs,
graph, and the sharded catalogue records) and copies the sample tender into
`public/`. The example queries live in two places that must agree: `QUERIES` in
the capture script and `EXAMPLES` in `src/DemoQueryScreen.jsx`.
