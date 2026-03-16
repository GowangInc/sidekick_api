// Phase 3 Tests: Advanced Features

console.log('Running Phase 3 Tests...\n');

// Test 1: Theme Support
console.log('Test 1: Theme Support');
try {
  const fs = require('fs');
  const html = fs.readFileSync('sidepanel.html', 'utf8');

  if (html.includes('data-theme') && html.includes(':root[data-theme="dark"]') && html.includes(':root[data-theme="light"]')) {
    console.log('✓ Theme support implemented\n');
  } else {
    console.log('✗ Theme support missing\n');
  }
} catch (e) {
  console.log('✗ Theme test failed:', e.message, '\n');
}

// Test 2: CSS Variables
console.log('Test 2: CSS Variables');
try {
  const fs = require('fs');
  const html = fs.readFileSync('sidepanel.html', 'utf8');

  if (html.includes('var(--bg)') && html.includes('var(--text)') && html.includes('var(--border)')) {
    console.log('✓ CSS variables properly used\n');
  } else {
    console.log('✗ CSS variables missing\n');
  }
} catch (e) {
  console.log('✗ CSS variables test failed:', e.message, '\n');
}

// Test 3: Theme Toggle Function
console.log('Test 3: Theme Toggle Function');
try {
  const fs = require('fs');
  const js = fs.readFileSync('sidepanel.js', 'utf8');

  if (js.includes('toggleTheme') && js.includes('loadTheme')) {
    console.log('✓ Theme toggle functions present\n');
  } else {
    console.log('✗ Theme functions missing\n');
  }
} catch (e) {
  console.log('✗ Theme function test failed:', e.message, '\n');
}

console.log('Phase 3 structure validation complete!');
console.log('\nNew features:');
console.log('- 🌓 Theme toggle button (dark/light mode)');
console.log('- CSS variables for consistent theming');
console.log('- Theme preference saved to storage');
console.log('- Enhanced markdown with tables and blockquotes');
