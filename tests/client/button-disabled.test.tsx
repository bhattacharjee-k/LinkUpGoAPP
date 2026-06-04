// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from '@/components/ui/button';

describe('Button disabled state', () => {
  it('renders a disabled button with the inactive muted treatment (not just opacity)', () => {
    render(<Button disabled>Next</Button>);
    const btn = screen.getByRole('button', { name: 'Next' });

    // Native disabled attribute is present
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    const className = btn.className;
    // Neutral muted background + foreground instead of a dimmed primary color
    expect(className).toContain('disabled:bg-muted');
    expect(className).toContain('disabled:text-muted-foreground');
    // Glow/shadow removed so it does not look raised/clickable
    expect(className).toContain('disabled:shadow-none');
    // Keeps clicks from registering
    expect(className).toContain('disabled:pointer-events-none');
    // Must NOT rely solely on the old opacity trick
    expect(className).not.toContain('disabled:opacity-50');
  });

  it('renders an enabled default (primary) button with the active primary classes', () => {
    render(<Button>Next</Button>);
    const btn = screen.getByRole('button', { name: 'Next' });

    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('text-primary-foreground');
  });
});
