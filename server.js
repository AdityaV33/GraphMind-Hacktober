const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Environment Variables (Auto-load .env if present) ─────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  });
}

// ─── Config ────────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Gemini Setup (Free Tier Safe: gemini-3.5-flash-lite) ───────────────────────────
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
let GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: MODEL_NAME });
} else {
  console.warn('⚠️ GEMINI_API_KEY not set yet. Create a .env file or set GEMINI_API_KEY environment variable.');
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
  if (!model) {
    if (process.env.GEMINI_API_KEY) {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      model = genAI.getGenerativeModel({ model: MODEL_NAME });
    } else {
      throw new Error('GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY=... in your .env file.');
    }
  }
  await rateLimiter.acquire();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
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

// ─── In-Memory Knowledge Graph ─────────────────────────────────────────────────
const knowledgeGraph = {
  entities: new Map(),   // id -> { id, name, type, description, sources: [] }
  relationships: [],     // { source, target, relation, confidence, sourceText, documentId }
  documents: new Map(),  // id -> { id, name, content, uploadedAt }

  addDocument(id, name, content) {
    this.documents.set(id, { id, name, content, uploadedAt: new Date().toISOString() });
  },

  addEntity(entity, documentId) {
    const existing = this.entities.get(entity.id);
    if (existing) {
      // Merge sources
      existing.sources.push({ documentId, sourceText: entity.sourceText || '' });
      if (entity.description && !existing.description) {
        existing.description = entity.description;
      }
    } else {
      this.entities.set(entity.id, {
        id: entity.id,
        name: entity.name,
        type: entity.type || 'unknown',
        description: entity.description || '',
        sources: [{ documentId, sourceText: entity.sourceText || '' }],
      });
    }
  },

  addRelationship(rel, documentId) {
    this.relationships.push({
      source: rel.source,
      target: rel.target,
      relation: rel.relation,
      confidence: rel.confidence || 'medium',
      sourceText: rel.sourceText || '',
      documentId,
    });
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

  // Export for visualization
  toJSON() {
    return {
      entities: Array.from(this.entities.values()),
      relationships: this.relationships,
      documents: Array.from(this.documents.values()),
    };
  },

  // Clear everything
  clear() {
    this.entities.clear();
    this.relationships = [];
    this.documents.clear();
  }
};

// ─── Extraction Prompt ─────────────────────────────────────────────────────────
function buildExtractionPrompt(text, documentName) {
  return `You are an entity and relationship extractor. Analyze this document and extract ALL entities (people, teams, organizations, events, places, resources, concepts) and their relationships.

DOCUMENT NAME: "${documentName}"
DOCUMENT TEXT:
"""
${text.slice(0, 8000)}
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
- Every relationship source/target MUST reference an entity ID from your entities list
- sourceText must be EXACT quotes from the document, not paraphrased
- Only extract relationships explicitly stated or strongly implied in the text
- Do NOT fabricate or infer relationships not supported by the text
- Confidence: high = explicitly stated, medium = strongly implied, low = weakly implied`;
}

// ─── Q&A Prompt ────────────────────────────────────────────────────────────────
function buildQAPrompt(question, subgraph, conflicts) {
  const factsText = subgraph.relationships.map(r => {
    const srcEntity = subgraph.entities.find(e => e.id === r.source);
    const tgtEntity = subgraph.entities.find(e => e.id === r.target);
    const docName = knowledgeGraph.documents.get(r.documentId)?.name || 'unknown';
    return `- ${srcEntity?.name || r.source} --[${r.relation}]--> ${tgtEntity?.name || r.target} (Source: "${r.sourceText}" from ${docName}) [confidence: ${r.confidence}]`;
  }).join('\n');

  const entitiesText = subgraph.entities.map(e =>
    `- ${e.name} (${e.type}): ${e.description || 'No description'}`
  ).join('\n');

  const conflictsText = conflicts.length > 0
    ? `\n\nCONFLICTING FACTS DETECTED:\n${conflicts.map(c =>
        `Entities: ${c.entities.join(' & ')}\n${c.claims.map(cl =>
          `  - "${cl.relation}" (from ${cl.document}): "${cl.sourceText}"`
        ).join('\n')}`
      ).join('\n\n')}`
    : '';

  return `You are a knowledge graph Q&A assistant. Answer the question using ONLY the facts provided below. Do NOT use any outside knowledge.

KNOWN ENTITIES:
${entitiesText || 'None found relevant.'}

KNOWN FACTS (from the knowledge graph):
${factsText || 'No relevant facts found.'}
${conflictsText}

QUESTION: "${question}"

RULES:
1. Answer ONLY from the facts above. If the facts don't contain enough info, say "I cannot answer this based on the available documents."
2. For EVERY claim in your answer, cite the source document and quote the supporting text.
3. If there are CONFLICTING facts, present ALL sides with their sources. Do not pick one.
4. For multi-hop questions (A relates to B, B relates to C, therefore A connects to C), explicitly trace the path.
5. NEVER fabricate information. If unsure, say so.

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
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text;
}

// ─── API Routes ────────────────────────────────────────────────────────────────

// Upload document and extract entities
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    let text = '';
    let docName = '';

    if (req.file) {
      docName = req.file.originalname;
      if (req.file.mimetype === 'application/pdf') {
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

    // Extract entities & relationships via Gemini
    console.log(`📄 Extracting from "${docName}" (${text.length} chars)...`);
    const prompt = buildExtractionPrompt(text, docName);
    const response = await callGemini(prompt);

    // Parse the JSON response (handle markdown fences)
    let extracted;
    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', response.slice(0, 500));
      return res.status(500).json({ error: 'Failed to parse extraction results', raw: response.slice(0, 200) });
    }

    // Add to knowledge graph
    let entityCount = 0, relCount = 0;
    for (const entity of (extracted.entities || [])) {
      knowledgeGraph.addEntity(entity, docId);
      entityCount++;
    }
    for (const rel of (extracted.relationships || [])) {
      // Validate endpoints exist
      if (knowledgeGraph.entities.has(rel.source) && knowledgeGraph.entities.has(rel.target)) {
        knowledgeGraph.addRelationship(rel, docId);
        relCount++;
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

    // Find relevant entities from the question
    const words = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matchedEntities = new Set();

    for (const word of words) {
      for (const [id, entity] of knowledgeGraph.entities) {
        const name = entity.name.toLowerCase();
        if (name.includes(word) || word.includes(name) || knowledgeGraph._similarity(name, word) > 0.4) {
          matchedEntities.add(id);
        }
      }
    }

    // If no specific entities matched, use all entities (small graph)
    let entityIds = Array.from(matchedEntities);
    if (entityIds.length === 0) {
      entityIds = Array.from(knowledgeGraph.entities.keys()).slice(0, 20);
    }

    // Get subgraph with 2-hop neighborhood
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

    res.json(answer);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message || 'Query failed' });
  }
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

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   🧠 Grounded Knowledge-Graph Q&A                   ║
║   Server running at http://localhost:${PORT}            ║
║   Model: ${MODEL_NAME} (Fastest & Free-Tier Safe)
║   Rate limit: 10 RPM (safety margin under 15 RPM)
╚══════════════════════════════════════════════════════╝
  `);
});
