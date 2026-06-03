// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { TravelControl } from '@/components/travel-control';

describe('TravelControl component', () => {
  it('renders the three mode chips (Walk, Transit, Car) and the four tolerance options (15, 30, 45, 60)', () => {
    const handleNeighborhoodChange = vi.fn();
    const handleModeChange = vi.fn();
    const handleToleranceChange = vi.fn();

    render(
      <TravelControl
        neighborhood="East Village"
        onNeighborhoodChange={handleNeighborhoodChange}
        mode="walk"
        onModeChange={handleModeChange}
        toleranceMin={15}
        onToleranceChange={handleToleranceChange}
      />
    );

    // Verify mode chips are rendered
    expect(screen.getByRole('button', { name: /Walk/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Transit/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Car/i })).toBeDefined();

    // Verify tolerance options are rendered
    expect(screen.getByRole('button', { name: '15m' })).toBeDefined();
    expect(screen.getByRole('button', { name: '30m' })).toBeDefined();
    expect(screen.getByRole('button', { name: '45m' })).toBeDefined();
    expect(screen.getByRole('button', { name: '60m' })).toBeDefined();

    // Verify initial label is rendered
    expect(screen.getByText(/Willing to travel · by walk/i)).toBeDefined();
  });

  it('selecting a mode chip calls onModeChange and onToleranceChange with correct values', () => {
    const handleNeighborhoodChange = vi.fn();
    const handleModeChange = vi.fn();
    const handleToleranceChange = vi.fn();

    render(
      <TravelControl
        neighborhood="East Village"
        onNeighborhoodChange={handleNeighborhoodChange}
        mode="walk"
        onModeChange={handleModeChange}
        toleranceMin={15}
        onToleranceChange={handleToleranceChange}
      />
    );

    // Click on "Car" mode chip
    const carButton = screen.getByRole('button', { name: /Car/i });
    fireEvent.click(carButton);

    // Verify callbacks are triggered with correct values (including default tolerance for car, which is 45)
    expect(handleModeChange).toHaveBeenCalledWith('car');
    expect(handleToleranceChange).toHaveBeenCalledWith(45);

    // Click on "Transit" mode chip
    const transitButton = screen.getByRole('button', { name: /Transit/i });
    fireEvent.click(transitButton);

    expect(handleModeChange).toHaveBeenCalledWith('transit');
    expect(handleToleranceChange).toHaveBeenCalledWith(30);
  });

  it('updates the "· by {mode}" label when mode changes in a stateful wrapper', () => {
    // Stateful wrapper to test full interaction and label updates
    function TestWrapper() {
      const [neighborhood, setNeighborhood] = useState('East Village');
      const [mode, setMode] = useState<'walk' | 'transit' | 'car'>('walk');
      const [toleranceMin, setToleranceMin] = useState(15);

      return (
        <TravelControl
          neighborhood={neighborhood}
          onNeighborhoodChange={setNeighborhood}
          mode={mode}
          onModeChange={setMode}
          toleranceMin={toleranceMin}
          onToleranceChange={setToleranceMin}
        />
      );
    }

    render(<TestWrapper />);

    // Initial check
    expect(screen.getByText(/Willing to travel · by walk/i)).toBeDefined();

    // Click on "Car" mode chip
    const carButton = screen.getByRole('button', { name: /Car/i });
    fireEvent.click(carButton);

    // Label should update to "Willing to travel · by car" and tolerance to "45 mins"
    expect(screen.getByText(/Willing to travel · by car/i)).toBeDefined();
    expect(screen.getByText('45 mins')).toBeDefined();

    // Click on "Transit" mode chip
    const transitButton = screen.getByRole('button', { name: /Transit/i });
    fireEvent.click(transitButton);

    // Label should update to "Willing to travel · by transit" and tolerance to "30 mins"
    expect(screen.getByText(/Willing to travel · by transit/i)).toBeDefined();
    expect(screen.getByText('30 mins')).toBeDefined();
  });

  it('selecting a tolerance calls onToleranceChange with the correct number', () => {
    const handleNeighborhoodChange = vi.fn();
    const handleModeChange = vi.fn();
    const handleToleranceChange = vi.fn();

    render(
      <TravelControl
        neighborhood="East Village"
        onNeighborhoodChange={handleNeighborhoodChange}
        mode="walk"
        onModeChange={handleModeChange}
        toleranceMin={15}
        onToleranceChange={handleToleranceChange}
      />
    );

    // Click on "45m" tolerance button
    const toleranceButton45 = screen.getByRole('button', { name: '45m' });
    fireEvent.click(toleranceButton45);

    expect(handleToleranceChange).toHaveBeenCalledWith(45);

    // Click on "60m" tolerance button
    const toleranceButton60 = screen.getByRole('button', { name: '60m' });
    fireEvent.click(toleranceButton60);

    expect(handleToleranceChange).toHaveBeenCalledWith(60);
  });

  it('the starting neighborhood input is present, renders correctly, and calls onNeighborhoodChange when text is input', () => {
    const handleNeighborhoodChange = vi.fn();
    const handleModeChange = vi.fn();
    const handleToleranceChange = vi.fn();

    render(
      <TravelControl
        neighborhood="East Village"
        onNeighborhoodChange={handleNeighborhoodChange}
        mode="walk"
        onModeChange={handleModeChange}
        toleranceMin={15}
        onToleranceChange={handleToleranceChange}
      />
    );

    // Find the input by test ID or placeholder
    const input = screen.getByTestId('input-starting-neighborhood') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('East Village');

    // Simulate typing "Brooklyn Heights"
    fireEvent.change(input, { target: { value: 'Brooklyn Heights' } });

    expect(handleNeighborhoodChange).toHaveBeenCalledWith('Brooklyn Heights');
  });
});
