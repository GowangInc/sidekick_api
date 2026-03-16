# v2.5.0 Release - PDF Download & Essential Commands

## What's New

### PDF Download Feature ✅
**Command:** `[SAVE_PDF]`

Now you can download any page as PDF! Perfect for:
- Saving articles for offline reading
- Archiving web pages
- Batch downloading multiple pages

**Example Usage:**
```
User: "Download each of the linked pages as PDFs"

AI will:
1. Extract all links with [EXTRACT_LINKS]
2. Click each link
3. Save as PDF with [SAVE_PDF]
4. Navigate back and repeat
```

PDFs saved to: `Downloads/Sidekick_PDFs/{domain}/{timestamp}.pdf`

---

### Essential Navigation Commands ✅

**[BACK]** - Go back in history
**[FORWARD]** - Go forward in history
**[EXTRACT_LINKS]** - Get all links on page
**[PRESS_KEY: key]** - Press keyboard keys (Enter, Escape, Tab, etc)

---

## Complete Command List (18 Total)

### Basic (8)
1. CLICK
2. FILL
3. TYPE
4. SELECT
5. SCROLL
6. READ
7. NAVIGATE
8. WAIT

### Advanced (10)
9. HOVER
10. EXTRACT_TABLE
11. EXTRACT_LINKS ⭐ NEW
12. WAIT_FOR
13. GET_ATTRS
14. PRESS_KEY ⭐ NEW
15. BACK ⭐ NEW
16. FORWARD ⭐ NEW
17. SAVE_PDF ⭐ NEW
18. SCREENSHOT

---

## Real-World Example

**Task:** Download all Wikipedia articles linked from a search page

**User:** "Download each of the linked pages as PDFs"

**AI Response:**
```
I'll extract the links and download each page as PDF.

[EXTRACT_LINKS]
Found 10 links. Downloading each...

[CLICK: a:nth-of-type(1)]
[WAIT: 2000]
[SAVE_PDF]
[BACK]

[CLICK: a:nth-of-type(2)]
[WAIT: 2000]
[SAVE_PDF]
[BACK]

... (continues for all links)

✅ Downloaded 10 PDFs to Downloads/Sidekick_PDFs/
```

---

## Installation

1. Reload extension in `chrome://extensions/`
2. Click "Update" or reload the extension
3. Open sidebar and try: "Save this page as PDF"

---

## Version History

**v2.5.0** (Current)
- Added SAVE_PDF command
- Added EXTRACT_LINKS command
- Added PRESS_KEY command
- Added BACK/FORWARD navigation
- Total: 18 commands

**v2.4.0**
- Retry logic and rate limiting
- Conversation persistence
- Keyboard shortcuts
- Extended commands
- Theme support

**v2.3.0**
- Basic tool calling
- Screenshot capture
