// App.jsx — Sentiment PULSE (single-file React component).
//
// Jet-black theme with a white accent. Pulse logo + glowing title, summary
// cards, a sentiment breakdown, an activity chart, a readable feed, and a
// two-row animated AWS architecture diagram (using the service icons in
// /public). Polls the API every 5s (or runs on simulated data when no API is
// configured).
//
// Reads VITE_API_URL from Vite env at build time. No chart library.

import { useState, useEffect, useMemo, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL;
const POLL_MS = 5000;

const FONT_SANS = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const ACCENT = '#ffffff'; // white accent

// Sentiment colors keep their meaning (green good, red bad, etc.).
const COLORS = {
  POSITIVE: '#22e37a',
  NEGATIVE: '#ff4d6d',
  NEUTRAL:  '#9aa7bd',
  MIXED:    '#b57bff',
};
const LABELS = { POSITIVE: 'Positive', NEGATIVE: 'Negative', NEUTRAL: 'Neutral', MIXED: 'Mixed' };
const ORDER = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'];

const UI = {
  pageBg: '#000000',
  card:   'rgba(20, 20, 23, 0.85)',
  border: 'rgba(255, 255, 255, 0.12)',
  ink:    '#f4f4f6',
  inkSoft:'#b0b3bb',
  inkMute:'#8b90a0',
  track:  'rgba(255, 255, 255, 0.09)',
};

// Glow helpers.
const glow = (hex, px = 14, a = '66') => `0 0 ${px}px ${hex}${a}`;
const textGlow = (hex, px = 12) => `0 0 ${px}px ${hex}bb`;

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers (mirror DynamoDB schema shape exactly)
// ─────────────────────────────────────────────────────────────────────────────

export function computeStats(records) {
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

export function computeHeatmap(records) {
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

export function detectAnomalies(records) {
  const alerts = [];
  // records arrive newest-first from the API
  for (let i = 0; i <= records.length - 5; i++) {
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

export function safeScore(r, label) {
  const v = r?.scores?.[label];
  if (v == null) return 0;
  return typeof v === 'string' ? parseFloat(v) : v;
}

export function confidenceOf(r) {
  if (!r) return 0;
  const label = (r.sentiment || '').charAt(0) + (r.sentiment || '').slice(1).toLowerCase();
  return safeScore(r, label);
}

// Group records into equal time buckets for the activity chart (not exported).
function computeTrend(records, bucketCount = 12) {
  if (records.length === 0) return [];
  // Split the visible records into equal-count buckets, oldest → newest, so the
  // bars stay contiguous regardless of bursty timestamps.
  const ordered = [...records].reverse();
  const n = ordered.length;
  const buckets = Array.from({ length: bucketCount }, () => ({
    POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0, total: 0, t: null,
  }));
  ordered.forEach((r, idx) => {
    const b = buckets[Math.min(bucketCount - 1, Math.floor((idx / n) * bucketCount))];
    b[r.sentiment] = (b[r.sentiment] || 0) + 1;
    b.total++;
    const t = new Date(r.timestamp).getTime();
    if (!isNaN(t) && b.t == null) b.t = t;
  });
  return buckets;
}

const fmtTime = (ts) => {
  const d = new Date(ts);
  return isNaN(d) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const fmtRelative = (ts) => {
  const d = new Date(ts).getTime();
  if (isNaN(d)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const pct = (n, total) => (total > 0 ? (n / total) * 100 : 0);

// ─────────────────────────────────────────────────────────────────────────────
// Simulated data — drives SIMULATION mode so the dashboard works without the
// producer running. Records mirror the real DynamoDB schema exactly.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SOURCES = ['twitter', 'reddit', 'hackernews', 'reviews', 'support'];
const MOCK_SAMPLES = {
  POSITIVE: [
    'Honestly the best release this year — everything just works.',
    'Loved how fast the new dashboard renders. Smooth all round.',
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
  return { id: `mock-${ts}-${__mockSeed}`, timestamp: new Date(ts).toISOString(), text, source, sentiment, scores };
}

function generateMockBatch(count = 40) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => generateMockRecord(now - i * 18000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [simulating, setSimulating] = useState(() => !API_URL);
  const [selected, setSelected] = useState(null);
  const [clock, setClock] = useState(() => new Date());
  const narrow = useMediaQuery('(max-width: 760px)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const loadedOnce = useRef(false);
  const userToggled = useRef(false); // once the user clicks the toggle, stop auto-overriding their choice

  useEffect(() => {
    if (simulating) return;
    let cancelled = false;
    const fetchData = async () => {
      if (document.hidden) return;            // don't poll a background tab
      try {
        if (!API_URL) throw new Error('VITE_API_URL is not set');
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const sorted = [...json].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setRecords(sorted);
        setLastSync(new Date());
        setError(null);
        setLoading(false);
        loadedOnce.current = true;
      } catch (err) {
        if (cancelled) return;
        // No backend reachable on first load → silently fall back to the built-in
        // demo so the dashboard is always populated (works with the stack deleted).
        if (!loadedOnce.current && !userToggled.current) { setSimulating(true); return; }
        setError(err.message);
        setLoading(false);
      }
    };
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    const onVis = () => { if (!document.hidden) fetchData(); };  // refresh on return
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [simulating]);

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

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => computeStats(records), [records]);
  const trend = useMemo(() => computeTrend(records), [records]);
  const anomalies = useMemo(() => detectAnomalies(records), [records]);

  const net = pct(stats.counts.POSITIVE - stats.counts.NEGATIVE, stats.total);
  const moodWord = net > 15 ? 'Positive' : net < -15 ? 'Negative' : 'Mixed / Neutral';
  const moodColor = net > 15 ? COLORS.POSITIVE : net < -15 ? COLORS.NEGATIVE : COLORS.NEUTRAL;

  const page = {
    minHeight: '100vh', background: `radial-gradient(1100px 520px at 50% -12%, #161616 0%, ${UI.pageBg} 55%)`,
    color: UI.ink, fontFamily: FONT_SANS, padding: narrow ? '14px' : '24px', boxSizing: 'border-box',
  };

  if (loading) {
    return (
      <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: UI.inkSoft }}>
        <PulseLogo size={28} /> <span style={{ marginLeft: 12 }}>Loading sentiment data…</span>
        <GlobalStyles />
      </div>
    );
  }

  return (
    <div style={page}>
      <GlobalStyles />
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Header
          simulating={simulating}
          onToggleSim={() => { userToggled.current = true; setSimulating(v => !v); }}
          lastSync={lastSync}
          clock={clock}
          moodWord={moodWord}
          moodColor={moodColor}
          hasData={records.length > 0}
        />

        {error && (
          <Banner color={COLORS.NEGATIVE}>
            Couldn’t reach the live API ({error}). {simulating ? '' : 'Showing the last data — or turn on Simulation.'}
          </Banner>
        )}

        {anomalies.length > 0 && (
          <Banner color={COLORS.NEGATIVE} soft>
            ⚠ {anomalies.length} negative spike{anomalies.length > 1 ? 's' : ''} detected recently
            (4+ of 5 consecutive records were negative).
          </Banner>
        )}

        {records.length === 0 ? (
          <EmptyState onDemo={() => setSimulating(true)} />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              <StatCard label="Total analyzed" value={stats.total.toLocaleString()} sub="records in view" accent={UI.ink} />
              <StatCard label="Positive" value={stats.counts.POSITIVE.toLocaleString()}
                        sub={`${pct(stats.counts.POSITIVE, stats.total).toFixed(0)}% of total`} accent={COLORS.POSITIVE} />
              <StatCard label="Negative" value={stats.counts.NEGATIVE.toLocaleString()}
                        sub={`${pct(stats.counts.NEGATIVE, stats.total).toFixed(0)}% of total`} accent={COLORS.NEGATIVE} />
              <StatCard label="Net sentiment" value={`${net >= 0 ? '+' : ''}${net.toFixed(0)}`}
                        sub="positive minus negative" accent={moodColor} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16, marginBottom: 16 }}>
              <Card title="Sentiment breakdown">
                <Breakdown counts={stats.counts} total={stats.total} />
              </Card>
              <Card title="Activity over time">
                <TrendChart trend={trend} />
              </Card>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Card title="Recent Reviews" tag={simulating ? 'LIVE' : 'Ingesting'} tagColor={simulating ? COLORS.POSITIVE : ACCENT}>
                <Feed records={records} onSelect={setSelected} />
              </Card>
            </div>

            <Card title="AWS Architecture Diagram">
              <AwsArchitecture reduceMotion={reduceMotion} />
            </Card>
          </>
        )}
      </div>

      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulse logo (animated, glowing, white)
// ─────────────────────────────────────────────────────────────────────────────

function PulseLogo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block', animation: 'sp-logo-pulse 2s ease-in-out infinite' }}>
      <defs>
        <linearGradient id="lg-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
        <filter id="lg-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#lg-badge)" stroke="#ffffff" strokeWidth="1.2" opacity="0.98" />
      <path d="M 7 25 H 17 L 20 20 L 23 25 L 26 13 L 30 36 L 33 25 L 35 25 H 41"
            fill="none" stroke="#ffffff" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" filter="url(#lg-glow)" />
      <circle cx="26" cy="13" r="2" fill="#ffffff" filter="url(#lg-glow)" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function Header({ simulating, onToggleSim, lastSync, clock, moodWord, moodColor, hasData }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <PulseLogo size={48} />
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', color: UI.ink }}>
            Sentiment{' '}
            <span style={{ color: ACCENT, fontWeight: 700, textShadow: textGlow(ACCENT, 16), animation: 'sp-title-glow 2s ease-in-out infinite' }}>
              PULSE
            </span>
          </h1>
          {hasData && (
            <div style={{ marginTop: 5, fontSize: 14, color: UI.inkSoft }}>
              Overall mood:{' '}
              <span style={{ color: moodColor, fontWeight: 600, textShadow: textGlow(moodColor, 10) }}>{moodWord}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: clock + status sit beside a compact Start/Stop Monitoring button. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 18, fontWeight: 600, lineHeight: 1,
            color: UI.ink, letterSpacing: '0.04em', textShadow: textGlow('#ffffff', 8),
            fontVariantNumeric: 'tabular-nums',
          }}>
            {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: UI.inkMute }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: simulating ? COLORS.POSITIVE : ACCENT,
              boxShadow: glow(simulating ? COLORS.POSITIVE : ACCENT, 9, 'aa'),
              animation: 'sp-live 1.6s ease-in-out infinite',
            }} />
            {simulating ? 'LIVE' : 'Ingesting'}{lastSync && <> · updated {fmtTime(lastSync)}</>}
          </span>
        </div>

        <button onClick={onToggleSim} aria-pressed={simulating} style={{
          fontFamily: FONT_SANS, fontSize: 13, fontWeight: 600, letterSpacing: '0.03em',
          padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: simulating ? '#ffffff' : 'rgba(255,255,255,0.05)',
          color: simulating ? '#000000' : '#ffffff',
          border: `1.5px solid ${simulating ? '#ffffff' : 'rgba(255,255,255,0.35)'}`,
          boxShadow: simulating ? '0 0 18px rgba(255,255,255,0.4)' : 'none',
          transition: 'all .2s ease',
        }}>
          {simulating ? (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><polygon points="2.5,1.5 11,6 2.5,10.5" fill="currentColor" /></svg>
          )}
          {simulating ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function Card({ title, subtitle, tag, tagColor, children }) {
  return (
    <div style={{
      background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 14,
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
    }}>
      {title && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${UI.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: UI.ink }}>
            {title}
            {subtitle && <span style={{ fontWeight: 400, color: UI.inkMute, marginLeft: 10, fontSize: 12 }}>{subtitle}</span>}
          </span>
          {tag && (
            <span style={{
              fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
              color: tagColor === ACCENT ? '#000' : tagColor, padding: '3px 8px', borderRadius: 6,
              background: tagColor === ACCENT ? ACCENT : `${tagColor}1f`,
              boxShadow: glow(tagColor, 8, '44'),
            }}>{tag}</span>
          )}
        </div>
      )}
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 14, padding: 18,
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{ fontSize: 13, color: UI.inkSoft, marginBottom: 10 }}>{label}</div>
      <div style={{
        fontFamily: FONT_MONO, fontSize: 34, fontWeight: 600, lineHeight: 1,
        color: accent, letterSpacing: '-0.01em', textShadow: textGlow(accent, 16),
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: UI.inkMute, marginTop: 10 }}>{sub}</div>}
    </div>
  );
}

function Banner({ children, color, soft }) {
  return (
    <div style={{
      background: soft ? `${color}12` : `${color}1e`,
      border: `1px solid ${color}66`, color: UI.ink,
      borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13,
      boxShadow: glow(color, 16, '22'),
    }}>
      {children}
    </div>
  );
}

function Breakdown({ counts, total }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ORDER.map(key => {
        const value = counts[key] || 0;
        const p = pct(value, total);
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: UI.ink }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[key], boxShadow: glow(COLORS[key], 8, 'aa') }} />
                {LABELS[key]}
              </span>
              <span style={{ color: UI.inkSoft }}>
                {value.toLocaleString()} <span style={{ color: UI.inkMute }}>({p.toFixed(0)}%)</span>
              </span>
            </div>
            <div style={{ height: 10, background: UI.track, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${p}%`, height: '100%', background: COLORS[key], borderRadius: 6, boxShadow: glow(COLORS[key], 10, 'cc'), transition: 'width .4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Tween an array of numbers toward its target whenever the target changes — used
// to make the trend curve fluctuate smoothly on every data update.
function useAnimatedArray(target, ms = 550) {
  const [vals, setVals] = useState(target);
  const ref = useRef(target);
  const raf = useRef();
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      ref.current = target; setVals(target); return;   // no tween under reduced motion
    }
    const from = ref.current, to = target, start = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const next = to.map((t, i) => {
        const f = from[i] != null ? from[i] : t;
        return f + (t - f) * e;
      });
      ref.current = next;
      setVals(next);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return vals;
}

// Catmull-Rom → cubic Bézier smooth path through points.
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function TrendChart({ trend }) {
  const maxTotal = Math.max(1, ...trend.map(b => b.total));
  const totals = useMemo(() => trend.map(b => b.total), [trend]);
  const anim = useAnimatedArray(totals);
  if (trend.length === 0) {
    return <div style={{ color: UI.inkMute, fontSize: 13 }}>Not enough data yet.</div>;
  }
  const n = trend.length;
  const pts = anim.map((t, i) => [((i + 0.5) / n) * 100, (1 - Math.min(1, t / maxTotal)) * 100]);
  const line = smoothPath(pts);
  const area = line ? `${line} L 100 100 L 0 100 Z` : '';
  const last = pts[pts.length - 1] || [0, 0];

  // Colour the curve by the mood at each point in time (mirrors the header's
  // net-sentiment mood: green positive, red negative, grey mixed/neutral).
  const moodOf = (b) => {
    const nb = b.total ? (b.POSITIVE - b.NEGATIVE) / b.total * 100 : 0;
    return nb > 15 ? COLORS.POSITIVE : nb < -15 ? COLORS.NEGATIVE : COLORS.NEUTRAL;
  };
  const stops = trend.map((b, i) => ({ off: n > 1 ? i / (n - 1) : 0, c: moodOf(b) }));
  const lastColor = moodOf(trend[trend.length - 1]);
  return (
    <div>
      <div style={{ position: 'relative', height: 160 }}>
        {/* bars (dimmed so the curve reads on top) */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          {trend.map((b, i) => (
            <div key={i} title={`${b.total} records`}
                 style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column-reverse', height: `${(b.total / maxTotal) * 100}%`, minHeight: b.total ? 3 : 0, borderRadius: 4, overflow: 'hidden', opacity: 0.6 }}>
                {ORDER.map(key => (
                  b[key] > 0 && (
                    <div key={key} style={{ height: `${(b[key] / b.total) * 100}%`, background: COLORS[key] }} />
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* fluctuating curve above the bars */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mood-curve" x1="0" y1="0" x2="1" y2="0">
              {stops.map((s, i) => <stop key={i} offset={s.off} stopColor={s.c} />)}
            </linearGradient>
            <linearGradient id="mood-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={lastColor} stopOpacity="0.22" />
              <stop offset="1" stopColor={lastColor} stopOpacity="0" />
            </linearGradient>
            <filter id="trend-glow" x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="1.3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d={area} fill="url(#mood-fill)" stroke="none" />
          <path d={line} fill="none" stroke="url(#mood-curve)" strokeWidth="2" vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" strokeLinecap="round" filter="url(#trend-glow)" />
        </svg>
        {/* pulsing marker on the newest point, coloured by the current mood */}
        <div style={{
          position: 'absolute', left: `${last[0]}%`, top: `${last[1]}%`,
          width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
          borderRadius: '50%', background: lastColor, boxShadow: glow(lastColor, 10, 'cc'),
          animation: 'sp-dot 1.6s ease-in-out infinite',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: UI.inkMute, marginTop: 8 }}>
        <span>{fmtTime(trend[0].t)}</span>
        <span>volume · oldest → newest</span>
        <span>{fmtTime(trend[trend.length - 1].t)}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
        {ORDER.map(key => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: UI.inkSoft }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[key], boxShadow: glow(COLORS[key], 8, 'aa') }} />
            {LABELS[key]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SentimentPill({ sentiment }) {
  const c = COLORS[sentiment] || UI.inkMute;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, color: c, background: `${c}20`,
      boxShadow: glow(c, 8, '55'), whiteSpace: 'nowrap',
    }}>
      {LABELS[sentiment] || sentiment}
    </span>
  );
}

function Feed({ records, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {records.slice(0, 12).map((r, i) => (
        <button key={r.id} onClick={() => onSelect(r)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 6px', borderTop: i === 0 ? 'none' : `1px solid ${UI.border}`, borderRadius: 8,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div style={{ width: 92, flexShrink: 0 }}><SentimentPill sentiment={r.sentiment} /></div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: UI.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.text}
          </div>
          <div style={{ flexShrink: 0, fontSize: 12, color: UI.inkMute, textAlign: 'right', fontFamily: FONT_MONO }}>
            <div>{r.source}</div>
            <div title={fmtTime(r.timestamp)}>{fmtRelative(r.timestamp)} · {(confidenceOf(r) * 100).toFixed(0)}%</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function DetailModal({ record, onClose }) {
  const sentiments = ['Positive', 'Negative', 'Neutral', 'Mixed'];
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      backdropFilter: 'blur(3px)',
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={`Review detail — ${record.sentiment}`} style={{
        background: '#0b0b0d', border: `1px solid ${UI.border}`, borderRadius: 16, maxWidth: 520, width: '100%',
        boxShadow: `0 24px 60px rgba(0,0,0,0.7), ${glow(COLORS[record.sentiment], 40, '33')}`, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${UI.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SentimentPill sentiment={record.sentiment} />
            <span style={{ fontSize: 13, color: UI.inkSoft, fontFamily: FONT_MONO }}>{record.source} · {fmtTime(record.timestamp)}</span>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: UI.inkMute, padding: '0 6px' }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: UI.ink, marginBottom: 22 }}>“{record.text}”</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: UI.inkSoft, marginBottom: 12 }}>Confidence scores</div>
          {sentiments.map(sn => {
            const v = safeScore(record, sn);
            const key = sn.toUpperCase();
            return (
              <div key={sn} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: UI.inkSoft }}>
                  <span>{sn}</span>
                  <span style={{ fontFamily: FONT_MONO }}>{(v * 100).toFixed(1)}%</span>
                </div>
                <div style={{ height: 8, background: UI.track, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${v * 100}%`, height: '100%', background: COLORS[key], borderRadius: 5, boxShadow: glow(COLORS[key], 8, 'aa') }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onDemo }) {
  return (
    <Card>
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><PulseLogo size={52} /></div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: UI.ink }}>No data yet</div>
        <div style={{ fontSize: 14, color: UI.inkSoft, marginBottom: 20 }}>
          Run <code>python producer.py</code> to start the stream, or preview with simulated data.
        </div>
        <button onClick={onDemo} style={{
          background: ACCENT, color: '#000', border: 'none', borderRadius: 10,
          padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: glow(ACCENT, 22, '55'), letterSpacing: '0.04em',
        }}>
          START SIMULATION
        </button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS architecture diagram — two rows (snake), animated data-flow arcs.
// Icons are the service PNGs in /public. Kinesis has no icon yet (placeholder).
// ─────────────────────────────────────────────────────────────────────────────

const ARCH_NODES = [
  { id: 'producer',   label: 'Producer',    sub: 'python',    img: '/ic-python.png' },
  { id: 'kinesis',    label: 'Kinesis',     sub: 'stream',    img: '/ic-kinesis.png' },
  { id: 'lambda',     label: 'Lambda',      sub: 'processor', img: '/ic-lambda.png' },
  { id: 'comprehend', label: 'Comprehend',  sub: 'NLP',       img: '/ic-comprehend.png' },
  { id: 'dynamo',     label: 'DynamoDB',    sub: 'table',     img: '/ic-dynamodb.png' },
  { id: 'api',        label: 'API Gateway', sub: '+ query λ', img: '/ic-api.png' },
  { id: 'react',      label: 'Dashboard',   sub: 'React',     img: '/ic-react.png', aspect: 3.23 },
];

// Snake layout: row 0 left→right (cols 0-3), then down, then row 1 right→left.
const ARCH_LAYOUT = [
  { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 },
  { col: 3, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 1 },
];

function AwsArchitecture({ reduceMotion }) {
  const W = 1000, H = 350;
  const margin = 100, cols = 4;
  const colStep = (W - 2 * margin) / (cols - 1);
  const boxW = 160, boxH = 120;
  const rowTop = [24, 204];
  const colX = (c) => margin + c * colStep;
  const rowCy = (r) => rowTop[r] + boxH / 2;
  const pos = ARCH_LAYOUT.map(({ col, row }) => ({ x: colX(col), y: rowCy(row) }));

  // Edge anchors for each node box.
  const rowOf = (i) => ARCH_LAYOUT[i].row;
  const edgeR = (i) => ({ x: pos[i].x + boxW / 2, y: pos[i].y });
  const edgeL = (i) => ({ x: pos[i].x - boxW / 2, y: pos[i].y });
  const edgeT = (i) => ({ x: pos[i].x, y: rowTop[rowOf(i)] });
  const edgeB = (i) => ({ x: pos[i].x, y: rowTop[rowOf(i)] + boxH });

  // A full S-curve between two anchors (horizontal or vertical section).
  const sCurve = (s, e) => {
    if (s.y === e.y) {
      const amp = 34, dx = e.x - s.x;
      return `C ${s.x + dx * 0.35} ${s.y - amp}, ${e.x - dx * 0.35} ${e.y + amp}, ${e.x} ${e.y}`;
    }
    const amp = 26, dy = e.y - s.y;
    return `C ${s.x - amp} ${s.y + dy * 0.35}, ${e.x + amp} ${e.y - dy * 0.35}, ${e.x} ${e.y}`;
  };

  // Each visible section is its own clear S, drawn edge-to-edge between boxes.
  const arcs = [
    [edgeR(0), edgeL(1)], [edgeR(1), edgeL(2)], [edgeR(2), edgeL(3)],
    [edgeB(3), edgeT(4)], [edgeL(4), edgeR(5)], [edgeL(5), edgeR(6)],
  ].map(([s, e]) => `M ${s.x} ${s.y} ${sCurve(s, e)}`);

  // One invisible continuous path drives the single flowing dot: it rides each
  // visible S in the gaps and hides behind the boxes between sections. Start and
  // end sit at the Producer/Dashboard centers so the loop restart is unseen.
  const flowD =
    `M ${pos[0].x} ${pos[0].y} L ${edgeR(0).x} ${edgeR(0).y} ${sCurve(edgeR(0), edgeL(1))}` +
    ` L ${edgeR(1).x} ${edgeR(1).y} ${sCurve(edgeR(1), edgeL(2))}` +
    ` L ${edgeR(2).x} ${edgeR(2).y} ${sCurve(edgeR(2), edgeL(3))}` +
    ` L ${edgeB(3).x} ${edgeB(3).y} ${sCurve(edgeB(3), edgeT(4))}` +
    ` L ${edgeL(4).x} ${edgeL(4).y} ${sCurve(edgeL(4), edgeR(5))}` +
    ` L ${edgeL(5).x} ${edgeL(5).y} ${sCurve(edgeL(5), edgeR(6))}` +
    ` L ${pos[6].x} ${pos[6].y}`;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto', minWidth: 620 }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="arc-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {arcs.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="2" />
            <path d={d} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="2" opacity="0.4" filter="url(#arc-glow)" />
          </g>
        ))}
        <path id="flow-all" d={flowD} fill="none" stroke="none" />
        {!reduceMotion && (
          <circle r="5" fill="#ffffff" filter="url(#arc-glow)">
            <animateMotion dur="7s" repeatCount="indefinite">
              <mpath href="#flow-all" />
            </animateMotion>
          </circle>
        )}

        {ARCH_NODES.map((node, i) => {
          const { x } = pos[i];
          const top = rowTop[ARCH_LAYOUT[i].row];
          const left = x - boxW / 2;
          // icon tile: square by default; wide (rectangular) for react so its
          // wordmark isn't cropped. contain-fit for wide, cover-fit for square.
          const tw = node.aspect ? Math.min(124, Math.round(58 * node.aspect)) : 58;
          const th = node.aspect ? Math.round(tw / node.aspect) : 58;
          const tx = x - tw / 2;
          const ty = top + 13 + (58 - th) / 2;
          const fit = node.aspect ? 'xMidYMid meet' : 'xMidYMid slice';
          return (
            <g key={node.id}>
              <rect x={left} y={top} width={boxW} height={boxH} rx="16" fill="#0d0d0f" stroke="rgba(255,255,255,0.16)" strokeWidth="1.3" />
              {/* icon fills its tile (source art trimmed); react keeps its wide aspect */}
              <clipPath id={`ic-clip-${node.id}`}><rect x={tx} y={ty} width={tw} height={th} rx="13" /></clipPath>
              <rect x={tx} y={ty} width={tw} height={th} rx="13" fill="#ffffff" />
              <image href={node.img} x={tx} y={ty} width={tw} height={th}
                     preserveAspectRatio={fit} clipPath={`url(#ic-clip-${node.id})`} />
              <text x={x} y={top + 90} textAnchor="middle" fontFamily={FONT_SANS} fontSize="15" fontWeight="600" fill={UI.ink}>{node.label}</text>
              <text x={x} y={top + 108} textAnchor="middle" fontFamily={FONT_MONO} fontSize="11" fill={UI.inkMute}>{node.sub}</text>
            </g>
          );
        })}

        {/* decorative faces mark tucked into the bottom-left corner (not part of the flow) */}
        <image href="/faces-mark.png" x={10} y={H - 76} width="66" height="66"
               preserveAspectRatio="xMidYMid meet" opacity="0.4" />
      </svg>
      </div>
      <div style={{ textAlign: 'center', color: UI.inkMute, fontSize: 12, marginTop: 6 }}>
        Each message flows through the pipeline in order — the dashboard polls API Gateway for the latest results every {POLL_MS / 1000}s.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Global keyframes
// ─────────────────────────────────────────────────────────────────────────────

function GlobalStyles() {
  return (
    <style>{`
      @keyframes sp-live { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
      @keyframes sp-title-glow {
        0%,100% { text-shadow: 0 0 10px #ffffff88 }
        50%     { text-shadow: 0 0 22px #ffffff, 0 0 34px #ffffff55 }
      }
      @keyframes sp-logo-pulse {
        0%,100% { filter: drop-shadow(0 0 3px #ffffff55) }
        50%     { filter: drop-shadow(0 0 10px #ffffffcc) }
      }
      @keyframes sp-dot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.7); opacity: 0.45 } }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }
      body { background: ${UI.pageBg}; }
    `}</style>
  );
}
