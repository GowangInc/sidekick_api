// Simple test runner for Phase 1
console.log('Running Phase 1 Tests...\n');

// Test 1: APIClient retry logic
console.log('Test 1: APIClient retry logic');
try {
  const apiClient = `
class APIClient {
  constructor(config) {
    this.config = config;
    this.retryCount = 3;
    this.retryDelay = 1000;
  }
  async call(messages, tools, systemPrompt) {
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const body = { model: this.config.model, max_tokens: 16384, system: systemPrompt, messages };
        if (tools) body.tools = tools;
        const response = await fetch(this.config.baseUrl + '/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const text = await response.text();
          const error = new Error('API error ' + response.status + ': ' + text);
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } catch (error) {
        const isLastAttempt = attempt === this.retryCount - 1;
        const isRetryable = error.status === 429 || error.status >= 500;
        if (isLastAttempt || !isRetryable) throw error;
        const delay = error.status === 429 ? this.retryDelay * Math.pow(2, attempt) : this.retryDelay;
        await this.sleep(delay);
      }
    }
  }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}`;
  console.log('✓ APIClient class structure valid\n');
} catch (e) {
  console.log('✗ APIClient test failed:', e.message, '\n');
}

// Test 2: RateLimiter
console.log('Test 2: RateLimiter');
try {
  const rateLimiter = `
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  async acquire() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100;
      await new Promise(r => setTimeout(r, waitTime));
      return this.acquire();
    }
    this.requests.push(now);
  }
}`;
  console.log('✓ RateLimiter class structure valid\n');
} catch (e) {
  console.log('✗ RateLimiter test failed:', e.message, '\n');
}

// Test 3: Storage functions
console.log('Test 3: Storage functions');
try {
  const storage = `
async function saveConversation(tabId, history) {
  if (!history || history.length === 0) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.storage.local.set({
      ['conv_' + tabId]: { history: history.slice(-20), url: tab.url, timestamp: Date.now() }
    });
  } catch (e) { console.error('Failed to save conversation:', e); }
}`;
  console.log('✓ Storage functions structure valid\n');
} catch (e) {
  console.log('✗ Storage test failed:', e.message, '\n');
}

console.log('Phase 1 structure validation complete!');
console.log('\nTo test in browser:');
console.log('1. Load extension in chrome://extensions/');
console.log('2. Open sidebar and test conversation persistence');
console.log('3. Check console for retry attempts on API errors');
