// Disable side panel globally — only enabled per-tab on click
chrome.sidePanel.setOptions({ enabled: false });

// Track which tabs have the panel open
const openPanelTabs = new Set();

// Track if vision failed so we don't keep retrying
let visionSupported = true;

// Conversation history per tab
const conversationHistory = new Map();

// Active ports from sidepanels (for streaming status updates)
const activePorts = new Map();

// Screenshot counter per tab
const screenshotCounters = new Map();

async function saveScreenshot(tabId, url, dataUrl) {
  const domain = new URL(url).hostname.replace(/[^a-z0-9]/gi, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const counter = (screenshotCounters.get(tabId) || 0) + 1;
  screenshotCounters.set(tabId, counter);
  const filename = `Sidekick_Screenshots/${domain}/${timestamp}_${counter}.png`;
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
}

// Handle action click manually: enable panel for this tab, then open it
chrome.action.onClicked.addListener((tab) => {
  openPanelTabs.add(tab.id);
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidepanel.html',
    enabled: true
  });
  chrome.sidePanel.open({ tabId: tab.id });
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  openPanelTabs.delete(tabId);
  conversationHistory.delete(tabId);
  activePorts.delete(tabId);
});

// Listen for port connections from sidepanel
chrome.runtime.onConnect.addListener((port) => {
  if (port.name.startsWith('sidepanel-')) {
    const tabId = parseInt(port.name.split('-')[1]);
    activePorts.set(tabId, port);
    port.onDisconnect.addListener(() => activePorts.delete(tabId));
  }
});

// Send a status update to the sidepanel
function sendStatus(tabId, status, data) {
  const port = activePorts.get(tabId);
  if (port) {
    try { port.postMessage({ type: 'status', status, ...data }); } catch {}
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_MESSAGE') {
    handleAIMessage(message.content, message.context, message.screenshot, message.tabId)
      .then(sendResponse);
    return true;
  }
  if (message.type === 'TEST_TOOL_USE') {
    testToolUseSupport(message.config).then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_HISTORY') {
    conversationHistory.delete(message.tabId);
    sendResponse({ ok: true });
    return false;
  }
});

async function testToolUseSupport(config) {
  try {
    const testTools = [{
      name: 'test_tool',
      description: 'Test tool',
      input_schema: { type: 'object', properties: {}, required: [] }
    }];
    await callAPI(config, [{ role: 'user', content: 'test' }], testTools, 'Test');
    return { supported: true };
  } catch (error) {
    return { supported: false, error: error.message };
  }
}

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
- [SCREENSHOT] — Capture a screenshot of the current page
- [NAVIGATE: url] — Navigate to a URL
- [WAIT: milliseconds] — Wait for the page to settle (e.g. after a click)

## Guidelines

- For questions about the page, just answer normally — no commands needed.
- When asked to interact, explain briefly what you'll do, then use commands.
- After you execute commands, you will automatically receive the updated page content including the full text of the new page. Read it carefully and use it to answer the user's original question.
- Use [READ: selector] to extract specific data from elements.
- For forms, prefer [TYPE: ...] over [FILL: ...] for dynamic/React-based pages.
- You can chain multiple commands in one response for multi-step tasks.
- You have conversation memory — you remember what you've done and seen before in this session.
- CRITICAL: After commands execute, you WILL receive the fresh page content automatically. You MUST analyze it and give a complete answer. NEVER say "the page should be loading" or "let me know what you see" — you can see the page yourself in the content provided to you.

## Response Format

