// ─── GraphMind — Client-Side Application ──────────────────────────────────────

// ─── State ─────────────────────────────────────────────────────────────────────
let graphData = { entities: [], relationships: [], documents: [] };
let network = null;

// ─── Entity Type Colors ────────────────────────────────────────────────────────
const TYPE_COLORS = {
  person: '#8b5cf6',
  organization: '#3b82f6',
  team: '#06b6d4',
  event: '#f59e0b',
  place: '#10b981',
  resource: '#f97316',
  concept: '#f43f5e',
  unknown: '#6b7280',
};

const TYPE_SHAPES = {
  person: 'dot',
  organization: 'diamond',
  team: 'triangle',
  event: 'star',
  place: 'square',
  resource: 'hexagon',
  concept: 'dot',
  unknown: 'dot',
};

// ─── DOM Elements ──────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const pasteInput = document.getElementById('paste-input');
const btnPasteSubmit = document.getElementById('btn-paste-submit');
const docList = document.getElementById('doc-list');
const docItems = document.getElementById('doc-items');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnClear = document.getElementById('btn-clear');
const btnDemo = document.getElementById('btn-demo');
const btnExportJson = document.getElementById('btn-export-json');
const btnExportPng = document.getElementById('btn-export-png');
const conflictBadge = document.getElementById('conflict-badge');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const nodeDetail = document.getElementById('node-detail');
const closeDetail = document.getElementById('close-detail');

// ─── Loading Helpers ───────────────────────────────────────────────────────────
function showLoading(text = 'Processing...') {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// ─── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  document.querySelector('#stat-docs .stat-num').textContent = graphData.documents.length;
  document.querySelector('#stat-entities .stat-num').textContent = graphData.entities.length;
  document.querySelector('#stat-relations .stat-num').textContent = graphData.relationships.length;
}

// ─── File Upload ───────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadFiles(fileInput.files);
  fileInput.value = '';
});

async function uploadFiles(files) {
  for (const file of files) await uploadSingleFile(file);
}

async function uploadSingleFile(file) {
  showLoading(`Extracting from "${file.name}"...`);
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    graphData = data.graph;
    addDocChip(data.documentName, data.extracted.entities);
    updateStats();
    renderGraph();
    hideLoading();
  } catch (err) {
    hideLoading();
    alert('Error: ' + err.message);
  }
}

// ─── Paste Text ────────────────────────────────────────────────────────────────
pasteInput.addEventListener('input', () => {
  btnPasteSubmit.disabled = !pasteInput.value.trim();
});

btnPasteSubmit.addEventListener('click', async () => {
  const text = pasteInput.value.trim();
  if (!text) return;
  showLoading('Extracting from pasted text...');
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, name: `Pasted Text ${graphData.documents.length + 1}` }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    graphData = data.graph;
    addDocChip(data.documentName, data.extracted.entities);
    updateStats();
    renderGraph();
    pasteInput.value = '';
    btnPasteSubmit.disabled = true;
    hideLoading();
  } catch (err) {
    hideLoading();
    alert('Error: ' + err.message);
  }
});

// ─── Document Chips ────────────────────────────────────────────────────────────
function addDocChip(name, entityCount) {
  docList.classList.remove('hidden');
  const chip = document.createElement('span');
  chip.className = 'doc-chip';
  chip.innerHTML = `📄 ${escapeHtml(name)} <span class="chip-badge">${entityCount}</span>`;
  docItems.appendChild(chip);
}

