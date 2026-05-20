import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { COLORS, G, DIM, HAIRLINE, FONT, tooltipStyle, panel, panelHeading } from '../theme';

const RADIAN = Math.PI / 180;

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#000" textAnchor="middle" dominantBaseline="central"
          fontSize="0.72rem" fontFamily={FONT} fontWeight="700">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function SentimentPieChart({ counts, total, dominant }) {
  const pieData = Object.entries(counts).map(([name, value]) => ({ name, value }));
  const dominantPct = total ? ((dominant?.[1] || 0) / total * 100).toFixed(1) : '0.0';

  return (
    <div style={panel(G)}>
      <div style={panelHeading}>{'// breakdown'}</div>
      <div style={{ fontSize: '0.72rem', color: DIM, marginBottom: '1rem' }}>
        dominant: <span style={{ color: COLORS[dominant?.[0]] }}>{dominant?.[0]}</span> at {dominantPct}%
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
        <PieChart width={180} height={180}>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
               outerRadius={85} strokeWidth={1} stroke="#000"
               labelLine={false} label={renderCustomLabel}>
            {pieData.map(entry => <Cell key={entry.name} fill={COLORS[entry.name]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {pieData.map(entry => (
            <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: COLORS[entry.name], flexShrink: 0 }} />
              <span style={{ color: COLORS[entry.name] }}>{entry.name}</span>
              <span style={{ color: DIM }}>({entry.value})</span>
            </div>
          ))}
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: DIM, borderTop: `1px solid ${HAIRLINE}`, paddingTop: '0.5rem' }}>
            total: <span style={{ color: G }}>{total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
