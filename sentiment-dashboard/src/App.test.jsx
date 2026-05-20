import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  computeStats,
  computeHeatmap,
  detectAnomalies,
  confidenceOf,
  safeScore,
} from './App.jsx';

const rec = (overrides = {}) => ({
  id: 'r-' + Math.random().toString(36).slice(2),
  sentiment: 'POSITIVE',
  source: 'twitter',
  timestamp: new Date().toISOString(),
  scores: { Positive: 0.9, Negative: 0.03, Neutral: 0.05, Mixed: 0.02 },
  text: '',
  ...overrides,
});

describe('safeScore', () => {
  it('returns numeric scores as-is', () => {
    expect(safeScore({ scores: { Positive: 0.42 } }, 'Positive')).toBe(0.42);
  });

  it('parses string scores (DynamoDB number-as-string shape)', () => {
    expect(safeScore({ scores: { Positive: '0.42' } }, 'Positive')).toBe(0.42);
  });

  it('returns 0 when the score is missing', () => {
    expect(safeScore({ scores: {} }, 'Positive')).toBe(0);
    expect(safeScore({}, 'Positive')).toBe(0);
  });

  it('returns 0 for a null record', () => {
    expect(safeScore(null, 'Positive')).toBe(0);
  });
});

describe('confidenceOf', () => {
  it('returns the score corresponding to the dominant sentiment', () => {
    expect(confidenceOf(rec({ sentiment: 'POSITIVE', scores: { Positive: 0.88 } }))).toBe(0.88);
    expect(confidenceOf(rec({ sentiment: 'NEGATIVE', scores: { Negative: 0.71 } }))).toBe(0.71);
    expect(confidenceOf(rec({ sentiment: 'NEUTRAL',  scores: { Neutral:  0.62 } }))).toBe(0.62);
    expect(confidenceOf(rec({ sentiment: 'MIXED',    scores: { Mixed:    0.55 } }))).toBe(0.55);
  });

  it('returns 0 for a null record', () => {
    expect(confidenceOf(null)).toBe(0);
  });
});

describe('computeStats', () => {
  it('returns zero counts and POSITIVE as default dominant for empty input', () => {
    const s = computeStats([]);
    expect(s.total).toBe(0);
    expect(s.counts).toEqual({ POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0 });
    expect(s.bySource).toEqual({});
    expect(s.dominant).toBe('POSITIVE');
  });

  it('counts records by sentiment and computes total', () => {
    const s = computeStats([
      rec({ sentiment: 'POSITIVE' }),
      rec({ sentiment: 'POSITIVE' }),
      rec({ sentiment: 'NEGATIVE' }),
      rec({ sentiment: 'NEUTRAL' }),
    ]);
    expect(s.total).toBe(4);
    expect(s.counts).toEqual({ POSITIVE: 2, NEGATIVE: 1, NEUTRAL: 1, MIXED: 0 });
    expect(s.dominant).toBe('POSITIVE');
  });

  it('groups counts by source', () => {
    const s = computeStats([
      rec({ sentiment: 'POSITIVE', source: 'twitter' }),
      rec({ sentiment: 'NEGATIVE', source: 'twitter' }),
      rec({ sentiment: 'POSITIVE', source: 'reddit'  }),
    ]);
    expect(s.bySource.twitter.total).toBe(2);
    expect(s.bySource.twitter.POSITIVE).toBe(1);
    expect(s.bySource.twitter.NEGATIVE).toBe(1);
    expect(s.bySource.reddit.total).toBe(1);
    expect(s.bySource.reddit.POSITIVE).toBe(1);
  });

  it('falls back to "unknown" when source is missing', () => {
    const s = computeStats([rec({ source: undefined })]);
    expect(s.bySource.unknown.total).toBe(1);
  });

  it('picks the most common sentiment as dominant', () => {
    const s = computeStats([
      rec({ sentiment: 'NEGATIVE' }),
      rec({ sentiment: 'NEGATIVE' }),
      rec({ sentiment: 'NEGATIVE' }),
      rec({ sentiment: 'POSITIVE' }),
    ]);
    expect(s.dominant).toBe('NEGATIVE');
  });
});

