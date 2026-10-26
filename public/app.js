// ─── GraphMind — Knowledge Graph Workspace & Adaptive AI Copilot ──────────────

// ─── State ─────────────────────────────────────────────────────────────────────
let graphData = { entities: [], relationships: [], documents: [], conflicts: [] };
let network = null;
let currentLayout = 'exploration'; // 'exploration' | 'chat-expanded'
let selectedNodeId = null;

// ─── Entity Type Colors & Shapes ───────────────────────────────────────────────
const TYPE_COLORS = {
  person: '#cbd5e1',       // Platinum / silver slate
  organization: '#38bdf8', // Ice blue
  team: '#2dd4bf',         // Mint teal
  event: '#f59e0b',        // Warm champagne gold
  place: '#10b981',        // Emerald
  resource: '#fb923c',     // Warm bronze
  concept: '#94a3b8',      // Titanium slate
  unknown: '#64748b',      // Steel grey
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
const workspace = document.getElementById('app-workspace');
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
const btnAskAboutNode = document.getElementById('btn-ask-about-node');

// Layout Controls
const btnOpenChat = document.getElementById('btn-open-chat');
const launcherBarTrigger = document.getElementById('launcher-bar-trigger');
const btnCollapseChat = document.getElementById('btn-collapse-chat');
const btnToggleFloating = document.getElementById('btn-toggle-floating');
const floatingPanel = document.getElementById('floating-analytics-panel');
const floatingBody = document.getElementById('floating-analytics-body');
const dockedGrid = document.getElementById('docked-analytics-grid');

// ─── Loading Helpers ───────────────────────────────────────────────────────────
function showLoading(text = 'Processing...') {
  if (loadingText) loadingText.textContent = text;
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

// ─── Layout Switching (Phase 4 & 5) ───────────────────────────────────────────
function setLayout(mode) {
  currentLayout = mode;
  if (mode === 'chat-expanded') {
    workspace.classList.remove('layout-exploration');
    workspace.classList.add('layout-chat-expanded');
  } else {
    workspace.classList.remove('layout-chat-expanded');
    workspace.classList.add('layout-exploration');
    const chatPanel = document.getElementById('chat-panel');
    const graphStageWrapper = document.getElementById('graph-stage-wrapper');
    const dockedAnalytics = document.getElementById('docked-analytics-section');
    if (chatPanel) {
      chatPanel.style.width = '';
      chatPanel.style.maxWidth = '';
    }
    if (graphStageWrapper) {
      graphStageWrapper.style.height = '';
      graphStageWrapper.style.flex = '';
    }
    if (dockedAnalytics) {
      dockedAnalytics.style.height = '';
    }
  }

  // Allow CSS transition to settle, then fit vis.js canvas seamlessly
  setTimeout(() => {
    if (network) {
      network.setSize('100%', '100%');
      network.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
    }
  }, 260);

  updateAnalytics();
}

if (launcherBarTrigger) {
  launcherBarTrigger.addEventListener('click', () => {
    setLayout('chat-expanded');
    chatInput.focus();
  });
}
if (btnOpenChat) {
  btnOpenChat.addEventListener('click', (e) => {
    e.stopPropagation();
    setLayout('chat-expanded');
    chatInput.focus();
  });
}
if (btnCollapseChat) {
  btnCollapseChat.addEventListener('click', () => {
    setLayout('exploration');
  });
}

// Minimize / Expand Floating Analytics in Exploration View
if (btnToggleFloating && floatingPanel) {
  btnToggleFloating.addEventListener('click', () => {
    const isMinimized = floatingPanel.classList.toggle('minimized');
    btnToggleFloating.textContent = isMinimized ? '+' : '−';
  });
}

// ─── Workspace Resizers (3 Windows in Expanded Chat Mode) ──────────────────────
function initResizers() {
  const resizerChat = document.getElementById('resizer-chat');
  const resizerAnalytics = document.getElementById('resizer-analytics');
  const chatPanel = document.getElementById('chat-panel');
  const graphWorkspacePanel = document.getElementById('graph-workspace-panel');
  const graphStageWrapper = document.getElementById('graph-stage-wrapper');
  const btnResizeChat = document.getElementById('btn-resize-chat');
  const btnResizeAnalytics = document.getElementById('btn-resize-analytics');

  // 1. Column Resizer (Left Workspace vs Chat Panel)
  if (resizerChat && chatPanel && workspace) {
    let isDraggingCol = false;
    let startX = 0;
    let startChatWidth = 0;

    resizerChat.addEventListener('mousedown', (e) => {
      if (currentLayout !== 'chat-expanded') return;
      isDraggingCol = true;
      startX = e.clientX;
      startChatWidth = chatPanel.getBoundingClientRect().width;
      resizerChat.classList.add('is-dragging');
      document.body.classList.add('is-resizing-col');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingCol) return;
      const totalWidth = workspace.getBoundingClientRect().width;
      const deltaX = startX - e.clientX;
      const newWidth = Math.max(280, Math.min(totalWidth * 0.8, startChatWidth + deltaX));
      chatPanel.style.width = newWidth + 'px';
      chatPanel.style.maxWidth = '85%';
      if (network) network.redraw();
    });

    window.addEventListener('mouseup', () => {
      if (!isDraggingCol) return;
      isDraggingCol = false;
      resizerChat.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-col');
      if (network) network.fit({ animation: false });
    });
  }

  // 2. Row Resizer (Graph Stage vs Docked Analytics grounded from bottom)
  const dockedAnalyticsSection = document.getElementById('docked-analytics-section');
  if (resizerAnalytics && dockedAnalyticsSection && graphWorkspacePanel) {
    let isDraggingRow = false;
    let startY = 0;
    let startAnalyticsHeight = 0;

    resizerAnalytics.addEventListener('mousedown', (e) => {
      if (currentLayout !== 'chat-expanded') return;
      isDraggingRow = true;
      startY = e.clientY;
      startAnalyticsHeight = dockedAnalyticsSection.getBoundingClientRect().height;
      resizerAnalytics.classList.add('is-dragging');
      document.body.classList.add('is-resizing-row');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingRow) return;
      const totalHeight = graphWorkspacePanel.getBoundingClientRect().height;
      const deltaY = e.clientY - startY;
      const minHeight = 120;
      const maxHeight = Math.max(minHeight, totalHeight - 160);
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startAnalyticsHeight - deltaY));
      dockedAnalyticsSection.style.height = newHeight + 'px';
      if (graphStageWrapper) {
        graphStageWrapper.style.flex = '1';
        graphStageWrapper.style.height = 'auto';
      }
      if (network) network.redraw();
    });

    window.addEventListener('mouseup', () => {
      if (!isDraggingRow) return;
      isDraggingRow = false;
      resizerAnalytics.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-row');
      if (network) network.fit({ animation: false });
    });
  }

  // 3. Quick Toggle Presets for Chat Width (Default 35% -> Wide 55% -> Full 75%)
  if (btnResizeChat && chatPanel && workspace) {
    let chatPresetIndex = 0;
    const presets = [0.35, 0.55, 0.72];
    btnResizeChat.addEventListener('click', () => {
      chatPresetIndex = (chatPresetIndex + 1) % presets.length;
      const totalWidth = workspace.getBoundingClientRect().width;
      const targetWidth = Math.round(totalWidth * presets[chatPresetIndex]);
      chatPanel.style.width = targetWidth + 'px';
      chatPanel.style.maxWidth = '85%';
      btnResizeChat.setAttribute('title', `Chat size: ${Math.round(presets[chatPresetIndex] * 100)}% (click to cycle)`);
      setTimeout(() => {
        if (network) network.fit({ animation: true });
      }, 300);
    });
  }

  // 4. Quick Toggle Presets for Bottom Analytics (Default 270px -> Expanded 440px -> Compact 150px)
  if (btnResizeAnalytics && dockedAnalyticsSection && graphWorkspacePanel) {
    let analyticsPresetIndex = 0;
    const presets = [270, 440, 150];
    btnResizeAnalytics.addEventListener('click', () => {
      analyticsPresetIndex = (analyticsPresetIndex + 1) % presets.length;
      const targetHeight = presets[analyticsPresetIndex];
      dockedAnalyticsSection.style.height = targetHeight + 'px';
      if (graphStageWrapper) {
        graphStageWrapper.style.flex = '1';
        graphStageWrapper.style.height = 'auto';
      }
      btnResizeAnalytics.setAttribute('title', `Analytics height: ${targetHeight}px (click to cycle)`);
      setTimeout(() => {
        if (network) network.fit({ animation: true });
      }, 300);
    });
  }
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────
function updateStats() {
  const docEl = document.querySelector('#stat-docs .stat-num');
  const entEl = document.querySelector('#stat-entities .stat-num');
  const relEl = document.querySelector('#stat-relations .stat-num');
  if (docEl) docEl.textContent = graphData.documents.length;
  if (entEl) entEl.textContent = graphData.entities.length;
  if (relEl) relEl.textContent = graphData.relationships.length;
}

