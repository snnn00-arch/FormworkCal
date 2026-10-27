import { describe, it, expect } from 'vitest';
import {
  calculateScaleFromTwoPoints,
  autoDetectScaleFromPlanData,
  RawVectorLine,
  RawTextItem,
} from '../scaleCalibrator';
import {
  autoDetectBeamsFromVectorLines,
  generateSampleBeamPlan,
} from '../beamDetector';

describe('scaleCalibrator & beamDetector', () => {
  it('calculates exact pixelsPerCm from two calibration points and distance in cm', () => {
    const scale = calculateScaleFromTwoPoints({ x: 100, y: 100 }, { x: 500, y: 100 }, 400);
    expect(scale).toBeCloseTo(1.0, 4);
  });

  it('auto-detects scale from dimension text and matching vector line length', () => {
    const lines: RawVectorLine[] = [{ x1: 100, y1: 50, x2: 700, y2: 50 }]; // 600 px
    const texts: RawTextItem[] = [{ text: '4.00', x: 400, y: 45 }]; // 4.00 m = 400 cm -> 1.5 px/cm
    const result = autoDetectScaleFromPlanData(lines, texts);
    expect(result.pixelsPerCm).toBeCloseTo(1.5, 2);
  });

  it('detects parallel horizontal and vertical vector line pairs as beams with 5cm formwork thickness', () => {
    const lines: RawVectorLine[] = [
      // Horizontal beam pair, 20 px apart (20 cm at 1 px/cm), 350 px long
      { x1: 100, y1: 100, x2: 450, y2: 100 },
      { x1: 100, y1: 120, x2: 450, y2: 120 },
      // Vertical beam pair, 20 px apart, 300 px long
      { x1: 100, y1: 120, x2: 100, y2: 420 },
      { x1: 120, y1: 120, x2: 120, y2: 420 },
    ];
    const detected = autoDetectBeamsFromVectorLines(lines, 1.0, 50);
    expect(detected.length).toBe(2);
    expect(detected[0].thicknessCm).toBe(5);
    expect(detected[0].defaultHeightCm).toBe(50);
  });

  it('generates a realistic sample beam plan with multiple heights (40, 50, 60, 70 cm)', () => {
    const sample = generateSampleBeamPlan();
    expect(sample.beams.length).toBeGreaterThanOrEqual(6);
    expect(sample.beams.every((b) => b.thicknessCm === 5)).toBe(true);
    const heights = new Set(sample.beams.map((b) => b.defaultHeightCm));
    expect(heights.size).toBeGreaterThanOrEqual(2);
  });
});
