import { describe, it, expect } from 'vitest';
import {
  optimizeSingleSidePanels,
  applyAutoCornerExtensions,
  computeAllBeamPanels,
  computeRentalSummary,
} from '../formworkOptimizer';
import { BeamElement, FORMWORK_THICKNESS_CM } from '../../types/formwork';

describe('formworkOptimizer', () => {
  it('always sets formwork thickness to 5 cm on every generated panel', () => {
    const panels = optimizeSingleSidePanels(220, 60, 'b1', 'B1', 'left');
    expect(panels.every((p) => p.thicknessCm === FORMWORK_THICKNESS_CM)).toBe(true);
    expect(panels.every((p) => p.thicknessCm === 5)).toBe(true);
  });

  it('assigns specific SKU color theme to each panel according to length and height', () => {
    const p120x40 = optimizeSingleSidePanels(120, 40, 'b1', 'B1', 'left');
    expect(p120x40[0].skuTheme?.stroke).toBe('#059669');

    const p100x60 = optimizeSingleSidePanels(100, 60, 'b1', 'B1', 'left');
    expect(p100x60[0].skuTheme?.stroke).toBe('#1D4ED8');

    const p50x70 = optimizeSingleSidePanels(50, 70, 'b1', 'B1', 'left');
    expect(p50x70[0].skuTheme?.stroke).toBe('#78350F');

    const free50 = optimizeSingleSidePanels(15, 50, 'b1', 'B1', 'left');
    expect(free50[0].skuTheme?.stroke).toBe('#BE123C');
  });

  it('prefers zero free-length remainder over greedy 120cm (e.g., 300cm -> 100x3 instead of 120x2+50+Free10)', () => {
    const panels = optimizeSingleSidePanels(300, 50, 'b1', 'B1', 'left');
    const lengths = panels.map((p) => p.lengthCm);
    expect(lengths).toEqual([100, 100, 100]);
    expect(panels.some((p) => p.type === 'free')).toBe(false);
  });

  it('minimizes panel count when exact fit is possible (e.g., 270cm -> 120 + 100 + 50)', () => {
    const panels = optimizeSingleSidePanels(270, 40, 'b1', 'B1', 'right');
    expect(panels.map((p) => p.lengthCm)).toEqual([120, 100, 50]);
    expect(panels.every((p) => p.heightCm === 40)).toBe(true);
  });

  it('creates a free-length item with minimized remainder when length cannot be exact (e.g., 285cm -> 120+100+50 + Free 15cm)', () => {
    const panels = optimizeSingleSidePanels(285, 70, 'b1', 'B1', 'left');
    const std = panels.filter((p) => p.type === 'standard').map((p) => p.lengthCm);
    const free = panels.filter((p) => p.type === 'free');
    expect(std).toEqual([120, 100, 50]);
    expect(free).toHaveLength(1);
    expect(free[0].lengthCm).toBe(15);
    expect(free[0].heightCm).toBe(70);
    expect(free[0].thicknessCm).toBe(5);
  });

  it('adds +5 cm outer corner extension when two perpendicular beams meet at an L-corner', () => {
    const beams: BeamElement[] = [
      {
        id: 'b1',
        name: 'B1',
        start: { x: 0, y: 0 },
        end: { x: 400, y: 0 },
        widthCm: 20,
        defaultHeightCm: 60,
        thicknessCm: 5,
        leftSide: { side: 'left', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
        rightSide: { side: 'right', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
      },
      {
        id: 'b2',
        name: 'B2',
        start: { x: 400, y: 0 },
        end: { x: 400, y: 300 },
        widthCm: 20,
        defaultHeightCm: 60,
        thicknessCm: 5,
        leftSide: { side: 'left', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
        rightSide: { side: 'right', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
      },
    ];

    const adjusted = applyAutoCornerExtensions(beams, 1);
    const hasFiveCmExtension =
      adjusted[0].leftSide.endExtensionCm === 5 ||
      adjusted[0].rightSide.endExtensionCm === 5;
    expect(hasFiveCmExtension).toBe(true);
  });

  it('aggregates rental summary across all 12 SKUs (3 lengths x 4 heights) and free-length heights', () => {
    const beams: BeamElement[] = [
      {
        id: 'b1',
        name: 'B1',
        start: { x: 0, y: 0 },
        end: { x: 255, y: 0 },
        widthCm: 20,
        defaultHeightCm: 40,
        thicknessCm: 5,
        leftSide: { side: 'left', heightCm: 40, startExtensionCm: 0, endExtensionCm: 0 },
        rightSide: { side: 'right', heightCm: 70, startExtensionCm: 0, endExtensionCm: 0 },
      },
    ];
    const panels = computeAllBeamPanels(beams, 1);
    const summary = computeRentalSummary(panels);

    expect(summary.matrix[100][40]).toBe(2);
    expect(summary.matrix[50][40]).toBe(1);
    expect(summary.matrix[100][70]).toBe(2);
    expect(summary.matrix[50][70]).toBe(1);
    expect(summary.freeTotalsByHeightCm[40].totalLengthCm).toBe(5);
    expect(summary.freeTotalsByHeightCm[70].totalLengthCm).toBe(5);
  });
});