// ─── Analytics Engine Integration (Phase 3) ───────────────────────────────────
function updateAnalytics() {
  if (typeof GraphAnalytics === 'undefined') return;

  const analytics = GraphAnalytics.deriveGraphAnalytics(graphData, selectedNodeId);
  renderFloatingAnalytics(analytics);
  renderDockedAnalytics(analytics);
}

// Render Floating Panel (Exploration Mode, Upper-Right)
function renderFloatingAnalytics(analytics) {
  if (!floatingBody) return;

  if (analytics.isEmpty) {
    floatingBody.innerHTML = `
      <div style="text-align:center; padding:16px 8px; color:var(--text-3); font-size:11px;">
        Upload docs or paste text to populate live graph intelligence.
      </div>`;
    return;
  }

  const densityPct = Math.round(analytics.density * 1000) / 10;
  let html = '';

  // KPI Grid
  html += `
    <div class="floating-kpis">
      <div class="kpi-card-mini">
        <div class="kpi-label-mini">Density</div>
        <div class="kpi-val-mini">${densityPct}%</div>
        <div class="kpi-sub-mini">${analytics.core.relationshipsCount} edges / max</div>
      </div>
      <div class="kpi-card-mini">
        <div class="kpi-label-mini">Avg Degree</div>
        <div class="kpi-val-mini">${analytics.degree.avgDegree}</div>
        <div class="kpi-sub-mini">Max: ${analytics.degree.maxDegree} conn</div>
      </div>
      <div class="kpi-card-mini">
        <div class="kpi-label-mini">Components</div>
        <div class="kpi-val-mini">${analytics.components.count}</div>
        <div class="kpi-sub-mini">${analytics.degree.isolatedCount} isolated</div>
      </div>
    </div>`;

  // Entity Type Distribution (Top 4)
  if (analytics.entityDistribution.breakdown.length > 0) {
    html += `
      <div>
        <div class="section-title-mini">Entity Taxonomy</div>
        <div class="type-bars-container">`;
    analytics.entityDistribution.breakdown.slice(0, 4).forEach(item => {
      const color = TYPE_COLORS[item.type] || TYPE_COLORS.unknown;
      html += `
        <div class="type-bar-row">
          <span class="type-bar-name">${escapeHtml(item.type)}</span>
          <div class="type-bar-track">
            <div class="type-bar-fill" style="width:${item.percentage}%; background:${color}"></div>
          </div>
          <span class="type-bar-count">${item.count}</span>
        </div>`;
    });
    html += `</div></div>`;
  }

  // Key Connected Hubs (Top 3)
  if (analytics.degree.topHubs.length > 0) {
    html += `
      <div>
        <div class="section-title-mini">Top Hub Entities</div>
        <div class="hub-list-mini">`;
    analytics.degree.topHubs.slice(0, 3).forEach(hub => {
      html += `
        <div class="hub-item-mini" onclick="focusGraphNode('${escapeHtml(hub.id)}')">
          <span class="hub-name-mini">${escapeHtml(hub.name)}</span>
          <span class="hub-degree-pill">${hub.degree} links</span>
        </div>`;
    });
    html += `</div></div>`;
  }

  // Contextual Selected Entity
  if (analytics.contextual) {
    const ctx = analytics.contextual;
    html += `
      <div class="floating-selected-box">
        <div class="sel-title">🎯 ${escapeHtml(ctx.name)}</div>
        <div class="sel-meta">${ctx.type} · ${ctx.degree} connections (${ctx.sources.length} sources)</div>
        <button onclick="askAboutEntity('${escapeHtml(ctx.name)}')">💬 Ask AI About Entity</button>
      </div>`;
  }

  floatingBody.innerHTML = html;
}

