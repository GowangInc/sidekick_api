# Sidekick API - Project Documentation

## Project Structure

```
base-claude-chrome/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (API calls, tool execution)
├── sidepanel.html         # Chat UI
├── sidepanel.js           # Chat logic
├── popup.html             # Settings UI
├── popup.js               # Settings logic
├── content.js             # Page interaction script
├── favicon.ico            # Extension icon
└── docs/
    ├── CLAUDE.md          # Current state
    ├── PROJECT.md         # This file
    ├── README.md          # User guide
    ├── ARCHITECTURE.md    # Technical design
    └── API_DESIGN.md      # API schemas
```

## Key Components

### background.js
- `handleAIMessage()` - Entry point for chat messages
- `runToolUseLoop()` - Implements Anthropic tool calling loop
- `callClaude()` - Makes API requests
- `executeToolOnPage()` - Runs tools via chrome.scripting

### sidepanel.js
- Auto-loads page context on open
- Sends messages to background worker
- Displays chat history

### Tools Available
1. `click_element` - Click any element by CSS selector
2. `fill_form` - Fill input fields by selector + value

## Current Issues
- AI may still respond as CLI instead of browser extension
- Need to verify tool calling works with foxcode.rjj.cc proxy

## Next Steps
- Test tool execution with real API
- Add more tools (extract data, navigate, etc.)
- Improve error handling
