# PDF Download Feature - v2.5.0

## New Command: SAVE_PDF

The extension can now save any page as a PDF!

## Usage

Simply ask the AI:
- "Save this page as PDF"
- "Download this as PDF"
- "Convert this page to PDF"

The AI will use the `[SAVE_PDF]` command automatically.

## Example: Download Multiple Pages

**User:** "Download each of the linked pages as PDFs"

**AI Response:**
```
I'll click each link and save them as PDFs.

[CLICK: a:nth-of-type(1)]
[WAIT: 2000]
[SAVE_PDF]
[NAVIGATE: previous_page_url]
[CLICK: a:nth-of-type(2)]
[WAIT: 2000]
[SAVE_PDF]
```

## Where PDFs are Saved

PDFs are automatically saved to:
```
Downloads/Sidekick_PDFs/{domain}/{timestamp}.pdf
```

Example:
```
Downloads/Sidekick_PDFs/en_wikipedia_org/2026-03-16T15-30-45.pdf
```

## Technical Details

- Uses Chrome's native `printToPDF` API
- Paper size: US Letter (8.5" x 11")
- Margins: 0.4" on all sides
- Preserves page formatting and styles
- No external dependencies required

## Limitations

- Requires Chrome 59+ (printToPDF API)
- Cannot save PDFs from chrome:// pages
- Some dynamic content may not render in PDF

## Try It Now!

Reload the extension and ask:
"Save this page as PDF"
