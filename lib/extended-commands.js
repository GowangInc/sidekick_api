// Extended commands for Phase 2
const ExtendedCommands = {
  async hover(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found';
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        return 'Hovered: ' + (el.textContent || el.tagName).slice(0, 50);
      },
      args: [selector]
    });
    return result.result;
  },

  async extractTable(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const table = document.querySelector(sel);
        if (!table) return 'Table not found';
        const rows = Array.from(table.rows);
        return rows.map(row =>
          Array.from(row.cells).map(cell => cell.textContent.trim())
        );
      },
      args: [selector]
    });
    return JSON.stringify(result.result);
  },

  async waitFor(tabId, selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => !!document.querySelector(sel),
        args: [selector]
      });
      if (result.result) return 'Element appeared';
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Timeout waiting for element');
  },

  async getAttributes(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found';
        const attrs = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return attrs;
      },
      args: [selector]
    });
    return JSON.stringify(result.result);
  },

  async printToPdf(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = new URL(tab.url);
      const domain = url.hostname.replace(/[^a-z0-9]/gi, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

      // Use Chrome's print to PDF API
      const pdfData = await chrome.tabs.printToPDF(tabId, {
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4
      });

      // Convert to data URL
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          const dataUrl = reader.result;
          const filename = `Sidekick_PDFs/${domain}/${timestamp}.pdf`;

          await chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false
          });

          resolve(`PDF saved: ${filename}`);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error('PDF generation failed: ' + error.message);
    }
  },

  async extractLinks(tabId) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        return links.map(a => ({ text: a.textContent.trim(), href: a.href }));
      }
    });
    return JSON.stringify(result.result);
  },

  async pressKey(tabId, key) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (k) => {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        document.activeElement.dispatchEvent(new KeyboardEvent('keypress', { key: k, bubbles: true }));
        document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
        return `Pressed key: ${k}`;
      },
      args: [key]
    });
    return result.result;
  },

  async goBack(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.history.back()
    });
    return 'Navigated back';
  },

  async goForward(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.history.forward()
    });
    return 'Navigated forward';
  },

  async newTab(tabId, url) {
    const tab = await chrome.tabs.create({ url, active: false });
    return `Opened new tab: ${tab.id}`;
  },

  async closeTab(tabId) {
    await chrome.tabs.remove(tabId);
    return 'Tab closed';
  },

  async reload(tabId) {
    await chrome.tabs.reload(tabId);
    return 'Page reloaded';
  },

  async uploadFile(tabId, selector, filepath) {
    // Note: Chrome extensions can't directly set file inputs for security
    // This returns instructions for the user
    return `Cannot directly upload files due to browser security. Please manually select: ${filepath}`;
  },

  async exportCsv(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const table = document.querySelector(sel);
        if (!table) return 'Table not found';
        const rows = Array.from(table.rows);
        const csv = rows.map(row =>
          Array.from(row.cells).map(cell =>
            `"${cell.textContent.trim().replace(/"/g, '""')}"`
          ).join(',')
        ).join('\n');
        return csv;
      },
      args: [selector]
    });

    // Download as CSV
    const csv = result.result;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    await chrome.downloads.download({
      url: url,
      filename: `Sidekick_CSV/table_${timestamp}.csv`,
      saveAs: false
    });

    return 'CSV exported';
  },

  async runJavascript(tabId, code) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (c) => eval(c),
      args: [code]
    });
    return JSON.stringify(result.result);
  },

  async extractImages(tabId) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const images = Array.from(document.querySelectorAll('img[src]'));
        return images.map(img => ({ src: img.src, alt: img.alt }));
      }
    });
    return JSON.stringify(result.result);
  },

  async doubleClick(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found';
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return 'Double clicked: ' + (el.textContent || el.tagName).slice(0, 50);
      },
      args: [selector]
    });
    return result.result;
  },

  async rightClick(tabId, selector) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'Element not found';
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        return 'Right clicked: ' + (el.textContent || el.tagName).slice(0, 50);
      },
      args: [selector]
    });
    return result.result;
  },

  async getCookies(tabId) {
    const tab = await chrome.tabs.get(tabId);
    const cookies = await chrome.cookies.getAll({ url: tab.url });
    return JSON.stringify(cookies);
  }
};
