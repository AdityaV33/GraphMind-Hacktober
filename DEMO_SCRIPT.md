# 🏆 GraphMind: 2-Minute Judge Walkthrough & Presentation Blueprint

> **Infinity AI Forge Hackathon — Problem Statement 18: Grounded Knowledge-Graph Q&A**  
> *Target Execution Time: 2 Minutes (120 seconds)*

---

## ⏱️ 2-Minute Live Demo Walkthrough Script

### **[0:00 – 0:25] Hook & Problem Definition**
> *"Hello judges. Standard RAG architectures fail in three critical dimensions: they can't chain relationships across documents (multi-hop), they silently hallucinate when facts conflict, and they make up answers instead of abstaining when information is missing.*  
>  
> *We built **GraphMind** — a grounded knowledge-graph engine that constructs typed semantic topologies from heterogeneous documents, traces verifiable reasoning paths, and strictly grounds answers in source text quotes."*

---

### **[0:25 – 0:50] Capability 1: 1-Click Ingestion & Topology Visualization**
> *(Action: Click **"⚡ Load Sample Demo"**)*  
>  
> *"In a single click, GraphMind ingests multi-format documents (like Markdown charters and executive audit PDFs) using `gemini-3.5-flash-lite` with our resilient 10 RPM rate-limiting buffer.*  
>  
> *Look at the canvas: Entities are categorized by ontology (People, Teams, Resources, Places, Events). Immediately notice this **amber dashed link** between Project Alpha and Budget Spec — our graph engine has automatically surfaced a cross-document contradiction."*

---

### **[0:50 – 1:15] Capability 2: Multi-Hop Reasoning Across Documents**
> *(Action: Click **"🔀 Multi-Hop"** preset)*  
>  
> **Query:** *"Which physical server room houses the computing cluster allocated to the team that Sarah Jenkins leads?"*  
>  
> *"Notice the reasoning chain: Sarah Jenkins → Engineering Alpha → Apollo Computing Cluster → Server Room 4B. The answer synthesizes facts from across multiple documents with exact verbatim citations and confidence metrics. No flat vector chunker could reliably connect these 4 hops."*

---

### **[1:15 – 1:35] Capability 3: Contradiction Detection & Visual Proof**
> *(Action: Click **"⚠️ Conflict"** preset)*  
>  
> **Query:** *"What is the approved operating budget for Project Alpha across the documents?"*  
>  
> *"Instead of hallucinating or picking one number at random, GraphMind highlights both conflicting claims: **$120,000** cited from the Project Charter vs **$180,000** cited from the Executive Audit Report. Both sides are presented with provenance."*

---

### **[1:35 – 1:50] Capability 4: Strict Abstention / Zero Hallucination**
> *(Action: Click **"🚫 Abstention"** preset)*  
>  
> **Query:** *"What is the public release date and ticket pricing for the Quantum Computing initiative?"*  
>  
> *"When a question is unsupported by graph facts, the model gracefully declines rather than fabricating answers. Confidence is marked as **unsupported**, fulfilling our strict zero-hallucination guarantee."*

---

### **[1:50 – 2:00] Closing & Exportable Artifacts**
> *(Action: Click **"💾 JSON"** and **"📷 Image"**)*  
>  
> *"Judges and downstream systems can export the entire graph topology as structured JSON or a high-resolution PNG artifact. GraphMind turns opaque document silos into transparent, verifiable intelligence. Thank you!"*

---

## 📊 Presentation Slides Outline (5 Slides)

### **Slide 1: Title & The Core Problem**
- **Headline**: GraphMind: Grounded Knowledge-Graph Q&A
- **Subheadline**: Eliminating Hallucinations, Resolving Contradictions, and Navigating Multi-Hop Documents
- **Pain Points of Vector RAG**:
  - ❌ Blind to multi-hop entity relationships
  - ❌ Silent failure on cross-document conflicting facts
  - ❌ Hallucinates plausible-sounding answers when data is missing

---

### **Slide 2: Architectural Pipeline**
- **Diagram**:
  `Raw Docs (.pdf, .md, .txt) ➔ Gemini 3.5 Flash-Lite Extraction ➔ In-Memory Graph Index ➔ 2-Hop BFS Traversal ➔ Contradiction Engine ➔ Grounded Answer with Source Citations`
- **Key Technical Highlights**:
  - Strict Pydantic-style JSON contracts for entities and edges
  - Substring-level source verification on every claim
  - Free-tier rate limiter protecting against 429 quota exhaustion

---

### **Slide 3: Triad of Grounded Intelligence**
1. **Multi-Hop Traversal**: 2-hop & 3-hop breadth-first search connects disjoint entity predicates.
2. **Conflict Surface**: Contradictory claims are visually rendered as amber dashed edges on the interactive vis-network topology.
3. **Abstention Guardrail**: Explicit fallback when entity connections are absent, preserving 100% truthfulness.

---

### **Slide 4: Infinity AI Forge Rubric Alignment**
- **Open-Source Contribution (25%)**: Modular knowledge graph primitives with conflict detection hooks and export utilities.
- **Engineering Quality (25%)**: Clean Express backend, rate-limiter with exponential backoff, deterministic parsing.
- **Usefulness & Originality (20%)**: Replaces black-box embeddings with queryable, inspectable visual graph networks.
- **Testing & Evidence (15%)**: 1-click preset harness validating all 3 core evaluation vectors in under 15 seconds.
- **Demo & Docs (15%)**: Self-contained web app with zero dependencies on external vector databases.

---

### **Slide 5: Impact & Live System**
- **GitHub Repository**: [https://github.com/AdityaV33/Hacktober-mlh.git](https://github.com/AdityaV33/Hacktober-mlh.git)
- **Live Local URL**: `http://localhost:3000`
- **Model Benchmark**: `gemini-3.5-flash-lite` (1.39s mean response time, free-tier safe)
