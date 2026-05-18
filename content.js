// ============================================================
// AI Context Saver - Content Script v5
// Multi-method scroll: tries every known approach for each platform
// ============================================================

const PLATFORM_SELECTORS = {
  "claude.ai": {
    name: "Claude",
    messages: [
      '[data-testid="human-turn"]',
      '[data-testid="ai-turn"]',
      '[class*="human-turn"]',
      '[class*="assistant-turn"]',
      '[class*="HumanTurn"]',
      '[class*="AssistantTurn"]',
    ],
    humanIndicators: ["human-turn", "humanturn", "human", "user"],
    aiIndicators: ["ai-turn", "assistantturn", "assistant", "claude"]
  },
  "chatgpt.com": {
    name: "ChatGPT",
    messages: ['[data-message-author-role]'],
    humanIndicators: ["user"],
    aiIndicators: ["assistant"]
  },
  "chat.openai.com": {
    name: "ChatGPT",
    messages: ['[data-message-author-role]'],
    humanIndicators: ["user"],
    aiIndicators: ["assistant"]
  },
  "gemini.google.com": {
    name: "Gemini",
    messages: ['model-response', 'user-query', '[class*="query-text"]', '[class*="response-content"]'],
    humanIndicators: ["user-query", "query"],
    aiIndicators: ["model-response", "response"]
  },
  "www.perplexity.ai": {
    name: "Perplexity",
    messages: ['[class*="AnswerBody"]', '[class*="UserMessage"]', 'div[data-testid*="message"]'],
    humanIndicators: ["usermessage", "user"],
    aiIndicators: ["answerbody", "answer"]
  },
  "copilot.microsoft.com": {
    name: "Copilot",
    messages: ['[class*="user-message"]', '[class*="bot-message"]', 'cib-message'],
    humanIndicators: ["user-message", "user"],
    aiIndicators: ["bot-message", "bot", "copilot"]
  }
};

function detectPlatform() {
  const host = window.location.hostname;
  for (const key of Object.keys(PLATFORM_SELECTORS)) {
    if (host.includes(key)) return { key, ...PLATFORM_SELECTORS[key] };
  }
  return null;
}

// ── FIND ALL SCROLLABLE ELEMENTS ───────────────────────────
// Returns array sorted by scrollable area descending
function getAllScrollers() {
  const results = [];
  document.querySelectorAll('*').forEach(el => {
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    const st = el.scrollTop;
    if (sh > ch + 50) {
      const style = window.getComputedStyle(el);
      const ov = style.overflowY;
      if (ov === 'auto' || ov === 'scroll') {
        results.push({ el, scrollable: sh - ch, scrollTop: st });
      }
    }
  });
  results.sort((a, b) => b.scrollable - a.scrollable);
  return results;
}

// ── ROLE DETECTION ─────────────────────────────────────────
function getRoleFromElement(el, platform) {
  const classStr = (el.className || "").toLowerCase();
  const testId   = (el.getAttribute?.("data-testid") || "").toLowerCase();
  const roleAttr = (el.getAttribute?.("data-message-author-role") || "").toLowerCase();
  const combined = classStr + " " + testId + " " + roleAttr;
  for (const ind of platform.humanIndicators) {
    if (combined.includes(ind.toLowerCase())) return "human";
  }
  for (const ind of platform.aiIndicators) {
    if (combined.includes(ind.toLowerCase())) return "ai";
  }
  return "unknown";
}

// ── COLLECT MESSAGES IN DOM ────────────────────────────────
function collectCurrentMessages(platform, seenTexts) {
  const newMessages = [];
  let foundEls = [];
  for (const selector of platform.messages) {
    try {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) foundEls = [...foundEls, ...els];
    } catch (e) {}
  }
  for (const el of [...new Set(foundEls)]) {
    const text = el.innerText?.trim();
    if (!text || text.length < 8) continue;
    const fp = text.substring(0, 150);
    if (seenTexts.has(fp)) continue;
    seenTexts.add(fp);
    const rect = el.getBoundingClientRect();
    const absY = rect.top + window.scrollY;
    newMessages.push({
      role: getRoleFromElement(el, platform),
      text: text.substring(0, 5000),
      _y: absY
    });
  }
  return newMessages;
}

