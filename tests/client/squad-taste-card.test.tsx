// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SquadTasteCard } from '@/components/squad-taste-card';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: { groups: { getTaste: vi.fn() } },
}));

describe('SquadTasteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the top categories chips and the taste text', async () => {
    vi.mocked(api.groups.getTaste).mockResolvedValue({
      text: 'This crew leans intimate, mid-priced cocktail spots.',
      categoryHistogram: { Cocktails: 19, 'Wine Bar': 19, 'Live Music': 11 },
      topCategories: ['Cocktails', 'Wine Bar', 'Live Music'],
    });

    render(<SquadTasteCard groupId="g1" />);

    const card = await screen.findByTestId('squad-taste-card');
    expect(card.textContent).toContain('Cocktails');
    expect(card.textContent).toContain('Wine Bar');
    expect(card.textContent).toContain('Live Music');
    expect(card.textContent).toContain('intimate, mid-priced cocktail spots');
  });

  it('renders nothing when the squad has no history', async () => {
    vi.mocked(api.groups.getTaste).mockResolvedValue({
      text: '',
      categoryHistogram: {},
      topCategories: [],
    });

    const { container } = render(<SquadTasteCard groupId="g1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders nothing on fetch error', async () => {
    vi.mocked(api.groups.getTaste).mockRejectedValue(new Error('boom'));

    const { container } = render(<SquadTasteCard groupId="g1" />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
