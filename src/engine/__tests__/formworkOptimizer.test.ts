import { describe, it, expect } from 'vitest';
import {
  optimizeSingleSidePanels,
  applyAutoCornerExtensions,
  computeAllBeamPanels,
  computeRentalSummary,
  getPlacedPanelPolygon,
} from '../formworkOptimizer';
import { createEdgesFromBoxTool } from '../beamDetector';
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

  it('allocates non-overlapping outer and inner corner extensions when two perpendicular beams meet at an L-corner or Cross-junction', () => {
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
    // Horizontal beam wraps outer corner (+15cm = halfW 10cm + 5cm formwork) and sets back inner corner (-10cm)
    expect(adjusted[0].rightSide.endExtensionCm).toBe(15);
    expect(adjusted[0].leftSide.endExtensionCm).toBe(-10);
    // Vertical beam: leftSide (-x, inner corner) sets back (-15cm), rightSide (+x, outer corner) butts flush (+10cm)
    expect(adjusted[1].leftSide.startExtensionCm).toBe(-15);
    expect(adjusted[1].rightSide.startExtensionCm).toBe(10);

    // Verify 0 2D overlap across all generated panels for both L-corner and Box tool
    const checkNoOverlaps = (testBeams: BeamElement[]) => {
      const panels = computeAllBeamPanels(testBeams, 1);
      const boxes = panels.map((p) => {
        const parent = testBeams.find((b) => b.id === p.beamId)!;
        const poly = getPlacedPanelPolygon(p, parent, 1);
        return {
          id: p.id,
          minX: Math.min(...poly.map((pt) => pt.x)),
          maxX: Math.max(...poly.map((pt) => pt.x)),
          minY: Math.min(...poly.map((pt) => pt.y)),
          maxY: Math.max(...poly.map((pt) => pt.y)),
        };
      });

      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const ovX = Math.min(boxes[i].maxX, boxes[j].maxX) - Math.max(boxes[i].minX, boxes[j].minX);
          const ovY = Math.min(boxes[i].maxY, boxes[j].maxY) - Math.max(boxes[i].minY, boxes[j].minY);
          expect(ovX > 0.5 && ovY > 0.5).toBe(false);
        }
      }
    };

    checkNoOverlaps(adjusted);

    const boxEdges = applyAutoCornerExtensions(
      createEdgesFromBoxTool('S1', { x: 100, y: 100 }, { x: 500, y: 400 }, 'inner', 60, 1, 20, true),
      1
    );
    checkNoOverlaps(boxEdges);

    // Outer Box (ตีกรอบวงนอก): verify ALL panels stay strictly within the drawn box [100, 500] x [100, 400] and never overlap
    const outerBoxEdges = applyAutoCornerExtensions(
      createEdgesFromBoxTool('S2', { x: 100, y: 100 }, { x: 500, y: 400 }, 'outer', 60, 1, 20, true),
      1
    );
    checkNoOverlaps(outerBoxEdges);
    const outerBoxPanels = computeAllBeamPanels(outerBoxEdges, 1);
    for (const p of outerBoxPanels) {
      const parent = outerBoxEdges.find((b) => b.id === p.beamId)!;
      const poly = getPlacedPanelPolygon(p, parent, 1);
      for (const pt of poly) {
        expect(pt.x).toBeGreaterThanOrEqual(100 - 0.1);
        expect(pt.x).toBeLessThanOrEqual(500 + 0.1);
        expect(pt.y).toBeGreaterThanOrEqual(100 - 0.1);
        expect(pt.y).toBeLessThanOrEqual(400 + 0.1);
      }
    }

    // Secondary Beam (คานซอย) T-junction: main beam B_main (0, 200)->(600, 200) met by secondary beam B_sec (300, 210)->(300, 500)
    const tJunctionBeams = applyAutoCornerExtensions(
      [
        {
          id: 'b-main',
          name: 'B1',
          start: { x: 0, y: 200 },
          end: { x: 600, y: 200 },
          widthCm: 20,
          defaultHeightCm: 60,
          thicknessCm: 5,
          leftSide: { side: 'left', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
          rightSide: { side: 'right', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
        },
        {
          id: 'b-sec',
          name: 'B2 (คานซอย)',
          start: { x: 300, y: 210 },
          end: { x: 300, y: 500 },
          widthCm: 20,
          defaultHeightCm: 60,
          thicknessCm: 5,
          leftSide: { side: 'left', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
          rightSide: { side: 'right', heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
        },
      ],
      1
    );
    checkNoOverlaps(tJunctionBeams);
    // Ensure main beam's bottom side (leftSide, +y) has NO panel covering the secondary beam mouth x in (291, 309)
    const tPanels = computeAllBeamPanels(tJunctionBeams, 1);
    const mainBottomPanels = tPanels.filter((p) => p.beamId === 'b-main' && p.side === 'left');
    for (const mp of mainBottomPanels) {
      const poly = getPlacedPanelPolygon(mp, tJunctionBeams[0], 1);
      const minX = Math.min(...poly.map((pt) => pt.x));
      const maxX = Math.max(...poly.map((pt) => pt.x));
      const overlapsSecondaryMouth = Math.min(maxX, 309) - Math.max(minX, 291) > 1;
      expect(overlapsSecondaryMouth).toBe(false);
    }
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


