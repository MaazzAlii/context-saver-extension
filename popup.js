// ============================================================
// AI Context Saver - Popup Script
// ============================================================

// ── STATE ──────────────────────────────────────────────────
let currentData = null;
let mistralKey = null;

// ── ELEMENTS ───────────────────────────────────────────────
const btnExtract        = document.getElementById('btnExtract');
const btnExtractLabel   = document.getElementById('btnExtractLabel');
const spinner           = document.getElementById('spinner');
const statusDot         = document.getElementById('statusDot');
const statusText        = document.getElementById('statusText');
const platformBadge     = document.getElementById('platformBadge');
const statsSection      = document.getElementById('statsSection');
const previewSection    = document.getElementById('previewSection');
const actionsSection    = document.getElementById('actionsSection');
const promptSection     = document.getElementById('promptSection');
const summarySection    = document.getElementById('summarySection');
const previewBox        = document.getElementById('previewBox');
const previewCount      = document.getElementById('previewCount');
const promptBox         = document.getElementById('promptBox');
const summaryBox        = document.getElementById('summaryBox');
const btnCopyPrompt     = document.getElementById('btnCopyPrompt');
const btnCopySummary    = document.getElementById('btnCopySummary');
const btnSaveSession    = document.getElementById('btnSaveSession');
const btnClearAll       = document.getElementById('btnClearAll');
const savedList         = document.getElementById('savedList');
const contextLimit      = document.getElementById('contextLimit');
const contextLimitVal   = document.getElementById('contextLimitVal');
const toast             = document.getElementById('toast');
const btnAISummary      = document.getElementById('btnAISummary');
const btnAISummaryLabel = document.getElementById('btnAISummaryLabel');
const spinnerMistral    = document.getElementById('spinnerMistral');
const mistralKeyInput   = document.getElementById('mistralKeyInput');
const btnSaveKey        = document.getElementById('btnSaveKey');
const apiStatusBar      = document.getElementById('apiStatusBar');

// ── LIVE PROGRESS LISTENER ────────────────────────────────
// Receives real-time updates from content script during auto-scroll
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'scrollProgress') {
    const { count, pct, status } = request;
    // Update status bar live
    setStatus('idle', status || `Scrolling… ${count} messages found`);
    // Update stats live if section is visible
    if (count > 0) {
      statsSection.classList.remove('hidden');
      document.getElementById('statMessages').textContent = count;
      document.getElementById('statTokens').textContent =
        count > 0 ? (count * 1.8 > 999 ? (count * 1.8 / 1000).toFixed(1) + 'k' : Math.round(count * 1.8)) : '0';
      document.getElementById('statTurns').textContent = Math.floor(count / 2);
    }
  }
});

// ── INIT ───────────────────────────────────────────────────
init();

async function init() {
  // Detect platform from current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = new URL(tab.url || 'https://unknown').hostname;
  const platformMap = {
    'claude.ai': 'Claude',
    'chatgpt.com': 'ChatGPT',
    'chat.openai.com': 'ChatGPT',
    'gemini.google.com': 'Gemini',
    'copilot.microsoft.com': 'Copilot',
    'www.perplexity.ai': 'Perplexity'
  };
  const platform = Object.entries(platformMap).find(([k]) => host.includes(k));
  platformBadge.textContent = platform ? platform[1] : 'Unknown';

  if (!platform) {
    setStatus('error', 'Not on a supported AI platform');
    btnExtract.disabled = true;
    btnExtract.style.opacity = '0.5';
  } else {
    setStatus('idle', `Ready to extract from ${platform[1]}`);
    statusDot.className = 'status-dot active';
  }

  // Load all settings
  const stored = await chrome.storage.local.get(['contextLimit', 'summaryMode', 'mistralKey']);
  if (stored.contextLimit) {
    contextLimit.value = stored.contextLimit;
    contextLimitVal.textContent = stored.contextLimit;
  }
  if (stored.summaryMode) {
    const radio = document.querySelector(`input[name="summaryMode"][value="${stored.summaryMode}"]`);
    if (radio) radio.checked = true;
  }

  // Load Mistral key
  if (stored.mistralKey) {
    mistralKey = stored.mistralKey;
    mistralKeyInput.value = '••••••••••••••••••••••••';
    setApiStatus(true);
  } else {
    setApiStatus(false);
  }

  renderSavedSessions();
}