- Use markdown formatting: **bold**, *italic*, bullet lists, numbered lists, headings.
- Be concise but thorough — give detailed information without unnecessary filler.
- Use bullet points or numbered lists to organize information clearly.
- Keep paragraphs short (2-3 sentences max).
- When listing items (repos, links, data), use a structured format.
- No need for greetings, sign-offs, or filler phrases like "Sure!" or "Great question!".`;

async function runSimpleChat(config, userMessage, context, screenshot, tabId) {
  // Get or create conversation history for this tab
  if (!conversationHistory.has(tabId)) {
    conversationHistory.set(tabId, []);
  }
  const history = conversationHistory.get(tabId);

  // Build first user message with page context
  let textContent = userMessage;
  if (context) {
    textContent = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 50000)}\n\nUser Request: ${userMessage}`;
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
    sendStatus(tabId, 'thinking', { turn });

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

    history.push({ role: 'assistant', content: text });

    // Capture URL before executing any commands (for SPA detection)
    const urlBeforeAction = await getTabUrl(tabId);

    // Parse and execute commands
    const actionResults = await parseAndExecuteCommands(text, tabId);
    allActionResults.push(...actionResults);

    // If no commands, we're done — AI gave a final answer
    if (actionResults.length === 0) {
      allResponses.push(text);
      break;
    }

    // Send action status to sidepanel
    sendStatus(tabId, 'acting', {
      actions: actionResults.map(r => r.command),
      turn
    });

    // Determine if navigation is expected (only NAVIGATE commands)
    const expectsNavigation = actionResults.some(r => r.command.startsWith('NAVIGATE:'));

    // Wait for the page to actually update, then verify content is stable
    sendStatus(tabId, 'waiting', { message: 'Waiting for page to update...' });
    await waitForPageUpdate(tabId, urlBeforeAction, expectsNavigation);

    sendStatus(tabId, 'reading', { message: 'Reading updated page...' });
    const freshContext = await getPageContextFromTab(tabId);
    const resultSummary = actionResults.map(r => `${r.command}: ${r.result}`).join('\n');

    console.log('[Loop] Fresh context after action:', {
      title: freshContext?.title,
      url: freshContext?.url,
      textLength: freshContext?.text?.length
    });

    let followUp = `[Action results]\n${resultSummary}`;
    if (freshContext) {
      followUp += `\n\n[Updated page content — this is what is currently displayed]\nTitle: ${freshContext.title}\nURL: ${freshContext.url}\n\nFull Page Content:\n${freshContext.text.slice(0, 50000)}`;
    }
    followUp += '\n\nIMPORTANT: The page content above is LIVE and CURRENT. Read it carefully and answer the user\'s original question using this content. Do NOT say the page is loading or ask the user what they see.';

    console.log('[Loop] Sending follow-up to AI, length:', followUp.length);
    history.push({ role: 'user', content: followUp });

    while (history.length > 20) {
      history.shift();
    }
  }

  return {
    content: allResponses.join('\n\n---\n\n'),
    commandsExecuted: allActionResults.length > 0,
    actionResults: allActionResults
  };
}

// Get current tab URL
async function getTabUrl(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url;
  } catch { return null; }
}

