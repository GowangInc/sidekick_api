// Smart selector with fallback strategies
async function findElement(tabId, selector) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      const strategies = [
        () => document.querySelector(sel),
        () => document.querySelector(`[data-testid="${sel}"]`),
        () => document.querySelector(`[aria-label="${sel}"]`),
        () => document.querySelector(`[placeholder="${sel}"]`),
        () => Array.from(document.querySelectorAll('button, a, input')).find(el =>
          el.textContent?.trim().toLowerCase() === sel.toLowerCase() ||
          el.value?.toLowerCase() === sel.toLowerCase()
        )
      ];

      for (const strategy of strategies) {
        try {
          const el = strategy();
          if (el) return { found: true, tag: el.tagName };
        } catch {}
      }
      return { found: false };
    },
    args: [selector]
  });

  if (!result.result.found) {
    throw new Error(`Element not found: ${selector}`);
  }
  return result.result;
}
