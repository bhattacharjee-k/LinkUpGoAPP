// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { GroupReconciliation } from '@/components/group-reconciliation';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => {
  return {
    api: {
      sessions: {
        getAggregate: vi.fn(),
      },
    },
  };
});

describe('GroupReconciliation component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    // Mock getAggregate to return a pending promise (never resolves during this test)
    vi.mocked(api.sessions.getAggregate).mockReturnValue(new Promise(() => {}));

    render(<GroupReconciliation sessionId="session-123" />);

    expect(screen.getByTestId('group-reconciliation-loading')).toBeDefined();
  });

  it('covers Data Fetching and Display, Budget Card, Energy Split, Getting There, and Anonymity Rule', async () => {
    const mockAggregate = {
      memberCount: 2,
      energy: {
        target: 'Vibey',
        spread: ['Vibey', 'Going out'] as [string, string],
        split: {
          'Vibey': 1,
          'Going out': 1,
        },
      },
      budget: {
        comfortTier: 2,
        label: '$$',
      },
      travel: {
        members: [
          {
            name: 'Alice',
            neighborhood: 'East Village',
            mode: 'walk',
            toleranceMin: 15,
          },
          {
            name: 'Bob',
            neighborhood: 'Williamsburg',
            mode: 'transit',
            toleranceMin: 30,
          },
        ],
      },
    };

    vi.mocked(api.sessions.getAggregate).mockResolvedValue(mockAggregate);

    render(<GroupReconciliation sessionId="session-123" />);

    // Wait for the component to finish loading and render
    const reconciliationContainer = await screen.findByTestId('group-reconciliation');
    expect(reconciliationContainer).toBeDefined();

    // 1. Budget Card Verification
    const budgetCard = screen.getByTestId('budget-card');
    expect(budgetCard).toBeDefined();
    expect(budgetCard.textContent).toContain('Comfortable at $$');
    expect(budgetCard.textContent).toContain('Mostly wallet-friendly tonight');

    // Assert that NO member name (Alice, Bob) is present anywhere in the budget card
    expect(budgetCard.textContent).not.toContain('Alice');
    expect(budgetCard.textContent).not.toContain('Bob');

    // 2. Energy Split Card Verification
    const energyCard = screen.getByTestId('energy-card');
    expect(energyCard).toBeDefined();
    expect(energyCard.textContent).toContain('1 Vibey');
    expect(energyCard.textContent).toContain('1 Going out');
    expect(energyCard.textContent).toContain('leaning Vibey');

    // Assert that NO member name (Alice, Bob) is present anywhere in the energy card
    expect(energyCard.textContent).not.toContain('Alice');
    expect(energyCard.textContent).not.toContain('Bob');

    // 3. Getting There (Travel) Card Verification
    const travelCard = screen.getByTestId('travel-card');
    expect(travelCard).toBeDefined();
    expect(travelCard.textContent).toContain('Alice');
    expect(travelCard.textContent).toContain('East Village');
    expect(travelCard.textContent).toContain('15m max');
    expect(travelCard.textContent).toContain('Bob');
    expect(travelCard.textContent).toContain('Williamsburg');
    expect(travelCard.textContent).toContain('30m max');

    // 4. Anonymity Rule Verification
    // Confirm that JSON.stringify or text-scraping verifies that the budget and energy DOM nodes contain absolutely zero trace of the member names
    const budgetHtml = budgetCard.innerHTML;
    const energyHtml = energyCard.innerHTML;

    expect(budgetHtml).not.toContain('Alice');
    expect(budgetHtml).not.toContain('Bob');
    expect(energyHtml).not.toContain('Alice');
    expect(energyHtml).not.toContain('Bob');

    // Also verify via JSON.stringify of textContent
    expect(JSON.stringify(budgetCard.textContent)).not.toContain('Alice');
    expect(JSON.stringify(budgetCard.textContent)).not.toContain('Bob');
    expect(JSON.stringify(energyCard.textContent)).not.toContain('Alice');
    expect(JSON.stringify(energyCard.textContent)).not.toContain('Bob');
  });

  it('handles empty cases gracefully (memberCount is 0) without crashing', async () => {
    const mockEmptyAggregate = {
      memberCount: 0,
      energy: {
        target: '',
        spread: ['', ''] as [string, string],
        split: {},
      },
      budget: {
        comfortTier: 0,
        label: '',
      },
      travel: {
        members: [],
      },
    };

    vi.mocked(api.sessions.getAggregate).mockResolvedValue(mockEmptyAggregate);

    const { container } = render(<GroupReconciliation sessionId="session-123" />);

    // Wait for the component to handle the state update and render null
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('handles error cases gracefully without crashing', async () => {
    vi.mocked(api.sessions.getAggregate).mockRejectedValue(new Error('Network error'));

    const { container } = render(<GroupReconciliation sessionId="session-123" />);

    // Wait for the component to handle the error and render null
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
