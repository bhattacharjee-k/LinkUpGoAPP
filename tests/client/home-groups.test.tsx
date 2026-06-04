// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Home } from '@/pages/home';
import { useApp } from '@/lib/context';

// Mock the app context so we can control groups / createGroup.
vi.mock('@/lib/context', () => ({
  useApp: vi.fn(),
}));

// NotificationBell hits the API on mount; stub it out so Home renders cleanly.
vi.mock('@/lib/api', () => ({
  api: { notifications: { unreadCount: vi.fn().mockResolvedValue({ count: 0 }) } },
}));

// Avoid pulling the real ad banner network/iframe behavior into the test.
vi.mock('@/components/ad-banner', () => ({ AdBanner: () => null }));

const createGroup = vi.fn();

function mockApp(overrides: Record<string, any> = {}) {
  vi.mocked(useApp).mockReturnValue({
    user: { id: 'u1', name: 'Ada', city: 'NYC' },
    sessions: [],
    groups: [],
    createGroup,
    updateGroup: vi.fn(),
    isAdmin: () => false,
    isGroupLocked: () => false,
    ...overrides,
  } as any);
}

describe('Home — Your Groups UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGroup.mockResolvedValue({ id: 'g1', name: 'New Crew' });
    mockApp();
  });

  it('shows the empty-state copy when the user has zero groups', () => {
    render(<Home />);
    const empty = screen.getByTestId('empty-groups');
    expect(empty.textContent).toContain('No groups yet');
    expect(empty.textContent).toContain('invite link');
  });

  it('renders a Create group trigger and a name input when opened', () => {
    render(<Home />);
    const trigger = screen.getByTestId('button-create-group');
    expect(trigger).toBeDefined();

    fireEvent.click(trigger);

    const input = screen.getByTestId('input-group-name');
    expect(input).toBeDefined();
  });

  it('disables submit when the name is empty and calls createGroup with the entered name', async () => {
    render(<Home />);
    fireEvent.click(screen.getByTestId('button-create-group'));

    const submit = screen.getByTestId('button-submit-create-group') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('input-group-name'), { target: { value: 'Friday Night Crew' } });
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    expect(createGroup).toHaveBeenCalledWith('Friday Night Crew');
  });

  it('hides the empty state once groups exist', () => {
    mockApp({ groups: [{ id: 'g1', name: 'Crew', members: ['u1'], inviteCode: 'ABC123', adminId: 'u1', locked: false }] });
    render(<Home />);
    expect(screen.queryByTestId('empty-groups')).toBeNull();
  });
});
