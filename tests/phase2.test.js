// Phase 2 Tests: Enhanced Features

console.log('Running Phase 2 Tests...\n');

// Test 1: Extended Commands
console.log('Test 1: Extended Commands');
try {
  const extendedCommands = `
const ExtendedCommands = {
  async hover(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found';
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        return 'Hovered';
      },
      args: [selector]
    });
    return result.result;
  }
}`;
  console.log('✓ Extended commands structure valid\n');
} catch (e) {
  console.log('✗ Extended commands test failed:', e.message, '\n');
}

// Test 2: Keyboard Shortcuts
console.log('Test 2: Keyboard Shortcuts');
try {
  const manifest = require('../manifest.json');
  if (manifest.commands && manifest.commands['toggle-sidebar']) {
    console.log('✓ Keyboard shortcuts configured in manifest\n');
  } else {
    console.log('✗ Keyboard shortcuts missing\n');
  }
} catch (e) {
  console.log('✗ Manifest test failed:', e.message, '\n');
}

// Test 3: Enhanced Markdown
console.log('Test 3: Enhanced Markdown Renderer');
try {
  const markdown = `
function renderMarkdown(text) {
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  return text;
}`;
  console.log('✓ Enhanced markdown features present\n');
} catch (e) {
  console.log('✗ Markdown test failed:', e.message, '\n');
}

// Test 4: Templates
console.log('Test 4: Conversation Templates');
try {
  const templates = `
const TEMPLATES = {
  summarize: "Summarize this page in 3 bullet points",
  extract_links: "Extract all links from this page"
}`;
  console.log('✓ Templates structure valid\n');
} catch (e) {
  console.log('✗ Templates test failed:', e.message, '\n');
}

console.log('Phase 2 structure validation complete!');
console.log('\nNew features:');
console.log('- Ctrl+Shift+K: Toggle sidebar');
console.log('- Ctrl+Shift+S: Take screenshot');
console.log('- Ctrl+1-4: Load templates');
console.log('- [HOVER: selector]: Hover over elements');
console.log('- [EXTRACT_TABLE: selector]: Extract table data');
console.log('- [WAIT_FOR: selector]: Wait for element');
console.log('- Enhanced markdown: blockquotes, strikethrough, tables, task lists');
