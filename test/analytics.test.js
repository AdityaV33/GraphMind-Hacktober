const assert = require('assert');
const {
  deriveGraphAnalytics,
  calculateCoreCounts,
  calculateEntityDistribution,
  calculateRelationshipDistribution,
  calculateDegreeStatistics,
  calculateConnectedComponents,
  calculateGraphDensity,
  deriveKnowledgeQuality,
  deriveContextualAnalytics,
} = require('../public/analytics.js');

console.log('🧪 Running Knowledge Graph Analytics Unit Tests...\n');

// ─── Test 1: Empty Graph ────────────────────────────────────────────────────────
{
  const analytics = deriveGraphAnalytics({ entities: [], relationships: [], documents: [] });
  assert.strictEqual(analytics.isEmpty, true);
  assert.strictEqual(analytics.core.entitiesCount, 0);
  assert.strictEqual(analytics.core.relationshipsCount, 0);
  assert.strictEqual(analytics.density, 0);
  assert.strictEqual(analytics.degree.avgDegree, 0);
  assert.strictEqual(analytics.components.count, 0);
  assert.strictEqual(analytics.quality.sourceCoveragePercent, 0);
  console.log('✅ Test 1: Empty graph handled safely without NaN or errors');
}

// ─── Test 2: Single Node (no edges) ────────────────────────────────────────────
{
  const single = {
    entities: [{ id: 'a', name: 'Alpha', type: 'concept', sources: [{ documentId: 'doc1' }] }],
    relationships: [],
    documents: [{ id: 'doc1', name: 'Doc 1' }],
  };
  const analytics = deriveGraphAnalytics(single);
  assert.strictEqual(analytics.isEmpty, false);
  assert.strictEqual(analytics.core.entitiesCount, 1);
  assert.strictEqual(analytics.density, 0); // V=1 -> 0
  assert.strictEqual(analytics.degree.avgDegree, 0);
  assert.strictEqual(analytics.degree.isolatedCount, 1);
  assert.strictEqual(analytics.components.count, 1);
  assert.strictEqual(analytics.quality.sourceCoveragePercent, 100);
  console.log('✅ Test 2: Single node graph handled correctly');
}

// ─── Test 3: Disconnected Components ───────────────────────────────────────────
{
  // Component 1: A - B
  // Component 2: C - D - E
  // Isolated: F
  const graph = {
    entities: [
      { id: 'a', name: 'A', type: 'person' },
      { id: 'b', name: 'B', type: 'person' },
      { id: 'c', name: 'C', type: 'place' },
      { id: 'd', name: 'D', type: 'place' },
      { id: 'e', name: 'E', type: 'place' },
      { id: 'f', name: 'F', type: 'concept' },
    ],
    relationships: [
      { source: 'a', target: 'b', relation: 'knows' },
      { source: 'c', target: 'd', relation: 'near' },
      { source: 'd', target: 'e', relation: 'near' },
    ],
    documents: [],
  };
  const analytics = deriveGraphAnalytics(graph);
  assert.strictEqual(analytics.components.count, 3);
  assert.strictEqual(analytics.components.largestComponentSize, 3); // C, D, E
  assert.strictEqual(analytics.degree.isolatedCount, 1); // F
  assert.strictEqual(analytics.degree.isolatedEntities[0].id, 'f');
  // Density: V=6, max edges = 6*5/2 = 15. E = 3. density = 3/15 = 0.2
  assert.strictEqual(analytics.density, 0.2);
  console.log('✅ Test 3: Disconnected components & isolated nodes verified');
}

// ─── Test 4: Density with Multi-edges & Conflicts ──────────────────────────────
{
  // A and B have 2 relationships (multi-edge/conflict)
  const graph = {
    entities: [
      { id: 'a', name: 'A', type: 'team', sources: [{ documentId: 'd1' }] },
      { id: 'b', name: 'B', type: 'resource', sources: [{ documentId: 'd1' }, { documentId: 'd2' }] },
    ],
    relationships: [
      { source: 'a', target: 'b', relation: 'funded_at_$120k', isConflict: true },
      { source: 'a', target: 'b', relation: 'funded_at_$180k', isConflict: true },
    ],
    documents: [{ id: 'd1', name: 'D1' }, { id: 'd2', name: 'D2' }],
    conflicts: [{ entities: ['a', 'b'], description: 'Budget conflict' }],
  };
  const analytics = deriveGraphAnalytics(graph);
  // V=2, max edges = 1. Unique pair = {a::b}. Density = 1.0 (not 2.0!)
  assert.strictEqual(analytics.density, 1);
  assert.strictEqual(analytics.quality.conflictsCount, 1);
  assert.strictEqual(analytics.quality.sourceCoveragePercent, 100);
  assert.strictEqual(analytics.quality.avgSourcesPerEntity, 1.5);
  console.log('✅ Test 4: Density properly deduplicates multi-edges and tracks conflicts');
}

// ─── Test 5: Contextual Analytics for Selected Node ────────────────────────────
{
  const graph = {
    entities: [
      { id: 'sarah', name: 'Sarah Jenkins', type: 'person', description: 'Lead', sources: [{ documentId: 'doc_alpha' }] },
      { id: 'alpha', name: 'Project Alpha', type: 'team' },
      { id: 'summit', name: 'Tech Summit', type: 'event' },
    ],
    relationships: [
      { source: 'sarah', target: 'alpha', relation: 'leads', confidence: 'high' },
      { source: 'sarah', target: 'summit', relation: 'attending', confidence: 'medium' },
    ],
    documents: [{ id: 'doc_alpha', name: 'Charter.md' }],
  };
  const ctx = deriveContextualAnalytics('sarah', graph.entities, graph.relationships, graph.documents, []);
  assert.strictEqual(ctx.name, 'Sarah Jenkins');
  assert.strictEqual(ctx.degree, 2);
  assert.strictEqual(ctx.outgoingCount, 2);
  assert.strictEqual(ctx.neighbors.length, 2);
  assert.strictEqual(ctx.sources.length, 1);
  console.log('✅ Test 5: Contextual node analytics verified');
}

console.log('\n🎉 ALL ANALYTICS TESTS PASSED!\n');
