import { describe, it, expect } from 'vitest';
import {
  extractGridAxes,
  extractGridIntersections,
  extractColumnSnapPoints,
  autoDetectBeamsWithDiagnostics,
  ClassifiedLine,
  GridAxis,
} from '../beamDetector';
import { RawTextItem, RawVectorLine } from '../scaleCalibrator';

describe('Grid-First Detection and Grid Intersections', () => {
  it('correctly extracts grid axes and labels from grid lines and bubble texts', () => {
    const classifiedLines: ClassifiedLine[] = [
      {
        line: { x1: 50, y1: 100, x2: 800, y2: 100 },
        orientation: 'horizontal',
        coord: 100,
        start: 50,
        end: 800,
        length: 750,
        category: 'grid_or_dimension',
        reason: 'full_span_grid_line',
      },
      {
        line: { x1: 50, y1: 400, x2: 800, y2: 400 },
        orientation: 'horizontal',
        coord: 400,
        start: 50,
        end: 800,
        length: 750,
        category: 'grid_or_dimension',
        reason: 'full_span_grid_line',
      },
      {
        line: { x1: 150, y1: 50, x2: 150, y2: 600 },
        orientation: 'vertical',
        coord: 150,
        start: 50,
        end: 600,
        length: 550,
        category: 'grid_or_dimension',
        reason: 'full_span_grid_line',
      },
      {
        line: { x1: 550, y1: 50, x2: 550, y2: 600 },
        orientation: 'vertical',
        coord: 550,
        start: 50,
        end: 600,
        length: 550,
        category: 'grid_or_dimension',
        reason: 'full_span_grid_line',
      },
    ];

    const texts: RawTextItem[] = [
      { text: 'A', x: 30, y: 100 },
      { text: 'B', x: 30, y: 400 },
      { text: '1', x: 150, y: 30 },
      { text: '2', x: 550, y: 30 },
    ];

    const axes = extractGridAxes(classifiedLines, texts);
    expect(axes.horizontal.length).toBe(2);
    expect(axes.vertical.length).toBe(2);
    expect(axes.horizontal[0].label).toBe('A');
    expect(axes.horizontal[1].label).toBe('B');
    expect(axes.vertical[0].label).toBe('1');
    expect(axes.vertical[1].label).toBe('2');
  });

  it('calculates all grid intersection coordinates and generates structural labels (A-1, A-2, B-1, B-2)', () => {
    const gridAxes: { horizontal: GridAxis[]; vertical: GridAxis[] } = {
      horizontal: [
        { orientation: 'horizontal', coord: 100, start: 50, end: 800, label: 'A' },
        { orientation: 'horizontal', coord: 400, start: 50, end: 800, label: 'B' },
      ],
      vertical: [
        { orientation: 'vertical', coord: 150, start: 50, end: 600, label: '1' },
        { orientation: 'vertical', coord: 550, start: 50, end: 600, label: '2' },
      ],
    };

    const intersections = extractGridIntersections(gridAxes);
    expect(intersections.length).toBe(4);

    const labels = intersections.map((i) => i.label);
    expect(labels).toContain('A-1');
    expect(labels).toContain('A-2');
    expect(labels).toContain('B-1');
    expect(labels).toContain('B-2');

    const nodeA1 = intersections.find((i) => i.label === 'A-1')!;
    expect(nodeA1.x).toBe(150);
    expect(nodeA1.y).toBe(100);

    const nodeB2 = intersections.find((i) => i.label === 'B-2')!;
    expect(nodeB2.x).toBe(550);
    expect(nodeB2.y).toBe(400);
  });

  it('includes grid intersections in magnetic snap points', () => {
    const rawLines: RawVectorLine[] = [
      { x1: 50, y1: 100, x2: 800, y2: 100 },
      { x1: 50, y1: 400, x2: 800, y2: 400 },
      { x1: 150, y1: 50, x2: 150, y2: 600 },
      { x1: 550, y1: 50, x2: 550, y2: 600 },
    ];
    const texts: RawTextItem[] = [
      { text: 'A', x: 30, y: 100 },
      { text: 'B', x: 30, y: 400 },
      { text: '1', x: 150, y: 30 },
      { text: '2', x: 550, y: 30 },
    ];

    const snapPoints = extractColumnSnapPoints(rawLines, texts, [], 1.0, 20);
    const gridSnaps = snapPoints.filter((sp) => sp.kind === 'grid_intersection');
    expect(gridSnaps.length).toBeGreaterThanOrEqual(4);
    expect(gridSnaps.some((sp) => sp.label.includes('A-1'))).toBe(true);
    expect(gridSnaps.some((sp) => sp.label.includes('B-2'))).toBe(true);
  });

  it('runs Phase 0 Grid-First detection and reports gridIntersections in diagnostics', () => {
    const rawLines: RawVectorLine[] = [
      // Grid lines
      { x1: 50, y1: 100, x2: 800, y2: 100 },
      { x1: 50, y1: 400, x2: 800, y2: 400 },
      { x1: 150, y1: 50, x2: 150, y2: 600 },
      { x1: 550, y1: 50, x2: 550, y2: 600 },
      // Beam edges along Grid A between Grid 1 (150) and Grid 2 (550)
      { x1: 150, y1: 90, x2: 550, y2: 90 },
      { x1: 150, y1: 110, x2: 550, y2: 110 },
    ];
    const texts: RawTextItem[] = [
      { text: 'A', x: 30, y: 100 },
      { text: 'B', x: 30, y: 400 },
      { text: '1', x: 150, y: 30 },
      { text: '2', x: 550, y: 30 },
      { text: 'B1', x: 350, y: 100 },
    ];

    const diag = autoDetectBeamsWithDiagnostics(rawLines, 1.0, 50, texts);
    expect(diag.counts.gridIntersections).toBe(4);
    expect(diag.gridIntersections.length).toBe(4);
    expect(diag.counts.gridGuidedBeams).toBeGreaterThanOrEqual(1);
  });
});
