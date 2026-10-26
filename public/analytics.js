/**
 * GraphMind — Knowledge Graph Analytics Engine
 * Pure functions deriving structural, quality, and contextual metrics
 * directly from live graph and document state (single source of truth).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GraphAnalytics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /**
   * Derive all analytics metrics from the live graph and documents.
   * @param {Object} graph - { entities: Array, relationships: Array, documents: Array, conflicts: Array }
   * @param {string|null} selectedNodeId - optional ID of currently selected entity
   * @returns {Object} Complete derived analytics report
   */
  function deriveGraphAnalytics(graph, selectedNodeId = null) {
    const entities = Array.isArray(graph?.entities) ? graph.entities : [];
    const relationships = Array.isArray(graph?.relationships) ? graph.relationships : [];
    const documents = Array.isArray(graph?.documents) ? graph.documents : [];
    const conflicts = Array.isArray(graph?.conflicts) ? graph.conflicts : [];

    const core = calculateCoreCounts(entities, relationships, documents);
    const entityDist = calculateEntityDistribution(entities);
    const relDist = calculateRelationshipDistribution(relationships);
    const degreeStats = calculateDegreeStatistics(entities, relationships);
    const components = calculateConnectedComponents(entities, relationships);
    const density = calculateGraphDensity(entities, relationships);
    const quality = deriveKnowledgeQuality(entities, relationships, documents, conflicts);
    const contextual = selectedNodeId ? deriveContextualAnalytics(selectedNodeId, entities, relationships, documents, conflicts) : null;

    return {
      core,
      entityDistribution: entityDist,
      relationshipDistribution: relDist,
      degree: degreeStats,
      components,
      density,
      quality,
      contextual,
      isEmpty: entities.length === 0,
    };
  }

  /**
   * Core counts
   */
  function calculateCoreCounts(entities, relationships, documents) {
    return {
      documentsCount: documents.length,
      entitiesCount: entities.length,
      relationshipsCount: relationships.length,
    };
  }

  /**
   * Entity distribution by type
   */
  function calculateEntityDistribution(entities) {
    const counts = {};
    const total = entities.length;

    entities.forEach(e => {
      const type = (e.type || 'unknown').toLowerCase();
      counts[type] = (counts[type] || 0) + 1;
    });

    const breakdown = Object.entries(counts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      uniqueTypesCount: Object.keys(counts).length,
      breakdown,
    };
  }

  /**
   * Relationship distribution by relation verb & confidence
   */
  function calculateRelationshipDistribution(relationships) {
    const relationCounts = {};
    const confidenceCounts = { high: 0, medium: 0, low: 0 };
    const total = relationships.length;

    relationships.forEach(r => {
      const rel = r.relation || 'related_to';
      relationCounts[rel] = (relationCounts[rel] || 0) + 1;

      const conf = (r.confidence || 'medium').toLowerCase();
      if (confidenceCounts[conf] !== undefined) {
        confidenceCounts[conf]++;
      } else {
        confidenceCounts.medium++;
      }
    });

    const topRelations = Object.entries(relationCounts)
      .map(([relation, count]) => ({
        relation,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      uniqueRelationTypesCount: Object.keys(relationCounts).length,
      topRelations,
      confidenceBreakdown: {
        high: confidenceCounts.high,
        medium: confidenceCounts.medium,
        low: confidenceCounts.low,
      },
    };
  }

  /**
   * Node degrees, hubs, and isolated entities
   */
  function calculateDegreeStatistics(entities, relationships) {
    const degrees = new Map();
    const inDegrees = new Map();
    const outDegrees = new Map();

    entities.forEach(e => {
      degrees.set(e.id, 0);
      inDegrees.set(e.id, 0);
      outDegrees.set(e.id, 0);
    });

    relationships.forEach(r => {
      if (outDegrees.has(r.source)) {
        outDegrees.set(r.source, outDegrees.get(r.source) + 1);
        degrees.set(r.source, degrees.get(r.source) + 1);
      }
      if (inDegrees.has(r.target)) {
        inDegrees.set(r.target, inDegrees.get(r.target) + 1);
        degrees.set(r.target, degrees.get(r.target) + 1);
      }
    });

    const degreeValues = Array.from(degrees.values());
    const totalDegree = degreeValues.reduce((sum, d) => sum + d, 0);
    const n = entities.length;
    const avgDegree = n > 0 ? Math.round((totalDegree / n) * 10) / 10 : 0;
    const maxDegree = degreeValues.length > 0 ? Math.max(...degreeValues) : 0;

    const isolatedEntities = entities
      .filter(e => (degrees.get(e.id) || 0) === 0)
      .map(e => ({ id: e.id, name: e.name, type: e.type }));

    // Top connected hubs
    const entityDegreeList = entities.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      degree: degrees.get(e.id) || 0,
      inDegree: inDegrees.get(e.id) || 0,
      outDegree: outDegrees.get(e.id) || 0,
    })).sort((a, b) => b.degree - a.degree);

    return {
      avgDegree,
      maxDegree,
      isolatedCount: isolatedEntities.length,
      isolatedEntities,
      topHubs: entityDegreeList.slice(0, 5),
    };
  }

  /**
   * Connected components using BFS
   */
  function calculateConnectedComponents(entities, relationships) {
    if (entities.length === 0) {
      return { count: 0, largestComponentSize: 0, componentSizes: [] };
    }

    const adj = new Map();
    entities.forEach(e => adj.set(e.id, []));

    relationships.forEach(r => {
      if (adj.has(r.source) && adj.has(r.target)) {
        adj.get(r.source).push(r.target);
        adj.get(r.target).push(r.source);
      }
    });

    const visited = new Set();
    const componentSizes = [];

    entities.forEach(e => {
      if (!visited.has(e.id)) {
        let size = 0;
        const queue = [e.id];
        visited.add(e.id);

        while (queue.length > 0) {
          const curr = queue.shift();
          size++;
          const neighbors = adj.get(curr) || [];
          for (const nbr of neighbors) {
            if (!visited.has(nbr)) {
              visited.add(nbr);
              queue.push(nbr);
            }
          }
        }
        componentSizes.push(size);
      }
    });

    componentSizes.sort((a, b) => b - a);
    return {
      count: componentSizes.length,
      largestComponentSize: componentSizes[0] || 0,
      componentSizes,
    };
  }

  /**
   * Graph density for simple graph: 2E / (V * (V - 1))
   * Deduplicates undirected multi-edges and excludes self-loops for density standard.
   */
  function calculateGraphDensity(entities, relationships) {
    const v = entities.length;
    if (v <= 1) return 0;

    // Deduplicate distinct pairs of connected nodes (excluding self-loops)
    const uniquePairs = new Set();
    relationships.forEach(r => {
      if (r.source && r.target && r.source !== r.target) {
        const key = [r.source, r.target].sort().join('::');
        uniquePairs.add(key);
      }
    });

    const e = uniquePairs.size;
    const maxEdges = (v * (v - 1)) / 2;
    if (maxEdges === 0) return 0;

    const density = e / maxEdges;
    return Math.round(density * 1000) / 1000; // e.g. 0.182
  }

  /**
   * Knowledge Quality: conflicts & document source coverage
   */
  function deriveKnowledgeQuality(entities, relationships, documents, conflicts) {
    // Entities with at least 1 document source citation
    let entitiesWithSources = 0;
    let totalSourcesCount = 0;

    entities.forEach(e => {
      const srcCount = Array.isArray(e.sources) ? e.sources.length : 0;
      if (srcCount > 0) entitiesWithSources++;
      totalSourcesCount += srcCount;
    });

    const n = entities.length;
    const sourceCoveragePercent = n > 0 ? Math.round((entitiesWithSources / n) * 100) : 0;
    const avgSourcesPerEntity = n > 0 ? Math.round((totalSourcesCount / n) * 10) / 10 : 0;

    // Direct conflict detection (either in conflicts array or flagged edges)
    const conflictEdgesCount = relationships.filter(r => r.isConflict).length;
    const conflictCount = conflicts.length || (conflictEdgesCount > 0 ? Math.ceil(conflictEdgesCount / 2) : 0);

    return {
      conflictsCount: conflictCount,
      conflictsList: conflicts,
      sourceCoveragePercent,
      avgSourcesPerEntity,
      entitiesWithSources,
    };
  }

  /**
   * Contextual analytics for a selected entity
   */
  function deriveContextualAnalytics(selectedNodeId, entities, relationships, documents, conflicts) {
    const entity = entities.find(e => e.id === selectedNodeId);
    if (!entity) return null;

    const incidentRels = relationships.filter(r => r.source === selectedNodeId || r.target === selectedNodeId);
    const neighborsMap = new Map();

    incidentRels.forEach(r => {
      const isOut = r.source === selectedNodeId;
      const otherId = isOut ? r.target : r.source;
      const otherEntity = entities.find(e => e.id === otherId);

      if (!neighborsMap.has(otherId)) {
        neighborsMap.set(otherId, {
          id: otherId,
          name: otherEntity?.name || otherId,
          type: otherEntity?.type || 'unknown',
          relations: [],
        });
      }

      neighborsMap.get(otherId).relations.push({
        relation: r.relation,
        direction: isOut ? 'outgoing' : 'incoming',
        confidence: r.confidence || 'medium',
        isConflict: Boolean(r.isConflict),
        sourceText: r.sourceText,
      });
    });

    const nodeConflicts = conflicts.filter(c =>
      Array.isArray(c.entities) && c.entities.includes(selectedNodeId)
    );

    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      degree: incidentRels.length,
      incomingCount: incidentRels.filter(r => r.target === selectedNodeId).length,
      outgoingCount: incidentRels.filter(r => r.source === selectedNodeId).length,
      neighbors: Array.from(neighborsMap.values()),
      sources: (entity.sources || []).map(s => {
        const doc = documents.find(d => d.id === s.documentId);
        return {
          documentId: s.documentId,
          documentName: doc?.name || s.documentId,
          quote: s.sourceText,
        };
      }),
      conflicts: nodeConflicts,
    };
  }

  return {
    deriveGraphAnalytics,
    calculateCoreCounts,
    calculateEntityDistribution,
    calculateRelationshipDistribution,
    calculateDegreeStatistics,
    calculateConnectedComponents,
    calculateGraphDensity,
    deriveKnowledgeQuality,
    deriveContextualAnalytics,
  };
});
