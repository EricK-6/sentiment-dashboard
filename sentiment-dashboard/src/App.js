import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';

const API_URL = 'https://o3kuswci10.execute-api.us-east-1.amazonaws.com/prod/sentiment';

const COLORS = {
  POSITIVE: '#22c55e',
  NEGATIVE: '#ef4444',
  NEUTRAL: '#3b82f6',
  MIXED: '#f97316'
};

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch(API_URL);
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>;

  // Pie chart data
  const sentimentCounts = data.reduce((acc, item) => {
    acc[item.sentiment] = (acc[item.sentiment] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(sentimentCounts).map(([name, value]) => ({ name, value }));

  // Timeline data — last 10 items reversed
  const timelineData = [...data].slice(0, 10).reverse().map((item, i) => ({
    name: i + 1,
    Positive: parseFloat(item.scores.Positive),
    Negative: parseFloat(item.scores.Negative),
    Neutral: parseFloat(item.scores.Neutral),
  }));

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1100px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Real-Time Sentiment Dashboard</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{data.length} records · updates every 5s</p>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

        {/* Pie Chart */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h2>Sentiment Breakdown</h2>
          <PieChart width={300} height={300}>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name} (${value})`}>
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>

        {/* Timeline */}
        <div style={{ flex: 2, minWidth: '400px' }}>
          <h2>Sentiment Timeline (last 10)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Positive" stroke={COLORS.POSITIVE} dot={false} />
              <Line type="monotone" dataKey="Negative" stroke={COLORS.NEGATIVE} dot={false} />
              <Line type="monotone" dataKey="Neutral" stroke={COLORS.NEUTRAL} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live Feed */}
      <div style={{ marginTop: '2rem' }}>
        <h2>Live Feed</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.slice(0, 8).map(item => (
            <div key={item.id} style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#f9f9f9',
              borderLeft: `4px solid ${COLORS[item.sentiment]}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{item.text}</span>
              <span style={{
                marginLeft: '1rem',
                fontWeight: 'bold',
                color: COLORS[item.sentiment],
                whiteSpace: 'nowrap'
              }}>{item.sentiment}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
