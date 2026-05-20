// production/App.jsx — Drop-in replacement for sentiment-dashboard/src/App.jsx
//
// Single-file React component that polls the real Sentiment Pulse API every
// 5 seconds and renders the D-direction dashboard (ECG hero + ops console).
// No external dependencies beyond React (Recharts is no longer needed — every
// chart is drawn with SVG).
//
// Theme prefs (palette, density) persist to localStorage. A small settings
// gear in the top-right toggles between themes for screenshot variants.
//
// Reads VITE_API_URL from Vite env at build time.

import { useState, useEffect, useMemo, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL;
const POLL_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// Theme — palettes, densities, font pairings. Drives the entire visual surface.
// ─────────────────────────────────────────────────────────────────────────────

const PALETTES = {
  paper: {
    name: 'Paper',
    bg: '#f4f2ed', panel: '#fbfaf6', panelHeader: '#f0ede5', paper: '#ede8d8',
    ink: '#1a1815', inkSoft: '#5a544c', inkMute: '#9a948a',
    rule: '#d8d2c4', ruleSoft: '#e6e1d6',
    pos: '#2f6a4a', neg: '#b8412a', neu: '#8a7544', mix: '#5a4a78',
    accent: '#b8412a',
  },
  slate: {
    name: 'Slate',
    bg: '#eef1f3', panel: '#f7f8fa', panelHeader: '#e8ecef', paper: '#e4e8eb',
    ink: '#15181c', inkSoft: '#4d555e', inkMute: '#8a939c',
    rule: '#cdd3d9', ruleSoft: '#dee2e7',
    pos: '#1f7a5a', neg: '#c4413b', neu: '#9a7a3a', mix: '#5a4a8a',
    accent: '#1f6f8a',
  },
  ivory: {
    name: 'Ivory',
    bg: '#f7f5ef', panel: '#fdfcf7', panelHeader: '#f2efe6', paper: '#ede9dc',
    ink: '#191814', inkSoft: '#5d5750', inkMute: '#a39d92',
    rule: '#dcd6c4', ruleSoft: '#e7e2d2',
    pos: '#3a6b4a', neg: '#c25033', neu: '#a18545', mix: '#665182',
    accent: '#9b6a2a',
  },
  bold: {
    name: 'Bold',
    bg: '#ffffff', panel: '#ffffff', panelHeader: '#f4f4f4', paper: '#f0f0f0',
    ink: '#000000', inkSoft: '#404040', inkMute: '#a0a0a0',
    rule: '#000000', ruleSoft: '#d4d4d4',
    pos: '#0a6b3e', neg: '#cc2418', neu: '#8a6a1a', mix: '#4a2a8a',
    accent: '#cc2418',
  },
};

const FONTS = {
  sans: '"Geist", "Söhne", -apple-system, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  display: '"Instrument Serif", "Newsreader", Georgia, serif',
};

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers (mirror DynamoDB schema shape exactly)
// ─────────────────────────────────────────────────────────────────────────────

function computeStats(records) {
  const counts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0 };
  const bySource = {};
  for (const r of records) {
    counts[r.sentiment] = (counts[r.sentiment] || 0) + 1;
    const src = r.source || 'unknown';
    bySource[src] = bySource[src] || { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0, total: 0 };
    bySource[src][r.sentiment] = (bySource[src][r.sentiment] || 0) + 1;
    bySource[src].total++;
  }
  const total = records.length;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'POSITIVE';
  return { counts, bySource, total, dominant };
}

function computeHeatmap(records) {
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ total: 0, pos: 0, neg: 0 }))
  );
  const now = Date.now();
  for (const r of records) {
    const t = new Date(r.timestamp).getTime();
    if (isNaN(t)) continue;
    const daysAgo = Math.floor((now - t) / (1000 * 60 * 60 * 24));
    if (daysAgo < 0 || daysAgo >= 7) continue;
    const day = 6 - daysAgo;
    const hour = new Date(t).getHours();
    grid[day][hour].total++;
    if (r.sentiment === 'POSITIVE') grid[day][hour].pos++;
    if (r.sentiment === 'NEGATIVE') grid[day][hour].neg++;
  }
  return grid;
}

