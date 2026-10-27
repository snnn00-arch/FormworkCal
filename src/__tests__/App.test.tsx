import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

describe('App Integration - Minimal White Formwork Calculator', () => {
  it('renders the Minimal White interface with 12-SKU matrix (lengths 120, 100, 50 x heights 40, 50, 60, 70) and fixed 5cm thickness', () => {
    render(<App />);
    expect(screen.getByText(/ความหนาไม้แบบ 5 ซม./i)).toBeInTheDocument();
    expect(screen.getAllByText('สูง 40 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('สูง 50 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('สูง 60 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('สูง 70 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/120 ซม\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/100 ซม\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/50 ซม\./i).length).toBeGreaterThan(0);
  });

  it('allows selecting a beam and editing its formwork height (40, 50, 60, 70 cm) and custom panels', () => {
    render(<App />);
    const editTabBtn = screen.getByRole('button', { name: /แก้ไขคาน/i });
    fireEvent.click(editTabBtn);

    const beamButton = screen.getByRole('button', { name: /^B1 \(บนซ้าย\)$/i });
    fireEvent.click(beamButton);

    expect(screen.getByText(/แก้ไขคานและแผ่นไม้แบบ: B1 \(บนซ้าย\)/i)).toBeInTheDocument();
    const height40Btn = screen.getByTitle('ตั้งความสูงทั้งสองฝั่ง 40 ซม.');
    fireEvent.click(height40Btn);

    expect(screen.getAllByText(/40 ซม./i).length).toBeGreaterThan(1);
  });
});