// Wait for page to update after actions — handles both full navigation and SPA
async function waitForPageUpdate(tabId, previousUrl, expectsNavigation) {
  if (!expectsNavigation) {
    // No navigation expected — just a short delay for DOM updates
    await new Promise(r => setTimeout(r, 1000));
    return;
  }

  console.log('[waitForPageUpdate] Starting — previousUrl:', previousUrl);

  // Phase 1: Wait for URL to change OR tab to start loading (max 5s)
  // This catches both SPA (pushState URL change) and full navigation (loading status)
  const phase1Start = Date.now();
  let urlChanged = false;
  let fullNavStarted = false;

  while (Date.now() - phase1Start < 5000) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url !== previousUrl) {
        urlChanged = true;
        console.log('[waitForPageUpdate] Phase 1: URL changed to', tab.url, `(${Date.now() - phase1Start}ms)`);
        break;
      }
      if (tab.status === 'loading') {
        fullNavStarted = true;
        console.log('[waitForPageUpdate] Phase 1: Full navigation detected', `(${Date.now() - phase1Start}ms)`);
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }

  if (!urlChanged && !fullNavStarted) {
    console.log('[waitForPageUpdate] Phase 1: No URL change or loading detected after 5s');
  }

  // Phase 2: If full navigation started, wait for it to complete (max 10s)
  if (fullNavStarted) {
    console.log('[waitForPageUpdate] Phase 2: Waiting for page complete...');
    const phase2Start = Date.now();
    while (Date.now() - phase2Start < 10000) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          console.log('[waitForPageUpdate] Phase 2: Page complete', `(${Date.now() - phase2Start}ms)`);
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    // Extra delay for JS framework rendering after load
    await new Promise(r => setTimeout(r, 1500));
  }

  // Phase 3: Wait for DOM content to stabilize (content length stops changing)
  // This is the key check — it works for ALL navigation types
  console.log('[waitForPageUpdate] Phase 3: Checking DOM stability...');
  let lastTextLength = 0;
  let stableChecks = 0;
  const phase3Start = Date.now();

  while (Date.now() - phase3Start < 8000) {
    try {
      const ctx = await getPageContextFromTab(tabId);
      const len = ctx?.text?.length || 0;

      if (len > 100 && len === lastTextLength) {
        stableChecks++;
        if (stableChecks >= 3) {
          console.log('[waitForPageUpdate] Phase 3: DOM stable at', len, 'chars after', stableChecks, `checks (${Date.now() - phase3Start}ms)`);
          break;
        }
      } else {
        stableChecks = 0;
      }
      lastTextLength = len;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (stableChecks < 3) {
    console.log('[waitForPageUpdate] Phase 3: Timed out — last content length:', lastTextLength);
  }

  console.log('[waitForPageUpdate] Done — total time:', Date.now() - phase1Start, 'ms');
}

// Fetch page context directly from the background
async function getPageContextFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ title: document.title, url: location.href, text: document.body.innerText.slice(0, 60000) })
    });
    return result.result;
  } catch {
    return null;
  }
}

async function parseAndExecuteCommands(text, tabId) {
  const results = [];
  const commandRegex = /\[(CLICK|FILL|TYPE|SELECT|SCROLL|READ|SCREENSHOT|NAVIGATE|WAIT):\s*(.+?)\]|\[SCREENSHOT\]/g;

  for (const match of text.matchAll(commandRegex)) {
    const command = match[1] || 'SCREENSHOT';
    const args = match[2] || '';

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
        case 'SCREENSHOT': {
          try {
            const tab = await chrome.tabs.get(tabId);
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            await saveScreenshot(tabId, tab.url, dataUrl);
            result = 'Screenshot saved';
          } catch (error) {
            result = 'Failed to capture screenshot: ' + error.message;
          }
          break;
        }
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
        if (target === 'up') { window.scrollBy(0, -500); return 'Scrolled up'; }
        if (target === 'down') { window.scrollBy(0, 500); return 'Scrolled down'; }
        if (target === 'top') { window.scrollTo(0, 0); return 'Scrolled to top'; }
        if (target === 'bottom') { window.scrollTo(0, document.body.scrollHeight); return 'Scrolled to bottom'; }
        const el = document.querySelector(target);
        if (!el) return 'Element not found: ' + target;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return 'Scrolled to: ' + target;
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

  let messageContent = userMessage;
  if (context && context.text) {
    messageContent = `Current Page: ${context.title}\nURL: ${context.url}\n\nPage Content:\n${context.text.slice(0, 50000)}\n\nUser Request: ${userMessage}`;
  }

  let messages = [{ role: 'user', content: messageContent }];

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
    max_tokens: 16384,
    system: systemPrompt,
    messages
  };

  if (tools) {
    body.tools = tools;
  }

  console.log('[API] Sending request:', {
    model: body.model,
    messageCount: messages.length,
    hasTools: !!tools,
    lastMessage: messages[messages.length - 1]
  });

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
    console.error('[API] Error response:', text);
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return await response.json();
}