describe('computeHeatmap', () => {
  const NOW = new Date('2026-05-20T15:00:00Z').getTime();

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns a 7×24 grid of zeros for empty input', () => {
    const grid = computeHeatmap([]);
    expect(grid).toHaveLength(7);
    expect(grid.every(row => row.length === 24)).toBe(true);
    expect(grid.flat().every(cell => cell.total === 0 && cell.pos === 0 && cell.neg === 0)).toBe(true);
  });

  it('places a record in the correct day-of-week and hour bucket', () => {
    const grid = computeHeatmap([
      rec({ timestamp: new Date(NOW).toISOString(), sentiment: 'POSITIVE' }),
    ]);
    // daysAgo = 0 → day index 6 (rightmost column = today)
    const hour = new Date(NOW).getHours(); // local-time hour
    expect(grid[6][hour].total).toBe(1);
    expect(grid[6][hour].pos).toBe(1);
    expect(grid[6][hour].neg).toBe(0);
  });

  it('tags negative records into the neg counter', () => {
    const grid = computeHeatmap([
      rec({ timestamp: new Date(NOW).toISOString(), sentiment: 'NEGATIVE' }),
    ]);
    const hour = new Date(NOW).getHours();
    expect(grid[6][hour].total).toBe(1);
    expect(grid[6][hour].neg).toBe(1);
    expect(grid[6][hour].pos).toBe(0);
  });

  it('drops records older than 7 days', () => {
    const eightDaysAgo = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
    const grid = computeHeatmap([rec({ timestamp: eightDaysAgo })]);
    expect(grid.flat().every(cell => cell.total === 0)).toBe(true);
  });

  it('skips records with unparseable timestamps', () => {
    const grid = computeHeatmap([rec({ timestamp: 'not-a-date' })]);
    expect(grid.flat().every(cell => cell.total === 0)).toBe(true);
  });
});

describe('detectAnomalies', () => {
  // Build records newest-first (the order the API returns them in).
  const mkBatch = (sentiments) =>
    sentiments.map((s, i) =>
      rec({
        id: `id-${i}`,
        sentiment: s,
        source: 'twitter',
        timestamp: new Date(Date.now() - i * 60_000).toISOString(),
      }),
    );

  it('returns no alerts when no 5-record window has ≥4 negatives', () => {
    const records = mkBatch([
      'POSITIVE', 'NEGATIVE', 'POSITIVE', 'NEUTRAL',
      'POSITIVE', 'POSITIVE', 'POSITIVE',
    ]);
    expect(detectAnomalies(records)).toHaveLength(0);
  });

  it('flags a 5/5 negative window as high severity', () => {
    const records = mkBatch([
      'NEGATIVE', 'NEGATIVE', 'NEGATIVE', 'NEGATIVE', 'NEGATIVE',
      'POSITIVE', 'POSITIVE',
    ]);
    const alerts = detectAnomalies(records);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('high');
    expect(alerts[0].label).toContain('5/5');
    expect(alerts[0].source).toBe('twitter');
  });

  it('flags a 4/5 negative window as medium severity', () => {
    const records = mkBatch([
      'NEGATIVE', 'NEGATIVE', 'POSITIVE', 'NEGATIVE', 'NEGATIVE',
      'POSITIVE', 'POSITIVE',
    ]);
    const alerts = detectAnomalies(records);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('medium');
    expect(alerts[0].label).toContain('4/5');
  });

  it('flags the last possible window — exactly 5 all-negative records', () => {
    // Regression: previously the loop bound was `i < length - 5`, missing
    // the final valid window. With exactly 5 negatives, no alert was raised.
    const records = mkBatch(['NEGATIVE', 'NEGATIVE', 'NEGATIVE', 'NEGATIVE', 'NEGATIVE']);
    const alerts = detectAnomalies(records);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('high');
  });

  it('caps the alerts array at 5 entries', () => {
    // 35 all-negative records → 6 detected spikes pre-cap, sliced to 5
    const records = mkBatch(Array(35).fill('NEGATIVE'));
    const alerts = detectAnomalies(records);
    expect(alerts).toHaveLength(5);
  });
});
