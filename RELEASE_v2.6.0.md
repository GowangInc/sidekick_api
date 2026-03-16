# v2.6.0 Release - 10 New Commands

## What's New

### Tab Management
- `[NEW_TAB: url]` - Open URL in new tab
- `[CLOSE_TAB]` - Close current tab
- `[RELOAD]` - Refresh page

### Advanced Interaction
- `[DOUBLE_CLICK: selector]` - Double click elements
- `[RIGHT_CLICK: selector]` - Context menu

### Data Extraction & Export
- `[EXTRACT_IMAGES]` - Get all images with src/alt
- `[EXPORT_CSV: table]` - Export table to CSV file
- `[GET_COOKIES]` - Get all cookies

### Developer Tools
- `[RUN_JS: code]` - Execute custom JavaScript

## Total Commands: 28

All tests passing ✅

## Examples

**Extract all images:**
```
[EXTRACT_IMAGES]
```

**Export table to CSV:**
```
[EXPORT_CSV: table.data]
```

**Run custom JavaScript:**
```
[RUN_JS: document.querySelectorAll('h1').length]
```

**Open multiple tabs:**
```
[NEW_TAB: https://example.com]
[NEW_TAB: https://google.com]
```
