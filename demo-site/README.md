# SIH26108 — static demo site

A no-backend showcase of the standards recommendation engine, built to deploy
straight to Vercel.

Everything on the page is a **recording of the real pipeline**, not a mock-up.
`scripts/capture_demo_fixtures.py` (in the repo root) runs real queries through
the real retriever, critic and graph, and writes the stage events, timings,
citations and confidence scores to `src/fixtures/`. The site replays them and
lights up the architecture diagram as each component is reached.

## Run locally

    npm install
    npm run dev

## Deploy to Vercel

From this directory:

    npx vercel --prod

Or from the Vercel dashboard: **New Project** -> import the repo -> set
**Root Directory** to `demo-site`. Framework preset Vite; build command
`npm run build`; output directory `dist`. `vercel.json` already sets these.

## Refreshing the fixtures

From the repo root, with the backend environment active:

    python scripts/capture_demo_fixtures.py

That rewrites `src/fixtures/runs.json` and `src/fixtures/corpus.json`. It warms
the embedder first and discards that run, so recorded timings reflect
steady-state latency rather than one-off model loading.

If the language model is unreachable when you capture, synthesis falls back to
the rule-based path and the site says so in a footer notice. Re-capture with the
model reachable to replace those fixtures.

## What is where

    src/App.jsx                 page shell, query picker, corpus stats
    src/replay.js               replays recorded stage events onto the map
    src/components/SystemMap.jsx  the live architecture diagram
    src/components/Result.jsx   recommendation and abstention views
    src/fixtures/               captured runs (regenerate, do not hand-edit)
