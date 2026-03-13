# Architecture

## Component Structure

### 1. Manifest (manifest.json)
- Defines extension metadata, permissions, and entry points
- Permissions: storage, sidePanel, scripting, activeTab, host permissions
- Declares background service worker, content scripts, and side panel

### 2. Background Service Worker (background.js)
- Handles API communication with AI services
- Manages message passing between components
- Stores and retrieves settings from chrome.storage
- Processes requests from sidebar and content scripts

### 3. Side Panel (sidepanel.html + sidepanel.js)
- Chat interface UI
- Message history display
- Input field for user queries
- Communicates with background worker for API calls
- Sends commands to content script for page interaction

### 4. Content Script (content.js)
- Injected into web pages
- Reads DOM content
- Executes page interactions (clicks, form fills)
- Extracts information from pages
- Reports back to sidebar via background worker

### 5. Settings Popup (popup.html + popup.js)
- Configuration interface
- Fields: Base URL, API Key, Model selection
- Provider presets (Anthropic, OpenAI, Custom)
- Save/load settings from chrome.storage.local
