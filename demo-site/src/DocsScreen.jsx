import { useEffect, useState } from 'react'
import { getStats } from './api.demo.js'

// Corpus figures come from the recorded stats, so they always agree with the
// Dashboard. The evaluation and engineering figures are copied from measured
// sources (data/logs/eval-scoped.json, CONTEXT.md), never estimated. When the
// golden set is re-run, update them here to match.

const SECTIONS = [
  ['problem', 'Problem statement'],
  ['solution', 'Our solution'],
  ['different', 'What we do differently'],
  ['how', 'How it works'],
  ['kpis', 'KPIs'],
  ['coverage', 'Requirement coverage'],
  ['stack', 'Tech stack'],
  ['limits', 'Limitations'],
  ['roadmap', 'Roadmap'],
]

function Table({ head, rows }) {
  return (
    <div className="scroll-x docs-table">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function Section({ id, title, lead, children }) {
  return (
    <section id={`doc-${id}`} className="panel docs-section">
      <h2>{title}</h2>
      {lead && <p className="sub">{lead}</p>}
      {children}
    </section>
  )
}

function Kpi({ n, l, cls = '' }) {
  return (
    <div className={`tile ${cls}`}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  )
}

const STAGES = [
  ['Semantic retrieval', 'Top passages by meaning, capped per standard; withdrawn standards demoted.'],
  ['Graph expansion', '1–2 hops through the dependency graph from the top candidates.'],
  ['Synthesis', 'The LLM sees only the retrieved passages and may cite nothing else.'],
  ['Critic', 'Two hard gates, then five signals combined multiplicatively.'],
  ['Currency', 'Cited edition checked against every edition in the BIS catalogue.'],
  ['Certification', 'BIS Product Certification, CRS and Hallmarking rule lookup.'],
]

const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-IN'))

export default function DocsScreen({ go }) {
  const [active, setActive] = useState(SECTIONS[0][0])
  const [stats, setStats] = useState(null)

  useEffect(() => { getStats().then(setStats).catch(() => {}) }, [])
  const ftPct = stats?.standards ? Math.round((stats.with_full_text / stats.standards) * 100) : null

  // Highlight whichever section is nearest the top of the viewport.
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(`doc-${id}`)).filter(Boolean)
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (seen[0]) setActive(seen[0].target.id.slice(4))
    }, { rootMargin: '-90px 0px -65% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const jump = (id) => {
    setActive(id)
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="docs">
      <nav className="docs-toc" aria-label="Documentation contents">
        <div className="docs-toc-label">Contents</div>
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={active === id ? 'on' : ''} onClick={() => jump(id)}>
            {label}
          </button>
        ))}
      </nav>

      <article className="docs-body">
        <div className="docs-hero">
          <div className="docs-eyebrow">Smart India Hackathon 2026 · SIH26108</div>
          <h2>AI-Powered Recommendation Engine for Indian Standards</h2>
          <p>
            It reads a tender, finds the right Indian Standard for each requirement,
            and <b>refuses to answer when it isn't sure</b>.
          </p>
          <div className="docs-meta small">
            Ministry of Consumer Affairs, Food &amp; Public Distribution · Department of Consumer Affairs · BIS
          </div>
        </div>

        <Section id="problem" title="Problem statement"
                 lead="Procurement agencies must cite the correct Indian Standards in every tender specification.">
          <p>Government departments, PSEs and procurement agencies reference Indian Standards when they write tenders. Getting that right is hard:</p>
          <ul className="docs-list">
            <li>There are roughly <b>24,000 published standards</b>, and their <b>scopes overlap</b>.</li>
            <li>Standards are <b>revised often</b>. A number that was right five years ago may now be superseded or withdrawn.</li>
            <li>A standard rarely stands alone. It <b>normatively references</b> others (test methods, terminology, safety, installation practice) that the tender must also cite.</li>
          </ul>
          <p>
            As a result, tenders leave out relevant standards, cite outdated editions, or state
            incomplete requirements. That leads to ambiguity, lower product quality and
            procurement disputes.
          </p>
          <div className="docs-callout abstain">
            <b>The failure mode that matters most.</b> Pointing a language model at the problem
            makes it worse. A model will confidently produce a <b>plausible IS number that does
            not exist</b>, or one that exists but is wrong. In a government tender, that error is
            expensive and often isn't caught until there's a dispute. So the core engineering
            problem is not retrieval. It is <b>knowing when not to answer</b>.
          </div>
        </Section>

        <Section id="solution" title="Our solution"
                 lead="ManakSetu matches a requirement to the standards that govern it, and shows its evidence.">
          <p>
            Give it a product description, a technical specification or a whole tender document.
            For each requirement, it returns:
          </p>
          <div className="docs-grid">
            <div className="docs-card"><b>The standard to cite</b><span>Matched on meaning, not keywords.</span></div>
            <div className="docs-card"><b>The proof</b><span>Every claim links to the verbatim passage of the real standard.</span></div>
            <div className="docs-card"><b>Currency</b><span>Whether the edition is current, superseded or withdrawn, and how many amendments apply.</span></div>
            <div className="docs-card"><b>Certification</b><span>Flags BIS Product Certification, CRS or Hallmarking where a rule applies.</span></div>
            <div className="docs-card"><b>Allied standards</b><span>Test methods, terminology, safety and installation standards it depends on.</span></div>
            <div className="docs-card"><b>A tender clause</b><span>Paste-ready specification text for the officer.</span></div>
          </div>
          <p>
            When the evidence doesn't support an answer, it <b>abstains</b>. It gives the reasons,
            the closest candidates for a person to judge, and advice on how to rephrase.
          </p>
          <h3>Four screens, one pipeline</h3>
          <ul className="docs-list">
            <li><b>New Query</b>: a single requirement, or a whole tender pasted in and turned into a compliance report.</li>
            <li><b>Dashboard</b>: corpus composition and the full ingestion audit trail.</li>
            <li><b>Standards Graph</b>: every standard and the cited dependencies between them.</li>
            <li><b>Reports</b>: the tender compliance report, exportable as JSON or CSV.</li>
          </ul>
          <button className="primary" onClick={() => go('query')}>Try a query</button>
        </Section>

        <Section id="different" title="What we do differently"
                 lead="Most solutions build search. Ours is built around the question a reviewer actually asks: why should I trust it?">
          <Table
            head={['Typical approach', 'ManakSetu']}
            rows={[
              ['Always returns a best guess', <><b>Abstains</b> when evidence is weak, and explains why</>],
              ['LLM output is trusted as-is', <><b>Deterministic hard gates</b>: an IS number not in the corpus cannot be emitted, since the check is a database lookup and not a model judgement</>],
              ['Answers without sources', <>Every claim cites a <b>chunk id that resolves to a verbatim passage</b></>],
              ['Keyword match on titles', <><b>Semantic match</b> over {fmt(stats?.chunks)} passages of real standard text</>],
              ['Returns the number only', <><b>Edition-aware currency</b>: caught a tender citing IS 3043:1987 when 2018 is current</>],
              ['Related standards are guessed', <>Dependency edges carry the <b>verbatim sentence that proves them</b>; inferred edges are drawn dashed and labelled</>],
              ['Opaque, hand-built dataset', <><b>Auditable ingestion</b>: every step is logged, and catalogue enumeration is provably complete</>],
              ['Scores added together', <>Confidence is a <b>geometric mean</b>, so one strong signal cannot hide a weak one</>],
            ]}
          />
        </Section>

        <Section id="how" title="How it works"
                 lead="Six stages, streamed live to the screen as they run.">
          <ol className="docs-flow">
            {STAGES.map(([t, d], i) => (
              <li key={t} className={t === 'Critic' ? 'critic' : ''}>
                <span className="docs-step">{i + 1}</span>
                <b>{t}</b>
                <span className="small">{d}</span>
              </li>
            ))}
          </ol>
          <h3>The critic, the core of the project</h3>
          <p>
            Two <b>deterministic hard gates</b> run first: every IS number must exist in the corpus,
            and every citation must point at a passage that was actually retrieved. If either
            fails, confidence is set to 0. Then five signals are combined:
          </p>
          <Table
            head={['Signal', 'What it catches']}
            rows={[
              [<code>grounding_rate</code>, 'Claims not supported by the passage they cite'],
              [<code>retrieval_strength</code>, 'Nothing in the corpus matches closely'],
              [<code>discrimination</code>, 'Scattered candidates, meaning the query is vague'],
              [<code>query_relevance</code>, 'A well-grounded answer to a different question'],
              [<code>verification_depth</code>, "The match rests on metadata, or on another edition's text"],
            ]}
          />
          <p className="small muted">
            A recommended standard that is <b>withdrawn</b> is near-vetoed. Below the threshold
            (default 0.55) the system abstains.
          </p>
          <h3>Data sources</h3>
          <ul className="docs-list">
            <li><b>BIS catalogue</b>: all standards, enumerated with digit seeds 0–9 so coverage is provably complete. Parse coverage is 99.3%; corrupt rows are rejected and logged, never guessed.</li>
            <li><b>Internet Archive</b>: Public.Resource.Org's pre-OCR'd text of BIS standards, matched on number, part and section.</li>
          </ul>
        </Section>

        <Section id="kpis" title="KPIs"
                 lead="Measured, not estimated. Evaluation uses a golden set phrased the way a procurement engineer writes, not the way standards are titled.">
          <h3>Corpus as built (ETD + LITD scope)</h3>
          <div className="tiles">
            <Kpi n={fmt(stats?.standards)} l="Standards in scope" />
            <Kpi n={fmt(stats?.with_full_text)} l={`With full text${ftPct ? ` (${ftPct}%)` : ''}`} cls="good" />
            <Kpi n={fmt(stats?.chunks)} l="Citable passages" />
            <Kpi n={fmt(stats?.edges_confirmed)} l="Confirmed dependencies" cls="good" />
          </div>

          <h3>Recommendation quality</h3>
          <div className="tiles">
            <Kpi n="100%" l="Recall@5: the right standard is always in the top five" cls="good" />
            <Kpi n="86%" l="Recall@3" />
            <Kpi n="71%" l="Recall@1, and precision when answering" />
            <Kpi n="3 of 4" l="Vague queries correctly refused" />
          </div>

          <h3>Safety (lower is better)</h3>
          <div className="tiles">
            <Kpi n="4" l="Confident but wrong, of 14 (one is a golden-set gap)" cls="flag" />
            <Kpi n="1" l="Confident on a vague query, of 4" cls="flag" />
          </div>
          <p className="small muted">
            Source: <code>scripts/evaluate.py</code>, 14 procurement-language queries plus 4
            deliberately vague ones. An earlier draft claimed zero confident-but-wrong answers,
            but that was never measured. These are the real numbers.
          </p>

          <h3>Data and engineering</h3>
          <Table
            head={['Measure', 'Result']}
            rows={[
              ['Catalogue parse coverage', '99.3%'],
              ['Full text holding the exact catalogue edition', '84%'],
              ['Index build time on GPU (RTX 5050, CUDA 12.8)', '87 min → 8 min (17.5× faster)'],
              ['Sample headline confidences', 'IS 694 0.88 · IS 3043 0.78 · IS 1554 0.98 · IS 16102 1.00'],
            ]}
          />

          <h3>What a pilot would measure</h3>
          <Table
            head={['KPI', 'Why it matters']}
            rows={[
              ['Outdated or withdrawn citations caught per tender', 'The direct cost the system avoids'],
              ['Time to draft the standards section of a tender', 'Officer productivity'],
              ['Officer acceptance rate of recommendations', 'Whether the answers are trusted in practice'],
              ['Confident-but-wrong rate on real tenders', 'The safety metric; the target is zero'],
              ['Abstention rate, and share resolved after rephrasing', 'Whether refusals are useful rather than obstructive'],
              ['Procurement disputes over standard citations', 'The downstream outcome the problem statement names'],
            ]}
          />
        </Section>

        <Section id="coverage" title="Requirement coverage"
                 lead="How the build maps to what the problem statement asked for.">
          <Table
            head={['Expected feature', 'Status', 'Evidence']}
            rows={[
              ['Accept descriptions, specs and tender documents', <span className="badge ok">Built</span>, 'Text and PDF upload verified end to end'],
              ['Semantic recommendation, not keyword', <span className="badge ok">Built</span>, '"earthing and bonding of electrical installation" → IS 3043, whose title contains neither "bonding" nor "installation"'],
              ['Allied standards, six categories', <span className="badge ok">Built</span>, "All six edge types, from BIS's own aspect taxonomy"],
              ['Latest version and amendments', <span className="badge ok">Built</span>, 'IS 1554 (Part 1):1988 → current, 5 amendments; IS 3043-1987 → superseded by 2018'],
              ['Certification requirements', <span className="badge warn">Partial</span>, 'BIS Product Certification and CRS fire; Hallmarking covers gold and silver, outside this corpus'],
              ['Multilingual input', <span className="badge warn">Designed</span>, 'Translate-then-retrieve: detect the language, match in English, answer in the original; Hindi, Marathi and Tamil examples on New Query'],
            ]}
          />
        </Section>

        <Section id="stack" title="Tech stack" lead="Each choice is made for a reason, not by default.">
          <Table
            head={['Layer', 'Choice', 'Why']}
            rows={[
              ['Scraping', 'Plain HTTP; Playwright once for discovery', 'Captured the base64 DataTables contract, then dropped the browser'],
              ['Full text', 'Internet Archive _djvu.txt', 'Already OCR\'d, public domain; no PDF pipeline needed'],
              ['Store', 'SQLite', 'Single file, transactional, right-sized for ~5k standards'],
              ['Embeddings', 'bge-small-en-v1.5, local', 'Offline, no API key, no per-query cost'],
              ['Vector index', 'FAISS (flat inner product)', 'Exact cosine search, and ships Windows wheels'],
              ['Graph', 'SQLite edges table', '~10.4k edges; one source of truth'],
              ['LLM', 'Groq, gpt-oss-120b', 'Synthesis and checking only, never the source of an IS number'],
              ['API / UI', 'FastAPI · React + Vite', 'Typed models and streaming; a force-directed dependency graph'],
            ]}
          />
        </Section>

        <Section id="limits" title="Limitations" lead="Stated plainly, because saying them up front makes the rest credible.">
          <ul className="docs-list">
            <li><b>Corpus scope.</b> Electrical and electronics departments (ETD and LITD) only, not all ~24,000 standards. Scaling up means re-running the scraper without the department filter.</li>
            <li><b>Partial full text.</b> 58% of standards have ingested text. The rest are flagged <i>metadata only, unverified</i> and carry lower confidence.</li>
            <li><b>Older editions.</b> 16% of the held text is from an earlier edition than the catalogue lists. This is tracked per standard and lowers confidence.</li>
            <li><b>Withdrawn standards.</b> 43% of the catalogue is withdrawn. These are kept so they can be flagged in tenders, but are never recommended.</li>
            <li><b>Certification rules</b> are a curated seed, not a legal source. Output is phrased as a flag to verify.</li>
            <li><b>Colloquial phrasing</b> ("bulb that saves electricity") degrades. The system abstains rather than guessing, so it fails safely.</li>
            <li><b>Ranking</b> puts the right standard first 71% of the time. That is why candidates are always shown.</li>
          </ul>
        </Section>

        <Section id="roadmap" title="Roadmap">
          <ol className="docs-list">
            <li><b>Full catalogue</b>: ingest all ~24,000 standards. The pipeline doesn't change.</li>
            <li><b>Multilingual layer</b>: detect the language, translate, run the same pipeline, and answer in the original language.</li>
            <li><b>Live certification rules</b>: sync with Quality Control Orders as gazette notifications change.</li>
            <li><b>Better ranking</b>: raise recall@1 by reducing the bias toward standards with full text.</li>
            <li><b>Pilot</b> with a procurement agency, tracking the KPIs above on real tenders.</li>
          </ol>
        </Section>
      </article>
    </div>
  )
}
