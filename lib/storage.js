// Conversation persistence
async function saveConversation(tabId, history) {
  if (!history || history.length === 0) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.storage.local.set({
      [`conv_${tabId}`]: {
        history: history.slice(-20),
        url: tab.url,
        timestamp: Date.now()
      }
    });
  } catch (e) {
    console.error('Failed to save conversation:', e);
  }
}

async function loadConversation(tabId) {
  try {
    const data = await chrome.storage.local.get(`conv_${tabId}`);
    return data[`conv_${tabId}`]?.history || null;
  } catch (e) {
    console.error('Failed to load conversation:', e);
    return null;
  }
}

async function clearConversation(tabId) {
  await chrome.storage.local.remove(`conv_${tabId}`);
}

async function cleanOldConversations() {
  const data = await chrome.storage.local.get(null);
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('conv_') && value.timestamp && now - value.timestamp > maxAge) {
      await chrome.storage.local.remove(key);
    }
  }
}
