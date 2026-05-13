import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';

const API_URL = 'https://o3kuswci10.execute-api.us-east-1.amazonaws.com/prod/sentiment';

const COLORS = { POSITIVE: '#00cfff', NEGATIVE: '#ff3131', NEUTRAL: '#ffaa00', MIXED: '#bf5fff' };
const G = '#00ff41';

const tooltipStyle = { backgroundColor: '#000', border: `1px solid ${G}`, color: G, fontFamily: 'Courier New', fontSize: '0.75rem' };

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return <text x={x} y={y} fill="#000" textAnchor="middle" dominantBaseline="central" fontSize="0.72rem" fontFamily="Courier New" fontWeight="700">{`${(percent * 100).toFixed(0)}%`}</text>;
};

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marqueeText, setMarqueeText] = useState('');

  const fetchData = async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date().toLocaleTimeString());
      if (json[0]) setMarqueeText(`LATEST: "${json[0].text}" → [${json[0].sentiment}]`);
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

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', backgroundColor:'#000', color:G, fontFamily:'Courier New' }}>&gt; initializing Sentiment_PULSE...</div>;
  if (error) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', backgroundColor:'#000', color:'#ff3131', fontFamily:'Courier New' }}>&gt; ERROR: {error}</div>;

  const counts = data.reduce((acc, item) => { acc[item.sentiment] = (acc[item.sentiment] || 0) + 1; return acc; }, {});
  const total = data.length;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const pieData = Object.entries(counts).map(([name, value]) => ({ name, value }));
  const timelineData = [...data].slice(0, 20).reverse().map((item, i) => ({
    name: i + 1,
    Positive: parseFloat(item.scores.Positive).toFixed(3),
    Negative: parseFloat(item.scores.Negative).toFixed(3),
    Neutral: parseFloat(item.scores.Neutral).toFixed(3),
    Mixed: parseFloat(item.scores.Mixed).toFixed(3),
  }));
  const recentSentiments = data.slice(0, 5).map(i => i.sentiment);
  const trendingNeg = recentSentiments.filter(s => s === 'NEGATIVE').length >= 3;
  const trendingPos = recentSentiments.filter(s => s === 'POSITIVE').length >= 3;
  const trend = trendingNeg ? 'NEGATIVE' : trendingPos ? 'POSITIVE' : 'MIXED';
  const trendColor = trendingNeg ? COLORS.NEGATIVE : trendingPos ? COLORS.POSITIVE : G;

  const formatTime = (ts) => {
    try { return new Date(ts).toLocaleTimeString(); } catch { return ''; }
  };

  const marqueeContent = `>>> ${marqueeText}   ·   POSITIVE: ${counts.POSITIVE||0}  ·  NEGATIVE: ${counts.NEGATIVE||0}  ·  NEUTRAL: ${counts.NEUTRAL||0}  ·  MIXED: ${counts.MIXED||0}   ·   DOMINANT: ${dominant?.[0]}   ·   PIPELINE: kinesis → lambda → comprehend → dynamodb   <<<`;

  return (
    <div style={{ backgroundColor:'#000', minHeight:'100vh', color:G, fontFamily:"'Courier New', monospace", padding:'2rem' }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes marquee{0%{transform:translateX(0%)}100%{transform:translateX(-50%)}}
        *{box-sizing:border-box}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom:'1rem', borderBottom:`1px solid ${G}`, paddingBottom:'1rem' }}>
        <h1 style={{ fontSize:'1.75rem', fontWeight:'700', color:G, margin:0, letterSpacing:'0.1em' }}>
          &gt; Sentiment_PULSE <span style={{ color:'#ff3131' }}>[LIVE]</span>
        </h1>
        <p style={{ color:'#00aa2a', marginTop:'0.25rem', fontSize:'0.85rem' }}>
          <span style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor:G, display:'inline-block', marginRight:'0.5rem', animation:'pulse 2s infinite' }} />
          {total} records · last sync {lastUpdated} · polling every 5s
        </p>
      </div>

      {/* Marquee ticker */}
      <div style={{ overflow:'hidden', borderBottom:`1px solid #001a00`, marginBottom:'1.5rem', padding:'0.4rem 0' }}>
        <div style={{ display:'flex', width:'200%', animation:'marquee 25s linear infinite', whiteSpace:'nowrap', fontSize:'0.78rem', color:'#00aa2a' }}>
          <span style={{ flex:'0 0 50%' }}>{marqueeContent}</span>
          <span style={{ flex:'0 0 50%' }}>{marqueeContent}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {['POSITIVE','NEGATIVE','NEUTRAL','MIXED'].map(s => {
          const pct = ((counts[s]||0) / total * 100).toFixed(1);
          return (
            <div key={s} style={{ backgroundColor:'#000', borderRadius:'2px', padding:'1rem', border:`1px solid ${COLORS[s]}`, textAlign:'center', boxShadow:`0 0 8px ${COLORS[s]}33` }}>
              <div style={{ fontSize:'1.75rem', fontWeight:'700', color:COLORS[s] }}>{counts[s]||0}</div>
              <div style={{ fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.1em', color:COLORS[s], marginBottom:'0.5rem' }}>{s}</div>
              <div style={{ backgroundColor:'#001a00', borderRadius:'1px', height:'4px', width:'100%' }}>
                <div style={{ backgroundColor:COLORS[s], height:'4px', width:`${pct}%`, borderRadius:'1px', transition:'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize:'0.65rem', color:'#00aa2a', marginTop:'0.3rem' }}>{pct}%</div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'1.5rem', marginBottom:'1.5rem' }}>
        <div style={{ backgroundColor:'#000', borderRadius:'2px', padding:'1.5rem', border:`1px solid ${G}`, boxShadow:`0 0 8px ${G}33` }}>
          <div style={{ fontSize:'0.8rem', fontWeight:'700', color:G, marginBottom:'0.4rem', textTransform:'uppercase', letterSpacing:'0.15em' }}>// breakdown</div>
          <div style={{ fontSize:'0.72rem', color:'#00aa2a', marginBottom:'1rem' }}>
            dominant: <span style={{ color:COLORS[dominant?.[0]] }}>{dominant?.[0]}</span> at {((dominant?.[1]||0)/total*100).toFixed(1)}%
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'1.5rem' }}>
            <PieChart width={180} height={180}>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} strokeWidth={1} stroke="#000" labelLine={false} label={renderCustomLabel}>
                {pieData.map(entry => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
              {pieData.map(entry => (
                <div key={entry.name} style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.75rem' }}>
                  <div style={{ width:'10px', height:'10px', borderRadius:'2px', backgroundColor:COLORS[entry.name], flexShrink:0 }} />
                  <span style={{ color:COLORS[entry.name] }}>{entry.name}</span>
                  <span style={{ color:'#00aa2a' }}>({entry.value})</span>
                </div>
              ))}
              <div style={{ marginTop:'0.5rem', fontSize:'0.7rem', color:'#00aa2a', borderTop:`1px solid #001a00`, paddingTop:'0.5rem' }}>
                total: <span style={{ color:G }}>{total}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor:'#000', borderRadius:'2px', padding:'1.5rem', border:`1px solid ${G}`, boxShadow:`0 0 8px ${G}33` }}>
          <div style={{ fontSize:'0.8rem', fontWeight:'700', color:G, marginBottom:'0.4rem', textTransform:'uppercase', letterSpacing:'0.15em' }}>// sentiment timeline (last 20)</div>
          <div style={{ fontSize:'0.72rem', color:'#00aa2a', marginBottom:'1rem' }}>
            confidence scores over time · trending <span style={{ color:trendColor }}>{trend}</span> · y-axis = model confidence [0–1]
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={timelineData} margin={{ top:5, right:10, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#001a00" />
              <XAxis dataKey="name" stroke="#00aa2a" tick={{ fontFamily:'Courier New', fontSize:'0.7rem', fill:'#00aa2a' }} />
              <YAxis domain={[0,1]} stroke="#00aa2a" tick={{ fontFamily:'Courier New', fontSize:'0.7rem', fill:'#00aa2a' }} tickCount={6} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontFamily:'Courier New', fontSize:'0.72rem', color:G }} />
              <Line type="monotone" dataKey="Positive" stroke={COLORS.POSITIVE} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Negative" stroke={COLORS.NEGATIVE} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Neutral" stroke={COLORS.NEUTRAL} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Mixed" stroke={COLORS.MIXED} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live Feed */}
      <div style={{ backgroundColor:'#000', borderRadius:'2px', padding:'1.5rem', border:`1px solid ${G}`, boxShadow:`0 0 8px ${G}33` }}>
        <div style={{ fontSize:'0.8rem', fontWeight:'700', color:G, marginBottom:'0.4rem', textTransform:'uppercase', letterSpacing:'0.15em' }}>// live feed</div>
        <div style={{ fontSize:'0.72rem', color:'#00aa2a', marginBottom:'1rem' }}>
          latest {Math.min(8,total)} records · kinesis → lambda → comprehend · auto-updates every 5s · {total} total in db
        </div>
        {data.slice(0,8).map(item => (
          <div key={item.id} style={{ padding:'0.6rem 1rem', borderRadius:'2px', background:'#000', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.4rem', borderLeft:`3px solid ${COLORS[item.sentiment]}` }}>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.15rem' }}>
              <span style={{ color:'#00cc33', fontSize:'0.85rem' }}>&gt; {item.text}</span>
              <span style={{ color:'#007700', fontSize:'0.7rem' }}>{formatTime(item.timestamp)}</span>
            </div>
            <span style={{ fontWeight:'700', fontSize:'0.75rem', whiteSpace:'nowrap', marginLeft:'1rem', color:COLORS[item.sentiment] }}>[{item.sentiment}]</span>
          </div>
        ))}
      </div>
    </div>
  );
}
