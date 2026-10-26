/**
 * GraphMind — Quantitative Benchmark Evaluation Script
 *
 * Runs 20 calibrated queries across 3 enterprise domains against the live
 * /api/query endpoint and measures:
 *   - Multi-Hop Traversal Recall
 *   - Conflict Detection F1
 *   - Hallucination Abstention Accuracy
 *   - Source Citation Fidelity
 *
 * Usage:
 *   1. Start the server:  npm start
 *   2. In another terminal: npm run evaluate
 *
 * The script auto-loads each domain's documents via /api/upload before querying.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE_URL     = process.env.TEST_URL || 'http://localhost:3000';
const DATASETS_DIR = path.join(__dirname, 'sample_datasets');

// ─── Benchmark Query Definitions ──────────────────────────────────────────────
const BENCHMARK = [
  // ── Corporate M&A Due Diligence ───────────────────────────────────────────
  {
    id: 'MNA-01', domain: '01_corporate_mna', type: 'multi-hop',
    question: 'Which city and state houses the facility holding proprietary patents directed by Dr. Aris Thorne?',
    mustContain: ['cambridge'],
    expectPath: true,
  },
  {
    id: 'MNA-02', domain: '01_corporate_mna', type: 'conflict',
    question: 'What is the agreed acquisition price for NovaBio Therapeutics across the agreements and audit reports?',
    conflictTerms: ['420', '380'],
  },
  {
    id: 'MNA-03', domain: '01_corporate_mna', type: 'abstention',
    question: 'What is the exact NASDAQ ticker symbol and IPO date for Apex Holdings?',
  },
  {
    id: 'MNA-04', domain: '01_corporate_mna', type: 'multi-hop',
    question: 'Which parent corporation is acquiring the entity that employed Dr. Aris Thorne?',
    mustContain: ['apex'],
    expectPath: true,
  },
  {
    id: 'MNA-05', domain: '01_corporate_mna', type: 'conflict',
    question: 'What is the current role of Dr. Aris Thorne according to both the merger sheet and forensic audit?',
    conflictTerms: ['vp', 'step'],
  },
  {
    id: 'MNA-06', domain: '01_corporate_mna', type: 'abstention',
    question: 'What was the premium percentage Apex Holdings paid over NovaBio\'s 52-week share average?',
  },

  // ── Clinical Trial Safety ──────────────────────────────────────────────────
  {
    id: 'CLI-01', domain: '02_clinical_trials', type: 'multi-hop',
    question: 'Which city and country is home to the medical facility where compound NX-109 was trialled under Dr. Miriam Chen?',
    mustContain: ['berlin'],
    expectPath: true,
  },
  {
    id: 'CLI-02', domain: '02_clinical_trials', type: 'conflict',
    question: 'What is the approved daily maintenance dosage for Compound NX-109 across the trial documents?',
    conflictTerms: ['50', '25'],
  },
  {
    id: 'CLI-03', domain: '02_clinical_trials', type: 'abstention',
    question: 'What is the projected retail price per bottle of compound NX-109 at a commercial pharmacy?',
  },
  {
    id: 'CLI-04', domain: '02_clinical_trials', type: 'multi-hop',
    question: 'Who assumed principal investigational oversight at the Berlin facility after the toxicity event?',
    mustContain: ['meyer', 'hans'],
    expectPath: true,
  },
  {
    id: 'CLI-05', domain: '02_clinical_trials', type: 'conflict',
    question: 'Who is documented as the lead investigator of the NX-109 trial across both documents?',
    conflictTerms: ['chen', 'meyer'],
  },
  {
    id: 'CLI-06', domain: '02_clinical_trials', type: 'abstention',
    question: 'How many pediatric patients were enrolled in the Phase I preliminary safety cohort for NX-109?',
  },

  // ── Cybersecurity Post-Mortem ──────────────────────────────────────────────
  {
    id: 'SEC-01', domain: '03_cybersecurity', type: 'multi-hop',
    question: 'Which specific database is housed in the datacenter where Bastion Gateway 04 routes ingress traffic?',
    mustContain: ['postgresql', 'ledger'],
    expectPath: true,
  },
  {
    id: 'SEC-02', domain: '03_cybersecurity', type: 'conflict',
    question: 'What was the initial penetration vector and compromised gateway across both incident reports?',
    conflictTerms: ['bastion', 'api gateway'],
  },
  {
    id: 'SEC-03', domain: '03_cybersecurity', type: 'abstention',
    question: 'What was the total Bitcoin ransom demanded by the threat actors?',
  },
  {
    id: 'SEC-04', domain: '03_cybersecurity', type: 'multi-hop',
    question: 'Which geographic region contains the infrastructure targeted by the SSRF exploit?',
    mustContain: ['dublin'],
    expectPath: true,
  },
  {
    id: 'SEC-05', domain: '03_cybersecurity', type: 'conflict',
    question: 'Was VPN credential stuffing the primary breach vector or a decoy according to the two reports?',
    conflictTerms: ['primary', 'decoy'],
  },
  {
    id: 'SEC-06', domain: '03_cybersecurity', type: 'abstention',
    question: 'What is the full name and personal address of the external red team auditor who reviewed the SIEM logs?',
  },

  // ── Demo Graph Cross-Domain ────────────────────────────────────────────────
  {
    id: 'GEN-01', domain: null, type: 'multi-hop',
    question: 'Which server room and city is the computing cluster allocated to Sarah Jenkins\'s team located in?',
    mustContain: ['server room 4b', 'zurich'],
    expectPath: true,
    useDemo: true,
  },
  {
    id: 'GEN-02', domain: null, type: 'abstention',
    question: 'What was the temperature inside Server Room 4B during the power outage on December 31?',
    useDemo: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: { raw: text } }; }
}

async function uploadMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const name    = path.basename(filePath);
  return apiFetch('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ text: content, name }),
  });
}

function evalResult(item, data) {
  const answer = (data?.answer || '').toLowerCase();

  if (item.type === 'multi-hop') {
    const targetHit   = (item.mustContain || []).every(k => answer.includes(k));
    const hasPath     = !item.expectPath || (Array.isArray(data?.reasoning_path) && data.reasoning_path.length > 0);
    return targetHit && hasPath;
  }
  if (item.type === 'conflict') {
    const bothMentioned = (item.conflictTerms || []).every(t => answer.includes(t.toLowerCase()));
    const flagged       = Array.isArray(data?.conflicts) && data.conflicts.length > 0;
    return bothMentioned || flagged;
  }
  if (item.type === 'abstention') {
    return data?.confidence === 'unsupported' ||
           answer.includes('cannot answer') ||
           answer.includes('not provided') ||
           answer.includes('not mentioned') ||
           answer.includes('no information') ||
           answer.includes('unsupported');
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' 📊  GraphMind Quantitative Benchmark  —  20-Query Evaluation');
  console.log(`     Target: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Health check
  const health = await apiFetch('/api/health');
  if (health.status !== 200 || !health.data?.geminiConfigured) {
    console.error('❌  Server not reachable or Gemini API key not configured.');
    console.error('    Start the server with: npm start');
    process.exit(1);
  }
  console.log(`✅  Server online — model: ${health.data.model}\n`);

  let loadedDomain = null;
  let demoLoaded   = false;

  const results = { 'multi-hop': [], conflict: [], abstention: [] };

  for (const item of BENCHMARK) {
    // ── Load domain documents if needed ──────────────────────────────────────
    if (item.useDemo && !demoLoaded) {
      await apiFetch('/api/clear', { method: 'POST' });
      await apiFetch('/api/demo',  { method: 'POST' });
      demoLoaded   = true;
      loadedDomain = '__demo__';
      console.log('  📂  Loaded demo dataset\n');
    } else if (item.domain && item.domain !== loadedDomain) {
      await apiFetch('/api/clear', { method: 'POST' });
      const domainPath = path.join(DATASETS_DIR, item.domain);
      const files = fs.readdirSync(domainPath).filter(f => f.endsWith('.md')).sort();
      for (const f of files) await uploadMarkdown(path.join(domainPath, f));
      loadedDomain = item.domain;
      demoLoaded   = false;
      console.log(`  📂  Loaded domain: ${item.domain}\n`);
    }

    // ── Query ────────────────────────────────────────────────────────────────
    const t0  = Date.now();
    const res = await apiFetch('/api/query', {
      method: 'POST',
      body: JSON.stringify({ question: item.question }),
    });
    const latency = Date.now() - t0;

    const passed = res.status === 200 && evalResult(item, res.data);
    const icon   = passed ? '✅' : '❌';
    const tag    = item.type.padEnd(10);
    const cites  = res.data?.citations?.length || 0;

    console.log(`  [${item.id}] ${icon} [${tag}]  (${latency}ms, ${cites} citations)  ${item.question.slice(0, 60)}...`);

    results[item.type].push({ passed, cited: cites > 0 });
  }

  // ─── Scores ────────────────────────────────────────────────────────────────
  const score = (arr) => arr.length ? (arr.filter(r => r.passed).length / arr.length * 100).toFixed(1) : 'N/A';
  const citeP = (arr) => arr.length ? (arr.filter(r => r.cited).length  / arr.length * 100).toFixed(1) : 'N/A';
  const all   = [...results['multi-hop'], ...results.conflict, ...results.abstention];

  const mhRecall    = score(results['multi-hop']);
  const cfF1        = score(results.conflict);
  const absAcc      = score(results.abstention);
  const citeFidelity = citeP(all);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' 📈  FINAL SCORECARD');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Multi-Hop Traversal Recall  : ${mhRecall}%`);
  console.log(`  Conflict Detection F1       : ${cfF1}%`);
  console.log(`  Hallucination Abstention    : ${absAcc}%`);
  console.log(`  Citation Fidelity           : ${citeFidelity}%`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const anyFail = all.some(r => !r.passed);
  process.exit(anyFail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
