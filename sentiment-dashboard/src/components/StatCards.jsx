import { COLORS, DIM, HAIRLINE } from '../theme';

const LABELS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'];

export default function StatCards({ counts, total }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
      {LABELS.map(s => {
        const count = counts[s] || 0;
        const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
        return (
          <div key={s} style={{
            backgroundColor: '#000', borderRadius: '2px', padding: '1rem',
            border: `1px solid ${COLORS[s]}`, textAlign: 'center', boxShadow: `0 0 8px ${COLORS[s]}33`,
          }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: COLORS[s] }}>{count}</div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS[s], marginBottom: '0.5rem' }}>{s}</div>
            <div style={{ backgroundColor: HAIRLINE, borderRadius: '1px', height: '4px', width: '100%' }}>
              <div style={{ backgroundColor: COLORS[s], height: '4px', width: `${pct}%`, borderRadius: '1px', transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: '0.65rem', color: DIM, marginTop: '0.3rem' }}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}
