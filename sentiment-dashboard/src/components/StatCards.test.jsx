import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCards from './StatCards';

describe('StatCards', () => {
  it('renders one card per sentiment with the right count and percentage', () => {
    render(<StatCards counts={{ POSITIVE: 30, NEGATIVE: 10, NEUTRAL: 8, MIXED: 2 }} total={50} />);

    // One card per sentiment label
    expect(screen.getByText('POSITIVE')).toBeInTheDocument();
    expect(screen.getByText('NEGATIVE')).toBeInTheDocument();
    expect(screen.getByText('NEUTRAL')).toBeInTheDocument();
    expect(screen.getByText('MIXED')).toBeInTheDocument();

    // Counts render
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    // Percentages: 30/50 = 60.0%, 10/50 = 20.0%
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
  });

  it('shows 0.0% for sentiments missing from the counts map', () => {
    render(<StatCards counts={{ POSITIVE: 5 }} total={5} />);

    // Missing sentiments still render with zero — important so the layout doesn't collapse
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(3); // NEGATIVE, NEUTRAL, MIXED
    expect(screen.getAllByText('0.0%').length).toBe(3);
  });

  it('does not divide by zero when no records exist yet', () => {
    render(<StatCards counts={{}} total={0} />);

    // All four cards should still render, all showing 0 / 0.0%
    expect(screen.getAllByText('0').length).toBe(4);
    expect(screen.getAllByText('0.0%').length).toBe(4);
  });
});