function detectAnomalies(records) {
  const alerts = [];
  // records arrive newest-first from the API
  for (let i = 0; i < records.length - 5; i++) {
    const window = records.slice(i, i + 5);
    const negCount = window.filter(r => r.sentiment === 'NEGATIVE').length;
    if (negCount >= 4) {
      alerts.push({
        id: `anom-${window[0].id}`,
        t: window[0].timestamp,
        severity: negCount === 5 ? 'high' : 'medium',
        label: `Negative spike · ${negCount}/5 records`,
        source: window[0].source,
      });
      i += 4;
    }
  }
  return alerts.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — drives the SIMULATE button when you want to demo without the
// producer running. Records mirror the real DynamoDB schema exactly so every
// downstream computation (stats, heatmap, anomalies, drawer) works untouched.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SOURCES = ['twitter', 'reddit', 'hackernews', 'reviews', 'support'];
const MOCK_SAMPLES = {
  POSITIVE: [
    'Honestly the best release this year — everything just works.',
    'Loved how fast the new dashboard renders. Smooth animations everywhere.',
    'Customer support resolved my issue in under five minutes. Impressive.',
    'The redesign is clean. Hierarchy and density feel finally right.',
    'Performance gains are real — page loads dropped ~40% on my machine.',
  ],
  NEGATIVE: [
    'API has been throwing 500s for the last hour. Anyone else seeing this?',
    'Latest update broke our integration. Rolling back to the previous version.',
    'Pricing change feels predatory. Looking at alternatives now.',
    'Documentation is wildly out of date. Wasted an afternoon on this.',
    'Support ticket open for 6 days with zero response. Unacceptable.',
  ],
  NEUTRAL: [
    'Just published our Q3 roadmap. Feedback welcome.',
    'Maintenance window scheduled for Sunday 02:00 UTC.',
    'New endpoint available in beta — see docs for details.',
    'Weekly digest going out tomorrow morning.',
    'Reminder: rate limits apply per API key.',
  ],
  MIXED: [
    'Love the new UI, but the migration path is rough.',
    'Great feature set, though pricing puts it out of reach for small teams.',
    'Performance is solid; reliability still needs work.',
    'Onboarding improved a lot, but the docs lag behind.',
    'Faster than the old version, less customizable than the old version.',
  ],
};

let __mockSeed = 1;
function generateMockRecord(ts = Date.now()) {
  __mockSeed++;
  const sentiments = ['POSITIVE', 'POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'];
  const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
  const samples = MOCK_SAMPLES[sentiment];
  const text = samples[Math.floor(Math.random() * samples.length)];
  const source = MOCK_SOURCES[Math.floor(Math.random() * MOCK_SOURCES.length)];
  const primary = 0.55 + Math.random() * 0.43;
  const rest = (1 - primary) / 3;
  const noise = () => (Math.random() - 0.5) * rest * 0.6;
  const scores = {
    Positive: sentiment === 'POSITIVE' ? primary : Math.max(0, rest + noise()),
    Negative: sentiment === 'NEGATIVE' ? primary : Math.max(0, rest + noise()),
    Neutral:  sentiment === 'NEUTRAL'  ? primary : Math.max(0, rest + noise()),
    Mixed:    sentiment === 'MIXED'    ? primary : Math.max(0, rest + noise()),
  };
  return {
    id: `mock-${ts}-${__mockSeed}`,
    timestamp: new Date(ts).toISOString(),
    text, source, sentiment, scores,
  };
}

function generateMockBatch(count = 40) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) =>
    generateMockRecord(now - i * 18000)
  );
}

function safeScore(r, label) {
  const v = r?.scores?.[label];
  if (v == null) return 0;
  return typeof v === 'string' ? parseFloat(v) : v;
}