// ── TABS ───────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'saved') renderSavedSessions();
  });
});

// ── SETTINGS ──────────────────────────────────────────────
contextLimit.addEventListener('input', () => {
  contextLimitVal.textContent = contextLimit.value;
  chrome.storage.local.set({ contextLimit: parseInt(contextLimit.value) });
});

document.querySelectorAll('input[name="summaryMode"]').forEach(r => {
  r.addEventListener('change', () => {
    chrome.storage.local.set({ summaryMode: r.value });
  });
});

// ── MISTRAL KEY SAVE ──────────────────────────────────────
btnSaveKey.addEventListener('click', async () => {
  const key = mistralKeyInput.value.trim();
  if (!key || key.startsWith('•')) {
    showToast('Please paste your Mistral API key');
    return;
  }
  // Validate key format (Mistral keys start with specific prefix)
  if (key.length < 20) {
    showToast('Key seems too short — check it');
    return;
  }

  // Test the key with a quick API call
  btnSaveKey.textContent = 'Testing…';
  btnSaveKey.disabled = true;

  try {
    const resp = await fetch('https://api.mistral.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });

    if (resp.ok) {
      mistralKey = key;
      await chrome.storage.local.set({ mistralKey: key });
      mistralKeyInput.value = '••••••••••••••••••••••••';
      setApiStatus(true);
      showToast('✓ Mistral API key saved!');
      // Enable button if data is already loaded
      if (currentData) btnAISummary.disabled = false;
    } else {
      showToast('❌ Invalid key — check and retry');
      setApiStatus(false);
    }
  } catch (e) {
    showToast('❌ Network error testing key');
    setApiStatus(false);
  }

  btnSaveKey.textContent = 'Save';
  btnSaveKey.disabled = false;
});

// Allow clearing key by typing in field
mistralKeyInput.addEventListener('focus', () => {
  if (mistralKeyInput.value.startsWith('•')) {
    mistralKeyInput.value = '';
    mistralKeyInput.type = 'text';
  }
});
mistralKeyInput.addEventListener('blur', () => {
  mistralKeyInput.type = 'password';
  if (!mistralKeyInput.value && mistralKey) {
    mistralKeyInput.value = '••••••••••••••••••••••••';
  }
});

btnClearAll.addEventListener('click', async () => {
  if (confirm('Delete all saved sessions?')) {
    await chrome.storage.local.remove('sessions');
    renderSavedSessions();
    showToast('All sessions cleared');
  }
});

// ── EXTRACT ────────────────────────────────────────────────
btnExtract.addEventListener('click', async () => {
  setLoading(true);
  setStatus('idle', 'Auto-scrolling chat… please wait (10–20s)');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }).catch(() => {});

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'extractChat' });

    if (!result || !result.success) {
      setStatus('error', result?.error || 'Extraction failed. Try scrolling to top manually first.');
      setLoading(false);
      return;
    }

    currentData = result;
    displayExtractedData(result);
    setStatus('active', `✓ Captured ${result.messages.length} messages from ${result.platform}`);
  } catch (err) {
    setStatus('error', 'Error: ' + (err.message || 'Could not connect to page'));
  }

  setLoading(false);
});

// ── FILTER GARBAGE MESSAGES ───────────────────────────────
// Remove any messages that are themselves context summaries/continuations
// (happens when user pastes a summary into a chat and then extracts it)
function filterGarbageMessages(messages) {
  const GARBAGE_PREFIXES = [
    '[AI CONTEXT SUMMARY',
    '[CONTEXT CONTINUATION',
    'This is a continuation of a previous AI',
    'Please read the above summary',
    'Please read the above conversation',
    '[READY — Please respond with',
    'Got it! I understand your previous context',
    "Got it! I've read your previous conversation",
  ];

  return messages.filter(msg => {
    const text = msg.text.trim();
    return !GARBAGE_PREFIXES.some(prefix => text.startsWith(prefix));
  });
}

