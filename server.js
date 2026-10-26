const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Environment Variables (Auto-load .env if present) ─────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (val) {
              process.env[key] = val;
            }
          }
        }
      });
    } catch (e) {
      console.warn('⚠️ Could not load .env file:', e.message);
    }
  }
}
loadEnv();

// ─── Config ────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB max

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Gemini Setup (Dynamic reload on each request) ───────────────────────────
function getGeminiModel() {
  loadEnv(); // Reload .env dynamically so user edits take effect immediately
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY=... in your .env file.');
  }
  const modelName = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

// ─── Rate Limiter (Free Tier: 15 RPM, 1M TPM) ─────────────────────────────────
class RateLimiter {
  constructor(maxRPM = 10) {
    this.maxRPM = maxRPM;
    this.timestamps = [];
    this.queue = [];
    this.processing = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this._process();
    });
  }

  async _process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      // Remove timestamps older than 60s
      this.timestamps = this.timestamps.filter(t => now - t < 60000);

      if (this.timestamps.length < this.maxRPM) {
        this.timestamps.push(now);
        const resolve = this.queue.shift();
        resolve();
      } else {
        // Wait until the oldest request expires
        const waitMs = 60000 - (now - this.timestamps[0]) + 100;
        console.log(`⏳ Rate limit: waiting ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
    this.processing = false;
  }
}

const rateLimiter = new RateLimiter(10); // Stay well under 15 RPM

async function callGemini(prompt, retries = 2) {
  const activeModel = getGeminiModel();
  await rateLimiter.acquire();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await activeModel.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (err.status === 429 && attempt < retries) {
        const backoff = (attempt + 1) * 15000; // 15s, 30s
        console.log(`⚠️ 429 rate limited, retrying in ${backoff / 1000}s...`);
        await new Promise(r => setTimeout(r, backoff));
      } else {
        throw err;
      }
    }
  }
}

function normalizeEntityName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^(dr\.|doctor|prof\.|professor|mr\.|mrs\.|ms\.)\s+/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ─── In-Memory Knowledge Graph ─────────────────────────────────────────────────
const knowledgeGraph = {
  entities: new Map(),   // id -> { id, name, type, description, sources: [] }
  relationships: [],     // { source, target, relation, confidence, sourceText, documentId }
  documents: new Map(),  // id -> { id, name, content, uploadedAt }

  addDocument(id, name, content) {
    this.documents.set(id, { id, name, content, uploadedAt: new Date().toISOString() });
  },

  addEntity(entity, documentId) {
    if (!entity || !entity.id) return null;

    // 1. Direct ID match
    let canonical = this.entities.get(entity.id);

    // 2. Normalized name match if not found by exact ID
    if (!canonical) {
      const normNew = normalizeEntityName(entity.name || entity.id);
      if (normNew.length > 2) {
        for (const [existingId, existing] of this.entities) {
          if (normalizeEntityName(existing.name) === normNew || normalizeEntityName(existingId) === normNew) {
            canonical = existing;
            break;
          }
        }
      }
    }

    if (canonical) {
      // Merge sources and description across documents
      canonical.sources.push({ documentId, sourceText: entity.sourceText || '' });
      if (entity.description && !canonical.description) {
        canonical.description = entity.description;
      }
      return canonical.id;
    } else {
      this.entities.set(entity.id, {
        id: entity.id,
        name: entity.name || entity.id,
        type: entity.type || 'unknown',
        description: entity.description || '',
        sources: [{ documentId, sourceText: entity.sourceText || '' }],
      });
      return entity.id;
    }
  },

  addRelationship(rel, documentId) {
    const isDup = this.relationships.some(r =>
      r.source === rel.source &&
      r.target === rel.target &&
      r.relation === rel.relation &&
      r.documentId === documentId
    );
    if (!isDup) {
      this.relationships.push({
        source: rel.source,
        target: rel.target,
        relation: rel.relation,
        confidence: rel.confidence || 'medium',
        sourceText: rel.sourceText || '',
        documentId,
      });
    }
  },

  // Find entities by fuzzy name match
  findEntities(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const [id, entity] of this.entities) {
      const name = entity.name.toLowerCase();
      if (name.includes(q) || q.includes(name) || this._similarity(name, q) > 0.5) {
        results.push(entity);
      }
    }
    return results;
  },

  // Get subgraph around entity IDs (BFS, 1-2 hops)
  getSubgraph(entityIds, maxHops = 2) {
    const visited = new Set(entityIds);
    const queue = entityIds.map(id => ({ id, hop: 0 }));
    const relevantRels = [];

    while (queue.length > 0) {
      const { id, hop } = queue.shift();
      if (hop >= maxHops) continue;

      for (const rel of this.relationships) {
        if (rel.source === id || rel.target === id) {
          relevantRels.push(rel);
          const neighbor = rel.source === id ? rel.target : rel.source;
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ id: neighbor, hop: hop + 1 });
          }
        }
      }
    }

    const entities = [];
    for (const id of visited) {
      const e = this.entities.get(id);
      if (e) entities.push(e);
    }

    return { entities, relationships: relevantRels };
  },

  // Shortest path between two entities (BFS, up to maxDepth hops)
  findPath(startId, endId, maxDepth = 6) {
    if (startId === endId) return [startId];
    const visited = new Set([startId]);
    const queue = [[startId]];

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      if (path.length > maxDepth) continue;

      for (const rel of this.relationships) {
        let neighbor = null;
        if (rel.source === current) neighbor = rel.target;
        else if (rel.target === current) neighbor = rel.source;

        if (neighbor) {
          if (neighbor === endId) {
            return [...path, endId];
          }
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push([...path, neighbor]);
          }
        }
      }
    }
    return null;
  },

  // Detect conflicting facts about same entity pair
  findConflicts(entityIds) {
    const conflicts = [];
    const pairMap = new Map();

    for (const rel of this.relationships) {
      if (entityIds.includes(rel.source) || entityIds.includes(rel.target)) {
        const key = [rel.source, rel.target].sort().join('::');
        if (!pairMap.has(key)) pairMap.set(key, []);
        pairMap.get(key).push(rel);
      }
    }

    for (const [key, rels] of pairMap) {
      if (rels.length > 1) {
        const relations = new Set(rels.map(r => r.relation));
        if (relations.size > 1) {
          conflicts.push({
            entities: key.split('::'),
            claims: rels.map(r => ({
              relation: r.relation,
              sourceText: r.sourceText,
              document: this.documents.get(r.documentId)?.name || r.documentId,
            })),
          });
        }
      }
    }
    return conflicts;
  },

  // Simple string similarity (Jaccard on character bigrams)
  _similarity(a, b) {
    const bigrams = (s) => {
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };
    const setA = bigrams(a);
    const setB = bigrams(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  },

  // Export for visualization with conflict annotations
  toJSON() {
    const pairMap = new Map();
    for (const rel of this.relationships) {
      const key = [rel.source, rel.target].sort().join('::');
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key).push(rel);
    }

    const conflictKeys = new Set();
    const allConflicts = [];
    for (const [key, rels] of pairMap) {
      if (rels.length > 1) {
        const relations = new Set(rels.map(r => r.relation));
        if (relations.size > 1) {
          conflictKeys.add(key);
          allConflicts.push({
            entities: key.split('::'),
            claims: rels.map(r => ({
              relation: r.relation,
              sourceText: r.sourceText,
              document: this.documents.get(r.documentId)?.name || r.documentId,
            })),
          });
        }
      }
    }

    const annotatedRels = this.relationships.map(rel => {
      const key = [rel.source, rel.target].sort().join('::');
      return {
        ...rel,
        isConflict: conflictKeys.has(key),
      };
    });

    return {
      entities: Array.from(this.entities.values()),
      relationships: annotatedRels,
      documents: Array.from(this.documents.values()),
      conflicts: allConflicts,
    };
  },

  // Remove single document and prune exclusive entities and relationships
  removeDocument(documentId) {
    let targetId = documentId;
    let docName = documentId;

    // 1. Direct match in documents map
    if (this.documents.has(targetId)) {
      docName = this.documents.get(targetId)?.name || targetId;
      this.documents.delete(targetId);
    } else {
      // 2. Try URI decoding
      let decoded = targetId;
      try { decoded = decodeURIComponent(targetId); } catch (e) {}
      if (this.documents.has(decoded)) {
        targetId = decoded;
        docName = this.documents.get(targetId)?.name || targetId;
        this.documents.delete(targetId);
      } else {
        // 3. Try finding by name or matching ID case-insensitively
        for (const [id, doc] of this.documents.entries()) {
          if (doc.id === targetId || doc.id === decoded ||
              doc.name === targetId || doc.name === decoded ||
              doc.id.toLowerCase() === String(targetId).toLowerCase()) {
            targetId = id;
            docName = doc.name;
            this.documents.delete(id);
            break;
          }
        }
      }
    }

    // Set of identifiers to match against relationships and sources
    let decodedId = null;
    try { decodedId = decodeURIComponent(documentId); } catch (e) {}
    const matchingIdentifiers = new Set([documentId, targetId, docName, decodedId].filter(Boolean));

    // Remove relationships that came from this document
    this.relationships = this.relationships.filter(r => !matchingIdentifiers.has(r.documentId));

    // Prune document from entities' sources
    const entitiesToRemove = [];
    for (const [id, entity] of this.entities) {
      entity.sources = (entity.sources || []).filter(s => !matchingIdentifiers.has(s.documentId));
      if (entity.sources.length === 0) {
        entitiesToRemove.push(id);
      }
    }

    // Delete entities with no remaining sources
    for (const id of entitiesToRemove) {
      this.entities.delete(id);
    }

    // Clean up any relationships whose endpoints no longer exist
    this.relationships = this.relationships.filter(r =>
      this.entities.has(r.source) && this.entities.has(r.target)
    );

    return { removedName: docName, remainingDocuments: this.documents.size };
  },

  // Clear everything
  clear() {
    this.entities.clear();
    this.relationships = [];
    this.documents.clear();
  }
};

// ─── Text Chunking for Long Documents ──────────────────────────────────────────
function chunkText(text, maxChunkSize = 25000, overlap = 1500) {
  if (text.length <= maxChunkSize) return [text];

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    if (endIndex < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', endIndex);
      const lastSentence = text.lastIndexOf('. ', endIndex);
      if (lastParagraph > startIndex + maxChunkSize * 0.6) {
        endIndex = lastParagraph + 2;
      } else if (lastSentence > startIndex + maxChunkSize * 0.6) {
        endIndex = lastSentence + 2;
      }
    } else {
      endIndex = text.length;
    }

    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk) chunks.push(chunk);

    if (endIndex >= text.length) break;
    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }
  return chunks;
}

// ─── Extraction Prompt ─────────────────────────────────────────────────────────
function buildExtractionPrompt(text, documentName, existingEntities = []) {
  const existingSection = (existingEntities && existingEntities.length > 0)
    ? `\nEXISTING ENTITIES ALREADY IN KNOWLEDGE GRAPH (Reuse these exact IDs when mentioned):
${existingEntities.slice(0, 40).map(e => `- ID: "${e.id}", Name: "${e.name}" (${e.type})`).join('\n')}\n`
    : '';

  return `You are an entity and relationship extractor. Analyze this document and extract ALL entities (people, teams, organizations, events, places, resources, concepts) and their relationships.

DOCUMENT NAME: "${documentName}"
${existingSection}DOCUMENT TEXT:
"""
${text.slice(0, 35000)}
"""

Respond ONLY with valid JSON matching this exact schema (no markdown, no explanation):
{
  "entities": [
    {
      "id": "lowercase_snake_case_unique_id",
      "name": "Display Name",
      "type": "person|organization|team|event|place|resource|concept",
      "description": "Brief description from the text",
      "sourceText": "Exact quote from document that mentions this entity"
    }
  ],
  "relationships": [
    {
      "source": "entity_id_1",
      "target": "entity_id_2",
      "relation": "verb_phrase_describing_relationship",
      "confidence": "high|medium|low",
      "sourceText": "Exact quote from document supporting this relationship"
    }
  ]
}

RULES:
- Entity IDs must be lowercase_snake_case
- IMPORTANT CROSS-DOCUMENT LINKING: If the text refers to any entity in the EXISTING ENTITIES list, you MUST use that entity's exact ID so relationships connect to the existing graph!
- Every relationship source/target MUST reference an entity ID from your entities list or the EXISTING ENTITIES list
- sourceText must be EXACT quotes from the document, not paraphrased
- Only extract relationships explicitly stated or strongly implied in the text
- Do NOT fabricate or infer relationships not supported by the text
- Confidence: high = explicitly stated, medium = strongly implied, low = weakly implied`;
}

// ─── Q&A Prompt ────────────────────────────────────────────────────────────────
function buildQAPrompt(question, subgraph, conflicts) {
  const relFacts = subgraph.relationships.map(r => {
    const srcEntity = subgraph.entities.find(e => e.id === r.source);
    const tgtEntity = subgraph.entities.find(e => e.id === r.target);
    const docName = knowledgeGraph.documents.get(r.documentId)?.name || 'unknown';
    return `- ${srcEntity?.name || r.source} --[${r.relation}]--> ${tgtEntity?.name || r.target} (Source: "${r.sourceText}" from ${docName}) [confidence: ${r.confidence}]`;
  });

  // Entities with sources & descriptions (grounded evidence for each entity)
  const entitiesText = subgraph.entities.map(e => {
    const sourcesList = (e.sources || []).map(s => {
      const docName = knowledgeGraph.documents.get(s.documentId)?.name || s.documentId;
      return `"${docName}"${s.sourceText ? ` (Quote: "${s.sourceText}")` : ''}`;
    }).join('; ');
    return `- ${e.name} (${e.type}): ${e.description || 'No description'}${sourcesList ? ` | Sources: ${sourcesList}` : ''}`;
  }).join('\n');

  // Grounded facts for entities without outgoing/incoming relationships in this subgraph
  const entitiesWithRels = new Set();
  subgraph.relationships.forEach(r => {
    entitiesWithRels.add(r.source);
    entitiesWithRels.add(r.target);
  });

  const entityFacts = subgraph.entities
    .filter(e => !entitiesWithRels.has(e.id))
    .map(e => {
      const srcText = (e.sources || []).map(s => {
        const docName = knowledgeGraph.documents.get(s.documentId)?.name || s.documentId;
        return `documented in "${docName}"${s.sourceText ? ` ("${s.sourceText}")` : ''}`;
      }).join(', ');
      return `- ${e.name} (${e.type}) is ${srcText || 'present in the knowledge graph'}. (Note: It has no direct relationship edges to other entities currently mapped).`;
    });

  const allFacts = [...relFacts, ...entityFacts];
  const factsText = allFacts.join('\n');

  const conflictsText = conflicts.length > 0
    ? `\n\nCONFLICTING FACTS DETECTED:\n${conflicts.map(c =>
        `Entities: ${c.entities.join(' & ')}\n${c.claims.map(cl =>
          `  - "${cl.relation}" (from ${cl.document}): "${cl.sourceText}"`
        ).join('\n')}`
      ).join('\n\n')}`
    : '';

  return `You are a knowledge graph Q&A assistant. Answer the question using ONLY the facts provided below. Do NOT use any outside knowledge.

KNOWN ENTITIES & THEIR SOURCES:
${entitiesText || 'None found relevant.'}

KNOWN FACTS (from the knowledge graph):
${factsText || 'No relevant facts found.'}
${conflictsText}

QUESTION: "${question}"

RULES:
1. Answer ONLY from the facts and entity sources provided above. If the facts don't contain enough info to answer the question, say "I cannot answer this based on the available documents."
2. For EVERY claim in your answer, cite the source document and quote the supporting text.
3. If asked about an entity that has no relationships, explain what the entity is based on its description and source documents, and note that it has no direct relationship connections in the graph.
4. If there are CONFLICTING facts, present ALL sides with their sources. Do not pick one.
5. For multi-hop questions (A relates to B, B relates to C, therefore A connects to C), explicitly trace the path.
6. NEVER fabricate information. If unsure, say so.

Respond with valid JSON:
{
  "answer": "Your grounded answer here with inline citations",
  "citations": [
    {"fact": "specific claim", "source": "document name", "quote": "exact supporting quote"}
  ],
  "confidence": "high|medium|low|unsupported",
  "conflicts": [
    {"description": "what conflicts", "sides": ["claim1 from doc1", "claim2 from doc2"]}
  ],
  "reasoning_path": ["Entity A", "→ relation →", "Entity B", "→ relation →", "Entity C"]
}`;
}

// ─── Parse PDF ─────────────────────────────────────────────────────────────────
async function parsePDF(buffer) {
  const pdfModule = require('pdf-parse');
  // Handle pdf-parse v2 (Class PDFParse)
  if (pdfModule && pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      if (typeof parser.destroy === 'function') {
        try { await parser.destroy(); } catch (_) {}
      }
    }
  }
  // Handle pdf-parse v1 (Callable function)
  if (typeof pdfModule === 'function') {
    const data = await pdfModule(buffer);
    return data.text || '';
  }
  if (pdfModule.default && typeof pdfModule.default === 'function') {
    const data = await pdfModule.default(buffer);
    return data.text || '';
  }
  throw new Error('Unsupported pdf-parse module export format');
}

// ─── API Routes ────────────────────────────────────────────────────────────────

// Upload document and extract entities
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    let text = '';
    let docName = '';

    if (req.file) {
      docName = req.file.originalname;
      const lowerName = (docName || '').toLowerCase();
      const isPdf =
        req.file.mimetype === 'application/pdf' ||
        req.file.mimetype === 'application/x-pdf' ||
        lowerName.endsWith('.pdf') ||
        (req.file.buffer && req.file.buffer.slice(0, 4).toString() === '%PDF');

      const isTxt = lowerName.endsWith('.txt') || req.file.mimetype === 'text/plain';
      const isMd = lowerName.endsWith('.md') || lowerName.endsWith('.markdown');

      if (!isPdf && !isTxt && !isMd) {
        return res.status(400).json({ error: `Unsupported file type for "${docName}". Only .pdf, .txt, and .md files are supported.` });
      }

      if (isPdf) {
        text = await parsePDF(req.file.buffer);
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
      docName = req.body.name || `Document ${knowledgeGraph.documents.size + 1}`;
    } else {
      return res.status(400).json({ error: 'No file or text provided' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'Document is empty' });
    }

    const docId = `doc_${Date.now()}`;
    knowledgeGraph.addDocument(docId, docName, text);

    // Extract entities & relationships via Gemini (chunk-aware for long documents)
    const chunks = chunkText(text, 25000, 1500);
    const maxChunks = Math.min(chunks.length, 6); // Up to ~150,000 chars (~60 pages)
    console.log(`📄 Ingesting "${docName}" (${text.length} chars in ${chunks.length} chunk${chunks.length > 1 ? 's' : ''})...`);

    let entityCount = 0;
    let relCount = 0;

    for (let i = 0; i < maxChunks; i++) {
      const chunk = chunks[i];
      const chunkLabel = chunks.length > 1 ? `${docName} (Part ${i + 1}/${chunks.length})` : docName;
      if (chunks.length > 1) {
        console.log(`🔍 Extracting chunk ${i + 1}/${maxChunks} (${chunk.length} chars)...`);
      }

      // Provide known entities so Gemini connects relationships across documents
      const knownEntities = Array.from(knowledgeGraph.entities.values()).map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
      }));

      const prompt = buildExtractionPrompt(chunk, chunkLabel, knownEntities);
      try {
        const response = await callGemini(prompt);
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const extracted = JSON.parse(cleaned);

        const idMap = new Map();
        for (const entity of (extracted.entities || [])) {
          const canonicalId = knowledgeGraph.addEntity(entity, docId);
          if (canonicalId) {
            idMap.set(entity.id, canonicalId);
            entityCount++;
          }
        }
        for (const rel of (extracted.relationships || [])) {
          const resolvedSource = idMap.get(rel.source) || rel.source;
          const resolvedTarget = idMap.get(rel.target) || rel.target;
          if (knowledgeGraph.entities.has(resolvedSource) && knowledgeGraph.entities.has(resolvedTarget)) {
            knowledgeGraph.addRelationship({
              ...rel,
              source: resolvedSource,
              target: resolvedTarget,
            }, docId);
            relCount++;
          }
        }
      } catch (chunkErr) {
        console.error(`Extraction failed on chunk ${i + 1}:`, chunkErr.message);
      }
    }

    console.log(`✅ Extracted ${entityCount} entities, ${relCount} relationships`);

    res.json({
      success: true,
      documentId: docId,
      documentName: docName,
      extracted: { entities: entityCount, relationships: relCount },
      graph: knowledgeGraph.toJSON(),
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

// Get current graph
app.get('/api/graph', (req, res) => {
  res.json(knowledgeGraph.toJSON());
});

// Ask a question
app.post('/api/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: 'No question provided' });
    }

    if (knowledgeGraph.entities.size === 0) {
      return res.json({
        answer: 'No documents have been uploaded yet. Please upload some documents first.',
        citations: [],
        confidence: 'unsupported',
        conflicts: [],
        reasoning_path: [],
      });
    }

    // Find relevant entities from the question:
    // 1. Direct name match (e.g. "What role does Phase 1 — Scaffold & Backend play...")
    const qLower = question.toLowerCase();
    const matchedEntities = new Set();

    for (const [id, entity] of knowledgeGraph.entities) {
      const name = (entity.name || '').toLowerCase();
      if (name && name.length >= 2 && qLower.includes(name)) {
        matchedEntities.add(id);
      }
    }

    // 2. If no direct name matches, match by significant keywords (>3 letters, ignoring common stop words)
    if (matchedEntities.size === 0) {
      const stopWords = new Set(['what', 'does', 'play', 'role', 'what', 'are', 'its', 'their', 'which', 'where', 'when', 'from', 'with', 'about', 'describe', 'relationships', 'sources', 'explain', 'show', 'tell']);
      const words = question.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
      for (const word of words) {
        for (const [id, entity] of knowledgeGraph.entities) {
          const name = entity.name.toLowerCase();
          if (name.includes(word) || word.includes(name) || knowledgeGraph._similarity(name, word) > 0.4) {
            matchedEntities.add(id);
          }
        }
      }
    }

    // If no specific entities matched, use all entities (small graph)
    let entityIds = Array.from(matchedEntities);
    if (entityIds.length === 0) {
      entityIds = Array.from(knowledgeGraph.entities.keys()).slice(0, 20);
    } else if (entityIds.length >= 2) {
      // Find hidden 3rd-party intermediary bridges between mentioned topics
      const bridgeNodes = new Set(entityIds);
      for (let i = 0; i < entityIds.length; i++) {
        for (let j = i + 1; j < entityIds.length; j++) {
          const path = knowledgeGraph.findPath(entityIds[i], entityIds[j], 6);
          if (path && path.length > 2) {
            path.forEach(nodeId => bridgeNodes.add(nodeId));
          }
        }
      }
      entityIds = Array.from(bridgeNodes);
    }

    // Get subgraph with 2-hop neighborhood around all entities and intermediary bridges
    const subgraph = knowledgeGraph.getSubgraph(entityIds, 2);
    const conflicts = knowledgeGraph.findConflicts(entityIds);

    // Build prompt and query Gemini
    const prompt = buildQAPrompt(question, subgraph, conflicts);
    const response = await callGemini(prompt);

    // Parse response
    let answer;
    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      answer = JSON.parse(cleaned);
    } catch (parseErr) {
      // If JSON parse fails, return the raw text as the answer
      answer = {
        answer: response,
        citations: [],
        confidence: 'medium',
        conflicts: [],
        reasoning_path: [],
      };
    }

    // Automatically match entity IDs involved in the reasoning path, citations, or answer text
    const highlightNodeIds = new Set();
    const textPool = [
      ...(Array.isArray(answer.reasoning_path) ? answer.reasoning_path : []),
      ...(Array.isArray(answer.citations) ? answer.citations.map(c => `${c.fact || ''} ${c.quote || ''}`) : []),
      typeof answer.answer === 'string' ? answer.answer : ''
    ].join(' ').toLowerCase();

    for (const [id, entity] of knowledgeGraph.entities) {
      const eName = (entity.name || '').toLowerCase();
      if (eName && eName.length > 2 && textPool.includes(eName)) {
        highlightNodeIds.add(id);
      }
    }
    answer.highlight_nodes = Array.from(highlightNodeIds);

    res.json(answer);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message || 'Query failed' });
  }
});

// ─── Executive Synthesis Briefing ──────────────────────────────────────────────
app.get('/api/summary', async (req, res) => {
  try {
    if (knowledgeGraph.entities.size === 0) {
      return res.json({
        success: false,
        message: 'No documents or graph in memory yet. Please upload documents or load the demo dataset first.',
        summary: '# Executive Briefing\n\nNo documents have been loaded into the knowledge graph yet.'
      });
    }

    const graphData = knowledgeGraph.toJSON();
    const docNames = graphData.documents.map(d => d.name).join(', ') || 'Uploaded Documents';

    // Calculate top hubs by degree (most connected entities)
    const degreeMap = new Map();
    for (const rel of graphData.relationships) {
      degreeMap.set(rel.source, (degreeMap.get(rel.source) || 0) + 1);
      degreeMap.set(rel.target, (degreeMap.get(rel.target) || 0) + 1);
    }
    const topHubs = Array.from(degreeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, degree]) => {
        const entity = knowledgeGraph.entities.get(id);
        return `${entity?.name || id} (${entity?.type || 'entity'}, ${degree} connections)`;
      });

    const prompt = `You are a strategic intelligence analyst and enterprise knowledge auditor.
Analyze the following multi-document knowledge graph and provide a high-impact, professional Executive Intelligence Briefing in clean GitHub-flavored Markdown.

GRAPH METRICS:
- Ingested Documents (${graphData.documents.length}): ${docNames}
- Total Extracted Entities: ${graphData.entities.length}
- Total Relationships: ${graphData.relationships.length}
- Central Knowledge Hubs: ${topHubs.join('; ') || 'None identified'}

CROSS-DOCUMENT CONFLICTS DETECTED (${graphData.conflicts.length}):
${graphData.conflicts.length > 0 ? JSON.stringify(graphData.conflicts, null, 2) : 'No direct factual conflicts detected across ingested documents.'}

CORE ENTITIES & RELATIONSHIPS SAMPLE:
${graphData.relationships.slice(0, 30).map(r => {
  const s = knowledgeGraph.entities.get(r.source)?.name || r.source;
  const t = knowledgeGraph.entities.get(r.target)?.name || r.target;
  return `- ${s} -> [${r.relation}] -> ${t} (Source: ${knowledgeGraph.documents.get(r.documentId)?.name || 'doc'})`;
}).join('\n')}

Format your briefing with these exact Markdown headers:
# 📊 Executive Intelligence Briefing

## 1. Domain & Knowledge Landscape Overview
(2-3 sentences summarizing the scope and domain covered by the documents)

## 2. Key Operational Hubs & Central Figures
(Bullet points detailing the most influential entities and their role in the ecosystem)

## 3. Critical Contradictions & Audit Discrepancies
(Detailed breakdown of any cross-document contradictions with citations, or explicit confirmation of cross-document consistency)

## 4. Risk Assessment & Strategic Blind Spots
(Vulnerabilities, single points of failure, or ungrounded areas in the knowledge graph)

## 5. Strategic Recommendations
(3-4 prioritized, actionable bullet points for decision-makers)

Respond ONLY with the Markdown content. Do not enclose in json.`;

    const response = await callGemini(prompt);
    const cleanedMarkdown = response.replace(/^```markdown\n?/i, '').replace(/```\n?$/i, '').trim();

    res.json({
      success: true,
      summary: cleanedMarkdown,
      stats: {
        documents: graphData.documents.length,
        entities: graphData.entities.length,
        relationships: graphData.relationships.length,
        conflicts: graphData.conflicts.length,
        topHubs
      }
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate briefing' });
  }
});

// ─── Export Knowledge Graph ───────────────────────────────────────────────────
app.get('/api/export', (req, res) => {
  try {
    const exportPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      ...knowledgeGraph.toJSON()
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="graphmind_knowledge_graph.json"');
    res.send(JSON.stringify(exportPayload, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

// ─── Import Knowledge Graph ───────────────────────────────────────────────────
app.post('/api/import', (req, res) => {
  try {
    const data = req.body;
    if (!data || (!data.entities && !data.relationships)) {
      return res.status(400).json({ error: 'Invalid graph format. Expected entities and relationships.' });
    }

    knowledgeGraph.clear();

    if (Array.isArray(data.documents)) {
      data.documents.forEach(doc => {
        knowledgeGraph.addDocument(doc.id, doc.name, doc.content || '');
      });
    }

    if (Array.isArray(data.entities)) {
      data.entities.forEach(ent => {
        knowledgeGraph.addEntity(ent, ent.documentId || 'imported_doc');
      });
    }

    if (Array.isArray(data.relationships)) {
      data.relationships.forEach(rel => {
        knowledgeGraph.addRelationship(rel, rel.documentId || 'imported_doc');
      });
    }

    res.json({
      success: true,
      message: 'Graph imported successfully',
      imported: {
        documents: knowledgeGraph.documents.size,
        entities: knowledgeGraph.entities.size,
        relationships: knowledgeGraph.relationships.length
      },
      graph: knowledgeGraph.toJSON()
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// ─── 1-Click Judge-Proof Demo Scenario ─────────────────────────────────────────
app.post('/api/demo', (req, res) => {
  knowledgeGraph.clear();

  const doc1Id = 'doc_alpha_charter';
  const doc1Name = 'Project Alpha Charter.md';
  const doc1Content = `Project Alpha is led by Sarah Jenkins, who acts as Team Lead.
Engineering Alpha is the primary unit executing Project Alpha and is allocated the Apollo Computing Cluster for intensive AI simulation workloads.
The Apollo Computing Cluster is physically housed in Server Room 4B within the Zurich Data Facility.
According to the initial Q1 allocation, Project Alpha operates on an approved budget of $120,000.`;

  const doc2Id = 'doc_audit_report';
  const doc2Name = 'Executive Audit & Operations Report.pdf';
  const doc2Content = `Sarah Jenkins will represent the engineering unit at the Global Tech Summit in Geneva.
The Global Tech Summit is hosted in Geneva, Switzerland.
Chief Architect Marcus Vance oversees all deployment pipelines running on the Apollo Computing Cluster.
Following the mid-year executive audit, Project Alpha operates on an approved budget of $180,000.
The Quantum Computing Sandbox is hosted on the Hyperion Supercomputer at Oak Ridge.`;

  knowledgeGraph.addDocument(doc1Id, doc1Name, doc1Content);
  knowledgeGraph.addDocument(doc2Id, doc2Name, doc2Content);

  // Entities
  const demoEntities = [
    { id: 'sarah_jenkins', name: 'Sarah Jenkins', type: 'person', description: 'Team Lead for Project Alpha', sourceText: 'Sarah Jenkins, who acts as Team Lead' },
    { id: 'project_alpha', name: 'Project Alpha', type: 'team', description: 'Core strategic AI initiative', sourceText: 'Project Alpha is led by Sarah Jenkins' },
    { id: 'engineering_alpha', name: 'Engineering Alpha', type: 'team', description: 'Primary engineering execution unit', sourceText: 'Engineering Alpha is the primary unit executing Project Alpha' },
    { id: 'apollo_cluster', name: 'Apollo Computing Cluster', type: 'resource', description: 'High-performance AI compute cluster', sourceText: 'allocated the Apollo Computing Cluster for intensive AI simulation workloads' },
    { id: 'server_room_4b', name: 'Server Room 4B', type: 'place', description: 'Physical datacenter room in Zurich', sourceText: 'physically housed in Server Room 4B within the Zurich Data Facility' },
    { id: 'global_tech_summit', name: 'Global Tech Summit', type: 'event', description: 'Annual international technology summit', sourceText: 'represent the engineering unit at the Global Tech Summit in Geneva' },
    { id: 'geneva', name: 'Geneva', type: 'place', description: 'Host city in Switzerland', sourceText: 'hosted in Geneva, Switzerland' },
    { id: 'marcus_vance', name: 'Marcus Vance', type: 'person', description: 'Chief Architect overseeing deployments', sourceText: 'Chief Architect Marcus Vance oversees all deployment pipelines' },
    { id: 'budget_spec', name: 'Project Alpha Budget', type: 'resource', description: 'Operating expenditure budget for Project Alpha', sourceText: 'operates on an approved budget' },
    { id: 'quantum_sandbox', name: 'Quantum Sandbox', type: 'resource', description: 'Experimental quantum computing sandbox', sourceText: 'Quantum Computing Sandbox is hosted on the Hyperion Supercomputer' },
    { id: 'hyperion', name: 'Hyperion Supercomputer', type: 'resource', description: 'Supercomputer located at Oak Ridge', sourceText: 'Hyperion Supercomputer at Oak Ridge' },
  ];

  demoEntities.forEach(e => {
    const docId = (e.id === 'global_tech_summit' || e.id === 'geneva' || e.id === 'marcus_vance' || e.id === 'quantum_sandbox' || e.id === 'hyperion')
      ? doc2Id : doc1Id;
    knowledgeGraph.addEntity(e, docId);
  });

  // Relationships (including multi-hop and explicit conflict)
  const demoRels = [
    { source: 'sarah_jenkins', target: 'project_alpha', relation: 'leads', confidence: 'high', sourceText: 'Project Alpha is led by Sarah Jenkins', documentId: doc1Id },
    { source: 'sarah_jenkins', target: 'engineering_alpha', relation: 'manages', confidence: 'high', sourceText: 'Sarah Jenkins, who acts as Team Lead... Engineering Alpha is the primary unit', documentId: doc1Id },
    { source: 'engineering_alpha', target: 'apollo_cluster', relation: 'allocated_resource', confidence: 'high', sourceText: 'Engineering Alpha is allocated the Apollo Computing Cluster', documentId: doc1Id },
    { source: 'apollo_cluster', target: 'server_room_4b', relation: 'located_in', confidence: 'high', sourceText: 'physically housed in Server Room 4B within the Zurich Data Facility', documentId: doc1Id },
    { source: 'sarah_jenkins', target: 'global_tech_summit', relation: 'attending_speaker', confidence: 'high', sourceText: 'Sarah Jenkins will represent the engineering unit at the Global Tech Summit', documentId: doc2Id },
    { source: 'global_tech_summit', target: 'geneva', relation: 'held_at', confidence: 'high', sourceText: 'Global Tech Summit is hosted in Geneva, Switzerland', documentId: doc2Id },
    { source: 'marcus_vance', target: 'apollo_cluster', relation: 'oversees_pipelines_on', confidence: 'high', sourceText: 'Marcus Vance oversees all deployment pipelines running on the Apollo Computing Cluster', documentId: doc2Id },
    // CONFLICT: Project Alpha Budget relationships differ across documents
    { source: 'project_alpha', target: 'budget_spec', relation: 'funded_at_$120,000_(Charter)', confidence: 'high', sourceText: 'Project Alpha operates on an approved budget of $120,000.', documentId: doc1Id },
    { source: 'project_alpha', target: 'budget_spec', relation: 'funded_at_$180,000_(Audit_Report)', confidence: 'high', sourceText: 'Following the mid-year executive audit, Project Alpha operates on an approved budget of $180,000.', documentId: doc2Id },
    { source: 'quantum_sandbox', target: 'hyperion', relation: 'hosted_on', confidence: 'high', sourceText: 'Quantum Computing Sandbox is hosted on the Hyperion Supercomputer at Oak Ridge', documentId: doc2Id },
  ];

  demoRels.forEach(r => {
    knowledgeGraph.addRelationship(r, r.documentId);
  });

  const fullData = knowledgeGraph.toJSON();
  res.json({
    success: true,
    message: 'Loaded judge-proof demo dataset with multi-hop paths and cross-document conflicts',
    graph: fullData,
    sampleQuestions: [
      {
        type: 'multi-hop',
        label: '🔀 Multi-Hop Reasoning',
        question: 'Which physical server room houses the computing cluster allocated to the team that Sarah Jenkins leads?',
        expectedPath: 'Sarah Jenkins → Engineering Alpha → Apollo Computing Cluster → Server Room 4B',
      },
      {
        type: 'conflict',
        label: '⚠️ Conflict Detection',
        question: 'What is the approved operating budget for Project Alpha across the documents?',
        expectedConflict: '$120,000 (Charter) vs $180,000 (Executive Audit Report)',
      },
      {
        type: 'abstention',
        label: '🚫 Hallucination Abstention',
        question: 'What is the public release date and ticket pricing for the Quantum Computing initiative?',
        expectedRefusal: 'Strict decline / unsupported response without fabricated dates',
      },
    ]
  });
});

// Remove single document
app.delete('/api/documents/:id', (req, res) => {
  const docId = req.params.id;
  const result = knowledgeGraph.removeDocument(docId);
  res.json({
    success: true,
    message: `Document "${result.removedName}" removed`,
    documentId: docId,
    graph: knowledgeGraph.toJSON(),
  });
});

app.post('/api/documents/:id/delete', (req, res) => {
  const docId = req.params.id;
  const result = knowledgeGraph.removeDocument(docId);
  res.json({
    success: true,
    message: `Document "${result.removedName}" removed`,
    documentId: docId,
    graph: knowledgeGraph.toJSON(),
  });
});

// Clear the graph
app.post('/api/clear', (req, res) => {
  knowledgeGraph.clear();
  res.json({ success: true, message: 'Knowledge graph cleared' });
});

// Get stats
app.get('/api/stats', (req, res) => {
  res.json({
    documents: knowledgeGraph.documents.size,
    entities: knowledgeGraph.entities.size,
    relationships: knowledgeGraph.relationships.length,
  });
});

// Health & Configuration status check
app.get('/api/health', (req, res) => {
  loadEnv();
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const hasKey = Boolean(apiKey);
  const maskedKey = hasKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : null;
  res.json({
    status: 'ok',
    geminiConfigured: hasKey,
    apiKeyMasked: maskedKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    stats: {
      documents: knowledgeGraph.documents.size,
      entities: knowledgeGraph.entities.size,
      relationships: knowledgeGraph.relationships.length,
    }
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────────
const activeModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   🧠 Grounded Knowledge-Graph Q&A                   ║
║   Server running at http://localhost:${PORT}            ║
║   Model: ${activeModel} (Fastest & Free-Tier Safe)
║   Rate limit: 10 RPM (safety margin under 15 RPM)
╚══════════════════════════════════════════════════════╝
    `);
  });
}

// ─── Reusable Module Exports ───────────────────────────────────────────────────
module.exports = {
  app,
  knowledgeGraph,
  RateLimiter,
  rateLimiter,
  chunkText,
  parsePDF,
  callGemini,
  getGeminiModel,
  normalizeEntityName,
};

