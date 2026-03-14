# Privacy Policy for Sidekick API

Last updated: March 14, 2026

## Data Collection
Sidekick API does not collect, store, or transmit any user data to the extension developer.

## Local Storage
- API configuration (endpoint URL, API key, model name) is stored locally in your browser using chrome.storage.local
- Conversation history is stored temporarily in browser memory and is not persisted

## Third-Party Services
- The extension communicates directly with your chosen AI API provider (Anthropic, OpenAI, or custom endpoint) using your own API key
- All data transmission occurs directly between your browser and your chosen API provider
- We do not have access to your API keys, conversations, or browsing data

## Permissions
- **activeTab, tabs**: Access current tab information to provide context to the AI
- **scripting**: Inject scripts to read page content and execute interactions
- **storage**: Save your API settings locally
- **sidePanel**: Display the chat interface
- **downloads**: Save screenshots and export conversations
- **host permissions**: Work on any website you visit

## Contact
For questions, visit: https://github.com/GowangInc/sidekick_api
