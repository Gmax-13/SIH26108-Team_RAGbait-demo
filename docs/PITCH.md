# How to explain this to the panel

You do **not** need to explain embeddings, FAISS, or geometric means. You need
to explain one idea and show three screens.

---

## The one-sentence version

> "It reads a tender, finds the right Indian Standard for each requirement, and
> refuses to answer when it isn't sure."

If you say nothing else, say that.

---

## The 30-second version

> "A procurement officer writing a tender has to pick the right Indian Standard
> out of about 24,000. Today that's manual, and mistakes are expensive — you
> cite a standard that was withdrawn ten years ago and the tender is wrong.
>
> Our system takes the requirement in plain English, finds the matching
> standard, shows the exact sentence from the standard that proves it, tells you
> whether that edition is still current, and flags whether BIS certification is
> mandatory.
>
> And when the evidence doesn't support an answer, it says so instead of making
> one up."

---

## The problem framing (this is what wins)

Most teams will build search. The judge's real question is: **why should I trust
it?**

An AI that invents a plausible-looking IS number is worse than no AI at all,
because a wrong standard number in a government tender is a real, expensive
error that nobody catches until later.

So the interesting engineering isn't the matching — it's the refusal.

> "Anyone can make a language model output an IS number. The hard part is making
> it shut up when it doesn't actually know."

---

## The demo — three screens, in this order

### 1. Show it working (30 seconds)

Single query → click **"PVC insulated copper cable, 1100 V"**.

Point at three things:
- the **standard it picked**
- the **confidence score**
- the **citation trail** — "this is the actual sentence from the actual
  standard. Every claim traces back to a real passage. Nothing is the model's
  opinion."

If a judge asks why the quoted text looks like an old scan: it *is* an old scan.
These are real BIS documents from the public Internet Archive mirror, OCR'd. We
didn't hand-type a demo dataset.

### 2. Show it refusing (this is the moment)

Click **"⊘ Ambiguous — should abstain"**.

> "That's a real tender phrase — 'good quality durable product'. It means
> nothing technically. A search engine would return its best guess anyway.
>
> Ours returns nothing. It shows why it refused, and offers the closest
> candidates for a human to judge. That refusal is the feature."

Let the screen sit there for a second. Don't rush past it.

### 3. Show the tender report (30 seconds)

Batch tender mode → **Load sample tender** → **Generate compliance report**.

> "A whole tender goes in. Every requirement comes out matched, and it caught
> that this tender cites IS 3043 from 1987 — the current edition is 2018."

That "caught an outdated reference" line is concrete and lands well.

---

## Four questions you will probably get

**"How do you know it isn't hallucinating?"**
> "Two checks run before anything is shown. First, every IS number in the output
> is checked against our database — if the model invents one, the answer is
> thrown away. That check is a plain database lookup, not another AI, so it
> can't hallucinate. Second, every claim has to be supported by the passage it
> cites. If either fails, we abstain."

**"Where did the data come from?"**
> "Two public sources: the BIS catalogue for the 5,054 standards, and the
> Internet Archive's public-domain mirror for the full text of 2,314 of them.
> The Dataset tab shows every single ingestion step — it's all logged."

Then open the **Dataset & ingestion log** tab. It's very hard to argue with.

**"What's the accuracy?"**
> "We measure it rather than guess." Run `python scripts/evaluate.py` beforehand
> and quote the numbers. The two that matter are **confident-but-wrong** and
> **confident-on-a-vague-query** — both should be zero.

**"What are the limitations?"** *(Answer this honestly — it builds credibility)*
> "Three. We've ingested the electrical and electronics departments, not all
> 24,000 standards. About 45% of standards have full text — the rest we can only
> match on title, and we label those clearly. And the certification rules are a
> curated table that needs checking against current government notifications."

Saying this out loud makes judges trust everything else you said.

---

## Words to avoid, and what to say instead

| Don't say | Say |
|---|---|
| "vector embeddings / FAISS" | "it matches on meaning, not keywords" |
| "RAG pipeline" | "it looks up the real document before answering" |
| "the critic layer computes a weighted geometric mean" | "it checks its own answer, and refuses if the evidence is weak" |
| "dependency graph traversal" | "standards reference other standards — we show that web" |
| "abstention threshold" | "if it isn't sure, it says so" |

If a judge is technical, they'll ask for the detail. Let *them* pull it out of
you — don't lead with it.

---

## If something breaks live

- **Everything abstains / "LLM unavailable"** → the free API quota ran out. Say:
  "the language model quota is exhausted, so it's running on the fallback path —
  the verification still works, it's just less precise." Then demo the **Explore
  a standard** tab, which needs no AI at all.
- **A query is slow** → the first one loads the model. Run one before you
  present.
- **Nothing loads** → check both terminals are running (API on 8000, dashboard
  on 5173).

---

## The closing line

> "The goal wasn't to build something that always answers. It was to build
> something a procurement officer can actually trust — which means it has to be
> willing to say 'I don't know'."
