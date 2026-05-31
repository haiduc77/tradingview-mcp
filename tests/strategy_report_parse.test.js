import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrategyReportText } from '../src/core/data.js';

test('parseStrategyReportText extracts visible Strategy Tester key stats', () => {
  const text = `
ETF Pullback Regime Swing v1
Jan 12, 2010 — May 29, 2026

Key stats

Total PnL
+3,406.67
EUR
+3.41%
Max drawdown
1,079.51
EUR
1.06%
Profitable trades
59.09%
52/88
Profit factor
1.565
Performance
Open PnL
0
EUR
0.00%
Expected payoff
38.71
EUR
Strategy Tester
Losers
Winners
Average loss
−2.98%
Average profit
3.65%
Trades distribution
88
Total trades
Winners
52 trades
59.09%
Losers
36 trades
40.91%
`;

  const result = parseStrategyReportText(text);

  assert.equal(result.metric_count > 0, true);
  assert.equal(result.metrics['Total PnL'], '+3,406.67 EUR');
  assert.equal(result.metrics['Total PnL %'], '+3.41%');
  assert.equal(result.metrics['Max drawdown'], '1,079.51 EUR');
  assert.equal(result.metrics['Max drawdown %'], '1.06%');
  assert.equal(result.metrics['Profitable trades'], '59.09%');
  assert.equal(result.metrics['Profitable trades count'], '52/88');
  assert.equal(result.metrics['Profit factor'], '1.565');
  assert.equal(result.metrics['Total trades'], '88');
  assert.equal(result.metrics['Winners'], '52 trades');
  assert.equal(result.metrics['Losers'], '36 trades');
  assert.equal(result.metrics['Average loss'], '−2.98%');
  assert.equal(result.metrics['Average profit'], '3.65%');
  assert.equal(result.metrics['Expected payoff'], '38.71 EUR');

  assert.equal(result.normalized.total_pnl, 3406.67);
  assert.equal(result.normalized.total_pnl_percent, 3.41);
  assert.equal(result.normalized.max_drawdown, 1079.51);
  assert.equal(result.normalized.max_drawdown_percent, 1.06);
  assert.equal(result.normalized.profitable_trades_percent, 59.09);
  assert.equal(result.normalized.profit_factor, 1.565);
  assert.equal(result.normalized.total_trades, 88);
  assert.equal(result.normalized.winning_trades, 52);
  assert.equal(result.normalized.losing_trades, 36);
  assert.equal(result.normalized.average_loss_percent, -2.98);
  assert.equal(result.normalized.average_profit_percent, 3.65);
  assert.equal(result.normalized.expected_payoff, 38.71);
  assert.equal(result.normalized.currency, 'EUR');
});