// ─── Graph Rendering ───────────────────────────────────────────────────────────
function renderGraph() {
  const container = document.getElementById('graph-container');
  container.innerHTML = '';

  if (graphData.entities.length === 0) {
    container.innerHTML = '<div class="graph-empty"><div class="empty-state"><span class="empty-icon">🔗</span><p>Upload documents or click <strong>⚡ Load Demo</strong></p><p class="empty-sub">Entities and relationships will appear here</p></div></div>';
    return;
  }

  // Build legend
  const legend = document.getElementById('graph-legend');
  const typesUsed = new Set(graphData.entities.map(e => e.type));
  legend.innerHTML = '';
  for (const type of typesUsed) {
    const color = TYPE_COLORS[type] || TYPE_COLORS.unknown;
    legend.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${type}</span>`;
  }

  // Conflict badge
  const hasConflicts = graphData.relationships.some(r => r.isConflict);
  if (hasConflicts) {
    legend.innerHTML += `<span class="legend-item conflict-item"><span class="legend-line-conflict"></span>⚠️ Conflict</span>`;
    if (conflictBadge) conflictBadge.classList.remove('hidden');
  } else {
    if (conflictBadge) conflictBadge.classList.add('hidden');
  }

  // Nodes
  const nodes = new vis.DataSet(graphData.entities.map(e => ({
    id: e.id,
    label: e.name,
    color: {
      background: TYPE_COLORS[e.type] || TYPE_COLORS.unknown,
      border: TYPE_COLORS[e.type] || TYPE_COLORS.unknown,
      highlight: { background: '#fff', border: TYPE_COLORS[e.type] || TYPE_COLORS.unknown },
      hover: { background: lightenColor(TYPE_COLORS[e.type] || TYPE_COLORS.unknown, 30), border: TYPE_COLORS[e.type] || TYPE_COLORS.unknown },
    },
    shape: TYPE_SHAPES[e.type] || 'dot',
    size: 16 + Math.min(e.sources?.length || 0, 5) * 3,
    font: { color: '#e8e8f0', size: 11, face: 'Inter, sans-serif', strokeWidth: 3, strokeColor: '#0c0c12' },
    borderWidth: 2,
    shadow: { enabled: true, color: TYPE_COLORS[e.type] || TYPE_COLORS.unknown, size: 6, x: 0, y: 0 },
  })));

  // Edges (amber dashed for conflicts)
  const edges = new vis.DataSet(graphData.relationships.map((r, i) => {
    const isConflict = Boolean(r.isConflict);
    return {
      id: `edge_${i}`,
      from: r.source,
      to: r.target,
      label: r.relation,
      arrows: 'to',
      color: isConflict ? { color: '#f59e0b', highlight: '#fbbf24', hover: '#fbbf24' } : {
        color: r.confidence === 'high' ? 'rgba(139,92,246,0.6)' : r.confidence === 'medium' ? 'rgba(245,158,11,0.5)' : 'rgba(107,114,128,0.4)',
        highlight: '#8b5cf6', hover: '#8b5cf6',
      },
      dashes: isConflict ? [6, 4] : (r.confidence === 'low'),
      font: { color: isConflict ? '#fbbf24' : '#9898b0', size: isConflict ? 10 : 9, face: 'Inter, sans-serif', strokeWidth: 2, strokeColor: '#0c0c12', align: 'top' },
      width: isConflict ? 3 : (r.confidence === 'high' ? 2 : 1),
      smooth: { type: 'continuous', roundness: 0.2 },
    };
  }));

  const options = {
    autoResize: true,
    height: '100%',
    width: '100%',
    physics: {
      barnesHut: { gravitationalConstant: -4000, centralGravity: 0.3, springLength: 120, springConstant: 0.04, damping: 0.09 },
      stabilization: { iterations: 150 },
    },
    interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true },
    layout: { improvedLayout: graphData.entities.length < 100 },
  };

  network = new vis.Network(container, { nodes, edges }, options);
  window.network = network;

  network.once('stabilizationIterationsDone', () => {
    network.fit({ animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
  });
  network.once('stabilized', () => {
    network.fit();
  });
  setTimeout(() => {
    if (network) {
      network.setSize('100%', '100%');
      network.fit();
    }
  }, 250);

  network.on('click', (params) => {
    if (params.nodes.length > 0) showNodeDetail(params.nodes[0]);
    else nodeDetail.classList.add('hidden');
  });
}

window.addEventListener('resize', () => {
  if (network) {
    network.setSize('100%', '100%');
    network.fit();
  }
});

function showNodeDetail(nodeId) {
  const entity = graphData.entities.find(e => e.id === nodeId);
  if (!entity) return;

  document.getElementById('detail-name').textContent = entity.name;
  const typeEl = document.getElementById('detail-type');
  typeEl.textContent = entity.type;
  typeEl.style.background = `${TYPE_COLORS[entity.type] || TYPE_COLORS.unknown}20`;
  typeEl.style.color = TYPE_COLORS[entity.type] || TYPE_COLORS.unknown;
  document.getElementById('detail-desc').textContent = entity.description || 'No description.';

  const sourcesDiv = document.getElementById('detail-sources');
  const sourceEntries = (entity.sources || []).map(s => {
    const doc = graphData.documents.find(d => d.id === s.documentId);
    return `<div class="source-item">📄 ${escapeHtml(doc?.name || s.documentId)}${s.sourceText ? `: "${escapeHtml(s.sourceText.slice(0, 100))}"` : ''}</div>`;
  }).join('');
  sourcesDiv.innerHTML = sourceEntries ? `<h4>Sources</h4>${sourceEntries}` : '';

  const relsDiv = document.getElementById('detail-relations');
  const rels = graphData.relationships.filter(r => r.source === nodeId || r.target === nodeId);
  const relEntries = rels.map(r => {
    const other = graphData.entities.find(e => e.id === (r.source === nodeId ? r.target : r.source));
    const dir = r.source === nodeId ? '→' : '←';
    return `<div class="relation-item"><span class="rel-arrow">${dir}</span> <strong>${r.relation}</strong> ${escapeHtml(other?.name || 'unknown')}</div>`;
  }).join('');
  relsDiv.innerHTML = rels.length ? `<h4>Relationships (${rels.length})</h4>${relEntries}` : '';

  nodeDetail.classList.remove('hidden');
}

closeDetail.addEventListener('click', () => nodeDetail.classList.add('hidden'));

// ─── Chat / Q&A ────────────────────────────────────────────────────────────────
chatInput.addEventListener('input', () => {
  btnSend.disabled = !chatInput.value.trim();
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
});
btnSend.addEventListener('click', sendQuestion);

async function sendQuestion() {
  const question = chatInput.value.trim();
  if (!question) return;

  const welcome = chatMessages.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  addMessage('user', question);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  btnSend.disabled = true;
  const typingEl = addTypingIndicator();

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    typingEl.remove();
    if (!res.ok) throw new Error(data.error || 'Query failed');
    addBotMessage(data);
  } catch (err) {
    typingEl.remove();
    addMessage('bot-error', 'Error: ' + err.message);
  }
  scrollChatBottom();
}

function addMessage(type, text) {
  const div = document.createElement('div');
  div.className = `msg msg-${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  scrollChatBottom();
}

function addBotMessage(data) {
  const div = document.createElement('div');
  div.className = 'msg msg-bot';
  let html = '';

  const conf = data.confidence || 'medium';
  html += `<div class="msg-confidence confidence-${conf}">${conf}</div>`;
  html += `<div class="msg-answer">${escapeHtml(data.answer)}</div>`;

  if (data.reasoning_path && data.reasoning_path.length > 0) {
    html += `<div class="msg-path">`;
    data.reasoning_path.forEach(step => {
      if (step.startsWith('→') || step.startsWith('←')) {
        html += `<span class="path-arrow">${escapeHtml(step)}</span>`;
      } else {
        html += `<span class="path-node">${escapeHtml(step)}</span>`;
      }
    });
    html += `</div>`;
  }

  if (data.conflicts && data.conflicts.length > 0) {
    html += `<div class="msg-conflicts"><div class="conflict-title">⚠️ Conflicting Information</div>`;
    data.conflicts.forEach(c => {
      html += `<div class="conflict-side"><strong>${escapeHtml(c.description || '')}</strong></div>`;
      (c.sides || []).forEach(s => { html += `<div class="conflict-side">• ${escapeHtml(s)}</div>`; });
    });
    html += `</div>`;
  }

  if (data.citations && data.citations.length > 0) {
    html += `<div class="msg-citations"><div class="msg-citations-title">📎 Sources</div>`;
    data.citations.forEach(c => {
      html += `<div class="citation"><span class="citation-fact">${escapeHtml(c.fact || '')}</span><span class="citation-source">${escapeHtml(c.source || '')}</span></div>`;
    });
    html += `</div>`;
  }

  div.innerHTML = html;
  chatMessages.appendChild(div);
  scrollChatBottom();
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatMessages.appendChild(div);
  scrollChatBottom();
  return div;
}

function scrollChatBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ─── Clear Graph ───────────────────────────────────────────────────────────────
btnClear.addEventListener('click', async () => {
  if (!confirm('Clear all documents and the knowledge graph?')) return;
  try {
    await fetch('/api/clear', { method: 'POST' });
    graphData = { entities: [], relationships: [], documents: [] };
    docItems.innerHTML = '';
    docList.classList.add('hidden');
    updateStats();
    renderGraph();
    chatMessages.innerHTML = `
      <div class="chat-welcome">
        <div class="welcome-icon">🧠</div>
        <h3>Welcome to GraphMind</h3>
        <p>Upload documents or load the demo, then ask questions.</p>
        <div class="welcome-features">
          <div class="feature"><span>📊</span> Multi-hop reasoning</div>
          <div class="feature"><span>⚖️</span> Conflict detection</div>
          <div class="feature"><span>🚫</span> Abstention guardrail</div>
        </div>
      </div>`;
    nodeDetail.classList.add('hidden');
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// ─── 1-Click Demo ──────────────────────────────────────────────────────────────
if (btnDemo) {
  btnDemo.addEventListener('click', async () => {
    showLoading('Loading Demo Scenario...');
    try {
      const res = await fetch('/api/demo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Demo load failed');

      graphData = data.graph;
      docItems.innerHTML = '';
      docList.classList.remove('hidden');

      graphData.documents.forEach(d => {
        const cnt = graphData.entities.filter(e => e.sources?.some(s => s.documentId === d.id)).length;
        addDocChip(d.name, cnt);
      });

      updateStats();
      renderGraph();

      const welcome = chatMessages.querySelector('.chat-welcome');
      if (welcome) welcome.remove();
      addMessage('bot-info', '⚡ Demo loaded! Click a preset above to test Multi-Hop, Conflict, or Abstention.');
      hideLoading();
    } catch (err) {
      hideLoading();
      alert('Error: ' + err.message);
    }
  });
}

// ─── Export JSON ────────────────────────────────────────────────────────────────
if (btnExportJson) {
  btnExportJson.addEventListener('click', () => {
    if (!graphData.entities.length) { alert('Graph is empty.'); return; }
    const blob = new Blob([JSON.stringify({ timestamp: new Date().toISOString(), ...graphData }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `graphmind-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  });
}

// ─── Export PNG ─────────────────────────────────────────────────────────────────
if (btnExportPng) {
  btnExportPng.addEventListener('click', () => {
    if (!network || !graphData.entities.length) { alert('No graph to export.'); return; }
    const canvas = document.querySelector('#graph-container canvas');
    if (!canvas) { alert('Canvas not found.'); return; }
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png');
    a.download = `graphmind-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  });
}

// ─── Quick Presets ──────────────────────────────────────────────────────────────
document.querySelectorAll('.prompt-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const query = pill.getAttribute('data-query');
    if (!query) return;
    chatInput.value = query;
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    btnSend.disabled = false;
    sendQuestion();
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + percent);
  const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
  const b = Math.min(255, (num & 0x0000FF) + percent);
  return `rgb(${r},${g},${b})`;
}

// ─── API Health Check ──────────────────────────────────────────────────────────
async function checkApiStatus() {
  const badge = document.getElementById('api-status-badge');
  const text = document.getElementById('api-status-text');
  if (!badge || !text) return;

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.geminiConfigured) {
      badge.className = 'api-badge status-connected';
      text.textContent = 'Gemini Active';
      badge.title = `Model: ${data.model} | Key: ${data.apiKeyMasked}`;
    } else {
      badge.className = 'api-badge status-missing';
      text.textContent = 'API Key Missing';
      badge.title = 'Add GEMINI_API_KEY to your .env file';
    }
  } catch (err) {
    badge.className = 'api-badge status-missing';
    text.textContent = 'Server Offline';
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  checkApiStatus();
  try {
    const res = await fetch('/api/graph');
    graphData = await res.json();
    updateStats();
    if (graphData.entities.length > 0) {
      renderGraph();
      graphData.documents.forEach(d => {
        const cnt = graphData.entities.filter(e => e.sources?.some(s => s.documentId === d.id)).length;
        addDocChip(d.name, cnt);
      });
    }
  } catch (err) {
    console.error('Failed to load initial graph:', err);
  }
})();
