import './App.css';
import { useSentimentData } from './hooks/useSentimentData';
import Header from './components/Header';
import Marquee from './components/Marquee';
import StatCards from './components/StatCards';
import SentimentPieChart from './components/SentimentPieChart';
import SentimentTimeline from './components/SentimentTimeline';
import LiveFeed from './components/LiveFeed';
import { G, FONT } from './theme';

const screenStyle = {
  backgroundColor: '#000',
  minHeight: '100vh',
  color: G,
  fontFamily: FONT,
  padding: '2rem',
};

const messageStyle = (color) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: '#000',
  color,
  fontFamily: FONT,
});

export default function App() {
  const { data, loading, error, lastUpdated, pollIntervalMs } = useSentimentData();

  if (loading) return <div style={messageStyle(G)}>&gt; initializing Sentiment_PULSE...</div>;
  if (error)   return <div style={messageStyle('#ff3131')}>&gt; ERROR: {error}</div>;

  const counts = data.reduce((acc, item) => {
    acc[item.sentiment] = (acc[item.sentiment] || 0) + 1;
    return acc;
  }, {});
  const total = data.length;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={screenStyle}>
      <Header total={total} lastUpdated={lastUpdated} pollIntervalMs={pollIntervalMs} />
      <Marquee latestRecord={data[0]} counts={counts} dominant={dominant} />
      <StatCards counts={counts} total={total} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <SentimentPieChart counts={counts} total={total} dominant={dominant} />
        <SentimentTimeline data={data} />
      </div>
      <LiveFeed data={data} total={total} />
    </div>
  );
}
