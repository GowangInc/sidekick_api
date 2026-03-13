// Disable side panel globally — only enabled per-tab on click
chrome.sidePanel.setOptions({ enabled: false });

// Track which tabs have the panel open
const openPanelTabs = new Set();

// Track if vision failed so we don't keep retrying
let visionSupported = true;

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
    handleAIMessage(message.content, message.context, message.screenshot, message.tabId)
      .then(sendResponse);
    return true;
  }
});

async function handleAIMessage(content, context, screenshot, tabId) {
  const { apiConfig } = await chrome.storage.local.get('apiConfig');
  if (!apiConfig) {
    return { error: 'API not configured. Please set up your API key in settings.' };
  }

  try {
    if (apiConfig.toolUse) {
      return await runToolUseLoop(apiConfig, content, context, tabId);
    } else {
      return await runSimpleChat(apiConfig, content, context, screenshot, tabId);
    }
  } catch (error) {
    return { error: error.message };
  }
}

// ── No-tool mode: text + optional screenshot, parse commands from response ──

const SYSTEM_PROMPT_SIMPLE = `You are an AI assistant running inside a Chrome browser extension. You can see the current web page's content and optionally a screenshot.

You can interact with the page by including commands in your response:
- [CLICK: css-selector] — clicks the element matching the CSS selector
- [FILL: css-selector | value] — fills the input matching the CSS selector with the given value

Examples:
- [CLICK: button.submit]
- [CLICK: #login-btn]
- [FILL: input[name="email"] | user@example.com]
- [FILL: #search | search query]

Only use commands when the user asks you to interact with the page. For questions about the page, just answer normally. Always explain what you're doing before using commands.`;

async function runSimpleChat(config, userMessage, context, screenshot, tabId) {
  // Build text with page context
  let textContent = userMessage;
  if (context) {
    textContent = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 3000)}\n\nUser Request: ${userMessage}`;
  }

  // Only use plain string — screenshot support can be enabled later
  const messages = [{ role: 'user', content: textContent }];

  console.log('[Sidekick] Sending simple chat:', {
    model: config.model,
    contentLength: textContent.length,
    hasScreenshot: !!screenshot
  });

  let response;
  try {
    response = await callAPI(config, messages, null, SYSTEM_PROMPT_SIMPLE);
  } catch (error) {
    console.error('[Sidekick] API call failed:', error.message);
    throw error;
  }

  const textBlock = response.content.find(b => b.type === 'text');
  const text = textBlock ? textBlock.text : 'Done';

  // Parse and execute any commands in the response
  const commandsExecuted = await parseAndExecuteCommands(text, tabId);

  return { content: text, commandsExecuted };
}

async function parseAndExecuteCommands(text, tabId) {
  const clickRegex = /\[CLICK:\s*(.+?)\]/g;
  const fillRegex = /\[FILL:\s*(.+?)\s*\|\s*(.+?)\]/g;
  let executed = false;

  for (const match of text.matchAll(clickRegex)) {
    const selector = match[1].trim();
    await executeToolOnPage('click_element', { selector }, tabId);
    executed = true;
  }

  for (const match of text.matchAll(fillRegex)) {
    const selector = match[1].trim();
    const value = match[2].trim();
    await executeToolOnPage('fill_form', { selector, value }, tabId);
    executed = true;
  }

  return executed;
}

// ── Tool-use mode: existing Anthropic tool calling loop ──

const SYSTEM_PROMPT_TOOLS = `You are an AI assistant running inside a Chrome browser extension. You have direct access to interact with the current web page using the provided tools. When the user asks you to click something or fill a form, use the click_element and fill_form tools. You ARE able to interact with web pages - that is your primary function.`;

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

  let messages = [{ role: 'user', content: userMessage }];
  if (context) {
    messages[0].content = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 3000)}\n\nUser Request: ${userMessage}`;
  }

  while (true) {
    const response = await callAPI(config, messages, tools, SYSTEM_PROMPT_TOOLS);
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

// ── Shared: API call and page interaction ──

async function callAPI(config, messages, tools, systemPrompt) {
  const body = {
    model: config.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages
  };

  // Only include tools if provided (tool-use mode)
  if (tools) {
    body.tools = tools;
  }

  const jsonBody = JSON.stringify(body);
  console.log('[Sidekick] API request:', {
    url: `${config.baseUrl}/v1/messages`,
    model: body.model,
    hasSystem: !!systemPrompt,
    hasTools: !!tools,
    bodySize: jsonBody.length,
    contentType: typeof messages[0]?.content
  });

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: jsonBody
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[Sidekick] API error response:', text);
    throw new Error(`API error ${response.status}: ${text}`);
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
