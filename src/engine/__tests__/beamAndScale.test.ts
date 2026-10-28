import { describe, it, expect } from 'vitest';
import {
  calculateScaleFromTwoPoints,
  autoDetectScaleFromPlanData,
  RawVectorLine,
  RawTextItem,
} from '../scaleCalibrator';
import {
  autoDetectBeamsFromVectorLines,
  autoDetectBeamsWithDiagnostics,
  classifyPlanLines,
  createEdgesFromLineTool,
  createEdgesFromBoxTool,
  inferBeamHeightFromNearbyTexts,
  generateSampleBeamPlan,
} from '../beamDetector';
import { computeAllBeamPanels } from '../formworkOptimizer';

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

  it('classifies and filters out paper border frames, title blocks, dashed grid lines, and dimension lines while detecting only real beams', () => {
    const pageDimensions = { width: 1200, height: 900 };
    const lines: RawVectorLine[] = [
      // 1. Double-line paper border frame near sheet margins (should be border_or_titleblock)
      { x1: 20, y1: 25, x2: 1180, y2: 25 },
      { x1: 35, y1: 40, x2: 1165, y2: 40 },
      { x1: 20, y1: 875, x2: 1180, y2: 875 },
      { x1: 20, y1: 25, x2: 20, y2: 875 },
      { x1: 1180, y1: 25, x2: 1180, y2: 875 },

      // 2. Dashed / collinear centerline grid line along y = 300 (4 short dashes -> grid_or_dimension)
      { x1: 120, y1: 300, x2: 200, y2: 300 },
      { x1: 230, y1: 300, x2: 310, y2: 300 },
      { x1: 340, y1: 300, x2: 420, y2: 300 },
      { x1: 450, y1: 300, x2: 530, y2: 300 },

      // 3. Exterior dimension line with "4.00" label (should be grid_or_dimension)
      { x1: 200, y1: 140, x2: 600, y2: 140 },
      { x1: 200, y1: 160, x2: 600, y2: 160 },

      // 4. True structural beam B1 (parallel edges at y = 290 and y = 310, aligned from x = 200 to 600)
      { x1: 200, y1: 290, x2: 600, y2: 290 },
      { x1: 200, y1: 310, x2: 600, y2: 310 },

      // 5. Single full-span grid line shooting across the drawing with mismatching length (should not pair with beam)
      { x1: 80, y1: 480, x2: 1050, y2: 480 },
    ];

    const texts: RawTextItem[] = [
      { text: '4.00', x: 400, y: 138 },
      { text: '4.00', x: 400, y: 158 },
      { text: 'B1', x: 400, y: 300 },
    ];

    const classified = classifyPlanLines(lines, texts, pageDimensions);
    expect(classified.filter((c) => c.category === 'border_or_titleblock').length).toBe(5);
    expect(classified.filter((c) => c.category === 'grid_or_dimension').length).toBeGreaterThanOrEqual(6);

    const diag = autoDetectBeamsWithDiagnostics(lines, 1.0, 60, texts, pageDimensions);
    expect(diag.beams.length).toBe(1);
    expect(diag.beams[0].name).toBe('B1');
    expect(diag.beams[0].start).toEqual({ x: 200, y: 300 });
    expect(diag.beams[0].end).toEqual({ x: 600, y: 300 });
    expect(diag.counts.horizontalGrids).toBeGreaterThanOrEqual(1);
    expect(diag.counts.gridGuidedBeams).toBe(1);
  });

  it('uses detected grid lines as reference axes to detect beams on grids, crossing grids, or with only one visible edge alongside a grid', () => {
    const pageDimensions = { width: 1200, height: 900 };
    const lines: RawVectorLine[] = [
      // Vertical Grid 1 at x = 200 (full-span grid line)
      { x1: 200, y1: 80, x2: 200, y2: 820 },
      // Vertical Grid 2 at x = 600 (full-span grid line)
      { x1: 600, y1: 80, x2: 600, y2: 820 },
      // Horizontal Grid A at y = 250 (full-span grid line)
      { x1: 80, y1: 250, x2: 1080, y2: 250 },
      // Horizontal Grid B at y = 550 (full-span grid line)
      { x1: 80, y1: 550, x2: 1080, y2: 550 },

      // Case A: Beam B1 on Horizontal Grid A (y = 250), broken into split segments by column faces
      { x1: 210, y1: 240, x2: 390, y2: 240 },
      { x1: 410, y1: 240, x2: 590, y2: 240 },
      { x1: 210, y1: 260, x2: 590, y2: 260 },

      // Case B: Beam B2 on Horizontal Grid B (y = 550) where ONLY ONE beam edge (y = 540) is visible next to the grid line
      { x1: 205, y1: 540, x2: 595, y2: 540 },

      // Case C: Secondary Beam B3 crossing between Vertical Grid 1 (x = 200) and Vertical Grid 2 (x = 600) at y = 400
      { x1: 205, y1: 390, x2: 595, y2: 390 },
      { x1: 205, y1: 410, x2: 595, y2: 410 },
    ];

    const texts: RawTextItem[] = [
      { text: '1', x: 200, y: 75 },
      { text: '2', x: 600, y: 75 },
      { text: 'A', x: 75, y: 250 },
      { text: 'B', x: 75, y: 550 },
      { text: 'B1', x: 400, y: 250 },
      { text: 'B2', x: 400, y: 550 },
      { text: 'B3', x: 400, y: 400 },
      // Case D: Beam B4 on Vertical Grid 1 (x = 200) between Grid A (250) and Grid B (550) recovered by tag + grid intersection
      { text: 'B4', x: 200, y: 400 },
    ];

    const diag = autoDetectBeamsWithDiagnostics(lines, 1.0, 60, texts, pageDimensions);
    expect(diag.counts.horizontalGrids).toBeGreaterThanOrEqual(2);
    expect(diag.counts.verticalGrids).toBeGreaterThanOrEqual(2);
    expect(diag.beams.length).toBe(4);
    expect(diag.counts.gridGuidedBeams).toBe(4);

    const names = diag.beams.map((b) => b.name).sort();
    expect(names).toEqual(['B1', 'B2', 'B3', 'B4']);
  });

  it('generates a realistic sample beam plan with multiple heights (40, 50, 60, 70 cm)', () => {
    const sample = generateSampleBeamPlan();
    expect(sample.beams.length).toBeGreaterThanOrEqual(6);
    expect(sample.beams.every((b) => b.thicknessCm === 5)).toBe(true);
    expect(sample.beams.every((b) => b.widthCm === 20)).toBe(true);
    const heights = new Set(sample.beams.map((b) => b.defaultHeightCm));
    expect(heights.size).toBeGreaterThanOrEqual(2);
  });

  it('creates single-edge formwork strips for inner and outer perimeter lines and boxes with 20cm beam width offset', () => {
    // 1. Inner line tool (300 cm inner length at 1 px/cm) with auto-parallel 20cm pair
    const innerPair = createEdgesFromLineTool(
      'B1',
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      'inner',
      50,
      1.0,
      20,
      true
    );
    expect(innerPair.length).toBe(2);
    expect(innerPair[0].attachMode).toBe('single_edge');
    expect(innerPair[0].edgeRole).toBe('inner');
    expect(Math.hypot(innerPair[0].end.x - innerPair[0].start.x, innerPair[0].end.y - innerPair[0].start.y)).toBeCloseTo(300, 1);
    // Outer paired line is offset by 20cm and extended by 20cm at both ends (340 cm + 5cm corner wrap on each end)
    expect(innerPair[1].edgeRole).toBe('outer');
    expect(Math.hypot(innerPair[1].end.x - innerPair[1].start.x, innerPair[1].end.y - innerPair[1].start.y)).toBeCloseTo(340, 1);
    expect(innerPair[1].leftSide.startExtensionCm).toBe(5);
    expect(innerPair[1].leftSide.endExtensionCm).toBe(5);

    const panels = computeAllBeamPanels(innerPair, 1.0);
    // Only 1 enabled side per single-edge element -> 2 sides total
    expect(panels.length).toBeGreaterThan(0);

    // 2. Inner box tool around 400x300 cm slab opening
    const boxEdges = createEdgesFromBoxTool(
      'S1',
      { x: 200, y: 200 },
      { x: 600, y: 500 },
      'inner',
      50,
      1.0,
      20,
      true
    );
    // 4 inner edges + 4 outer edges = 8 single-edge strips
    expect(boxEdges.length).toBe(8);
    expect(boxEdges.filter((e) => e.edgeRole === 'inner').length).toBe(4);
    expect(boxEdges.filter((e) => e.edgeRole === 'outer').length).toBe(4);
  });

  it('supports SPW-FORCON-ST-261022-01 patterns: 3-decimal dimensions (4.000), 1:75 scale, and T/B elevation beam height inference', () => {
    const lines: RawVectorLine[] = [{ x1: 100, y1: 50, x2: 500, y2: 50 }]; // 400 px
    const texts: RawTextItem[] = [
      { text: '4.000', x: 300, y: 45 },
      { text: '1 : 75', x: 900, y: 800 },
      { text: 'B1 T = +0.65', x: 300, y: 195 },
      { text: 'B = +0.15', x: 300, y: 215 },
    ];
    const scaleRes = autoDetectScaleFromPlanData(lines, texts);
    expect(scaleRes.pixelsPerCm).toBeCloseTo(1.0, 2);

    const inferredHeight = inferBeamHeightFromNearbyTexts(
      300,
      200,
      texts,
      60
    );
    // |0.65 - 0.15| = 0.50m = 50cm
    expect(inferredHeight).toBe(50);
  });
});