// Render Docked Analytics Section (Expanded Mode, Beneath Graph)
function renderDockedAnalytics(analytics) {
  if (!dockedGrid) return;

  if (analytics.isEmpty) {
    dockedGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 28px; color: var(--text-3); font-size: 12px;">
        No graph data loaded. Upload documents or paste raw text to view live structural analytics.
      </div>`;
    return;
  }

  const densityPct = Math.round(analytics.density * 1000) / 10;
  let html = '';

  // Card 1: Graph Structure & Topology
  html += `
    <div class="docked-card">
      <div class="docked-card-title">
        <span>Topology & Structure</span>
        <span class="badge">${analytics.core.entitiesCount}V / ${analytics.core.relationshipsCount}E</span>
      </div>
      <div class="kpi-row-duo">
        <div class="kpi-cell">
          <div class="kpi-cell-val" style="color:var(--violet)">${densityPct}%</div>
          <div class="kpi-cell-label">Graph Density</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-cell-val" style="color:var(--cyan)">${analytics.degree.avgDegree}</div>
          <div class="kpi-cell-label">Average Degree</div>
        </div>
      </div>
      <div class="kpi-row-duo" style="margin-bottom:0">
        <div class="kpi-cell">
          <div class="kpi-cell-val">${analytics.components.count}</div>
          <div class="kpi-cell-label">Components (max size ${analytics.components.largestComponentSize})</div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-cell-val">${analytics.degree.isolatedCount}</div>
          <div class="kpi-cell-label">Isolated Nodes</div>
        </div>
      </div>
    </div>`;

  // Card 2: Entity Taxonomy Distribution
  html += `
    <div class="docked-card">
      <div class="docked-card-title">
        <span>Entity Taxonomy</span>
        <span class="badge">${analytics.entityDistribution.uniqueTypesCount} Types</span>
      </div>
      <div class="type-bars-container" style="gap:7px;">`;
  analytics.entityDistribution.breakdown.slice(0, 5).forEach(item => {
    const color = TYPE_COLORS[item.type] || TYPE_COLORS.unknown;
    html += `
      <div class="type-bar-row">
        <span class="type-bar-name" title="${item.type}">${escapeHtml(item.type)}</span>
        <div class="type-bar-track">
          <div class="type-bar-fill" style="width:${item.percentage}%; background:${color}"></div>
        </div>
        <span class="type-bar-count">${item.count} (${item.percentage}%)</span>
      </div>`;
  });
  html += `</div></div>`;

  // Card 3: Key Hub Entities
  html += `
    <div class="docked-card">
      <div class="docked-card-title">
        <span>Hub Entities & Bridges</span>
        <span class="badge">Top Connected</span>
      </div>
      <div class="hub-list-mini" style="gap:5px;">`;
  analytics.degree.topHubs.slice(0, 4).forEach(hub => {
    html += `
      <div class="hub-item-mini" onclick="focusGraphNode('${escapeHtml(hub.id)}')">
        <span class="hub-name-mini">${escapeHtml(hub.name)} <span style="font-size:9px; color:var(--text-3)">(${hub.type})</span></span>
        <span class="hub-degree-pill">${hub.degree} links</span>
      </div>`;
  });
  html += `</div></div>`;


  // Card 5 (Contextual Node Inspector in Docked Area)
  if (analytics.contextual) {
    const ctx = analytics.contextual;
    html += `
      <div class="docked-card" style="border-color:rgba(245,158,11,0.35); background:linear-gradient(135deg, rgba(245,158,11,0.06), rgba(20,24,32,0.8)); grid-column:1 / -1;">
        <div class="docked-card-title">
          <span style="color:#fbbf24;">🎯 Active Entity Focus: ${escapeHtml(ctx.name)}</span>
          <button class="btn-sm" style="padding:3px 10px; font-size:10px;" onclick="askAboutEntity('${escapeHtml(ctx.name)}')">Ask AI About ${escapeHtml(ctx.name)}</button>
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:var(--text-2);">
          <div><strong>Type:</strong> ${ctx.type}</div>
          <div><strong>Total Degree:</strong> ${ctx.degree} (${ctx.incomingCount} in / ${ctx.outgoingCount} out)</div>
          <div><strong>Neighbors:</strong> ${ctx.neighbors.map(n => escapeHtml(n.name)).join(', ') || 'None'}</div>
          <div><strong>Sources Cited:</strong> ${ctx.sources.length} document references</div>
        </div>
      </div>`;
  }

  dockedGrid.innerHTML = html;
}

// ─── File Upload ───────────────────────────────────────────────────────────────
if (dropZone) {
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  });
}

if (fileInput) {
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadFiles(fileInput.files);
    fileInput.value = '';
  });
}

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'];

function isValidFileType(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

async function uploadFiles(files) {
  for (const file of files) {
    if (!isValidFileType(file.name)) {
      alert(`Unsupported file type for "${file.name}". Only .pdf, .txt, and .md files are supported.`);
      continue;
    }
    await uploadSingleFile(file);
  }
}

async function uploadSingleFile(file) {
  if (!isValidFileType(file.name)) {
    alert(`Unsupported file type for "${file.name}". Only .pdf, .txt, and .md files are supported.`);
    return;
  }
  showLoading(`Extracting from "${file.name}"...`);
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    graphData = data.graph;
    renderDocChips();
    updateStats();
    renderGraph();
    updateAnalytics();
    hideLoading();
  } catch (err) {
    hideLoading();
    alert('Error: ' + err.message);
  }
}

// ─── Paste Text ────────────────────────────────────────────────────────────────
if (pasteInput) {
  pasteInput.addEventListener('input', () => {
    btnPasteSubmit.disabled = !pasteInput.value.trim();
  });
}

if (btnPasteSubmit) {
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
      renderDocChips();
      updateStats();
      renderGraph();
      updateAnalytics();
      pasteInput.value = '';
      btnPasteSubmit.disabled = true;
      hideLoading();
    } catch (err) {
      hideLoading();
      alert('Error: ' + err.message);
    }
  });
}

// ─── Document Chips & Removal ─────────────────────────────────────────────────
function renderDocChips() {
  if (!docList || !docItems) return;
  docItems.innerHTML = '';

  if (!graphData.documents || graphData.documents.length === 0) {
    docList.classList.add('hidden');
    return;
  }

  docList.classList.remove('hidden');
  graphData.documents.forEach(d => {
    const cnt = graphData.entities.filter(e => e.sources?.some(s => s.documentId === d.id)).length;
    const chip = document.createElement('span');
    chip.className = 'doc-chip';
    chip.setAttribute('data-doc-id', d.id);
    chip.setAttribute('title', `${d.name} (${cnt} entities). Hover to remove.`);
    chip.innerHTML = `
      <span class="doc-chip-label" title="${escapeHtml(d.name)}">📄 ${escapeHtml(d.name)}</span>
      <span class="chip-badge" title="${cnt} extracted entities">${cnt}</span>
      <button type="button" class="doc-remove-btn" title="Remove ${escapeHtml(d.name)}" aria-label="Remove ${escapeHtml(d.name)}">✕</button>
    `;

    const removeBtn = chip.querySelector('.doc-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeDocument(d.id, e);
      });
    }

    docItems.appendChild(chip);
  });
}

function addDocChip(name, entityCount) {
  renderDocChips();
}

window.removeDocument = async function (docId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const doc = (graphData.documents || []).find(d => d.id === docId || d.name === docId);
  const docName = doc?.name || docId || 'document';

  if (!confirm(`Remove "${docName}" from the knowledge graph?`)) return;

  showLoading(`Removing "${docName}"...`);
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.graph) {
      graphData = data.graph;
    } else {
      // Local optimistic fallback if server is out of sync or restarted
      const matchingIds = new Set([docId, doc?.id, doc?.name].filter(Boolean));
      graphData.documents = (graphData.documents || []).filter(d => !matchingIds.has(d.id) && !matchingIds.has(d.name));
      graphData.entities = (graphData.entities || []).filter(e => {
        if (!e.sources) return false;
        e.sources = e.sources.filter(s => !matchingIds.has(s.documentId));
        return e.sources.length > 0;
      });
      const validEntityIds = new Set(graphData.entities.map(e => e.id));
      graphData.relationships = (graphData.relationships || []).filter(r =>
        !matchingIds.has(r.documentId) && validEntityIds.has(r.source) && validEntityIds.has(r.target)
      );
    }

    if (selectedNodeId && !graphData.entities.some(e => e.id === selectedNodeId)) {
      selectedNodeId = null;
      if (nodeDetail) nodeDetail.classList.add('hidden');
    }

    renderDocChips();
    updateStats();
    renderGraph();
    updateAnalytics();

    addMessage('bot-info', `Removed "${docName}". Knowledge graph and analytics have been dynamically updated.`);
    hideLoading();
  } catch (err) {
    console.warn('Removal fallback triggered:', err);
    // Guarantee UI never stays broken or stuck on error
    const matchingIds = new Set([docId, doc?.id, doc?.name].filter(Boolean));
    graphData.documents = (graphData.documents || []).filter(d => !matchingIds.has(d.id) && !matchingIds.has(d.name));
    renderDocChips();
    updateStats();
    renderGraph();
    updateAnalytics();
    hideLoading();
  }
};

// ─── Graph Rendering ───────────────────────────────────────────────────────────
function renderGraph() {
  const container = document.getElementById('graph-container');
  if (!container) return;
  container.innerHTML = '';

  if (graphData.entities.length === 0) {
    container.innerHTML = `
      <div class="graph-empty">
        <div class="empty-state">
          <span class="empty-icon">🔗</span>
          <p>Upload documents or paste text to build your graph</p>
          <p class="empty-sub">Entities and relationships will render interactively</p>
        </div>
      </div>`;
    return;
  }

  // Legend
  const legend = document.getElementById('graph-legend');
  if (legend) {
    const typesUsed = new Set(graphData.entities.map(e => e.type));
    legend.innerHTML = '';
    for (const type of typesUsed) {
      const color = TYPE_COLORS[type] || TYPE_COLORS.unknown;
      legend.innerHTML += `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${type}</span>`;
    }

    const hasConflicts = graphData.relationships.some(r => r.isConflict);
    if (hasConflicts) {
      legend.innerHTML += `<span class="legend-item conflict-item"><span class="legend-line-conflict"></span>⚠️ Conflict</span>`;
      if (conflictBadge) conflictBadge.classList.remove('hidden');
    } else {
      if (conflictBadge) conflictBadge.classList.add('hidden');
    }
  }

  // Nodes
  const nodes = new vis.DataSet(graphData.entities.map(e => ({
    id: e.id,
    label: e.name,
    color: {
      background: TYPE_COLORS[e.type] || TYPE_COLORS.unknown,
      border: TYPE_COLORS[e.type] || TYPE_COLORS.unknown,
      highlight: { background: '#ffffff', border: TYPE_COLORS[e.type] || TYPE_COLORS.unknown },
      hover: { background: lightenColor(TYPE_COLORS[e.type] || TYPE_COLORS.unknown, 25), border: TYPE_COLORS[e.type] || TYPE_COLORS.unknown },
    },
    shape: TYPE_SHAPES[e.type] || 'dot',
    size: 16 + Math.min(e.sources?.length || 0, 5) * 3,
    font: { color: '#f3f4f8', size: 11, face: 'Inter, sans-serif', strokeWidth: 3, strokeColor: '#080a0f' },
    borderWidth: 2,
    shadow: { enabled: true, color: TYPE_COLORS[e.type] || TYPE_COLORS.unknown, size: 7, x: 0, y: 0 },
  })));

  // Edges
  const edges = new vis.DataSet(graphData.relationships.map((r, i) => {
    const isConflict = Boolean(r.isConflict);
    return {
      id: `edge_${i}`,
      from: r.source,
      to: r.target,
      label: r.relation,
      arrows: 'to',
      color: isConflict ? { color: '#f59e0b', highlight: '#fbbf24', hover: '#fbbf24' } : {
        color: r.confidence === 'high' ? 'rgba(203,213,225,0.55)' : r.confidence === 'medium' ? 'rgba(245,158,11,0.45)' : 'rgba(100,116,139,0.35)',
        highlight: '#f8fafc', hover: '#ffffff',
      },
      dashes: isConflict ? [6, 4] : (r.confidence === 'low'),
      font: { color: isConflict ? '#fbbf24' : '#929cb3', size: isConflict ? 10 : 9, face: 'Inter, sans-serif', strokeWidth: 2, strokeColor: '#080a0f', align: 'top' },
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
    network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
  });

  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      selectedNodeId = params.nodes[0];
      showNodeDetail(selectedNodeId);
      updateAnalytics();
    } else {
      selectedNodeId = null;
      if (nodeDetail) nodeDetail.classList.add('hidden');
      updateAnalytics();
    }
  });
}

// Focus a node in the graph on hub click
window.focusGraphNode = function (nodeId) {
  if (!network) return;
  selectedNodeId = nodeId;
  network.selectNodes([nodeId]);
  network.focus(nodeId, { scale: 1.2, animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  showNodeDetail(nodeId);
  updateAnalytics();
};

window.addEventListener('resize', () => {
  if (network) {
    network.setSize('100%', '100%');
    network.fit();
  }
});

function showNodeDetail(nodeId) {
  const entity = graphData.entities.find(e => e.id === nodeId);
  if (!entity || !nodeDetail) return;

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

if (closeDetail) {
  closeDetail.addEventListener('click', () => {
    if (nodeDetail) nodeDetail.classList.add('hidden');
    selectedNodeId = null;
    updateAnalytics();
  });
}

// Ask AI About Entity from Node Detail or Analytics
window.askAboutEntity = function (entityName) {
  if (!entityName) return;
  setLayout('chat-expanded');
  chatInput.value = `What role does ${entityName} play, what are its relationships, and what sources describe it?`;
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  btnSend.disabled = false;
  chatInput.focus();
};

if (btnAskAboutNode) {
  btnAskAboutNode.addEventListener('click', () => {
    const entity = graphData.entities.find(e => e.id === selectedNodeId);
    if (entity) askAboutEntity(entity.name);
  });
}

// ─── Chat / Q&A ────────────────────────────────────────────────────────────────
if (chatInput) {
  chatInput.addEventListener('input', () => {
    btnSend.disabled = !chatInput.value.trim();
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
  });
}

if (btnSend) {
  btnSend.addEventListener('click', sendQuestion);
}

async function sendQuestion() {
  const question = chatInput.value.trim();
  if (!question) return;

  // If in exploration mode, expand chat first
  if (currentLayout !== 'chat-expanded') {
    setLayout('chat-expanded');
  }

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
if (btnClear) {
  btnClear.addEventListener('click', async () => {
    if (!confirm('Clear all documents and the knowledge graph?')) return;
    try {
      await fetch('/api/clear', { method: 'POST' });
      graphData = { entities: [], relationships: [], documents: [], conflicts: [] };
      selectedNodeId = null;
      if (docItems) docItems.innerHTML = '';
      if (docList) docList.classList.add('hidden');
      updateStats();
      renderGraph();
      updateAnalytics();
      chatMessages.innerHTML = `
        <div class="chat-welcome">
          <h3>Welcome to GraphMind</h3>
          <p>Upload documents or paste text to extract entities, relationships, and ask questions grounded strictly in your knowledge graph.</p>
        </div>`;
      if (nodeDetail) nodeDetail.classList.add('hidden');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

// ─── Demo Scenario Functionality (Preserved) ──────────────────────────────────
window.loadDemo = async function () {
  showLoading('Loading Demo Scenario...');
  try {
    const res = await fetch('/api/demo', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Demo load failed');

    graphData = data.graph;
    selectedNodeId = null;
    renderDocChips();

    updateStats();
    renderGraph();
    updateAnalytics();

    const welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    addMessage('bot-info', '⚡ Demo scenario loaded! Multi-hop paths and budget conflicts are active in the graph. Ask questions in the chat to test Grounded Q&A.');
    hideLoading();
    return true;
  } catch (err) {
    hideLoading();
    console.error('Demo load error:', err);
    return false;
  }
};

if (btnDemo) {
  btnDemo.addEventListener('click', window.loadDemo);
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
    setLayout('chat-expanded');
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
  initResizers();
  checkApiStatus();
  try {
    const res = await fetch('/api/graph');
    graphData = await res.json();
    updateStats();
    if (graphData.entities.length > 0) {
      renderGraph();
    }
    renderDocChips();
    updateAnalytics();
  } catch (err) {
    console.error('Failed to load initial graph:', err);
  }
})();