function confidenceOf(r) {
  if (!r) return 0;
  const label = (r.sentiment || '').charAt(0) + (r.sentiment || '').slice(1).toLowerCase();
  return safeScore(r, label);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useTickCounter(value, ms = 600) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef(null);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  useEffect(() => {
    if (!ms) { setDisplay(value); return; }
    cancelAnimationFrame(rafRef.current);
    fromRef.current = display;
    startRef.current = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - startRef.current) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(fromRef.current + (value - fromRef.current) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
  return display;
}

function usePersistedState(key, initial) {
  const [v, setV] = useState(() => {
    try { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [palette, setPalette] = usePersistedState('sp-palette', 'paper');
  const [showSettings, setShowSettings] = useState(false);
  const s = PALETTES[palette] || PALETTES.paper;
  const COLORS = { POSITIVE: s.pos, NEGATIVE: s.neg, NEUTRAL: s.neu, MIXED: s.mix };

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [ackedIds, setAckedIds] = useState(() => new Set());
  const [clock, setClock] = useState(() => new Date().toUTCString().slice(17, 25));

  // Poll API (paused while simulating)
  useEffect(() => {
    if (simulating) return;
    let cancelled = false;
    const fetchData = async () => {
      try {
        if (!API_URL) throw new Error('VITE_API_URL not set');
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const sorted = [...json].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRecords(sorted);
        setLastSync(new Date());
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      }
    };
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [simulating]);

  // Mock stream (active only while simulating). Seeds a backlog then pushes
  // a new record every 2s. Toggling off restores live polling.
  useEffect(() => {
    if (!simulating) return;
    setRecords(generateMockBatch(40));
    setLastSync(new Date());
    setError(null);
    setLoading(false);
    const id = setInterval(() => {
      setRecords(prev => [generateMockRecord(), ...prev].slice(0, 500));
      setLastSync(new Date());
    }, 2000);
    return () => clearInterval(id);
  }, [simulating]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toUTCString().slice(17, 25)), 1000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => computeStats(records), [records]);
  const heatmap = useMemo(() => computeHeatmap(records), [records]);
  const anomalies = useMemo(() => detectAnomalies(records), [records]);

  // Rec/min
  const bpm = useMemo(() => {
    if (records.length < 2) return 0;
    const recent = records.slice(0, Math.min(20, records.length));
    const spanMs = new Date(recent[0].timestamp) - new Date(recent[recent.length - 1].timestamp);
    if (spanMs <= 0) return 0;
    return (recent.length - 1) / (spanMs / 60000);
  }, [records]);

  // ── Empty / loading / error states ──
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: s.bg, color: s.inkSoft, fontFamily: FONTS.mono, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        <PulseDot s={s} />
        <div>Initializing Sentiment Pulse…</div>
      </div>
    );
  }
  if (error && records.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: s.bg, color: s.ink, fontFamily: FONTS.mono, padding: 24 }}>
        <div style={{ color: s.neg, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>● Connection error</div>
        <div style={{ fontSize: 12, color: s.inkSoft, maxWidth: 480, textAlign: 'center' }}>{error}</div>
        <div style={{ fontSize: 11, color: s.inkMute, textAlign: 'center', maxWidth: 480 }}>
          Verify VITE_API_URL is set in <code>.env.local</code> and points to your API Gateway endpoint, then restart <code>npm run dev</code>.
        </div>
        <button onClick={() => setSimulating(true)} style={{
          marginTop: 8, fontFamily: FONTS.mono, fontSize: 11, padding: '6px 14px',
          background: s.ink, color: s.bg, border: 'none', cursor: 'pointer',
          letterSpacing: '0.1em', borderRadius: 2,
        }}>▶ SIMULATE (DEMO MODE)</button>
      </div>
    );
  }
  if (records.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, background: s.bg, color: s.inkSoft, fontFamily: FONTS.mono, fontSize: 12 }}>
        <PulseDot s={s} />
        <div style={{ letterSpacing: '0.16em', textTransform: 'uppercase', color: s.inkMute }}>Waiting for first record</div>
        <div style={{ fontSize: 11, color: s.inkMute }}>Run <code>python producer.py</code> to start the stream.</div>
        <button onClick={() => setSimulating(true)} style={{
          marginTop: 6, fontFamily: FONTS.mono, fontSize: 11, padding: '6px 14px',
          background: s.ink, color: s.bg, border: 'none', cursor: 'pointer',
          letterSpacing: '0.1em', borderRadius: 2,
        }}>▶ SIMULATE (DEMO MODE)</button>
      </div>
    );
  }

  // ── Live dashboard ──
  return (
    <div style={{
      width: '100vw', height: '100vh', background: s.bg, color: s.ink,
      fontFamily: FONTS.sans, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <StatusStrip s={s} stats={stats} bpm={bpm} clock={clock} lastSync={lastSync} error={error}
                   COLORS={COLORS} onSettings={() => setShowSettings(v => !v)}
                   simulating={simulating} onToggleSim={() => setSimulating(v => !v)} />

      {/* Hero: ECG + KPI rail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', borderBottom: `1px solid ${s.rule}`, background: s.panel, flexShrink: 0 }}>
        <ECGChart s={s} records={records} hoveredId={hoveredId} onHover={setHoveredId} onBeatClick={setSelected} COLORS={COLORS} />
        <KPIRail s={s} counts={stats.counts} total={stats.total} bpm={bpm} />
      </div>

      {/* Bottom row */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 1, background: s.rule, minHeight: 0 }}>
        <Heatmap s={s} heatmap={heatmap} />
        <AnomalyLog s={s} anomalies={anomalies} ackedIds={ackedIds} onAck={id => setAckedIds(prev => new Set(prev).add(id))} />
        <SourcePulses s={s} records={records} bySource={stats.bySource} />
        <Feed s={s} records={records} onSelect={setSelected} COLORS={COLORS} />
      </div>

      <Ticker s={s} latest={records[0]} total={stats.total} bpm={bpm} COLORS={COLORS} />

      {selected && <DetailDrawer s={s} record={selected} onClose={() => setSelected(null)} COLORS={COLORS} />}

      {showSettings && (
        <SettingsMenu s={s} palette={palette} setPalette={setPalette} onClose={() => setShowSettings(false)} />
      )}

      {/* Global animations */}
      <style>{`
        @keyframes p-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes p-drawer-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes p-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function Panel({ s, title, code, action, children, padding = '12px 14px', style }) {
  return (
    <div style={{ background: s.panel, border: `1px solid ${s.rule}`, display: 'flex', flexDirection: 'column', minHeight: 0, ...style }}>
      <div style={{
        borderBottom: `1px solid ${s.rule}`, padding: '6px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        background: s.panelHeader, flexShrink: 0,
      }}>
        <span style={{ color: s.ink, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {action}
          <span style={{ color: s.inkMute }}>{code}</span>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function PulseDot({ s, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <circle cx={9} cy={9} r={8} fill="none" stroke={s.ink} strokeWidth={1} />
      <path d="M 2 9 L 6 9 L 7.5 5 L 9.5 13 L 11.5 7 L 13 9 L 16 9"
            fill="none" stroke={s.accent} strokeWidth={1.2}
            strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status strip
// ─────────────────────────────────────────────────────────────────────────────

function StatusStrip({ s, stats, bpm, clock, lastSync, error, COLORS, onSettings, simulating, onToggleSim }) {
  const healthy = !error;
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderBottom: `1px solid ${s.rule}`, background: s.panel,
      fontFamily: FONTS.mono, fontSize: 11, height: 36, flexShrink: 0,
    }}>
      <div style={{ padding: '0 14px', borderRight: `1px solid ${s.rule}`, height: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
        <PulseDot s={s} />
        <span style={{ color: s.ink, fontWeight: 600, letterSpacing: '0.08em' }}>SENTIMENT_PULSE</span>
        <span style={{ color: s.inkMute }}>v2.4.1</span>
        {simulating && (
          <span style={{
            marginLeft: 4, padding: '2px 6px', background: s.accent, color: s.bg,
            fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', borderRadius: 2,
            animation: 'p-pulse 1.6s ease-in-out infinite',
          }}>DEMO MODE</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 14px', borderRight: `1px solid ${s.rule}`, height: '100%', color: s.inkSoft }}>
        <span>API <span style={{ color: healthy ? s.pos : s.neg }}>● {healthy ? 'ONLINE' : 'ERR'}</span></span>
        <span>λ <span style={{ color: healthy ? s.pos : s.inkMute }}>● {healthy ? 'OK' : '—'}</span></span>
        <span>DDB <span style={{ color: healthy ? s.pos : s.inkMute }}>● {healthy ? 'OK' : '—'}</span></span>
        <span>COMPREHEND <span style={{ color: healthy ? s.pos : s.inkMute }}>● {healthy ? 'OK' : '—'}</span></span>
      </div>
      <div style={{ flex: 1, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 14, color: s.inkMute, overflow: 'hidden' }}>
        <span>{stats.total.toLocaleString()} REC</span>
        <span>·</span>
        <span>{bpm.toFixed(1)} rec/min</span>
        <span>·</span>
        <span>dominant: <span style={{ color: COLORS[stats.dominant] }}>{stats.dominant}</span></span>
        {lastSync && <><span>·</span><span>last sync {lastSync.toUTCString().slice(17, 25)}</span></>}
      </div>
      <div style={{ padding: '0 14px', borderLeft: `1px solid ${s.rule}`, height: '100%', display: 'flex', alignItems: 'center', gap: 10, color: s.inkSoft }}>
        <span>{clock}</span>
        <button onClick={onToggleSim} style={{
          fontFamily: FONTS.mono, fontSize: 10, padding: '4px 10px',
          background: simulating ? s.ink : 'transparent',
          color: simulating ? s.bg : s.ink,
          border: `1px solid ${simulating ? s.ink : s.rule}`, cursor: 'pointer',
          letterSpacing: '0.08em', borderRadius: 2,
        }}>{simulating ? '■ STOP' : '▶ SIMULATE'}</button>
        <button onClick={onSettings} style={{
          fontFamily: FONTS.mono, fontSize: 10, padding: '4px 10px',
          background: 'transparent', color: s.ink,
          border: `1px solid ${s.rule}`, cursor: 'pointer',
          letterSpacing: '0.08em', borderRadius: 2,
        }}>⚙ THEME</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI rail
// ─────────────────────────────────────────────────────────────────────────────

function KPIRail({ s, counts, total, bpm }) {
  const net = total > 0 ? (counts.POSITIVE - counts.NEGATIVE) / total * 100 : 0;
  const netDisp = useTickCounter(net, 600);
  const posDisp = useTickCounter(counts.POSITIVE, 600);
  const negDisp = useTickCounter(counts.NEGATIVE, 600);
  const bpmDisp = useTickCounter(bpm, 600);

  const rows = [
    { label: 'NET SCORE', val: `${netDisp >= 0 ? '+' : ''}${netDisp.toFixed(1)}`, unit: 'pts', color: s.ink },
    { label: 'POSITIVE', val: Math.round(posDisp), unit: `${total > 0 ? (counts.POSITIVE / total * 100).toFixed(1) : 0}%`, color: s.pos },
    { label: 'NEGATIVE', val: Math.round(negDisp), unit: `${total > 0 ? (counts.NEGATIVE / total * 100).toFixed(1) : 0}%`, color: s.neg },
    { label: 'PULSE RATE', val: bpmDisp.toFixed(1), unit: 'rec/min', color: s.ink },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateRows: `repeat(${rows.length}, 1fr)` }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          padding: '10px 16px',
          borderBottom: i < rows.length - 1 ? `1px solid ${s.ruleSoft}` : 'none',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute, letterSpacing: '0.12em', marginBottom: 4 }}>{r.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: FONTS.mono, fontSize: 22, fontWeight: 500, color: r.color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{r.val}</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft }}>{r.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ECG chart
// ─────────────────────────────────────────────────────────────────────────────

function ECGChart({ s, records, hoveredId, onHover, onBeatClick }) {
  const ecgW = 1200, ecgH = 240;
  const baselineY = ecgH * 0.55;
  const SEG_COUNT = 80;
  const segW = ecgW / SEG_COUNT;
  const slice = records.slice(0, SEG_COUNT).reverse();

  const beats = useMemo(() => slice.map((r, i) => {
    const xStart = i * segW;
    const xMid = xStart + segW * 0.4;
    const xMid2 = xStart + segW * 0.5;
    const xEnd = xStart + segW;
    let peak;
    if (r.sentiment === 'POSITIVE') peak = baselineY - 70 * safeScore(r, 'Positive');
    else if (r.sentiment === 'NEGATIVE') peak = baselineY + 70 * safeScore(r, 'Negative');
    else if (r.sentiment === 'NEUTRAL') peak = baselineY - 10 * safeScore(r, 'Neutral');
    else peak = baselineY + 16 * safeScore(r, 'Mixed');
    const preY = r.sentiment === 'POSITIVE' ? baselineY + 5 : r.sentiment === 'NEGATIVE' ? baselineY - 5 : baselineY;
    return { r, xStart, xMid, xMid2, xEnd, preY, peak };
  }), [slice, segW, baselineY]);

  const ecgPath = useMemo(() => {
    const pts = [['0', baselineY.toFixed(1)]];
    for (const b of beats) {
      pts.push([(b.xStart + segW * 0.3).toFixed(1), b.preY.toFixed(1)]);
      pts.push([b.xMid.toFixed(1), b.peak.toFixed(1)]);
      pts.push([b.xMid2.toFixed(1), (baselineY + (b.peak - baselineY) * 0.15).toFixed(1)]);
      pts.push([b.xEnd.toFixed(1), baselineY.toFixed(1)]);
    }
    return 'M ' + pts.map(([x, y]) => `${x},${y}`).join(' L ');
  }, [beats, baselineY, segW]);

  return (
    <div style={{ borderRight: `1px solid ${s.rule}`, position: 'relative', background: s.panel }}>
      <div style={{
        borderBottom: `1px solid ${s.rule}`, padding: '6px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        background: s.panelHeader, flexShrink: 0,
      }}>
        <span style={{ color: s.ink, fontWeight: 600 }}>SENTIMENT ECG · LAST {SEG_COUNT} RECORDS</span>
        <span style={{ color: s.inkMute }}>UP=POS · DOWN=NEG · AMP=CONFIDENCE</span>
      </div>
      <div style={{ position: 'relative', background: s.paper }}>
        <svg width="100%" height={ecgH} viewBox={`0 0 ${ecgW} ${ecgH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <pattern id="ecg-grid-fine" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={s.rule} strokeWidth="0.5" opacity="0.6" />
            </pattern>
            <pattern id="ecg-grid-bold" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke={s.rule} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={ecgW} height={ecgH} fill="url(#ecg-grid-fine)" />
          <rect width={ecgW} height={ecgH} fill="url(#ecg-grid-bold)" />
          <line x1={0} x2={ecgW} y1={baselineY} y2={baselineY} stroke={s.rule} strokeWidth={1} strokeDasharray="2 4" />
          <path d={ecgPath} fill="none" stroke={s.accent} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />

          {beats.map((b, i) => {
            const isHover = hoveredId === b.r.id;
            const isLatest = i === beats.length - 1;
            return (
              <g key={b.r.id}
                 onMouseEnter={() => onHover(b.r.id)}
                 onMouseLeave={() => onHover(null)}
                 onClick={() => onBeatClick(b.r)}
                 style={{ cursor: 'pointer' }}>
                <rect x={b.xStart} y={0} width={segW} height={ecgH} fill="transparent" />
                {isHover && (
                  <>
                    <line x1={b.xMid} x2={b.xMid} y1={0} y2={ecgH} stroke={s.ink} strokeOpacity={0.2} strokeDasharray="2 3" />
                    <circle cx={b.xMid} cy={b.peak} r={4} fill={s.ink} />
                  </>
                )}
                {isLatest && (
                  <>
                    <circle cx={b.xMid} cy={b.peak} r={5} fill={s.accent}>
                      <animate attributeName="r" values="5;7;5" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={b.xMid} cy={b.peak} r={10} fill={s.accent} opacity={0.25}>
                      <animate attributeName="r" values="6;14;6" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        <div style={{ position: 'absolute', left: 8, top: 6, fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute, letterSpacing: '0.08em', pointerEvents: 'none' }}>+POS</div>
        <div style={{ position: 'absolute', left: 8, bottom: 6, fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute, letterSpacing: '0.08em', pointerEvents: 'none' }}>−NEG</div>

        {hoveredId && (() => {
          const hb = beats.find(b => b.r.id === hoveredId);
          if (!hb) return null;
          const rightSide = hb.xMid / ecgW > 0.6;
          return (
            <div style={{
              position: 'absolute',
              left: rightSide ? 'auto' : `${(hb.xMid / ecgW * 100).toFixed(1)}%`,
              right: rightSide ? `${((ecgW - hb.xMid) / ecgW * 100).toFixed(1)}%` : 'auto',
              top: 16,
              transform: 'translateX(8px)',
              background: s.ink, color: s.bg,
              fontFamily: FONTS.mono, fontSize: 10, padding: '6px 10px',
              maxWidth: 280, pointerEvents: 'none', zIndex: 5,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <div style={{ opacity: 0.6, marginBottom: 2 }}>
                {hb.r.sentiment} · {hb.r.source} · {new Date(hb.r.timestamp).toUTCString().slice(17, 22)}Z
              </div>
              <div style={{ lineHeight: 1.4 }}>{(hb.r.text || '').slice(0, 110)}{(hb.r.text || '').length > 110 ? '…' : ''}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap
// ─────────────────────────────────────────────────────────────────────────────

function Heatmap({ s, heatmap }) {
  const maxCell = Math.max(...heatmap.flat().map(c => c.total), 1);
  const dayLabels = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  return (
    <Panel s={s} title="HOUR × DAY HEATMAP" code="OPS-001">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft, marginBottom: 10 }}>
          Volume · last 7d · red = negative bias
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 14 }}>
            {dayLabels.map((dl, i) => (
              <div key={i} style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute, height: 16, lineHeight: '16px' }}>{dl}</div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 1, marginBottom: 4 }}>
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} style={{ fontFamily: FONTS.mono, fontSize: 8, color: s.inkMute, textAlign: 'center', height: 10 }}>
                  {h % 4 === 0 ? h.toString().padStart(2, '0') : ''}
                </div>
              ))}
            </div>
            {heatmap.map((row, di) => (
              <div key={di} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, marginBottom: 2 }}>
                {row.map((cell, hi) => {
                  const intensity = cell.total / maxCell;
                  const negBias = cell.total ? cell.neg / cell.total : 0;
                  const isNeg = negBias > 0.5 && cell.total > 0;
                  const base = isNeg ? s.neg : s.ink;
                  const alpha = intensity * 0.85 + (cell.total > 0 ? 0.08 : 0);
                  return (
                    <div key={hi} style={{
                      height: 16,
                      background: cell.total === 0 ? s.ruleSoft : `${base}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`,
                    }} title={`${dayLabels[di]} ${hi}:00 — ${cell.total} records`} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute }}>
          <span>VOL</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(a => (
              <div key={a} style={{ width: 12, height: 8, background: `${s.ink}${Math.round(a * 255).toString(16).padStart(2, '0')}` }} />
            ))}
          </div>
          <span style={{ marginLeft: 6 }}>NEG&gt;50%</span>
          <div style={{ width: 12, height: 8, background: s.neg, opacity: 0.7 }} />
        </div>
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly log
// ─────────────────────────────────────────────────────────────────────────────

function AnomalyLog({ s, anomalies, ackedIds, onAck }) {
  const unacked = anomalies.filter(a => !ackedIds.has(a.id));
  return (
    <Panel s={s} title="ANOMALY LOG" code={`ALERT · ${unacked.length} OPEN`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto' }}>
        {anomalies.length === 0 && (
          <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: s.inkMute }}>No anomalies in window.</div>
        )}
        {anomalies.slice(0, 4).map(a => {
          const acked = ackedIds.has(a.id);
          const color = a.severity === 'high' ? s.neg : s.neu;
          return (
            <div key={a.id} style={{
              border: `1px solid ${acked ? s.ruleSoft : color}`,
              borderLeft: `4px solid ${acked ? s.ruleSoft : color}`,
              padding: '6px 9px',
              background: acked ? s.panel : (a.severity === 'high' ? `${s.neg}11` : `${s.neu}11`),
              opacity: acked ? 0.55 : 1,
              transition: 'all .3s cubic-bezier(.2,.7,.3,1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 600, color: acked ? s.inkMute : color, letterSpacing: '0.08em' }}>
                  {acked ? '✓ ACKED' : (a.severity === 'high' ? '⚠ HIGH' : '⚠ MED')}
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute }}>
                  {new Date(a.t).toUTCString().slice(17, 22)}Z
                </span>
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: s.ink, marginBottom: 2 }}>{a.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkSoft }}>src: {a.source}</span>
                {!acked && (
                  <button onClick={() => onAck(a.id)} style={{
                    fontFamily: FONTS.mono, fontSize: 9, color: s.inkSoft,
                    background: 'transparent', border: `1px solid ${s.rule}`,
                    padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.08em',
                  }}>ACK</button>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 'auto', borderTop: `1px solid ${s.ruleSoft}`, paddingTop: 8, fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute }}>
          RULE: ≥4/5 NEG · wnd 30m · cd 5m
        </div>
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Source pulses
// ─────────────────────────────────────────────────────────────────────────────

function SourcePulses({ s, records, bySource }) {
  function spark(src) {
    const sr = records.filter(r => r.source === src).slice(0, 24).reverse();
    if (sr.length < 2) return null;
    const w = 180, h = 28, mid = h / 2;
    const pts = sr.map((r, i) => {
      const x = (i / (sr.length - 1)) * w;
      let y;
      if (r.sentiment === 'POSITIVE') y = mid - 10 * safeScore(r, 'Positive');
      else if (r.sentiment === 'NEGATIVE') y = mid + 10 * safeScore(r, 'Negative');
      else y = mid + (i % 3 - 1) * 2;
      return [x.toFixed(1), y.toFixed(1)];
    });
    return { d: 'M ' + pts.map(([x, y]) => `${x},${y}`).join(' L '), w, h };
  }
  return (
    <Panel s={s} title="PULSE BY SOURCE" code="SRC-002">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'auto' }}>
        {Object.entries(bySource).sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([src, dd]) => {
          const sp = spark(src);
          const net = ((dd.POSITIVE - dd.NEGATIVE) / dd.total * 100).toFixed(0);
          const netNum = parseFloat(net);
          return (
            <div key={src} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: s.ink, fontWeight: 500 }}>{src}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: netNum > 0 ? s.pos : s.neg, fontVariantNumeric: 'tabular-nums' }}>
                  {netNum > 0 ? '+' : ''}{net}
                </span>
              </div>
              {sp && (
                <svg width="100%" height={sp.h} viewBox={`0 0 ${sp.w} ${sp.h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                  <line x1={0} x2={sp.w} y1={sp.h / 2} y2={sp.h / 2} stroke={s.rule} strokeDasharray="1 3" />
                  <path d={sp.d} fill="none" stroke={netNum > 0 ? s.pos : s.neg} strokeWidth={1.2} />
                </svg>
              )}
              <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute }}>
                n={dd.total} · pos {dd.POSITIVE} · neg {dd.NEGATIVE}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed
// ─────────────────────────────────────────────────────────────────────────────

function Feed({ s, records, onSelect, COLORS }) {
  return (
    <Panel s={s} title="RECENT BEATS" code="FEED-003" padding="0">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
        {records.slice(0, 6).map((r) => {
          const conf = confidenceOf(r);
          return (
            <button key={r.id} onClick={() => onSelect(r)} style={{
              all: 'unset', cursor: 'pointer', display: 'block',
              padding: '8px 14px',
              borderBottom: `1px solid ${s.ruleSoft}`,
              borderLeft: `3px solid ${COLORS[r.sentiment]}`,
              transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${COLORS[r.sentiment]}14`}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS[r.sentiment], letterSpacing: '0.1em', fontWeight: 600 }}>
                  {r.sentiment.slice(0, 3)} · {(conf * 100).toFixed(0)}%
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute }}>
                  {new Date(r.timestamp).toUTCString().slice(17, 22)}
                </span>
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 12, lineHeight: 1.35, color: s.ink, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {r.text}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute, letterSpacing: '0.06em' }}>
                {r.source}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker
// ─────────────────────────────────────────────────────────────────────────────

function Ticker({ s, latest, total, bpm, COLORS }) {
  return (
    <div style={{
      borderTop: `1px solid ${s.rule}`, background: s.ink, color: s.bg,
      fontFamily: FONTS.mono, fontSize: 10, padding: '6px 14px',
      display: 'flex', alignItems: 'center', gap: 18, overflow: 'hidden',
      flexShrink: 0, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: COLORS[latest.sentiment], flexShrink: 0 }}>● {latest.sentiment.slice(0, 3)}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{latest.text}</span>
      <span style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
        kinesis→λ→comprehend→ddb · {bpm.toFixed(1)} rec/min · {total.toLocaleString()} total
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail drawer
// ─────────────────────────────────────────────────────────────────────────────

function DetailDrawer({ s, record, onClose, COLORS }) {
  const sentiments = ['Positive', 'Negative', 'Neutral', 'Mixed'];
  const scoreVals = sentiments.map(sn => safeScore(record, sn));
  const maxScore = Math.max(...scoreVals);
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 50,
        animation: 'p-fade-in .15s ease-out',
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 440,
        background: s.panel, borderLeft: `1px solid ${s.rule}`,
        boxShadow: '-12px 0 32px rgba(0,0,0,0.12)', zIndex: 51,
        display: 'flex', flexDirection: 'column',
        animation: 'p-drawer-in .2s cubic-bezier(.2,.7,.3,1)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${s.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: s.panelHeader }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
            Record detail · {(record.id || '').slice(-8)}
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 14, color: s.inkSoft, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: s.inkMute, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>Text</div>
          <div style={{
            fontFamily: FONTS.display, fontStyle: 'italic',
            fontSize: 18, lineHeight: 1.45, color: s.ink, marginBottom: 24,
            paddingLeft: 16, borderLeft: `3px solid ${COLORS[record.sentiment]}`,
          }}>
            &ldquo;{record.text}&rdquo;
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
            <Stat s={s} label="Sentiment" value={record.sentiment} color={COLORS[record.sentiment]} />
            <Stat s={s} label="Source" value={record.source} />
            <Stat s={s} label="Timestamp" value={new Date(record.timestamp).toUTCString().slice(0, 22) + 'Z'} />
            <Stat s={s} label="ID" value={record.id} mono />
          </div>

          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: s.inkMute, letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>
            Confidence scores
          </div>
          {sentiments.map((sn, i) => {
            const v = scoreVals[i];
            const key = sn.toUpperCase();
            return (
              <div key={sn} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft, marginBottom: 3 }}>
                  <span>{sn}</span>
                  <span style={{ color: v === maxScore ? COLORS[key] : s.ink, fontWeight: v === maxScore ? 600 : 400 }}>{(v * 100).toFixed(2)}%</span>
                </div>
                <div style={{ height: 6, background: s.ruleSoft, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${v * 100}%`, background: COLORS[key], transition: 'width .3s cubic-bezier(.2,.7,.3,1)' }} />
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 28, padding: 12, background: s.bg, border: `1px solid ${s.rule}`, fontFamily: FONTS.mono, fontSize: 10, color: s.inkSoft, lineHeight: 1.6 }}>
            <div style={{ color: s.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9, marginBottom: 6 }}>Pipeline trace</div>
            <div>kinesis-stream → ingested at {new Date(record.timestamp).toUTCString().slice(17, 22)}Z</div>
            <div>SentimentProcessor λ → 142ms</div>
            <div>comprehend:DetectSentiment → {record.sentiment}</div>
            <div>dynamodb:PutItem → SentimentResults · {(record.id || '').slice(-8)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ s, label, value, color, mono }) {
  return (
    <div>
      <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: s.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: mono ? FONTS.mono : FONTS.sans, fontSize: 13, color: color || s.ink, fontWeight: 500, wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings menu
// ─────────────────────────────────────────────────────────────────────────────

function SettingsMenu({ s, palette, setPalette, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 99 }} />
      <div style={{
        position: 'absolute', top: 42, right: 16, zIndex: 100,
        background: s.panel, border: `1px solid ${s.rule}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
        padding: 14, minWidth: 220, fontFamily: FONTS.mono, fontSize: 10,
      }}>
        <div style={{ color: s.inkMute, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Theme</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {Object.entries(PALETTES).map(([key, p]) => (
            <button key={key} onClick={() => setPalette(key)} style={{
              fontFamily: FONTS.mono, fontSize: 10, padding: '8px 10px',
              background: palette === key ? p.ink : p.bg, color: palette === key ? p.bg : p.ink,
              border: `1px solid ${palette === key ? p.ink : s.rule}`, cursor: 'pointer',
              letterSpacing: '0.05em', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <span style={{ width: 8, height: 8, background: p.bg, border: `1px solid ${p.ink}` }} />
                <span style={{ width: 8, height: 8, background: p.accent }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, color: s.inkMute, fontSize: 9, lineHeight: 1.5 }}>
          Theme persists across reloads (localStorage).
        </div>
      </div>
    </>
  );
}
