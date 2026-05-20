import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { COLORS, G, DIM, HAIRLINE, FONT, tooltipStyle, panel, panelHeading } from '../theme';

const POINTS = 20;
const NEG_TREND_THRESHOLD = 3;
const POS_TREND_THRESHOLD = 3;

function computeTrend(data) {
  const recent = data.slice(0, 5).map(i => i.sentiment);
  const neg = recent.filter(s => s === 'NEGATIVE').length >= NEG_TREND_THRESHOLD;
  const pos = recent.filter(s => s === 'POSITIVE').length >= POS_TREND_THRESHOLD;
  if (neg) return { label: 'NEGATIVE', color: COLORS.NEGATIVE };
  if (pos) return { label: 'POSITIVE', color: COLORS.POSITIVE };
  return { label: 'MIXED', color: G };
}

export default function SentimentTimeline({ data }) {
  const timelineData = [...data].slice(0, POINTS).reverse().map((item, i) => ({
    name: i + 1,
    Positive: parseFloat(item.scores.Positive).toFixed(3),
    Negative: parseFloat(item.scores.Negative).toFixed(3),
    Neutral: parseFloat(item.scores.Neutral).toFixed(3),
    Mixed: parseFloat(item.scores.Mixed).toFixed(3),
  }));
  const trend = computeTrend(data);

  return (
    <div style={panel(G)}>
      <div style={panelHeading}>{`// sentiment timeline (last ${POINTS})`}</div>
      <div style={{ fontSize: '0.72rem', color: DIM, marginBottom: '1rem' }}>
        confidence scores over time · trending <span style={{ color: trend.color }}>{trend.label}</span> · y-axis = model confidence [0–1]
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={timelineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={HAIRLINE} />
          <XAxis dataKey="name" stroke={DIM} tick={{ fontFamily: FONT, fontSize: '0.7rem', fill: DIM }} />
          <YAxis domain={[0, 1]} stroke={DIM} tick={{ fontFamily: FONT, fontSize: '0.7rem', fill: DIM }} tickCount={6} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontFamily: FONT, fontSize: '0.72rem', color: G }} />
          <Line type="monotone" dataKey="Positive" stroke={COLORS.POSITIVE} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="Negative" stroke={COLORS.NEGATIVE} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="Neutral" stroke={COLORS.NEUTRAL} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="Mixed" stroke={COLORS.MIXED} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
