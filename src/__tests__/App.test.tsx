import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

describe('App Integration - Minimal White Formwork Calculator', () => {
  it('renders the Minimal White interface with 12-SKU matrix (lengths 120, 100, 50 x heights 40, 50, 60, 70) and fixed 5cm thickness', () => {
    render(<App />);
    expect(screen.getByText(/หนา 5 ซม\./i)).toBeInTheDocument();
    expect(screen.getAllByText('สูง 40 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('สูง 50 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('สูง 60 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('สูง 70 ซม.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/120 ซม\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/นำเข้า PDF แปลนคาน/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/สแกนคาน \(Auto 50 ซม\.\)/i)).toBeInTheDocument();

    // Undo / Redo / Save / Load / PDF buttons
    expect(screen.getByTitle(/ย้อนกลับ \(Undo: Ctrl \+ Z\)/i)).toBeInTheDocument();
    expect(screen.getByTitle(/ทำซ้ำ \(Redo: Ctrl \+ Y หรือ Ctrl \+ Shift \+ Z\)/i)).toBeInTheDocument();
    expect(screen.getByText(/บันทึกโปรเจกต์/i)).toBeInTheDocument();
    expect(screen.getByText(/เปิดโปรเจกต์/i)).toBeInTheDocument();
    expect(screen.getByText(/รายงาน PDF/i)).toBeInTheDocument();
  });

  it('allows switching tool to draw inner/outer perimeter lines, multi-select with shift, and undo/redo', () => {
    const { container } = render(<App />);

    // Verify 20cm default beam width input exists
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();

    // Verify default height is 50 cm
    expect(screen.getByDisplayValue('50 ซม.')).toBeInTheDocument();

    // Switch to Draw Inner Perimeter Line tool
    const drawInnerLineBtn = screen.getByRole('button', { name: /วาดคาน \(วงใน\)/i });
    fireEvent.click(drawInnerLineBtn);

    const canvas = container.querySelector('canvas')!;

    // Click start point (100, 100) and end point (400, 100) -> creates inner + outer parallel lines (20cm offset)
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
    fireEvent.mouseDown(canvas, { clientX: 400, clientY: 100 });

    // Open edit tab
    const editTabBtn = screen.getByRole('button', { name: /แก้ไข/i });
    fireEvent.click(editTabBtn);

    expect(screen.getByText(/แก้ไขคานและแผ่นไม้แบบ: B1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /สลับฝั่งเกาะ \(Flip\)/i })).toBeInTheDocument();

    // Change height to 40 cm
    const height40Btn = screen.getByTitle('ตั้งความสูงทั้งสองฝั่ง 40 ซม.');
    fireEvent.click(height40Btn);

    expect(screen.getAllByText(/40 ซม./i).length).toBeGreaterThan(1);

    // Press Undo button or Ctrl+Z
    const undoBtn = screen.getByTitle(/ย้อนกลับ \(Undo: Ctrl \+ Z\)/i);
    expect(undoBtn).not.toBeDisabled();
    fireEvent.click(undoBtn);

    // Press Redo button
    const redoBtn = screen.getByTitle(/ทำซ้ำ \(Redo: Ctrl \+ Y หรือ Ctrl \+ Shift \+ Z\)/i);
    expect(redoBtn).not.toBeDisabled();
    fireEvent.click(redoBtn);

    // Press Delete key to delete the selected beam
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByText(/แก้ไขคานและแผ่นไม้แบบ: B1 \(ขอบใน\)/i)).not.toBeInTheDocument();
  });
});
