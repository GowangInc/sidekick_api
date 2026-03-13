const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const settingsBtn = document.getElementById('settings-btn');
const pageInfo = document.getElementById('page-info');
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');

let pageContext = null;
let lockedTabId = null;

// Lock to the current tab on startup
init();

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);
settingsBtn.addEventListener('click', openSettings);

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    lockedTabId = tab.id;
    await getPageContext();
    // Watch for navigation within the locked tab
    chrome.tabs.onUpdated.addListener(onTabUpdated);
  } catch (error) {
    addMessage('Failed to initialize: ' + error.message, 'error');
  }
}

function onTabUpdated(tabId, changeInfo, tab) {
  if (tabId !== lockedTabId) return;
  if (changeInfo.status === 'complete') {
    // Page navigated — refresh context
    getPageContext();
  }
}

async function getPageContext() {
  if (!lockedTabId) return;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: lockedTabId },
      func: () => ({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 5000) })
    });
    const isFirstLoad = !pageContext;
    pageContext = result.result;
    updatePageInfoBar();
    if (isFirstLoad) {
      addMessage(`Page loaded: ${pageContext.title}`, 'assistant');
    } else {
      addMessage(`Page navigated: ${pageContext.title}`, 'assistant');
    }
  } catch (error) {
    addMessage('Failed to get page: ' + error.message, 'error');
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

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      content,
      context: pageContext,
      tabId: lockedTabId
    });

    if (response.error) {
      addMessage(response.error, 'error');
    } else {
      addMessage(response.content, 'assistant');
    }
  } catch (error) {
    addMessage('Failed to send message: ' + error.message, 'error');
  }

  sendBtn.disabled = false;
}

function addMessage(content, type) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = content;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
