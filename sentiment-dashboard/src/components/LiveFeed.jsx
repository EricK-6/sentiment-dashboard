import { COLORS, G, DIM, panel, panelHeading, formatTime } from '../theme';

const FEED_LIMIT = 8;

export default function LiveFeed({ data, total }) {
  const items = data.slice(0, FEED_LIMIT);
  return (
    <div style={panel(G)}>
      <div style={panelHeading}>{'// live feed'}</div>
      <div style={{ fontSize: '0.72rem', color: DIM, marginBottom: '1rem' }}>
        latest {Math.min(FEED_LIMIT, total)} records · kinesis → lambda → comprehend · auto-updates every 5s · {total} total in db
      </div>
      {items.map(item => (
        <div key={item.id} style={{
          padding: '0.6rem 1rem', borderRadius: '2px', background: '#000',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '0.4rem', borderLeft: `3px solid ${COLORS[item.sentiment]}`,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <span style={{ color: '#00cc33', fontSize: '0.85rem' }}>&gt; {item.text}</span>
            <span style={{ color: '#007700', fontSize: '0.7rem' }}>{formatTime(item.timestamp)}</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '0.75rem', whiteSpace: 'nowrap', marginLeft: '1rem', color: COLORS[item.sentiment] }}>
            [{item.sentiment}]
          </span>
        </div>
      ))}
    </div>
  );
}