// ── DISPLAY DATA ──────────────────────────────────────────
function displayExtractedData(data) {
  const limit = parseInt(contextLimit.value) || 50;

  // Filter garbage FIRST before anything else
  const cleanMessages = filterGarbageMessages(data.messages);
  // Store cleaned messages back so Mistral also gets clean data
  data.messages = cleanMessages;

  // For preview & raw copy: respect the limit slider
  const messages = cleanMessages.slice(-limit);
  // For stats: show totals from cleaned set
  const humanCount = cleanMessages.filter(m => m.role === 'human').length;
  const aiCount    = cleanMessages.filter(m => m.role === 'ai').length;
  const approxTokens = Math.round(cleanMessages.reduce((s, m) => s + m.text.length, 0) / 4);

  document.getElementById('statMessages').textContent = cleanMessages.length;
  document.getElementById('statTokens').textContent = approxTokens > 999
    ? (approxTokens / 1000).toFixed(1) + 'k' : approxTokens;
  document.getElementById('statTurns').textContent = Math.min(humanCount, aiCount);

  statsSection.classList.remove('hidden');

  // Preview — show last 8 clean messages
  previewBox.innerHTML = '';
  messages.slice(-8).forEach(msg => {
    const div = document.createElement('div');
    div.className = 'msg-line';
    const roleEl = document.createElement('div');
    roleEl.className = `msg-role ${msg.role}`;
    roleEl.textContent = msg.role === 'human' ? '▶ YOU' : `▶ ${data.platform.toUpperCase()}`;
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = msg.text.length > 200 ? msg.text.substring(0, 200) + '…' : msg.text;
    div.appendChild(roleEl);
    div.appendChild(textEl);
    previewBox.appendChild(div);
  });

  previewCount.textContent = `${cleanMessages.length} msgs`;
  previewSection.classList.remove('hidden');

  // Generate continuation prompt from clean messages
  const prompt = buildContinuationPrompt(data, messages);
  promptBox.textContent = prompt;
  promptSection.classList.remove('hidden');

  // Enable AI Summary button only if key exists
  btnAISummary.disabled = !mistralKey;
  actionsSection.classList.remove('hidden');

  // Hide previous summary if re-extracting
  summarySection.classList.add('hidden');
  summaryBox.textContent = '';
}

// ── BUILD PROMPT ──────────────────────────────────────────
function buildContinuationPrompt(data, messages) {
  const mode = document.querySelector('input[name="summaryMode"]:checked')?.value || 'full';
  const platform = data.platform;
  const now = new Date().toLocaleString();

  let prompt = `[CONTEXT CONTINUATION — Originally from ${platform} | Saved: ${now}]\n\n`;
  prompt += `This is a continuation of a previous AI chat session. Here is the conversation history so far:\n\n`;
  prompt += `${'─'.repeat(50)}\n\n`;

  if (mode === 'minimal') {
    // Key points only
    prompt += `SUMMARY OF PREVIOUS CONVERSATION:\n`;
    const aiMessages = messages.filter(m => m.role === 'ai');
    const lastFew = aiMessages.slice(-3);
    lastFew.forEach(m => {
      prompt += `• ${m.text.substring(0, 300)}${m.text.length > 300 ? '…' : ''}\n`;
    });
    prompt += `\n[End of summary]\n\n`;
  } else if (mode === 'smart') {
    // First exchange + last N messages
    const first = messages.slice(0, 2);
    const last = messages.slice(-8);
    const combined = [...first, { role: 'ai', text: '… [middle of conversation] …' }, ...last];

    combined.forEach(m => {
      if (m.text === '… [middle of conversation] …') {
        prompt += `…\n[Some messages omitted for brevity]\n…\n\n`;
        return;
      }
      const role = m.role === 'human' ? 'Human' : platform;
      prompt += `${role}:\n${m.text}\n\n`;
    });
  } else {
    // Full history
    messages.forEach(m => {
      const role = m.role === 'human' ? 'Human' : platform;
      prompt += `${role}:\n${m.text}\n\n`;
    });
  }

  prompt += `${'─'.repeat(50)}\n\n`;
  prompt += `Please read the above conversation carefully and continue from where we left off. `;
  prompt += `The next message from me will continue this session.\n\n`;
  prompt += `[READY — Please respond with: "Got it! I've read your previous conversation. What would you like to continue with?"]`;

  return prompt;
}