// ── OVERLAY ────────────────────────────────────────────────
function createOverlay() {
  document.getElementById('__acs_overlay__')?.remove();
  if (!document.getElementById('__acs_style__')) {
    const s = document.createElement('style');
    s.id = '__acs_style__';
    s.textContent = `@keyframes __acs_in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(s);
  }
  const o = document.createElement('div');
  o.id = '__acs_overlay__';
  o.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#fff;border:2px solid #4f46e5;border-radius:14px;padding:15px 18px;min-width:275px;font-family:system-ui,sans-serif;box-shadow:0 8px 30px rgba(79,70,229,0.25);animation:__acs_in 0.25s ease;`;
  o.innerHTML = `
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">
      <div style="width:26px;height:26px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;">🧠</div>
      <span style="font-weight:800;font-size:13px;color:#1a1a2e;">AI Context Saver</span>
    </div>
    <div id="__acs_status__" style="font-size:11px;color:#4a4a6a;font-weight:600;margin-bottom:9px;line-height:1.5;">Initializing…</div>
    <div style="background:#f0f1f8;border-radius:20px;height:5px;overflow:hidden;margin-bottom:9px;">
      <div id="__acs_bar__" style="height:100%;width:0%;background:linear-gradient(90deg,#4f46e5,#7c3aed);transition:width 0.35s ease;border-radius:20px;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <div id="__acs_count__" style="font-size:12px;color:#4f46e5;font-weight:800;">0 messages</div>
      <div id="__acs_pct__" style="font-size:11px;color:#9090b0;font-weight:600;">0%</div>
    </div>`;
  document.body.appendChild(o);
}

function updateOverlay(status, pct, count) {
  const clamp = Math.min(100, Math.max(0, Math.round(pct)));
  document.getElementById('__acs_status__')?.setAttribute('textContent', status);
  const s = document.getElementById('__acs_status__'); if (s) s.textContent = status;
  const b = document.getElementById('__acs_bar__');    if (b) b.style.width = clamp + '%';
  const c = document.getElementById('__acs_count__');  if (c) c.textContent = count + ' messages found';
  const p = document.getElementById('__acs_pct__');    if (p) p.textContent = clamp + '%';
}

function finishOverlay(count, ok) {
  const o = document.getElementById('__acs_overlay__');
  const s = document.getElementById('__acs_status__'); if (s) s.textContent = ok ? '✓ Done — all messages captured' : '⚠ Partial capture';
  const b = document.getElementById('__acs_bar__');    if (b) { b.style.width = '100%'; b.style.background = ok ? '#0ea56e' : '#f97316'; }
  const c = document.getElementById('__acs_count__');  if (c) c.textContent = count + ' messages total';
  if (o) o.style.borderColor = ok ? '#0ea56e' : '#f97316';
  setTimeout(() => document.getElementById('__acs_overlay__')?.remove(), 3000);
}

function sendProgress(count, pct, status) {
  try { chrome.runtime.sendMessage({ action: 'scrollProgress', count, pct, status }); } catch (e) {}
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── SCROLL HELPER: tries EVERY method ─────────────────────
// Returns true if scroll position actually changed
async function scrollToTop(scroller) {
  const before = scroller.scrollTop;

  // Method 1: Direct scrollTop
  scroller.scrollTop = 0;
  await sleep(100);
  if (scroller.scrollTop < before - 10) return true;

  // Method 2: scrollTo API
  scroller.scrollTo({ top: 0, behavior: 'instant' });
  await sleep(100);
  if (scroller.scrollTop < before - 10) return true;

  // Method 3: window scroll
  window.scrollTo({ top: 0, behavior: 'instant' });
  window.scrollY; // flush
  await sleep(100);

  return scroller.scrollTop < before - 10;
}

async function scrollBy(scroller, delta) {
  const before = scroller.scrollTop;

  // Method 1: Direct
  scroller.scrollTop += delta;
  await sleep(50);
  if (Math.abs(scroller.scrollTop - before) > 10) return true;

  // Method 2: scrollBy API
  scroller.scrollBy({ top: delta, behavior: 'instant' });
  await sleep(50);
  if (Math.abs(scroller.scrollTop - before) > 10) return true;

  // Method 3: window
  window.scrollBy({ top: delta, behavior: 'instant' });
  await sleep(50);

  return Math.abs(scroller.scrollTop - before) > 10;
}

// ── MAIN COLLECTOR ─────────────────────────────────────────
async function autoScrollAndCollect(sendResponse) {
  const platform = detectPlatform();
  if (!platform) {
    sendResponse({ success: false, error: 'Platform not recognized', platform: 'Unknown' });
    return;
  }

  createOverlay();
  const seenTexts   = new Set();
  const allMessages = [];

  // ── STEP 1: Identify the correct scroller ─────────────────
  // First, go to very bottom to ensure scroller has scrollTop > 0
  updateOverlay('Finding scroll container…', 3, 0);

  // Scroll everything to bottom first
  document.documentElement.scrollTop = 999999;
  document.body.scrollTop = 999999;
  document.querySelectorAll('*').forEach(el => {
    try { el.scrollTop = 999999; } catch (e) {}
  });
  await sleep(800);

  // Now find which element actually has scrollTop > 0
  const scrollers = getAllScrollers();
  let scroller = null;

  // Pick the one with the largest scrollTop AND largest scrollHeight
  // This is almost certainly the chat container
  let bestScore = 0;
  for (const { el, scrollable, scrollTop } of scrollers) {
    // Score = scrollTop (proves it's actually scrolled) + scrollable area
    const score = scrollTop * 2 + scrollable;
    if (score > bestScore) {
      bestScore = score;
      scroller = el;
    }
  }

  if (!scroller) scroller = document.documentElement;

  // Log for debugging
  console.log('[ACS] Using scroller:', scroller.tagName, scroller.className?.substring(0, 60));
  console.log('[ACS] scrollTop:', scroller.scrollTop, 'scrollHeight:', scroller.scrollHeight);

  // ── STEP 2: Collect from bottom ───────────────────────────
  updateOverlay('Reading latest messages…', 8, 0);
  sendProgress(0, 8, 'Reading latest messages…');
  scroller.scrollTop = scroller.scrollHeight;
  await sleep(900);

  let msgs = collectCurrentMessages(platform, seenTexts);
  allMessages.push(...msgs);

  // ── STEP 3: Scroll up in steps ────────────────────────────
  const STEP      = 600;
  const PAUSE     = 750;
  const MAX_STEPS = 150;
  const MAX_EMPTY = 6;

  let emptyStreak = 0;
  let step        = 0;
  let prevScrollTop = scroller.scrollTop;

  updateOverlay('Scrolling up to load full history…', 12, allMessages.length);
  sendProgress(allMessages.length, 12, 'Starting scroll…');

  while (step < MAX_STEPS && emptyStreak < MAX_EMPTY) {
    step++;
    const targetPos = Math.max(0, scroller.scrollTop - STEP);

    // Try all scroll methods
    scroller.scrollTop = targetPos;
    scroller.scrollTo?.({ top: targetPos, behavior: 'instant' });
    await sleep(PAUSE);

    // Check if we actually moved
    const moved = Math.abs(scroller.scrollTop - prevScrollTop) > 20;
    prevScrollTop = scroller.scrollTop;

    const found = collectCurrentMessages(platform, seenTexts);
    if (found.length === 0 && !moved) {
      emptyStreak++;
    } else {
      if (found.length > 0) emptyStreak = 0;
      allMessages.push(...found);
    }

    const atTop   = scroller.scrollTop < 10;
    const fraction = scroller.scrollHeight > 0
      ? Math.max(0, 1 - scroller.scrollTop / scroller.scrollHeight) : 1;
    const pct = 12 + Math.round(fraction * 76);

    const status = atTop
      ? '✓ Reached top of chat!'
      : `Scrolling up… (${Math.round(fraction * 100)}% loaded, ${allMessages.length} msgs)`;

    updateOverlay(status, pct, allMessages.length);
    sendProgress(allMessages.length, pct, status);

    if (atTop) break;
  }

  // ── STEP 4: Scroll back to bottom ─────────────────────────
  updateOverlay('Scrolling back to bottom…', 91, allMessages.length);
  sendProgress(allMessages.length, 91, 'Almost done…');
  scroller.scrollTop = scroller.scrollHeight;
  await sleep(900);
  const finalMsgs = collectCurrentMessages(platform, seenTexts);
  allMessages.push(...finalMsgs);

  // ── STEP 5: Sort & clean ───────────────────────────────────
  allMessages.sort((a, b) => (a._y || 0) - (b._y || 0));
  const clean = allMessages.map(({ _y, ...m }) => m);
  const known = clean.filter(m => m.role !== 'unknown');
  const final = known.length >= Math.min(3, clean.length * 0.4) ? known : clean;

  sendProgress(final.length, 100, 'Complete!');

  if (final.length === 0) {
    finishOverlay(0, false);
    sendResponse(extractFallback(platform));
    return;
  }

  finishOverlay(final.length, true);
  sendResponse({
    success: true,
    platform: platform.name,
    messages: final,
    url: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString()
  });
}

// ── FALLBACK ───────────────────────────────────────────────
function extractFallback(platform) {
  const els = document.querySelectorAll('p,[role="region"],article,section');
  const msgs = [];
  els.forEach((el, i) => {
    const text = el.innerText?.trim();
    if (text && text.length > 30)
      msgs.push({ role: i % 2 === 0 ? 'human' : 'ai', text: text.substring(0, 2000) });
  });
  return {
    success: msgs.length > 0,
    platform: platform?.name || 'Unknown',
    messages: msgs.slice(0, 80),
    url: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    fallback: true,
    error: msgs.length === 0 ? 'Could not extract messages.' : undefined
  };
}

// ── LISTENER ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractChat') {
    autoScrollAndCollect(sendResponse);
    return true;
  }
  return true;
});
