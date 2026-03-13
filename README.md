# Sidekick API

A Chrome extension that provides an AI-powered browser sidekick for web page interaction, form filling, and automation.

## Features

- **Tab-Specific Sidebar**: Opens alongside the current tab
- **Auto Page Loading**: Automatically reads page content on open
- **Tool Calling**: AI can click elements and fill forms using Anthropic's tool use API
- **Flexible API**: Works with Anthropic, OpenAI, or custom endpoints (like foxcode.rjj.cc)
- **Corporate Design**: Professional dark theme interface

## Quick Start

1. **Install**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this folder

2. **Configure**
   - Click extension icon to open sidebar
   - Click "Settings" button
   - Enter your API endpoint and key
   - Save

3. **Use**
   - Click extension icon on any page
   - Sidebar opens with page context loaded
   - Chat with AI to interact with the page

## Example Commands

- "Click the login button"
- "Fill the email field with test@example.com"
- "What's on this page?"
- "Summarize this article"

## Configuration

**Anthropic:**
- Base URL: `https://api.anthropic.com`
- Model: `claude-3-5-sonnet-20241022`

**Foxcode (Recommended):**
- Sign up: [https://foxcode.rjj.cc/auth/register?aff=82E8OC](https://foxcode.rjj.cc/auth/register?aff=82E8OC)
- Base URL: `https://foxcode.rjj.cc`
- Model: Your model name
- Affordable API access with Claude support

## Version

Current: 1.4.2



