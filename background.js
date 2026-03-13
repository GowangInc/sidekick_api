// Disable side panel globally — only enabled per-tab on click
chrome.sidePanel.setOptions({ enabled: false });

// Track which tabs have the panel open
const openPanelTabs = new Set();

// Handle action click manually: enable panel for this tab, then open it
chrome.action.onClicked.addListener(async (tab) => {
  openPanelTabs.add(tab.id);
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidepanel.html',
    enabled: true
  });
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  openPanelTabs.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_MESSAGE') {
    handleAIMessage(message.content, message.context, message.tabId).then(sendResponse);
    return true;
  }
});

async function handleAIMessage(content, context, tabId) {
  const { apiConfig } = await chrome.storage.local.get('apiConfig');
  if (!apiConfig) {
    return { error: 'API not configured. Please set up your API key in settings.' };
  }

  try {
    return await runToolUseLoop(apiConfig, content, context, tabId);
  } catch (error) {
    return { error: error.message };
  }
}

async function runToolUseLoop(config, userMessage, context, tabId) {
  const tools = [
    {
      name: 'click_element',
      description: 'Click an element on the page using a CSS selector',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the element to click' }
        },
        required: ['selector']
      }
    },
    {
      name: 'fill_form',
      description: 'Fill form fields on the page',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input field' },
          value: { type: 'string', description: 'Value to fill in the field' }
        },
        required: ['selector', 'value']
      }
    }
  ];

  const systemPrompt = `You are an AI assistant running inside a Chrome browser extension. You have direct access to interact with the current web page using the provided tools. When the user asks you to click something or fill a form, use the click_element and fill_form tools. You ARE able to interact with web pages - that is your primary function.`;

  let messages = [{ role: 'user', content: userMessage }];
  if (context) {
    messages[0].content = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 3000)}\n\nUser Request: ${userMessage}`;
  }

  while (true) {
    const response = await callClaude(config, messages, tools, systemPrompt);
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(b => b.type === 'text');
      return { content: textBlock ? textBlock.text : 'Done' };
    }

    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      const result = await executeToolOnPage(toolUse.name, toolUse.input, tabId);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }
}

async function callClaude(config, messages, tools, systemPrompt) {
  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  return await response.json();
}

async function executeToolOnPage(toolName, toolInput, tabId) {
  // Use the locked tab ID, fall back to active tab if not provided
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
  }

  if (toolName === 'click_element') {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (el) el.click();
      },
      args: [toolInput.selector]
    });
    return 'Clicked';
  }

  if (toolName === 'fill_form') {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, val) => {
        const el = document.querySelector(sel);
        if (el) el.value = val;
      },
      args: [toolInput.selector, toolInput.value]
    });
    return 'Filled';
  }

  return 'Unknown tool';
}
