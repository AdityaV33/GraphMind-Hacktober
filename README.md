# 🧠 GraphMind — Grounded Knowledge-Graph Q&A

A full-stack hackathon project that extracts entities & relationships from multi-format documents (PDF, Markdown, Text), constructs an interactive Knowledge Graph, and performs strict, hallucination-free Q&A with exact source citations and conflict detection.

---

## 🚀 Quick Start for Team Members

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 2. Setup & Installation
```bash
# Clone the repository
git clone <YOUR-REPO-URL>
cd mlh

# Install dependencies
npm install

# Set up your Gemini API Key
cp .env.example .env
# Edit .env and paste your GEMINI_API_KEY
```

### 3. Run Locally
```bash
npm start
# or for auto-reloading dev mode:
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🌟 Key Features
- **Multi-Format Ingestion**: Upload `.txt`, `.md`, `.pdf`, `.json` or paste text directly.
- **AI Graph Extraction**: Uses `gemini-2.0-flash` to extract entities (people, orgs, events, concepts) and typed relationships with source quotes.
- **Interactive Visual Graph**: Powered by `vis-network` with color-coded nodes and relationship inspection panel.
- **Strict Grounding & Zero Hallucination**: Answers are strictly backed by graph facts. If unsupported, the model gracefully declines.
- **Conflict Detection**: Automatically surfaces opposing claims across different documents.
- **Multi-Hop Reasoning**: Discovers connected paths (A → B → C) and visualizes the reasoning chain.
- **Free-Tier Protection**: Built-in 10 RPM rate limiter and backoff retry logic to stay safely under Gemini API free quotas.

---

## 📁 Project Structure
```
├── server.js              # Express backend, Gemini extraction & Q&A logic
├── public/
│   ├── index.html         # Main dashboard UI
│   ├── style.css          # Glassmorphic dark styling & animations
│   └── app.js             # Client-side graph rendering & chat handling
├── .env.example           # Template for environment variables
├── .gitignore             # Ignores node_modules, .env, and logs
└── package.json           # Scripts and dependencies
```
