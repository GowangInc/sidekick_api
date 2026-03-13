# API Design

## Storage Schema
```javascript
{
  apiConfig: {
    baseUrl: string,      // e.g., "https://foxcode.rjj.cc/v1"
    apiKey: string,       // User's API key
    provider: string,     // "anthropic" | "openai" | "custom"
    model: string         // e.g., "claude-3-5-sonnet-20241022"
  }
}
```

## Message Passing Protocol

### Sidebar → Background
```javascript
{ type: "SEND_MESSAGE", content: string, context?: object }
{ type: "GET_PAGE_CONTENT" }
{ type: "EXECUTE_ACTION", action: object }
```

### Background → Content Script
```javascript
{ type: "GET_DOM_CONTENT" }
{ type: "CLICK_ELEMENT", selector: string }
{ type: "FILL_FORM", fields: object }
{ type: "EXTRACT_DATA", selectors: array }
```

### Content Script → Background
```javascript
{ type: "DOM_CONTENT", data: object }
{ type: "ACTION_RESULT", success: boolean, data?: any }
```

## AI Provider Compatibility

### Anthropic Format
- Endpoint: `/v1/messages`
- Headers: `x-api-key`, `anthropic-version`
- Body: `{ model, messages, max_tokens }`

### OpenAI Format
- Endpoint: `/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`
- Body: `{ model, messages }`
