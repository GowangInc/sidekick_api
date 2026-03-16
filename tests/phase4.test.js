// Phase 4 Tests: Commands 1-10

console.log('Running Phase 4 Tests (Commands 1-10)...\n');

const fs = require('fs');

// Test 1: NEW_TAB
console.log('Test 1: NEW_TAB');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async newTab') && code.includes('chrome.tabs.create')) {
    console.log('✓ NEW_TAB implemented\n');
  } else {
    console.log('✗ NEW_TAB missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 2: CLOSE_TAB
console.log('Test 2: CLOSE_TAB');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async closeTab') && code.includes('chrome.tabs.remove')) {
    console.log('✓ CLOSE_TAB implemented\n');
  } else {
    console.log('✗ CLOSE_TAB missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 3: RELOAD
console.log('Test 3: RELOAD');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async reload') && code.includes('chrome.tabs.reload')) {
    console.log('✓ RELOAD implemented\n');
  } else {
    console.log('✗ RELOAD missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 4: EXPORT_CSV
console.log('Test 4: EXPORT_CSV');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async exportCsv') && code.includes('text/csv')) {
    console.log('✓ EXPORT_CSV implemented\n');
  } else {
    console.log('✗ EXPORT_CSV missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 5: RUN_JAVASCRIPT
console.log('Test 5: RUN_JAVASCRIPT');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async runJavascript') && code.includes('eval')) {
    console.log('✓ RUN_JAVASCRIPT implemented\n');
  } else {
    console.log('✗ RUN_JAVASCRIPT missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 6: EXTRACT_IMAGES
console.log('Test 6: EXTRACT_IMAGES');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async extractImages') && code.includes('querySelectorAll(\'img')) {
    console.log('✓ EXTRACT_IMAGES implemented\n');
  } else {
    console.log('✗ EXTRACT_IMAGES missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 7: DOUBLE_CLICK
console.log('Test 7: DOUBLE_CLICK');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async doubleClick') && code.includes('dblclick')) {
    console.log('✓ DOUBLE_CLICK implemented\n');
  } else {
    console.log('✗ DOUBLE_CLICK missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 8: RIGHT_CLICK
console.log('Test 8: RIGHT_CLICK');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async rightClick') && code.includes('contextmenu')) {
    console.log('✓ RIGHT_CLICK implemented\n');
  } else {
    console.log('✗ RIGHT_CLICK missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 9: GET_COOKIES
console.log('Test 9: GET_COOKIES');
try {
  const code = fs.readFileSync('lib/extended-commands.js', 'utf8');
  if (code.includes('async getCookies') && code.includes('chrome.cookies.getAll')) {
    console.log('✓ GET_COOKIES implemented\n');
  } else {
    console.log('✗ GET_COOKIES missing\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

// Test 10: Commands in background.js
console.log('Test 10: Commands registered in parser');
try {
  const code = fs.readFileSync('background.js', 'utf8');
  const commands = ['NEW_TAB', 'CLOSE_TAB', 'RELOAD', 'EXPORT_CSV', 'RUN_JS', 'EXTRACT_IMAGES', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'GET_COOKIES'];
  const allPresent = commands.every(cmd => code.includes(cmd));
  if (allPresent) {
    console.log('✓ All commands registered\n');
  } else {
    console.log('✗ Some commands missing from parser\n');
  }
} catch (e) {
  console.log('✗ Test failed:', e.message, '\n');
}

console.log('Phase 4 validation complete!');
console.log('\nTotal commands now: 28');
