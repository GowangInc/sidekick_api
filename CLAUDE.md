# Sidekick API

## Overview
A Chrome extension providing an AI-powered browser sidekick for web page interaction. Uses Anthropic's tool calling API to enable the AI to directly click elements and fill forms on web pages.

## Current Status (v1.3.0)

### Working Features
- Sidebar opens per-tab when extension icon is clicked
- Auto-loads page content on sidebar open
- Settings panel for API configuration (Anthropic/OpenAI/Custom endpoints)
- Corporate dark theme UI
- Tool calling implementation with proper loop

### Architecture
- **Manifest V3** Chrome extension
- **Background Service Worker**: Handles API calls and tool execution loop
- **Side Panel**: Chat interface (tab-specific)
- **Content Script**: Injected into pages for DOM access
- **Settings**: Stored in chrome.storage.local

### Tool Calling Implementation
Uses Anthropic's standard tool use API:
1. Defines `click_element` and `fill_form` tools
2. Sends tools + messages to `/v1/messages` endpoint
3. Parses `tool_use` blocks from response
4. Executes tools via chrome.scripting.executeScript
5. Returns results with `tool_use_id`
6. Loops until final text response

### System Prompt
Explicitly tells the AI it's a browser extension with page interaction capabilities to prevent "I can't help with that" responses.

## Usage
1. Click extension icon to open sidebar for current tab
2. AI automatically loads page context
3. Chat with AI to interact with page
4. Click "Settings" to configure API endpoint

## Configuration
Supports any Anthropic-compatible API endpoint (e.g., foxcode.rjj.cc)
