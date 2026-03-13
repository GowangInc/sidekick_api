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
    await refreshContext();
    addMessage(`Page loaded: ${pageContext?.title || 'Unknown'}`, 'assistant');
    // Watch for navigation within the locked tab
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

async function sendMessage() {
  const content = input.value.trim();
  if (!content) return;

  addMessage(content, 'user');
  input.value = '';
  sendBtn.disabled = true;

  // Take a fresh screenshot right before sending
  await refreshContext();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      content,
      context: pageContext,
      screenshot: screenshotBase64,
      tabId: lockedTabId
    });

    if (response.error) {
      addMessage(response.error, 'error');
    } else {
      addMessage(response.content, 'assistant');

      // If commands were executed, show results and refresh
      if (response.commandsExecuted && response.actionResults) {
        for (const ar of response.actionResults) {
          addMessage(`Action: ${ar.command} → ${ar.result}`, 'action');
        }
        // Wait a moment for page to settle, then refresh context
        await new Promise(r => setTimeout(r, 1500));
        await refreshContext();
      }
    }
  } catch (error) {
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
