/**
 * Core watchlist logic.
 * Uses TradingView's internal widget API with DOM fallback.
 */
import { evaluate, evaluateAsync, getClient } from '../connection.js';

export async function get() {
  // Try internal API first — reads from the active watchlist widget
  const symbols = await evaluate(`
    (function() {
      // Method 1: Try the watchlist widget's internal data
      try {
        var rightArea = document.querySelector('[class*="layout__area--right"]');
        if (!rightArea || rightArea.offsetWidth < 50) return { symbols: [], source: 'panel_closed' };
      } catch(e) {}

      // Method 2: Read data-symbol-full attributes from watchlist rows
      var results = [];
      var seen = {};
      var container = document.querySelector('[class*="layout__area--right"]');
      if (!container) return { symbols: [], source: 'no_container' };

      // Find all elements with symbol data attributes
      var symbolEls = container.querySelectorAll('[data-symbol-full]');
      for (var i = 0; i < symbolEls.length; i++) {
        var sym = symbolEls[i].getAttribute('data-symbol-full');
        if (!sym || seen[sym]) continue;
        seen[sym] = true;

        // Find the row and extract price data
        var row = symbolEls[i].closest('[class*="row"]') || symbolEls[i].parentElement;
        var cells = row ? row.querySelectorAll('[class*="cell"], [class*="column"]') : [];
        var nums = [];
        for (var j = 0; j < cells.length; j++) {
          var t = cells[j].textContent.trim();
          if (t && /^[\\-+]?[\\d,]+\\.?\\d*%?$/.test(t.replace(/[\\s,]/g, ''))) nums.push(t);
        }
        results.push({ symbol: sym, last: nums[0] || null, change: nums[1] || null, change_percent: nums[2] || null });
      }

      if (results.length > 0) return { symbols: results, source: 'data_attributes' };

      // Method 3: Scan for ticker-like text in the right panel
      var items = container.querySelectorAll('[class*="symbolName"], [class*="tickerName"], [class*="symbol-"]');
      for (var k = 0; k < items.length; k++) {
        var text = items[k].textContent.trim();
        if (text && /^[A-Z][A-Z0-9.:!]{0,20}$/.test(text) && !seen[text]) {
          seen[text] = true;
          results.push({ symbol: text, last: null, change: null, change_percent: null });
        }
      }

      return { symbols: results, source: results.length > 0 ? 'text_scan' : 'empty' };
    })()
  `);

  return {
    success: true,
    count: symbols?.symbols?.length || 0,
    source: symbols?.source || 'unknown',
    symbols: symbols?.symbols || [],
  };
}

