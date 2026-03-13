const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const settingsBtn = document.getElementById('settings-btn');
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
settingsBtn.addEventListener('click', openSettings);
refreshBtn.addEventListener('click', async () => {
  await refreshContext();
  addMessage('Context refreshed', 'assistant');
});

function openSettings() {
  chrome.runtime.openOptionsPage();
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
  div.textContent = content;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