// ── MISTRAL AI SUMMARIZATION ──────────────────────────────
btnAISummary.addEventListener('click', async () => {
  if (!mistralKey || !currentData) return;

  setMistralLoading(true);
  setStatus('idle', 'Sending full chat to Mistral AI…');

  try {
    // ✅ FIX: Use ALL extracted messages, not just last N
    // The context limit slider only applies to raw copy mode
    const allMessages = currentData.messages;
    const platform = currentData.platform;

    // Build the FULL conversation text
    let chatText = '';
    allMessages.forEach((m, i) => {
      const role = m.role === 'human' ? 'Human' : platform;
      // Cap each message at 1500 chars to stay within API limits
      const text = m.text.length > 1500 ? m.text.substring(0, 1500) + '…[truncated]' : m.text;
      chatText += `[${i + 1}] ${role}: ${text}\n\n`;
    });

    const totalMessages = allMessages.length;
    const systemPrompt = `You are an expert at summarizing AI conversations for context continuation.
Your job: create a COMPLETE and DETAILED summary of the ENTIRE conversation (all ${totalMessages} messages) that can be pasted into a NEW AI chat session so the new AI understands the full context and can continue seamlessly.

Rules:
- Cover the FULL conversation from start to finish — do not skip early messages
- Include: main topic, all key decisions made, all important code/data/files mentioned, the full progression of work, current state of progress
- Scale your summary length to the conversation size — longer chats need longer summaries (up to 800 words)
- Write it as a structured briefing with sections, not a transcript
- End with: "CONTINUE FROM: [one sentence of exactly what to do next]"
- Do NOT include greetings or meta-commentary`;

    const userPrompt = `Summarize this ENTIRE AI conversation (${totalMessages} messages) for context continuation. Cover everything from start to end:\n\n${chatText}`;

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralKey}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) throw new Error('Empty response from Mistral');

    // Build the final continuation prompt using the AI summary
    const now = new Date().toLocaleString();
    const continuationPrompt = `[AI CONTEXT SUMMARY — Originally from ${platform} | Summarized by Mistral AI | ${now}]

This is a continuation of a previous AI conversation. Below is an intelligent summary:

${'─'.repeat(50)}

${summary}

${'─'.repeat(50)}

Please read the above summary and continue from where we left off. Respond with: "Got it! I understand your previous context. Ready to continue."`;

    summaryBox.textContent = continuationPrompt;
    summarySection.classList.remove('hidden');

    // Update saved session with summary too
    const usedTokens = Math.round((systemPrompt.length + userPrompt.length + summary.length) / 4);
    setStatus('active', `✓ Full summary of ${totalMessages} messages ready (~${usedTokens} tokens used)`);
    showToast('✨ Full chat summarized!');

  } catch (err) {
    const msg = err.message || 'Unknown error';
    setStatus('error', 'Mistral error: ' + msg);
    showToast('❌ ' + msg);
    // If unauthorized, clear key
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      mistralKey = null;
      await chrome.storage.local.remove('mistralKey');
      setApiStatus(false);
      mistralKeyInput.value = '';
      showToast('❌ Invalid key — please re-enter');
    }
  }

  setMistralLoading(false);
});

// ── COPY AI SUMMARY ───────────────────────────────────────
btnCopySummary.addEventListener('click', async () => {
  if (!summaryBox.textContent) return;
  try {
    await navigator.clipboard.writeText(summaryBox.textContent);
    showToast('✓ AI Summary copied! Paste into any new chat');
    btnCopySummary.textContent = '✓ Copied!';
    setTimeout(() => { btnCopySummary.textContent = '📋 Copy'; }, 2000);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = summaryBox.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✓ AI Summary copied!');
  }
});
btnCopyPrompt.addEventListener('click', async () => {
  if (!promptBox.textContent) return;
  try {
    await navigator.clipboard.writeText(promptBox.textContent);
    showToast('✓ Copied! Paste into any AI chat');
    btnCopyPrompt.textContent = '✓ Copied!';
    setTimeout(() => { btnCopyPrompt.textContent = '📋 Copy Raw'; }, 2000);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = promptBox.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✓ Copied! Paste into any AI chat');
  }
});

