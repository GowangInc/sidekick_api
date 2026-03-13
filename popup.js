const PROVIDER_DEFAULTS = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5'
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4'
  },
  custom: {
    baseUrl: '',
    model: ''
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get('apiConfig');
  if (config.apiConfig) {
    document.getElementById('provider').value = config.apiConfig.provider || 'custom';
    document.getElementById('baseUrl').value = config.apiConfig.baseUrl || '';
    document.getElementById('apiKey').value = config.apiConfig.apiKey || '';
    document.getElementById('model').value = config.apiConfig.model || '';
    document.getElementById('toolUse').checked = config.apiConfig.toolUse || false;
  }
});

document.getElementById('provider').addEventListener('change', (e) => {
  const defaults = PROVIDER_DEFAULTS[e.target.value];
  document.getElementById('baseUrl').value = defaults.baseUrl;
  document.getElementById('model').value = defaults.model;
});

document.getElementById('save').addEventListener('click', async () => {
  const config = {
    provider: document.getElementById('provider').value,
    baseUrl: document.getElementById('baseUrl').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value.trim(),
    toolUse: document.getElementById('toolUse').checked
  };

  await chrome.storage.local.set({ apiConfig: config });
  showStatus('Settings saved successfully!', 'success');
});

document.getElementById('openSidebar').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  setTimeout(() => status.className = 'status', 3000);
}
