// Disable side panel globally — only enabled per-tab on click
chrome.sidePanel.setOptions({ enabled: false });

// Track which tabs have the panel open
const openPanelTabs = new Set();

// Track if vision failed so we don't keep retrying
let visionSupported = true;

// Conversation history per tab
const conversationHistory = new Map();

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
  conversationHistory.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_MESSAGE') {
    handleAIMessage(message.content, message.context, message.screenshot, message.tabId)
      .then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_HISTORY') {
    conversationHistory.delete(message.tabId);
    sendResponse({ ok: true });
    return false;
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

const SYSTEM_PROMPT_SIMPLE = `You are an AI browser assistant running inside a Chrome extension. You can see the page content (and optionally a screenshot) and interact with it using commands.

## Available Commands

Place commands on their own line in your response:

- [CLICK: css-selector] — Click an element
- [FILL: css-selector | value] — Set an input's value (fires change events)
- [TYPE: css-selector | value] — Type into a field character by character (for React/dynamic forms)
- [SELECT: css-selector | value] — Select a dropdown option by value
- [SCROLL: up] or [SCROLL: down] or [SCROLL: selector] — Scroll the page or to an element
- [READ: css-selector] — Extract and return text content from an element
- [NAVIGATE: url] — Navigate to a URL
- [WAIT: milliseconds] — Wait for the page to settle (e.g. after a click)

## Guidelines

- For questions about the page, just answer normally — no commands needed.
- When asked to interact, explain briefly what you'll do, then use commands.
- After you execute commands, you will automatically receive the updated page content. Use it to continue the task or answer the user's question.
- Use [READ: selector] to extract specific data from elements.
- For forms, prefer [TYPE: ...] over [FILL: ...] for dynamic/React-based pages.
- You can chain multiple commands in one response for multi-step tasks.
- You have conversation memory — you remember what you've done and seen before in this session.
- IMPORTANT: When you navigate or click and get updated page content, immediately analyze it and respond with the information the user asked for. Do NOT ask the user to wait or confirm — you already have the new page data.`;

