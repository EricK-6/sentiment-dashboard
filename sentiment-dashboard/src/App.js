import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';

const API_URL = 'https://o3kuswci10.execute-api.us-east-1.amazonaws.com/prod/sentiment';

const COLORS = {
  POSITIVE: '#00ff41',
  NEGATIVE: '#ff3131',
  NEUTRAL: '#00cfff',
  MIXED: '#ffaa00'
};

const G = '#00ff41';

const styles = {
  app: { backgroundColor: '#000000', minHeight: '100vh', color: G, fontFamily: "'Courier New', monospace", padding: '2rem' },
  header: { marginBottom: '2rem', borderBottom: `1px solid ${G}`, paddingBottom: '1rem' },
  title: { fontSize: '1.75rem', fontWeight: '700', color: G, margin: 0, letterSpacing: '0.1em' },
  subtitle: { color: '#00aa2a', marginTop: '0.25rem', fontSize: '0.85rem', letterSpacing: '0.05em' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' },
  card: { backgroundColor: '#000000', borderRadius: '2px', padding: '1.5rem', border: `1px solid ${G}`, boxShadow: `0 0 8px ${G}33` },
  cardTitle: { fontSize: '0.8rem', fontWeight: '700', color: G, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.15em' },
  feedItem: { padding: '0.6rem 1rem', borderRadius: '2px', background: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', borderLeft: '3px solid' },
  badge: { fontWeight: '700', fontSize: '0.75rem', whiteSpace: 'nowrap', marginLeft: '1rem', letterSpacing: '0.1em' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#000', color: G, fontFamily: 'Courier New', fontSize: '1rem' },
  error: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#000', color: '#ff3131', fontFamily: 'Courier New' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: G, display: 'inline-block', marginRight: '0.5rem', animation: 'pulse 2s infinite' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' },
  statCard: { backgroundColor: '#000', borderRadius: '2px', padding: '1rem', border: `1px solid ${G}`, textAlign: 'center', boxShadow: `0 0 6px ${G}22` },
  statNumber: { fontSize: '1.75rem', fontWeight: '700', fontFamily: 'Courier New' },
  statLabel: { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' },
};

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={styles.loading}>&gt; initializing dashboard...</div>;
  if (error) return <div style={styles.error}>&gt; ERROR: {error} — retrying...</div>;

  const counts = data.reduce((acc, item) => {
    acc[item.sentiment] = (acc[item.sentiment] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(counts).map(([name, value]) => ({ name, value }));

  const timelineData = [...data].slice(0, 10).reverse().map((item, i) => ({
    name: i + 1,
    Positive: parseFloat(item.scores.Positive),
    Negative: parseFloat(item.scores.Negative),
    Neutral: parseFloat(item.scores.Neutral),
  }));

  return (
    <div style={styles.app}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.2} } * { box-sizing: border-box; }`}</style>

      <div style={styles.header}>
        <h1 style={styles.title}>&gt; REAL-TIME SENTIMENT DASHBOARD</h1>
        <p style={styles.subtitle}>
          <span style={styles.dot} />
          {data.length} records loaded · last sync {lastUpdated} · polling every 5s
        </p>
      </div>

      <div style={styles.statsGrid}>
        {['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'].map(s => (
          <div key={s} style={{ ...styles.statCard, borderColor: COLORS[s], boxShadow: `0 0 8px ${COLORS[s]}33` }}>
            <div style={{ ...styles.statNumber, color: COLORS[s] }}>{counts[s] || 0}</div>
            <div style={{ ...styles.statLabel, color: COLORS[s] }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>// breakdown</div>
          <PieChart width={240} height={240}>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} strokeWidth={0} label={({ name, value }) => `${value}`} labelLine={{ stroke: G }}>
              {pieData.map(entry => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#000', border: `1px solid ${G}`, color: G, fontFamily: 'Courier New', fontSize: '0.8rem' }} />
          </PieChart>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>// sentiment timeline (last 10)</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#001a00" />
              <XAxis dataKey="name" stroke="#00aa2a" tick={{ fontFamily: 'Courier New', fontSize: '0.75rem', fill: '#00aa2a' }} />
              <YAxis domain={[0, 1]} stroke="#00aa2a" tick={{ fontFamily: 'Courier New', fontSize: '0.75rem', fill: '#00aa2a' }} />
              <Tooltip contentStyle={{ backgroundColor: '#000', border: `1px solid ${G}`, color: G, fontFamily: 'Courier New', fontSize: '0.8rem' }} />
              <Legend wrapperStyle={{ fontFamily: 'Courier New', fontSize: '0.75rem', color: G }} />
              <Line type="monotone" dataKey="Positive" stroke={COLORS.POSITIVE} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Negative" stroke={COLORS.NEGATIVE} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Neutral" stroke={COLORS.NEUTRAL} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>// live feed</div>
        {data.slice(0, 8).map(item => (
          <div key={item.id} style={{ ...styles.feedItem, borderLeftColor: COLORS[item.sentiment] }}>
            <span style={{ color: '#00cc33', fontSize: '0.85rem' }}>&gt; {item.text}</span>
            <span style={{ ...styles.badge, color: COLORS[item.sentiment] }}>[{item.sentiment}]</span>
          </div>
        ))}
      </div>
    </div>
  );
}
