import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/watchlist.js';

export function registerWatchlistTools(server) {
  server.tool('watchlist_get', 'Get all symbols from the current TradingView watchlist with last price, change, and change%', {}, async () => {
    try { return jsonResult(await core.get()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('watchlist_get_full', 'Get the full current TradingView watchlist by scrolling virtualized rows until no new symbols are found', {
    maxScrolls: z.number().int().min(1).max(500).optional().describe('Maximum scroll passes before stopping (default 120)'),
    settleMs: z.number().int().min(25).max(2000).optional().describe('Delay after each scroll in milliseconds (default 150)'),
    stalePasses: z.number().int().min(1).max(50).optional().describe('Stop after this many passes add no new symbols (default 8)'),
  }, async ({ maxScrolls, settleMs, stalePasses }) => {
    try { return jsonResult(await core.getFull({ maxScrolls, settleMs, stalePasses })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('watchlist_add', 'Add a symbol to the TradingView watchlist', {
    symbol: z.string().describe('Symbol to add (e.g., AAPL, BTCUSD, ES1!, NYMEX:CL1!)'),
  }, async ({ symbol }) => {
    try { return jsonResult(await core.add({ symbol })); }
    catch (err) {
      // Try to close any open search/input on error
      try {
        const { getClient } = await import('../connection.js');
        const c = await getClient();
        await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      } catch (_) {}
      return jsonResult({ success: false, error: err.message }, true);
    }
  });
}
