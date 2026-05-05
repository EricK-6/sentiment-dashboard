// src/App.jsx
// Install deps: npm install recharts axios
// Set REACT_APP_API_URL in .env.local or Amplify console

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from "recharts";

const API_URL = process.env.REACT_APP_API_URL || "https://YOUR_API_GATEWAY_URL/prod";
const POLL_INTERVAL = 5000; // ms

const SENTIMENT_COLORS = {
  POSITIVE: "#22c55e",
  NEGATIVE: "#ef4444",
  NEUTRAL:  "#94a3b8",
  MIXED:    "#f59e0b",
};

const SENTIMENT_EMOJI = {
  POSITIVE: "😊",
  NEGATIVE: "😞",
  NEUTRAL:  "😐",
  MIXED:    "😕",
};

// ─── Subcomponents ───────────────────────────────────────────────

function StatCard({ label, value, color, emoji }) {
  return (
    <div style={{
      background: "#0f172a",
      border: `1px solid ${color}33`,
      borderTop: `3px solid ${color}`,
      borderRadius: "8px",
      padding: "20px 24px",
      minWidth: "140px",
      flex: 1,
    }}>
      <div style={{ fontSize: "28px", marginBottom: "4px" }}>{emoji}</div>
      <div style={{ fontSize: "32px", fontWeight: "700", color, fontFamily: "monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}

function SentimentBadge({ sentiment }) {
  const color = SENTIMENT_COLORS[sentiment] || "#64748b";
  return (
    <span style={{
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
      borderRadius: "4px",
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.06em",
    }}>
      {sentiment}
    </span>
  );
}

function RecentFeed({ records }) {
  return (
    <div style={{
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid #1e293b",
        fontSize: "13px",
        fontWeight: "600",
        color: "#94a3b8",
        letterSpacing: "0.08em",
      }}>
        LIVE FEED
      </div>
      <div style={{ maxHeight: "360px", overflowY: "auto" }}>
        {records.length === 0 && (
          <div style={{ padding: "24px 20px", color: "#475569", fontSize: "14px" }}>
            No records yet — run producer.py to start streaming...
          </div>
        )}
        {records.map((r, i) => (
          <div key={r.id || i} style={{
            padding: "12px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "13px",
                color: "#cbd5e1",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginBottom: "4px",
              }}>
                {r.text}
              </div>
              <div style={{ fontSize: "11px", color: "#475569" }}>
                {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "—"}
              </div>
            </div>
            <SentimentBadge sentiment={r.sentiment} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [history, setHistory] = useState([]); // for timeline chart

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/sentiment`);
      const payload = res.data;
      setData(payload);
      setError(null);
      setLastUpdated(new Date());

      // Append summary snapshot to history for timeline
      setHistory(prev => {
        const snapshot = {
          time: new Date().toLocaleTimeString(),
          ...payload.summary,
        };
        const next = [...prev, snapshot];
        return next.slice(-20); // keep last 20 snapshots
      });
    } catch (err) {
      setError("Unable to reach API. Check your REACT_APP_API_URL and CORS settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Pie chart data
  const pieData = data
    ? Object.entries(data.summary).map(([name, value]) => ({ name, value }))
    : [];

  // Bar chart data
  const barData = pieData;

  const styles = {
    app: {
      minHeight: "100vh",
      background: "#020817",
      color: "#e2e8f0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      padding: "32px 24px",
      maxWidth: "1200px",
      margin: "0 auto",
    },
    header: {
      marginBottom: "32px",
    },
    title: {
      fontSize: "22px",
      fontWeight: "700",
      color: "#f8fafc",
      letterSpacing: "0.02em",
      margin: 0,
    },
    subtitle: {
      fontSize: "12px",
      color: "#475569",
      marginTop: "6px",
      letterSpacing: "0.08em",
    },
    pulse: {
      display: "inline-block",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: "#22c55e",
      marginRight: "8px",
      animation: "pulse 2s infinite",
    },
    grid2: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "20px",
      marginBottom: "20px",
    },
    card: {
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: "8px",
      padding: "20px",
    },
    cardTitle: {
      fontSize: "11px",
      color: "#64748b",
      letterSpacing: "0.1em",
      marginBottom: "16px",
      fontWeight: "600",
    },
    statsRow: {
      display: "flex",
      gap: "12px",
      marginBottom: "20px",
      flexWrap: "wrap",
    },
  };

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={styles.pulse} />
          Sentiment Stream Dashboard
        </h1>
        <div style={styles.subtitle}>
          AWS KINESIS → LAMBDA → COMPREHEND → DYNAMODB &nbsp;|&nbsp;
          {lastUpdated
            ? `LAST UPDATED ${lastUpdated.toLocaleTimeString()}`
            : "CONNECTING..."}
          &nbsp;|&nbsp; POLLING EVERY {POLL_INTERVAL / 1000}S
        </div>
      </div>

      {error && (
        <div style={{
          background: "#450a0a",
          border: "1px solid #ef4444",
          borderRadius: "6px",
          padding: "12px 16px",
          fontSize: "13px",
          color: "#fca5a5",
          marginBottom: "20px",
        }}>
          ⚠ {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ color: "#475569", fontSize: "14px" }}>Loading...</div>
      )}

      {data && (
        <>
          {/* Stat Cards */}
          <div style={styles.statsRow}>
            {Object.entries(data.summary).map(([sentiment, count]) => (
              <StatCard
                key={sentiment}
                label={sentiment}
                value={count}
                color={SENTIMENT_COLORS[sentiment]}
                emoji={SENTIMENT_EMOJI[sentiment]}
              />
            ))}
            <StatCard
              label="TOTAL RECORDS"
              value={data.total}
              color="#60a5fa"
              emoji="📊"
            />
          </div>

          {/* Charts row */}
          <div style={styles.grid2}>
            {/* Pie Chart */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>SENTIMENT BREAKDOWN</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SENTIMENT_COLORS[entry.name]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Bar Chart */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>COUNT BY SENTIMENT</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SENTIMENT_COLORS[entry.name]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Timeline Chart */}
          {history.length > 1 && (
            <div style={{ ...styles.card, marginBottom: "20px" }}>
              <div style={styles.cardTitle}>SENTIMENT TIMELINE (LIVE)</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {Object.entries(SENTIMENT_COLORS).map(([key, color]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Live Feed */}
          <RecentFeed records={data.records || []} />
        </>
      )}
    </div>
  );
}