// ── SAVE SESSION ──────────────────────────────────────────
btnSaveSession.addEventListener('click', async () => {
  if (!currentData) return;

  const stored = await chrome.storage.local.get('sessions');
  const sessions = stored.sessions || [];

  const session = {
    id: Date.now(),
    platform: currentData.platform,
    title: currentData.title || `${currentData.platform} Chat`,
    url: currentData.url,
    timestamp: currentData.timestamp,
    messages: currentData.messages,
    prompt: promptBox.textContent
  };

  sessions.unshift(session);
  // Keep max 20 sessions
  if (sessions.length > 20) sessions.splice(20);

  await chrome.storage.local.set({ sessions });
  showToast('💾 Session saved!');
  btnSaveSession.textContent = '✓ Saved!';
  setTimeout(() => { btnSaveSession.textContent = '💾 Save Session'; }, 2000);
});

// ── RENDER SAVED SESSIONS ─────────────────────────────────
async function renderSavedSessions() {
  const stored = await chrome.storage.local.get('sessions');
  const sessions = stored.sessions || [];

  savedList.innerHTML = '';

  if (sessions.length === 0) {
    savedList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div>No saved sessions yet.</div>
        <div style="margin-top:6px;font-size:9px">Extract a chat and hit "Save Session"</div>
      </div>`;
    return;
  }

  const platformIcons = { Claude: '🤖', ChatGPT: '💬', Gemini: '✨', Copilot: '🪁', Perplexity: '🔍' };

  sessions.forEach(session => {
    const el = document.createElement('div');
    el.className = 'saved-session';
    const date = new Date(session.timestamp).toLocaleDateString();
    const msgs = session.messages?.length || 0;
    const icon = platformIcons[session.platform] || '💭';

    el.innerHTML = `
      <div class="session-icon">${icon}</div>
      <div class="session-info">
        <div class="session-title">${session.title.substring(0, 45)}</div>
        <div class="session-meta">${session.platform} · ${msgs} msgs · ${date}</div>
      </div>
      <button class="session-del" data-id="${session.id}" title="Delete">✕</button>
    `;

    // Click to copy
    el.addEventListener('click', async (e) => {
      if (e.target.classList.contains('session-del')) return;
      await navigator.clipboard.writeText(session.prompt).catch(() => {});
      showToast('✓ Copied! Paste into any AI chat');
    });

    // Delete button
    el.querySelector('.session-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      const stored2 = await chrome.storage.local.get('sessions');
      const updated = (stored2.sessions || []).filter(s => s.id !== session.id);
      await chrome.storage.local.set({ sessions: updated });
      renderSavedSessions();
      showToast('Session deleted');
    });

    savedList.appendChild(el);
  });
}

// ── HELPERS ───────────────────────────────────────────────
function setStatus(type, message) {
  statusText.textContent = message;
  statusDot.className = 'status-dot' + (type === 'active' ? ' active' : type === 'error' ? ' error' : '');
}

function setLoading(loading) {
  btnExtract.disabled = loading;
  spinner.style.display = loading ? 'block' : 'none';
  btnExtractLabel.textContent = loading ? 'Extracting…' : '⚡ Extract Chat';
}

function setMistralLoading(loading) {  btnAISummary.disabled = loading;
  spinnerMistral.style.display = loading ? 'block' : 'none';
  btnAISummaryLabel.textContent = loading ? 'Summarizing…' : '🤖 AI Smart Summary (Mistral)';
}

function setApiStatus(connected) {
  if (connected) {
    apiStatusBar.className = 'api-status connected';
    apiStatusBar.textContent = '✓ Mistral API connected — AI Summary enabled';
    if (currentData) btnAISummary.disabled = false;
  } else {
    apiStatusBar.className = 'api-status disconnected';
    apiStatusBar.textContent = '⚠ No API key — AI Summary disabled';
    btnAISummary.disabled = true;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
