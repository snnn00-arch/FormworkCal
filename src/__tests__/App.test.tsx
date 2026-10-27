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
    expect(screen.getAllByText(/นำเข้า PDF แปลนคาน/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/สแกนตรวจจับคาน \(Auto\)/i)).toBeInTheDocument();
  });

  it('allows switching tool to draw beam, creating a beam on canvas, and editing its formwork height', () => {
    const { container } = render(<App />);

    // Switch to Draw Beam tool
    const drawToolBtn = screen.getByRole('button', { name: /วาดคาน/i });
    fireEvent.click(drawToolBtn);

    const canvas = container.querySelector('canvas')!;

    // Click start point (100, 100)
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
    // Click end point (400, 100) -> creates 300px beam
    fireEvent.mouseDown(canvas, { clientX: 400, clientY: 100 });

    // Open edit tab
    const editTabBtn = screen.getByRole('button', { name: /แก้ไขคาน/i });
    fireEvent.click(editTabBtn);

    expect(screen.getByText(/แก้ไขคานและแผ่นไม้แบบ: B1/i)).toBeInTheDocument();

    // Change height to 40 cm
    const height40Btn = screen.getByTitle('ตั้งความสูงทั้งสองฝั่ง 40 ซม.');
    fireEvent.click(height40Btn);

    expect(screen.getAllByText(/40 ซม./i).length).toBeGreaterThan(1);
  });
});
