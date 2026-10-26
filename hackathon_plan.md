# 🏆 Hackathon Plan: Grounded Knowledge-Graph Q&A

**Time Budget**: 11:10 AM → 4:00 PM (~5 hours)

---

## What We're Building

A web app where users:
1. **Upload / paste documents** (text, markdown, or PDF)
2. The app **extracts entities & relationships** using Gemini
3. Entities are organized into a **visual knowledge graph**
4. Users **ask questions** — answers are grounded in graph facts with source citations
5. System handles **conflicting facts**, **multi-hop reasoning**, and **refuses to fabricate**

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | HTML + CSS + JS | Fast, no build step |
| Backend | Node.js (Express) | Already installed (v22) |
| LLM | Gemini API (gemini-2.0-flash) | Free tier, fast, you have the key |
| Graph Viz | vis.js (CDN) | Beautiful interactive graphs, zero setup |
| Storage | In-memory JSON | No DB needed for a hackathon |

---

## Phase 1 — Scaffold & Backend (11:10 AM – 12:00 PM) ⏱ 50 min

> [!IMPORTANT]
> Get the skeleton running end-to-end. A working `/upload` → extraction pipeline.

### Steps
1. `npm init -y` + install Express, multer, @google/generative-ai, pdf-parse
2. Create Express server with routes:
   - `POST /api/upload` — accept text/files, call Gemini to extract entities & relationships
   - `GET /api/graph` — return the current knowledge graph as JSON
   - `POST /api/query` — accept a question, return grounded answer
3. Build the **extraction prompt** — structured JSON output from Gemini:
   ```json
   {
     "entities": [{"id": "e1", "name": "...", "type": "person|org|event|place|resource", "source": "doc1, line 3"}],
     "relationships": [{"source": "e1", "target": "e2", "relation": "works_at", "confidence": "high", "source_text": "exact quote"}]
   }
   ```
4. Store extracted graph in-memory (Map of entities, array of relationships)
5. Verify: upload a sample doc → get JSON back

### Deliverable
`POST /api/upload` returns extracted entities+relationships JSON ✅

---

## Phase 2 — Q&A Engine (12:00 PM – 12:45 PM) ⏱ 45 min

> [!IMPORTANT]
> The core differentiator. Answers MUST be grounded, never fabricated.

### Steps
1. Build graph traversal for the Q&A route:
   - Parse question → identify relevant entities (fuzzy match on names)
   - BFS from matched entities → collect subgraph (1-2 hops)
   - Send subgraph context + question to Gemini with strict grounding prompt
2. **Grounding prompt** enforces:
   - Answer ONLY from provided graph facts
   - Cite `source_text` for every claim
   - If conflicting facts exist → present BOTH with sources, flag the conflict
   - If question needs multi-hop → trace the path explicitly (A→B→C)
   - If unsupported → say "I cannot answer this based on the available documents" — NO fabrication
3. Return structured answer:
   ```json
   {
     "answer": "...",
     "citations": [{"fact": "...", "source": "doc1"}],
     "confidence": "high|medium|low",
     "conflicts": [],
     "path": ["Entity A", "→ works_at →", "Entity B"]
   }
   ```

### Deliverable
`POST /api/query` returns grounded answers with citations ✅

---

## Phase 3 — Frontend UI (12:45 PM – 2:00 PM) ⏱ 1h 15min

> [!TIP]
> Make it look PREMIUM. This is what judges see first.

### Steps
1. **Landing / Upload page**
   - Dark glassmorphic theme, gradient accents
   - Drag-and-drop zone for documents + paste-text area
   - Upload progress animation
   - Uploaded document list with entity count badges
2. **Knowledge Graph view**
   - vis.js interactive network graph
   - Nodes colored by entity type (person=blue, org=green, event=purple, place=orange)
   - Edges labeled with relationship type
   - Click a node → side panel shows source documents & facts
   - Smooth physics animations
3. **Q&A Chat panel**
   - Chat-style interface (right panel or bottom drawer)
   - User types question → animated typing indicator → grounded answer
   - Citations rendered as clickable source chips
   - Conflict warnings highlighted in amber
   - "Unsupported" answers clearly styled (not an error, a feature)
4. **Responsive layout**: graph on left, chat on right (or stacked on mobile)

### Deliverable
Full working UI — upload docs → see graph → ask questions ✅

---

## Phase 4 — Edge Cases & Polish (2:00 PM – 3:00 PM) ⏱ 1h

> [!WARNING]
> This is what separates winners from demos-that-crash.

### Steps
1. **Conflicting facts handling**
   - When two documents disagree, show both with source attribution
   - Visual indicator on graph edges (dashed line for conflicts)
2. **Multi-hop questions**
   - "Does X work with Y?" when X→A→B→Y (no direct edge)
   - Show the full reasoning path in the answer
3. **Unsupported questions**
   - Clearly refuse with "Not enough information in the documents"
   - Suggest what related info IS available
4. **Error handling**
   - Empty uploads, invalid files, API rate limits
   - Loading states, retry logic
5. **Polish**
   - Smooth transitions between views
   - Keyboard shortcuts (Ctrl+Enter to send question)
   - Clear graph / reset button
   - Export graph as JSON

### Deliverable
Robust app that handles all edge cases gracefully ✅

---

## Phase 5 — Demo Prep & Final Testing (3:00 PM – 4:00 PM) ⏱ 1h

### Steps
1. **Prepare demo documents** (3-4 short docs with overlapping entities, one conflict)
2. **Test the full flow** end-to-end 3 times
3. **Record a 2-min demo** or prepare live-demo script:
   - Upload 3 docs → show graph building in real-time
   - Ask a simple question → show grounded answer with citation
   - Ask a multi-hop question → show path tracing
   - Ask a conflicting-fact question → show both sides
   - Ask an unsupported question → show graceful refusal
4. **Write README.md** — what it does, how to run, screenshots
5. Final git commit & push

### Deliverable
Polished demo-ready app ✅

---

## Summary Timeline

| Time | Phase | Output |
|------|-------|--------|
| 11:10–12:00 | Backend + Extraction | API that extracts entities from docs |
| 12:00–12:45 | Q&A Engine | Grounded answers with citations |
| 12:45–2:00 | Frontend UI | Premium interactive web app |
| 2:00–3:00 | Edge Cases + Polish | Conflict/multi-hop/unsupported handling |
| 3:00–4:00 | Demo Prep | Tested, documented, demo-ready |

> [!CAUTION]
> **Do NOT spend more than the allocated time on any phase.** Move on even if imperfect — a working end-to-end demo beats a half-finished perfect backend.
