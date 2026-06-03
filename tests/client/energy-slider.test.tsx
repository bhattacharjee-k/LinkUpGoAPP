// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EnergySlider } from '@/components/energy-slider';
import { ENERGY_BANDS } from '@shared/energy';

describe('EnergySlider component', () => {
  it('renders the band name and anchor for a given value', () => {
    const handleChange = vi.fn();
    render(<EnergySlider value="Vibey" onChange={handleChange} />);

    // Verify "Vibey" is rendered
    expect(screen.getAllByText('Vibey').length).toBeGreaterThan(0);

    // Verify the anchor text is rendered
    expect(screen.getByText(ENERGY_BANDS['Vibey'].anchor)).toBeDefined();
  });

  it('triggers onChange with correct EnergyLevel when slider is moved', () => {
    const handleChange = vi.fn();
    const { container } = render(<EnergySlider value="Vibey" onChange={handleChange} />);

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();

    // Move to Chill range (e.g., 10)
    fireEvent.change(slider, { target: { value: '10' } });
    expect(handleChange).toHaveBeenCalledWith('Chill');

    // Move to Full send range (e.g., 90)
    fireEvent.change(slider, { target: { value: '90' } });
    expect(handleChange).toHaveBeenCalledWith('Full send');
  });

  it('does not render the numeric NII value anywhere in the output text', () => {
    const handleChange = vi.fn();
    const { container } = render(<EnergySlider value="Vibey" onChange={handleChange} />);

    // Get all text content from the rendered component
    const textContent = container.textContent || '';

    // Verify that "NII" is not present in the text
    expect(textContent).not.toContain('NII');

    // Verify that the numeric value of the slider (e.g., "37.5" or "37" or "38") is not in the text content
    expect(textContent).not.toContain('37');
    expect(textContent).not.toContain('38');

    // For "Vibey", there should be no digits in the text content at all
    expect(/\d/.test(textContent)).toBe(false);
  });
});
