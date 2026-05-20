import { DIM, HAIRLINE } from '../theme';

export default function Marquee({ latestRecord, counts, dominant }) {
  const latest = latestRecord
    ? `LATEST: "${latestRecord.text}" → [${latestRecord.sentiment}]`
    : 'AWAITING DATA';

  const content = `>>> ${latest}   ·   POSITIVE: ${counts.POSITIVE || 0}  ·  NEGATIVE: ${counts.NEGATIVE || 0}  ·  NEUTRAL: ${counts.NEUTRAL || 0}  ·  MIXED: ${counts.MIXED || 0}   ·   DOMINANT: ${dominant?.[0]}   ·   PIPELINE: kinesis → lambda → comprehend → dynamodb   <<<`;

  return (
    <div style={{ overflow: 'hidden', borderBottom: `1px solid ${HAIRLINE}`, marginBottom: '1.5rem', padding: '0.4rem 0' }}>
      <div style={{
        display: 'flex', width: '200%', animation: 'marquee 25s linear infinite',
        whiteSpace: 'nowrap', fontSize: '0.78rem', color: DIM,
      }}>
        <span style={{ flex: '0 0 50%' }}>{content}</span>
        <span style={{ flex: '0 0 50%' }}>{content}</span>
      </div>
    </div>
  );
}
