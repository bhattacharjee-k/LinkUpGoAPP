// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Profile } from '@/pages/profile';
import { History } from '@/pages/history';
import { useApp } from '@/lib/context';

// Control the app context.
vi.mock('@/lib/context', () => ({
  useApp: vi.fn(),
}));

// Mock wouter's useLocation so we can observe navigation.
const setLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/profile', setLocation],
  // History uses <Link>; render a plain anchor so it mounts cleanly.
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const updateUserProfile = vi.fn();
const logout = vi.fn();

function mockApp(overrides: Record<string, any> = {}) {
  vi.mocked(useApp).mockReturnValue({
    user: {
      id: 'u1',
      name: 'Ada',
      username: 'ada',
      email: '',
      city: 'NYC',
      budget: ['$$'],
      energy: 'Vibey',
      categories: [],
      hardNos: [],
      discoveryStyle: 'mixed',
      crowdPreference: 'no_preference',
      favoriteNeighborhoods: [],
    },
    sessions: [],
    groups: [],
    updateUserProfile,
    logout,
    ...overrides,
  } as any);
}

describe('Profile — history entry point + single save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserProfile.mockResolvedValue(undefined);
    mockApp();
  });

  it('renders a Plan history entry point that navigates to /history when clicked', () => {
    render(<Profile />);
    const entry = screen.getByTestId('button-plan-history');
    expect(entry).toBeDefined();

    fireEvent.click(entry);
    expect(setLocation).toHaveBeenCalledWith('/history');
  });

  it('exposes exactly one save control and calls updateUserProfile when clicked', () => {
    render(<Profile />);

    // There should be a single save button (no duplicate "Save Changes").
    const saveButtons = screen.getAllByRole('button').filter((b) =>
      /save/i.test(b.textContent || ''),
    );
    expect(saveButtons.length).toBe(1);

    fireEvent.click(screen.getByTestId('button-save-prefs'));
    expect(updateUserProfile).toHaveBeenCalledTimes(1);
  });
});

describe('History — empty state for new users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp();
  });

  it('renders the empty state when there are no past (locked) sessions', () => {
    render(<History />);
    expect(screen.getByText('No past plans yet')).toBeDefined();
  });
});
