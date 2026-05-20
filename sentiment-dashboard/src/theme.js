export const COLORS = {
  POSITIVE: '#00cfff',
  NEGATIVE: '#ff3131',
  NEUTRAL: '#ffaa00',
  MIXED: '#bf5fff',
};

// Terminal-green accent used everywhere; named G for brevity in JSX.
export const G = '#00ff41';
export const DIM = '#00aa2a';
export const HAIRLINE = '#001a00';

export const FONT = "'Courier New', monospace";

export const tooltipStyle = {
  backgroundColor: '#000',
  border: `1px solid ${G}`,
  color: G,
  fontFamily: FONT,
  fontSize: '0.75rem',
};

export const panel = (color = G) => ({
  backgroundColor: '#000',
  borderRadius: '2px',
  padding: '1.5rem',
  border: `1px solid ${color}`,
  boxShadow: `0 0 8px ${color}33`,
});

export const panelHeading = {
  fontSize: '0.8rem',
  fontWeight: '700',
  color: G,
  marginBottom: '0.4rem',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
};

export const panelSubheading = {
  fontSize: '0.72rem',
  color: DIM,
  marginBottom: '1rem',
};

export const formatTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString(); } catch { return ''; }
};
