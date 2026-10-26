# Hackathon Rule: Token Conservation via Graphify

## Primary Directive
We are competing in a hackathon. **Conserving context tokens is critical.**
Never ingest entire repositories, large code files, or extensive documentation dumps directly into the context window.

## Graphify Knowledge Graph Protocol
1. **Skill Integration**:
   - The `graphify` skill (`file:///C:/Users/Advaya/.gemini/config/skills/graphify/SKILL.md`) is active.
   - For any project codebase, external library clone, or large documentation folder, initialize or update graphify:
     - `/graphify <path>` or `/graphify https://github.com/<owner>/<repo>`
     - Outputs persist in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`).

2. **Querying & Answering via Graph (Zero-Token-Waste Traversal)**:
   - When questions arise about code architecture, execution paths, dependencies, or component roles:
     - Check `graphify-out/graph.json`.
     - Use `graphify query "<expanded query>" --budget 1500` (or BFS/DFS traversal).
     - Use `graphify path "NodeA" "NodeB"` for tracing connections between modules.
     - Use `graphify explain "NodeName"` for concise module overviews.
   - **Never read entire files when graph queries suffice.** Only open targeted lines (`view_file` with `StartLine`/`EndLine`) using the exact `source_location` given by graphify.

3. **Hackathon Execution Mode**:
   - Keep answers sharp, high-signal, and minimal in tokens.
   - Await the user's hackathon problem statement and any starter repos/code to build the initial graph representation.
