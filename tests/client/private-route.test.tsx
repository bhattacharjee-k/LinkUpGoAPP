// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const setLocation = vi.fn();
const useAppMock = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/profile', setLocation],
}));

vi.mock('@/lib/context', () => ({
  useApp: () => useAppMock(),
}));

// Import after mocks are registered.
import { PrivateRoute } from '@/App';

function Protected() {
  return <div data-testid="protected">protected content</div>;
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loader and does not redirect or render the component while auth is loading', () => {
    useAppMock.mockReturnValue({ user: null, isLoading: true });

    const { container } = render(<PrivateRoute component={Protected} />);

    // Does not navigate.
    expect(setLocation).not.toHaveBeenCalled();
    // Does not render the protected component.
    expect(screen.queryByTestId('protected')).toBeNull();
    // Shows the spinner.
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('redirects to /onboarding when loaded and unauthenticated', () => {
    useAppMock.mockReturnValue({ user: null, isLoading: false });

    render(<PrivateRoute component={Protected} />);

    expect(setLocation).toHaveBeenCalledWith('/onboarding');
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('renders the protected component when loaded and authenticated', () => {
    useAppMock.mockReturnValue({ user: { id: 'u1', name: 'Priya' }, isLoading: false });

    render(<PrivateRoute component={Protected} />);

    expect(setLocation).not.toHaveBeenCalled();
    expect(screen.getByTestId('protected')).toBeDefined();
  });
});
