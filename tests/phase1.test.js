// Phase 1 Tests: Stability & Reliability

// Mock chrome API
global.chrome = {
  storage: {
    local: {
      data: {},
      get: function(keys) {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: this.data[keys] });
        }
        return Promise.resolve(this.data);
      },
      set: function(items) {
        Object.assign(this.data, items);
        return Promise.resolve();
      },
      remove: function(keys) {
        if (Array.isArray(keys)) {
          keys.forEach(k => delete this.data[k]);
        } else {
          delete this.data[keys];
        }
        return Promise.resolve();
      }
    }
  },
  tabs: {
    get: (id) => Promise.resolve({ id, url: 'https://example.com' })
  }
};

// Load modules
const fs = require('fs');
const path = require('path');

// Read and eval the modules
const apiClientCode = fs.readFileSync(path.join(__dirname, '../lib/api-client.js'), 'utf8');
const storageCode = fs.readFileSync(path.join(__dirname, '../lib/storage.js'), 'utf8');

eval(apiClientCode);
eval(storageCode);

// Tests
describe('APIClient', () => {
  test('retries on 5xx errors', async () => {
    let attempts = 0;
    global.fetch = jest.fn(() => {
      attempts++;
      if (attempts < 2) {
        return Promise.reject({ status: 500, message: 'Server error' });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: 'text', text: 'success' }] })
      });
    });

    const client = new APIClient({
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model'
    });

    const result = await client.call([{ role: 'user', content: 'test' }], null, 'system');
    expect(attempts).toBe(2);
    expect(result.content[0].text).toBe('success');
  });

  test('throws after max retries', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject({ status: 500, message: 'Server error' })
    );

    const client = new APIClient({
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model'
    });

    await expect(client.call([{ role: 'user', content: 'test' }], null, 'system'))
      .rejects.toThrow();
  });
});

describe('RateLimiter', () => {
  test('allows requests under limit', async () => {
    const limiter = new RateLimiter(5, 1000);

    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    expect(limiter.requests.length).toBe(5);
  });

  test('blocks requests over limit', async () => {
    const limiter = new RateLimiter(2, 1000);

    await limiter.acquire();
    await limiter.acquire();

    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(900);
  });
});

describe('Conversation Storage', () => {
  beforeEach(() => {
    chrome.storage.local.data = {};
  });

  test('saves conversation', async () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ];

    await saveConversation(1, history);

    const stored = await chrome.storage.local.get('conv_1');
    expect(stored.conv_1.history).toEqual(history);
  });

  test('loads conversation', async () => {
    const history = [{ role: 'user', content: 'Test' }];
    await chrome.storage.local.set({
      conv_1: { history, timestamp: Date.now() }
    });

    const loaded = await loadConversation(1);
    expect(loaded).toEqual(history);
  });

  test('limits history to 20 messages', async () => {
    const history = Array(25).fill(null).map((_, i) => ({
      role: 'user',
      content: `Message ${i}`
    }));

    await saveConversation(1, history);

    const stored = await chrome.storage.local.get('conv_1');
    expect(stored.conv_1.history.length).toBe(20);
  });

  test('cleans old conversations', async () => {
    const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
    const newTimestamp = Date.now();

    await chrome.storage.local.set({
      conv_1: { history: [], timestamp: oldTimestamp },
      conv_2: { history: [], timestamp: newTimestamp }
    });

    await cleanOldConversations();

    const data = await chrome.storage.local.get(null);
    expect(data.conv_1).toBeUndefined();
    expect(data.conv_2).toBeDefined();
  });
});

console.log('Phase 1 tests completed');