async function runSimpleChat(config, userMessage, context, screenshot, tabId) {
  // Get or create conversation history for this tab
  if (!conversationHistory.has(tabId)) {
    conversationHistory.set(tabId, []);
  }
  const history = conversationHistory.get(tabId);

  // Build first user message with page context
  let textContent = userMessage;
  if (context) {
    textContent = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 10000)}\n\nUser Request: ${userMessage}`;
  }

  // Build message content — with or without screenshot
  const useVision = screenshot && visionSupported;
  let messageContent;
  if (useVision) {
    messageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: screenshot }
      },
      { type: 'text', text: textContent }
    ];
  } else {
    messageContent = textContent;
  }

  history.push({ role: 'user', content: messageContent });

  // Keep history manageable
  while (history.length > 20) {
    history.shift();
  }

  // Action loop: AI responds → execute commands → get new page → AI continues
  const allActionResults = [];
  const allResponses = [];
  const MAX_TURNS = 25;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      response = await callAPI(config, [...history], null, SYSTEM_PROMPT_SIMPLE);
    } catch (error) {
      // Vision fallback on first turn
      if (turn === 0 && useVision && error.message.includes('400')) {
        visionSupported = false;
        history[history.length - 1] = { role: 'user', content: textContent };
        response = await callAPI(config, [...history], null, SYSTEM_PROMPT_SIMPLE);
      } else {
        throw error;
      }
    }

    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock ? textBlock.text : 'Done';
    allResponses.push(text);

    history.push({ role: 'assistant', content: text });

    // Parse and execute commands
    const actionResults = await parseAndExecuteCommands(text, tabId);
    allActionResults.push(...actionResults);

    // If no commands, we're done — AI gave a final answer
    if (actionResults.length === 0) break;

    // Wait for page to fully load after commands
    await waitForPageLoad(tabId, 8000);

    const freshContext = await getPageContextFromTab(tabId);
    const resultSummary = actionResults.map(r => `${r.command}: ${r.result}`).join('\n');

    let followUp = `[Action results]\n${resultSummary}`;
    if (freshContext) {
      followUp += `\n\n[Updated page]\nTitle: ${freshContext.title}\nURL: ${freshContext.url}\n\nContent:\n${freshContext.text.slice(0, 10000)}`;
    }
    followUp += '\n\nPlease continue — describe what you see or take the next action.';

    history.push({ role: 'user', content: followUp });

    while (history.length > 20) {
      history.shift();
    }
  }

  return {
    content: allResponses.join('\n\n'),
    commandsExecuted: allActionResults.length > 0,
    actionResults: allActionResults
  };
}

// Wait for a tab to finish loading (or timeout)
async function waitForPageLoad(tabId, timeoutMs = 8000) {
  // First give a small initial delay for navigation to start
  await new Promise(r => setTimeout(r, 500));

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra delay for JS-rendered content (React, etc.)
        setTimeout(resolve, 1000);
      }
    }

    // Check if already loaded
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timeout);
        // Still wait a bit for dynamic content
        setTimeout(resolve, 2000);
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    });
  });
}

// Fetch page context directly from the background (no sidepanel needed)
async function getPageContextFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 15000) })
    });
    return result.result;
  } catch {
    return null;
  }
}

async function parseAndExecuteCommands(text, tabId) {
  const results = [];

  // Match all command patterns
  const commandRegex = /\[(CLICK|FILL|TYPE|SELECT|SCROLL|READ|NAVIGATE|WAIT):\s*(.+?)\]/g;

  for (const match of text.matchAll(commandRegex)) {
    const command = match[1];
    const args = match[2];

    try {
      let result;
      switch (command) {
        case 'CLICK':
          result = await executeOnPage(tabId, 'click', { selector: args.trim() });
          break;
        case 'FILL': {
          const [selector, value] = args.split('|').map(s => s.trim());
          result = await executeOnPage(tabId, 'fill', { selector, value });
          break;
        }
        case 'TYPE': {
          const [selector, value] = args.split('|').map(s => s.trim());
          result = await executeOnPage(tabId, 'type', { selector, value });
          break;
        }
        case 'SELECT': {
          const [selector, value] = args.split('|').map(s => s.trim());
          result = await executeOnPage(tabId, 'select', { selector, value });
          break;
        }
        case 'SCROLL':
          result = await executeOnPage(tabId, 'scroll', { target: args.trim() });
          break;
        case 'READ':
          result = await executeOnPage(tabId, 'read', { selector: args.trim() });
          break;
        case 'NAVIGATE':
          result = await executeOnPage(tabId, 'navigate', { url: args.trim() });
          break;
        case 'WAIT': {
          const ms = Math.min(parseInt(args.trim()) || 1000, 5000);
          await new Promise(resolve => setTimeout(resolve, ms));
          result = `Waited ${ms}ms`;
          break;
        }
      }
      results.push({ command: `${command}: ${args}`, result: result || 'Done' });
    } catch (error) {
      results.push({ command: `${command}: ${args}`, result: `Error: ${error.message}` });
    }
  }

  return results;
}

async function executeOnPage(tabId, action, params) {
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
  }

  if (action === 'click') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found: ' + sel;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.click();
        return 'Clicked: ' + (el.textContent || el.tagName).slice(0, 50);
      },
      args: [params.selector]
    });
    return result.result;
  }

  if (action === 'fill') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found: ' + sel;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return 'Filled: ' + sel + ' = ' + val;
      },
      args: [params.selector, params.value]
    });
    return result.result;
  }

  if (action === 'type') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found: ' + sel;
        el.focus();
        el.value = '';
        for (const char of val) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
          el.value += char;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'Typed: ' + val;
      },
      args: [params.selector, params.value]
    });
    return result.result;
  }

  if (action === 'select') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found: ' + sel;
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'Selected: ' + val;
      },
      args: [params.selector, params.value]
    });
    return result.result;
  }

  if (action === 'scroll') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (target) => {
        if (target === 'up') {
          window.scrollBy(0, -500);
          return 'Scrolled up';
        } else if (target === 'down') {
          window.scrollBy(0, 500);
          return 'Scrolled down';
        } else if (target === 'top') {
          window.scrollTo(0, 0);
          return 'Scrolled to top';
        } else if (target === 'bottom') {
          window.scrollTo(0, document.body.scrollHeight);
          return 'Scrolled to bottom';
        } else {
          const el = document.querySelector(target);
          if (!el) return 'Element not found: ' + target;
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return 'Scrolled to: ' + target;
        }
      },
      args: [params.target]
    });
    return result.result;
  }

  if (action === 'read') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found: ' + sel;
        return el.innerText.slice(0, 2000);
      },
      args: [params.selector]
    });
    return result.result;
  }

  if (action === 'navigate') {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (url) => { window.location.href = url; },
      args: [params.url]
    });
    return 'Navigating to: ' + params.url;
  }

  return 'Unknown action';
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
    messages[0].content = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 10000)}\n\nUser Request: ${userMessage}`;
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
      const result = await executeOnPage(tabId, toolUse.name === 'click_element' ? 'click' : 'fill', toolUse.input);
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

// ── Shared: API call ──

async function callAPI(config, messages, tools, systemPrompt) {
  const body = {
    model: config.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages
  };

  if (tools) {
    body.tools = tools;
  }

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return await response.json();
}
