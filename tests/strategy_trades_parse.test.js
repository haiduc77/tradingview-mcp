import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrategyTradesText } from '../src/core/data.js';

test('parseStrategyTradesText extracts Strategy Tester list-of-trades rows', () => {
  const text = `List of trades

Trade number
Type
Date and time
Signal
Price
Size
Net PnL
Favorable excursion
Adverse excursion
Cumulative PnL

2long
Exit
Entry
May 11, 2026
Apr 24, 2026
ATR stop
Long
16.646
EUR
17.782
EUR
276
4.91\u202fKEUR
\u2212313.536
EUR
\u22126.39%
44.16
EUR
0.90%
\u2212338.376
EUR
\u22126.89%
\u2212120.216
EUR
\u22120.12%

1long
Exit
Entry
Apr 07, 2026
Mar 24, 2026
Target weak
Long
18.908
EUR
18.192
EUR
270
4.91\u202fKEUR
+193.32
EUR
+3.94%
237.06
EUR
4.83%
\u2212301.86
EUR
\u22126.15%
193.32
EUR
0.19%`;

  const result = parseStrategyTradesText(text);
  assert.equal(result.trade_count, 2);

  assert.deepEqual(
    {
      trade_number: result.trades[0].trade_number,
      direction: result.trades[0].direction,
      entry_date: result.trades[0].entry_date,
      exit_date: result.trades[0].exit_date,
      entry_signal: result.trades[0].entry_signal,
      exit_signal: result.trades[0].exit_signal,
      entry_price: result.trades[0].entry_price,
      exit_price: result.trades[0].exit_price,
      net_pnl: result.trades[0].net_pnl,
      net_pnl_percent: result.trades[0].net_pnl_percent,
      adverse_excursion_percent: result.trades[0].adverse_excursion_percent,
    },
    {
      trade_number: 2,
      direction: 'long',
      entry_date: 'Apr 24, 2026',
      exit_date: 'May 11, 2026',
      entry_signal: 'Long',
      exit_signal: 'ATR stop',
      entry_price: 17.782,
      exit_price: 16.646,
      net_pnl: -313.536,
      net_pnl_percent: -6.39,
      adverse_excursion_percent: -6.89,
    }
  );

  assert.equal(result.trades[1].trade_number, 1);
  assert.equal(result.trades[1].exit_signal, 'Target weak');
  assert.equal(result.trades[1].net_pnl, 193.32);
  assert.equal(result.trades[1].cumulative_pnl_percent, 0.19);
});

