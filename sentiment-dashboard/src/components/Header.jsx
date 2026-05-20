import { G, DIM } from '../theme';

export default function Header({ total, lastUpdated, pollIntervalMs }) {
  return (
    <div style={{ marginBottom: '1rem', borderBottom: `1px solid ${G}`, paddingBottom: '1rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: G, margin: 0, letterSpacing: '0.1em' }}>
        &gt; Sentiment_PULSE{' '}
        <span style={{ color: '#ff3131', animation: 'blink 1s step-start infinite' }}>[LIVE]</span>
      </h1>
      <p style={{ color: DIM, marginTop: '0.25rem', fontSize: '0.85rem' }}>
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', backgroundColor: G,
          display: 'inline-block', marginRight: '0.5rem', animation: 'pulse 2s infinite',
        }} />
        {total} records · last sync {lastUpdated} · polling every {pollIntervalMs / 1000}s
      </p>
    </div>
  );
}
