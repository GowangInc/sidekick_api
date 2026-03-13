const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const settingsBtn = document.getElementById('settings-btn');

let pageContext = null;

// Auto-load page on startup
getPageContext();

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);
settingsBtn.addEventListener('click', openSettings);

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function getPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 5000) })
    });
    pageContext = result.result;
    addMessage(`Page loaded: ${pageContext.title}`, 'assistant');
  } catch (error) {
    addMessage('Failed to get page: ' + error.message, 'error');
  }
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
      context: pageContext
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