export async function getFull({ maxScrolls = 120, settleMs = 150, stalePasses = 8 } = {}) {
  const max = Math.max(1, Math.min(Number(maxScrolls) || 120, 500));
  const settle = Math.max(25, Math.min(Number(settleMs) || 150, 2000));
  const staleLimit = Math.max(1, Math.min(Number(stalePasses) || 8, 50));

  const result = await evaluateAsync(`
    (async function() {
      var maxScrolls = ${max};
      var settleMs = ${settle};
      var staleLimit = ${staleLimit};
      var sleep = function(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); };

      function isVisible(el) {
        if (!el) return false;
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
      }

      function rightPanel() {
        var panels = Array.prototype.slice.call(document.querySelectorAll('[class*="layout__area--right"], [data-name="widgetbar-wrap"], [data-name="widgetbar-pages-with-tabs"]'));
        for (var i = 0; i < panels.length; i++) {
          if (isVisible(panels[i]) && panels[i].getBoundingClientRect().width > 80) return panels[i];
        }
        return null;
      }

      function findWatchlistScroller(panel) {
        var nodes = Array.prototype.slice.call(panel.querySelectorAll('*'));
        var candidates = [];
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var rect = el.getBoundingClientRect();
          if (!isVisible(el) || rect.height < 100) continue;
          if (el.scrollHeight <= el.clientHeight + 10) continue;
          var text = (el.innerText || '').trim();
          if (!text || !/(^|\\n)Symbol(\\n|$)/.test(text) && !/(^|\\n)[A-Z0-9]{1}\\n[A-Z0-9.]{2,8}\\nD\\n/.test(text)) continue;
          candidates.push({ el: el, score: el.scrollHeight - el.clientHeight + text.length });
        }
        candidates.sort(function(a, b) { return b.score - a.score; });
        return candidates.length ? candidates[0].el : null;
      }

      function isNumberText(value) {
        return /^[+\-−]?\d[\d.,]*$/.test(String(value || '').replace(/[\s\u00a0\u202f]/g, ''));
      }

      function isPercentText(value) {
        return /^[+\-−]?\d[\d.,]*%$/.test(String(value || '').replace(/[\s\u00a0\u202f]/g, ''));
      }

      function cleanQuoteRow(row) {
        if (!row) return null;
        if (row.last && !isNumberText(row.last)) row.last = null;
        if (row.change && !isNumberText(row.change)) row.change = null;
        if (row.change_percent && !isPercentText(row.change_percent)) row.change_percent = null;
        return row;
      }

      function parseText(text) {
        var lines = String(text || '').split(/\\n+/).map(function(s) { return s.trim(); }).filter(Boolean);
        var rows = [];
        for (var i = 0; i < lines.length - 4; i++) {
          var symbol = lines[i + 1];
          if (!/^[A-Z0-9]$/.test(lines[i])) continue;
          if (!/^[A-Z0-9.]{2,12}$/.test(symbol)) continue;
          if (lines[i + 2] !== 'D') continue;
          rows.push(cleanQuoteRow({
            symbol: symbol,
            last: lines[i + 3] || null,
            change: lines[i + 4] || null,
            change_percent: lines[i + 5] || null,
          }));
          i += 5;
        }
        return rows;
      }

      function collectFromDataAttributes(panel) {
        var rows = [];
        var seen = {};
        var els = panel.querySelectorAll('[data-symbol-full]');
        for (var i = 0; i < els.length; i++) {
          var symbol = els[i].getAttribute('data-symbol-full');
          if (!symbol || seen[symbol]) continue;
          seen[symbol] = true;
          rows.push({ symbol: symbol, last: null, change: null, change_percent: null });
        }
        return rows;
      }

      var panel = rightPanel();
      if (!panel) return { success: true, count: 0, source: 'panel_closed', symbols: [] };

      var scroller = findWatchlistScroller(panel);
      if (!scroller) {
        var directRows = collectFromDataAttributes(panel).concat(parseText(panel.innerText || ''));
        var directSeen = {};
        var direct = [];
        for (var d = 0; d < directRows.length; d++) {
          if (!directRows[d].symbol || directSeen[directRows[d].symbol]) continue;
          directSeen[directRows[d].symbol] = true;
          direct.push(directRows[d]);
        }
        return { success: true, count: direct.length, source: direct.length ? 'direct_panel_scan' : 'no_scroller', symbols: direct };
      }

      var byKey = {};
      var ordered = [];
      var passes = 0;
      var stale = 0;
      var lastTop = -1;
      var direction = 1;

      function rowKey(row) {
        return String(row.symbol || '').split(':').pop();
      }

      function remember(rows) {
        var added = 0;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!row.symbol) continue;
          var key = rowKey(row);
          if (!key) continue;
          row = cleanQuoteRow(row);
          if (!byKey[key]) {
            byKey[key] = Object.assign({ ticker: key }, row);
            ordered.push(key);
            added++;
          } else {
            var current = byKey[key];
            if (String(row.symbol).indexOf(':') !== -1 && String(current.symbol).indexOf(':') === -1) {
              current.symbol = row.symbol;
            }
            if (row.last) current.last = row.last;
            if (row.change) current.change = row.change;
            if (row.change_percent) current.change_percent = row.change_percent;
          }
        }
        return added;
      }

      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(settleMs);

      for (var pass = 0; pass < maxScrolls; pass++) {
        passes++;
        var added = 0;
        added += remember(collectFromDataAttributes(scroller));
        added += remember(parseText(scroller.innerText || ''));

        if (added === 0) stale++; else stale = 0;

        var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        var atTop = scroller.scrollTop <= 4;
        if (direction > 0 && atBottom) {
          if (stale >= staleLimit) break;
          direction = -1;
        } else if (direction < 0 && atTop) {
          if (stale >= staleLimit) break;
          direction = 1;
        }

        lastTop = scroller.scrollTop;
        scroller.scrollTop = Math.max(0, Math.min(
          scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollTop + direction * Math.max(80, Math.floor(scroller.clientHeight * 0.75))
        ));
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(settleMs);

        if (scroller.scrollTop === lastTop && stale >= staleLimit) break;
      }

      var symbols = ordered.map(function(key) { return byKey[key]; });
      return {
        success: true,
        count: symbols.length,
        source: 'virtual_scroll',
        symbols: symbols,
        passes: passes,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      };
    })()
  `);

  return result || { success: false, error: 'No result returned from watchlist full extraction' };
}

export async function add({ symbol }) {
  // Use keyboard shortcut to open symbol search in watchlist, type symbol, press Enter
  const c = await getClient();

  // First ensure watchlist panel is open
  const panelState = await evaluate(`
    (function() {
      var btn = document.querySelector('[data-name="base-watchlist-widget-button"]')
        || document.querySelector('[aria-label*="Watchlist"]');
      if (!btn) return { error: 'Watchlist button not found' };
      var isActive = btn.getAttribute('aria-pressed') === 'true'
        || btn.classList.toString().indexOf('Active') !== -1
        || btn.classList.toString().indexOf('active') !== -1;
      if (!isActive) { btn.click(); return { opened: true }; }
      return { opened: false };
    })()
  `);

  if (panelState?.error) throw new Error(panelState.error);
  if (panelState?.opened) await new Promise(r => setTimeout(r, 500));

  // Click the "Add symbol" button (various selectors)
  const addClicked = await evaluate(`
    (function() {
      var selectors = [
        '[data-name="add-symbol-button"]',
        '[aria-label="Add symbol"]',
        '[aria-label*="Add symbol"]',
        'button[class*="addSymbol"]',
      ];
      for (var s = 0; s < selectors.length; s++) {
        var btn = document.querySelector(selectors[s]);
        if (btn && btn.offsetParent !== null) { btn.click(); return { found: true, selector: selectors[s] }; }
      }
      // Fallback: find + button in right panel
      var container = document.querySelector('[class*="layout__area--right"]');
      if (container) {
        var buttons = container.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var ariaLabel = buttons[i].getAttribute('aria-label') || '';
          if (/add.*symbol/i.test(ariaLabel) || buttons[i].textContent.trim() === '+') {
            buttons[i].click();
            return { found: true, method: 'fallback' };
          }
        }
      }
      return { found: false };
    })()
  `);

  if (!addClicked?.found) throw new Error('Add symbol button not found in watchlist panel');
  await new Promise(r => setTimeout(r, 300));

  // Type the symbol into the search input
  await c.Input.insertText({ text: symbol });
  await new Promise(r => setTimeout(r, 500));

  // Press Enter to select the first result
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
  await new Promise(r => setTimeout(r, 300));

  // Press Escape to close search
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape' });

  return { success: true, symbol, action: 'added' };
}
