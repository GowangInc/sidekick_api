const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const exportBtn = document.getElementById('export-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const saveSettingsBtn = document.getElementById('save-settings');
const pageInfo = document.getElementById('page-info');
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');
const refreshBtn = document.getElementById('refresh-btn');

let pageContext = null;
let lockedTabId = null;
let screenshotBase64 = null;
let port = null;
let loadingEl = null;

// Lock to the current tab on startup
init();

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);
exportBtn.addEventListener('click', exportConversation);
settingsBtn.addEventListener('click', toggleSettings);
saveSettingsBtn.addEventListener('click', saveSettings);
refreshBtn.addEventListener('click', async () => {
  await refreshContext();
  addMessage('Context refreshed', 'assistant');
});

function toggleSettings() {
  settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  if (settingsPanel.style.display === 'block') loadSettings();
}

function exportConversation() {
  const messages = Array.from(messagesDiv.querySelectorAll('.message'));
  let markdown = `# Conversation Export\n\n**Page:** ${pageContext?.title || 'Unknown'}\n**URL:** ${pageContext?.url || 'Unknown'}\n**Date:** ${new Date().toLocaleString()}\n\n---\n\n`;

  messages.forEach(msg => {
    const type = msg.classList.contains('user') ? 'User' : msg.classList.contains('assistant') ? 'Assistant' : 'System';
    const content = msg.textContent.trim();
    markdown += `### ${type}\n\n${content}\n\n`;
  });

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadSettings() {
  const { apiConfig } = await chrome.storage.local.get('apiConfig');
  if (apiConfig) {
    document.getElementById('provider').value = apiConfig.provider || 'anthropic';
    document.getElementById('baseUrl').value = apiConfig.baseUrl || '';
    document.getElementById('apiKey').value = apiConfig.apiKey || '';
    document.getElementById('model').value = apiConfig.model || '';
    document.getElementById('toolUse').checked = apiConfig.toolUse || false;
  }
}

async function saveSettings() {
  const apiConfig = {
    provider: document.getElementById('provider').value,
    baseUrl: document.getElementById('baseUrl').value,
    apiKey: document.getElementById('apiKey').value,
    model: document.getElementById('model').value,
    toolUse: document.getElementById('toolUse').checked
  };

  // Test tool use if enabled
  if (apiConfig.toolUse) {
    const testResult = await chrome.runtime.sendMessage({
      type: 'TEST_TOOL_USE',
      config: apiConfig
    });
    if (!testResult.supported) {
      if (confirm('Tool use is not supported by this API endpoint. Disable tool use and continue?')) {
        apiConfig.toolUse = false;
        document.getElementById('toolUse').checked = false;
      } else {
        return;
      }
    }
  }

  await chrome.storage.local.set({ apiConfig });
  settingsPanel.style.display = 'none';
  addMessage('Settings saved', 'assistant');
}

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    lockedTabId = tab.id;

    // Open a port for streaming status updates from background
    port = chrome.runtime.connect({ name: `sidepanel-${lockedTabId}` });
    port.onMessage.addListener(onStatusUpdate);

    await refreshContext();
    addMessage(`Page loaded: ${pageContext?.title || 'Unknown'}`, 'assistant');
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  } catch (error) {
    addMessage('Failed to initialize: ' + error.message, 'error');
  }
}

function onTabUpdated(tabId, changeInfo, tab) {
  if (tabId !== lockedTabId) return;
  if (changeInfo.status === 'complete') {
    refreshContext();
  }
}

function onStatusUpdate(message) {
  if (message.type !== 'status') return;
  updateLoading(message.status, message);
}

async function refreshContext() {
  await getPageContext();
  await captureScreenshot();
  if (pageContext) {
    updatePageInfoBar();
  }
}

async function getPageContext() {
  if (!lockedTabId) return;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: lockedTabId },
      func: () => ({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 15000) })
    });
    pageContext = result.result;
  } catch (error) {
    // Silently fail — page may be navigating
  }
}

