// Content script for page interaction
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_DOM_CONTENT') {
    sendResponse({
      title: document.title,
      url: location.href,
      text: document.body.innerText.slice(0, 5000),
      html: document.body.innerHTML.slice(0, 5000)
    });
  }

  if (message.type === 'CLICK_ELEMENT') {
    const el = document.querySelector(message.selector);
    if (el) {
      el.click();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Element not found' });
    }
  }

  if (message.type === 'FILL_FORM') {
    for (const [selector, value] of Object.entries(message.fields)) {
      const el = document.querySelector(selector);
      if (el) el.value = value;
    }
    sendResponse({ success: true });
  }

  if (message.type === 'EXTRACT_DATA') {
    const data = {};
    for (const sel of message.selectors) {
      const el = document.querySelector(sel);
      data[sel] = el ? el.textContent : null;
    }
    sendResponse({ success: true, data });
  }

  return true;
});
