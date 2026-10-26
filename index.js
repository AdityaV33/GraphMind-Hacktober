/**
 * GraphMind — Grounded Knowledge-Graph Q&A Engine
 *
 * Reusable Node.js module. Import the engine and REST app
 * independently from the CLI server entry point.
 *
 * Usage:
 *   const { app, knowledgeGraph } = require('graphmind');
 *   app.listen(3000);
 */

'use strict';

const server = require('./server');

module.exports = {
  /** Express application — mount or extend as needed */
  app: server.app,

  /** In-memory knowledge graph engine with BFS traversal & conflict detection */
  knowledgeGraph: server.knowledgeGraph,

  /** Gemini rate limiter instance (10 RPM, free-tier safe) */
  rateLimiter: server.rateLimiter,

  /** Split long text into overlapping chunks for LLM ingestion */
  chunkText: server.chunkText,

  /** Extract plain text from a PDF buffer */
  parsePDF: server.parsePDF,

  /** Call Gemini with automatic retry + rate limiting */
  callGemini: server.callGemini,

  /** Return a configured Gemini model instance from current .env */
  getGeminiModel: server.getGeminiModel,

  /** Normalize entity names for cross-document deduplication */
  normalizeEntityName: server.normalizeEntityName,
};