async function captureScreenshot() {
  try {
    const tab = await chrome.tabs.get(lockedTabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    screenshotBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  } catch (error) {
    screenshotBase64 = null;
  }
}

function updatePageInfoBar() {
  if (!pageContext) return;
  pageTitle.textContent = pageContext.title || 'Untitled';
  pageUrl.textContent = pageContext.url;
  pageInfo.style.display = 'flex';
}

// ── Loading animation ──

function showLoading() {
  if (loadingEl) return;
  loadingEl = document.createElement('div');
  loadingEl.className = 'message loading';
  loadingEl.innerHTML = `
    <div class="loading-dots">
      <span></span><span></span><span></span>
    </div>
    <div class="loading-status">Thinking...</div>
  `;
  messagesDiv.appendChild(loadingEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateLoading(status, data) {
  if (!loadingEl) return;
  const statusEl = loadingEl.querySelector('.loading-status');
  if (!statusEl) return;

  switch (status) {
    case 'thinking':
      statusEl.textContent = data.turn > 0 ? `Thinking (step ${data.turn + 1})...` : 'Thinking...';
      break;
    case 'acting':
      statusEl.textContent = `Executing: ${data.actions?.[0] || 'action'}`;
      break;
    case 'waiting':
      statusEl.textContent = data.message || 'Waiting for page...';
      break;
    case 'reading':
      statusEl.textContent = 'Reading page content...';
      break;
  }
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideLoading() {
  if (loadingEl) {
    loadingEl.remove();
    loadingEl = null;
  }
}

// ── Messaging ──

async function sendMessage() {
  const content = input.value.trim();
  if (!content) return;

  addMessage(content, 'user');
  input.value = '';
  sendBtn.disabled = true;

  // Take a fresh screenshot right before sending
  await refreshContext();
  showLoading();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      content,
      context: pageContext,
      screenshot: screenshotBase64,
      tabId: lockedTabId
    });

    hideLoading();

    if (response.error) {
      addMessage(response.error, 'error');
    } else {
      // Show action results first if any
      if (response.commandsExecuted && response.actionResults) {
        for (const ar of response.actionResults) {
          addMessage(`${ar.command} -> ${ar.result}`, 'action');
        }
      }
      // Show AI responses (may be multiple from the loop)
      addMessage(response.content, 'assistant');
      // Refresh context to stay in sync
      if (response.commandsExecuted) {
        await refreshContext();
      }
    }
  } catch (error) {
    hideLoading();
    addMessage('Failed to send message: ' + error.message, 'error');
  }

  sendBtn.disabled = false;
  input.focus();
}

function addMessage(content, type) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  if (type === 'assistant') {
    div.innerHTML = renderMarkdown(content);
  } else {
    div.textContent = content;
  }
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ── Lightweight markdown renderer ──

function renderMarkdown(text) {
  // Sanitize HTML entities first
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings (###, ##, #)
  text = text.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bold and italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rule
  text = text.replace(/^---$/gm, '<hr>');

  // Unordered lists — collect consecutive lines
  text = text.replace(/^([ \t]*[-*] .+(\n|$))+/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      return '<li>' + line.replace(/^[ \t]*[-*] /, '') + '</li>';
    }).join('');
    return '<ul>' + items + '</ul>';
  });

  // Ordered lists
  text = text.replace(/^(\d+\. .+(\n|$))+/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      return '<li>' + line.replace(/^\d+\. /, '') + '</li>';
    }).join('');
    return '<ol>' + items + '</ol>';
  });

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs — wrap remaining loose text lines
  text = text.replace(/^(?!<[a-z])((?!<\/?(ul|ol|li|h[2-4]|pre|hr|blockquote)[ >]).+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  text = text.replace(/<p>\s*<\/p>/g, '');

  return text;
}
