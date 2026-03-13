# Sidekick API

## Overview
A Chrome extension that provides a sidebar chat interface with AI capabilities for web page interaction. Users can configure custom API endpoints (Anthropic/OpenAI compatible) to use their preferred AI service.

## Key Features
- **Sidebar Chat Interface**: Persistent sidebar that can be toggled alongside browser content
- **Flexible API Configuration**: Support for multiple AI providers via custom base URL and API key
- **Web Page Interaction**: Read page content, click elements, fill forms, collect information
- **Settings Management**: Popup interface for configuring API endpoints and keys

## Technical Stack
- Manifest V3
- Vanilla JavaScript (minimal dependencies)
- Chrome Extension APIs: sidePanel, storage, scripting, activeTab
- Content scripts for DOM interaction
- Background service worker for API calls

## Target Use Cases
1. Form filling assistance
2. Page content analysis and summarization
3. Automated navigation guidance
4. Information extraction from web pages
