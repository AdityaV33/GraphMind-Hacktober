/**
 * GraphMind End-to-End Test Suite
 * Tests 10 verification vectors covering core grounding, graph traversal,
 * conflict detection, hallucination abstention, and executive briefing.
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, raw: text };
  }
}

async function runSuite() {
  console.log(`\n🚀 Starting GraphMind Test Suite against ${BASE_URL}...\n`);
  const startTime = Date.now();

  try {
    // ─── 1. Health & Config ──────────────────────────────────────────────
    console.log('📌 Test 1: Health & System Diagnostics');
    const health = await request('/api/health');
    assert(health.status === 200, 'Health endpoint responds with 200');
    assert(health.data?.geminiConfigured === true, 'Gemini API key is configured');
    assert(Boolean(health.data?.model), `Gemini model active: ${health.data?.model}`);

    // ─── 2. Graph Reset ──────────────────────────────────────────────────
    console.log('\n📌 Test 2: Graph Reset / Clear');
    const clear = await request('/api/clear', { method: 'POST' });
    assert(clear.status === 200 && clear.data?.success === true, 'Clear graph responds with success');
    const emptyStats = await request('/api/stats');
    assert(emptyStats.data?.entities === 0, 'Graph entities count is 0 after clear');

    // ─── 3. Demo Dataset Load ────────────────────────────────────────────
    console.log('\n📌 Test 3: Load Judge-Proof Demo Scenario');
    const demo = await request('/api/demo', { method: 'POST' });
    assert(demo.status === 200 && demo.data?.success === true, 'Demo endpoint returns success');
    assert(demo.data?.graph?.entities?.length === 11, `Demo loaded 11 entities (found: ${demo.data?.graph?.entities?.length})`);
    assert(demo.data?.graph?.conflicts?.length > 0, `Demo loaded cross-document conflicts (found: ${demo.data?.graph?.conflicts?.length})`);

    // ─── 4. Graph Structure & Annotations ────────────────────────────────
    console.log('\n📌 Test 4: Graph Retrieval & Conflict Annotation');
    const graph = await request('/api/graph');
    assert(graph.data?.entities?.length === 11, 'Graph entities retrieved intact');
    assert(graph.data?.relationships?.some(r => r.isConflict === true), 'Graph relationships annotate conflicting edges with isConflict=true');

    // ─── 5. Multi-Hop Traversal Query ────────────────────────────────────
    console.log('\n📌 Test 5: Multi-Hop Reasoning & Highlight Nodes');
    const q1 = await request('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question: 'Which physical server room houses the computing cluster allocated to the team that Sarah Jenkins leads?'
      })
    });
    assert(q1.status === 200, 'Query endpoint returns 200');
    const q1Answer = (q1.data?.answer || '').toLowerCase();
    const serverRoomFound = q1Answer.includes('server room 4b') || q1Answer.includes('zurich');
    assert(serverRoomFound, 'Multi-hop answer correctly resolves Server Room 4B in Zurich');
    assert(Array.isArray(q1.data?.reasoning_path) && q1.data?.reasoning_path.length > 0, 'Reasoning path is traced');
    assert(Array.isArray(q1.data?.highlight_nodes) && q1.data?.highlight_nodes.length > 0, `Highlight nodes tagged for visual traversal: ${JSON.stringify(q1.data?.highlight_nodes)}`);

    // ─── 6. Conflict Detection Query ─────────────────────────────────────
    console.log('\n📌 Test 6: Cross-Document Contradiction Grounding');
    const q2 = await request('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the approved operating budget for Project Alpha across the documents?'
      })
    });
    const q2Answer = (q2.data?.answer || '').toLowerCase();
    const hasBothBudgets = q2Answer.includes('120,000') && q2Answer.includes('180,000');
    const conflictsReturned = Array.isArray(q2.data?.conflicts) && q2.data?.conflicts.length > 0;
    assert(hasBothBudgets || conflictsReturned, 'Cross-document conflict between $120,000 and $180,000 surfaced');
    assert(Array.isArray(q2.data?.citations) && q2.data?.citations.length > 0, 'Citations provided for conflicting claims');

    // ─── 7. Hallucination Abstention ─────────────────────────────────────
    console.log('\n📌 Test 7: Strict Hallucination Abstention');
    const q3 = await request('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the public release date and ticket pricing for the Quantum Computing initiative?'
      })
    });
    const q3Answer = (q3.data?.answer || '').toLowerCase();
    const refused = q3.data?.confidence === 'unsupported' ||
                    q3Answer.includes('cannot answer') ||
                    q3Answer.includes('not provided') ||
                    q3Answer.includes('not mentioned') ||
                    q3Answer.includes('no information') ||
                    q3Answer.includes('unsupported');
    assert(refused, `System strictly abstained on missing facts (confidence: ${q3.data?.confidence})`);

    // ─── 8. Executive Synthesis Briefing ─────────────────────────────────
    console.log('\n📌 Test 8: Executive Synthesis Briefing (/api/summary)');
    const summary = await request('/api/summary');
    assert(summary.status === 200 && summary.data?.success === true, 'Summary endpoint returns 200 with success: true');
    assert(typeof summary.data?.summary === 'string' && summary.data?.summary.includes('Executive'), 'Briefing markdown generated with executive overview');
    assert(Boolean(summary.data?.stats?.topHubs), `Top hubs identified: ${JSON.stringify(summary.data?.stats?.topHubs)}`);

    // ─── 9. Graph Export ─────────────────────────────────────────────────
    console.log('\n📌 Test 9: Graph Export (/api/export)');
    const exp = await request('/api/export');
    assert(exp.status === 200, 'Export endpoint returns 200');
    assert(exp.data?.version === '1.0' && Array.isArray(exp.data?.entities), 'Export payload adheres to v1.0 schema');

    // ─── 10. Graph Import ────────────────────────────────────────────────
    console.log('\n📌 Test 10: Graph Import (/api/import)');
    const imp = await request('/api/import', {
      method: 'POST',
      body: JSON.stringify(exp.data)
    });
    assert(imp.status === 200 && imp.data?.success === true, 'Import endpoint successfully restored graph');
    assert(imp.data?.imported?.entities === 11, `Import restored 11 entities (found: ${imp.data?.imported?.entities})`);

  } catch (err) {
    console.error('\n💥 Unexpected suite crash:', err);
    failed++;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`🏁 Suite Finished in ${durationSec}s`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`══════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite();
