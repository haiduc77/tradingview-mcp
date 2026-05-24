import { register } from '../router.js';
import * as core from '../../core/watchlist.js';

register('watchlist', {
  description: 'Watchlist tools (get, full, add)',
  subcommands: new Map([
    ['get', {
      description: 'Get watchlist symbols',
      handler: () => core.get(),
    }],
    ['full', {
      description: 'Get full watchlist symbols by scrolling virtualized rows',
      options: {
        maxScrolls: { type: 'string', description: 'Maximum scroll passes before stopping (default 120)' },
        settleMs: { type: 'string', description: 'Delay after each scroll in milliseconds (default 150)' },
        stalePasses: { type: 'string', description: 'Stop after this many passes add no new symbols (default 8)' },
      },
      handler: (opts) => core.getFull({
        maxScrolls: opts.maxScrolls,
        settleMs: opts.settleMs,
        stalePasses: opts.stalePasses,
      }),
    }],
    ['add', {
      description: 'Add a symbol to the watchlist',
      handler: (opts, positionals) => {
        if (!positionals[0]) throw new Error('Symbol required. Usage: tv watchlist add AAPL');
        return core.add({ symbol: positionals[0] });
      },
    }],
  ]),
});
