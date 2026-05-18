// ============================================================
// AI Context Saver - Background Service Worker
// Relays live scroll progress from content script to popup
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Context Saver installed.');
});

// Relay progress messages from content script to popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrollProgress') {
    // Broadcast to all extension views (popup)
    chrome.runtime.sendMessage(request).catch(() => {});
  }
  if (request.action === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }
});
