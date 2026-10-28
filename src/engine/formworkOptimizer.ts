import {
  BeamElement,
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
  FormworkHeight,
  getSkuTheme,
  PlacedPanel,
  RentalSummaryReport,
  STANDARD_LENGTHS,
  StandardPanelLength,
} from '../types/formwork';

interface ComboResult {
  counts: Record<StandardPanelLength, number>;
  coveredLength: number;
  remainder: number;
  totalPanels: number;
}

/**
 * Finds the combination of {120, 100, 50} cm panels <= targetLengthCm that:
 * 1. Minimizes the remainder (free length)
 * 2. Tie-breaks by minimum total number of standard panels
 * 3. Tie-breaks by preferring more 120 cm panels, then 100 cm panels
 */
export function findOptimalPanelCombination(targetLengthCm: number): ComboResult {
  const cleanLength = Math.max(0, Math.round(targetLengthCm));
  let best: ComboResult = {
    counts: { 120: 0, 100: 0, 50: 0 },
    coveredLength: 0,
    remainder: cleanLength,
    totalPanels: 0,
  };

  const max120 = Math.floor(cleanLength / 120);
  for (let c120 = max120; c120 >= 0; c120--) {
    const remAfter120 = cleanLength - c120 * 120;
    const max100 = Math.floor(remAfter120 / 100);
    for (let c100 = max100; c100 >= 0; c100--) {
      const remAfter100 = remAfter120 - c100 * 100;
      const c50 = Math.floor(remAfter100 / 50);
      const covered = c120 * 120 + c100 * 100 + c50 * 50;
      const remainder = cleanLength - covered;
      const totalPanels = c120 + c100 + c50;

      const isBetterRemainder = remainder < best.remainder;
      const isSameRemainderFewerPanels =
        remainder === best.remainder && totalPanels < best.totalPanels;
      const isSameRemainderSamePanelsMore120 =
        remainder === best.remainder &&
        totalPanels === best.totalPanels &&
        c120 > best.counts[120];

      if (
        (best.coveredLength === 0 && covered > 0) ||
        isBetterRemainder ||
        isSameRemainderFewerPanels ||
        isSameRemainderSamePanelsMore120
      ) {
        best = {
          counts: { 120: c120, 100: c100, 50: c50 },
          coveredLength: covered,
          remainder,
          totalPanels,
        };
      }
    }
  }

  return best;
}

export function optimizeSingleSidePanels(
  targetLengthCm: number,
  heightCm: FormworkHeight,
  beamId: string,
  beamName: string,
  side: 'left' | 'right'
): PlacedPanel[] {
  const cleanLength = Math.max(0, Math.round(targetLengthCm));
  if (cleanLength === 0) return [];

  const combo = findOptimalPanelCombination(cleanLength);
  const panels: PlacedPanel[] = [];
  let offset = 0;
  let index = 1;

  for (const lengthSize of STANDARD_LENGTHS) {
    const count = combo.counts[lengthSize];
    for (let i = 0; i < count; i++) {
      panels.push({
        id: `${beamId}-${side}-std-${index++}`,
        beamId,
        beamName,
        side,
        type: 'standard',
        lengthCm: lengthSize,
        heightCm,
        thicknessCm: FORMWORK_THICKNESS_CM,
        offsetStartCm: offset,
        skuTheme: getSkuTheme(lengthSize, heightCm, false),
      });
      offset += lengthSize;
    }
  }

  if (combo.remainder > 0) {
    panels.push({
      id: `${beamId}-${side}-free`,
      beamId,
      beamName,
      side,
      type: 'free',
      lengthCm: combo.remainder,
      heightCm,
      thicknessCm: FORMWORK_THICKNESS_CM,
      offsetStartCm: offset,
      skuTheme: getSkuTheme(combo.remainder, heightCm, true),
    });
  }

  return panels;
}

export function getBeamLengthCm(beam: BeamElement, pixelsPerCm: number): number {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const dx = beam.end.x - beam.start.x;
  const dy = beam.end.y - beam.start.y;
  return Math.round(Math.hypot(dx, dy) / safeScale);
}

/**
 * Automatically detects L-corners and T-junctions between beams and applies
 * +5 cm (FORMWORK_THICKNESS_CM) on outer corners so the 5 cm formwork wraps cleanly.
 */
export function applyAutoCornerExtensions(
  beams: BeamElement[],
  pixelsPerCm: number
): BeamElement[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const snapThresholdPx = 25 * safeScale; // within 25 cm

  return beams.map((beam) => {
    let leftStartExt = 0;
    let leftEndExt = 0;
    let rightStartExt = 0;
    let rightEndExt = 0;

    const bDx = beam.end.x - beam.start.x;
    const bDy = beam.end.y - beam.start.y;
    const bLen = Math.hypot(bDx, bDy) || 1;
    const ux = bDx / bLen;
    const uy = bDy / bLen;
    // Left normal (-uy, ux)
    const nx = -uy;
    const ny = ux;

    for (const other of beams) {
      if (other.id === beam.id) continue;

      const oMid = {
        x: (other.start.x + other.end.x) / 2,
        y: (other.start.y + other.end.y) / 2,
      };

      const startDist = Math.min(
        Math.hypot(beam.start.x - other.start.x, beam.start.y - other.start.y),
        Math.hypot(beam.start.x - other.end.x, beam.start.y - other.end.y)
      );
      if (startDist <= snapThresholdPx) {
        const toOtherX = oMid.x - beam.start.x;
        const toOtherY = oMid.y - beam.start.y;
        const dotNormal = toOtherX * nx + toOtherY * ny;
        // Outer side is opposite to the direction the intersecting beam turns
        if (dotNormal >= 0) {
          rightStartExt = FORMWORK_THICKNESS_CM;
        } else {
          leftStartExt = FORMWORK_THICKNESS_CM;
        }
      }

      const endDist = Math.min(
        Math.hypot(beam.end.x - other.start.x, beam.end.y - other.start.y),
        Math.hypot(beam.end.x - other.end.x, beam.end.y - other.end.y)
      );
      if (endDist <= snapThresholdPx) {
        const toOtherX = oMid.x - beam.end.x;
        const toOtherY = oMid.y - beam.end.y;
        const dotNormal = toOtherX * nx + toOtherY * ny;
        if (dotNormal >= 0) {
          rightEndExt = FORMWORK_THICKNESS_CM;
        } else {
          leftEndExt = FORMWORK_THICKNESS_CM;
        }
      }
    }

    return {
      ...beam,
      thicknessCm: FORMWORK_THICKNESS_CM,
      leftSide: {
        ...beam.leftSide,
        startExtensionCm:
          beam.edgeRole === 'inner'
            ? 0
            : Math.max(beam.leftSide.startExtensionCm || 0, leftStartExt),
        endExtensionCm:
          beam.edgeRole === 'inner'
            ? 0
            : Math.max(beam.leftSide.endExtensionCm || 0, leftEndExt),
      },
      rightSide: {
        ...beam.rightSide,
        startExtensionCm:
          beam.edgeRole === 'inner'
            ? 0
            : Math.max(beam.rightSide.startExtensionCm || 0, rightStartExt),
        endExtensionCm:
          beam.edgeRole === 'inner'
            ? 0
            : Math.max(beam.rightSide.endExtensionCm || 0, rightEndExt),
      },
    };
  });
}

export function computeAllBeamPanels(
  beams: BeamElement[],
  pixelsPerCm: number
): PlacedPanel[] {
  const allPanels: PlacedPanel[] = [];

  for (const beam of beams) {
    const baseLengthCm = getBeamLengthCm(beam, pixelsPerCm);

    for (const sideKey of ['leftSide', 'rightSide'] as const) {
      const sideCfg = beam[sideKey];
      if (sideCfg.enabled === false) continue;

      if (sideCfg.customPanels && sideCfg.customPanels.length > 0) {
        let offset = 0;
        for (const cp of sideCfg.customPanels) {
          allPanels.push({
            ...cp,
            beamId: beam.id,
            beamName: beam.name,
            side: sideCfg.side,
            thicknessCm: FORMWORK_THICKNESS_CM,
            offsetStartCm: offset,
            skuTheme: cp.skuTheme || getSkuTheme(cp.lengthCm, cp.heightCm, cp.type === 'free'),
          });
          offset += cp.lengthCm;
        }
      } else {
        const totalSideLengthCm = Math.max(
          0,
          baseLengthCm + sideCfg.startExtensionCm + sideCfg.endExtensionCm
        );
        const sidePanels = optimizeSingleSidePanels(
          totalSideLengthCm,
          sideCfg.heightCm,
          beam.id,
          beam.name,
          sideCfg.side
        );
        allPanels.push(...sidePanels);
      }
    }
  }

  return allPanels;
}

export function computeRentalSummary(panels: PlacedPanel[]): RentalSummaryReport {
  const matrix: Record<StandardPanelLength, Record<FormworkHeight, number>> = {
    120: { 40: 0, 50: 0, 60: 0, 70: 0 },
    100: { 40: 0, 50: 0, 60: 0, 70: 0 },
    50: { 40: 0, 50: 0, 60: 0, 70: 0 },
  };
  const totalsByLength: Record<StandardPanelLength, number> = { 120: 0, 100: 0, 50: 0 };
  const totalsByHeight: Record<FormworkHeight, number> = { 40: 0, 50: 0, 60: 0, 70: 0 };
  const freeTotalsByHeightCm: Record<FormworkHeight, { count: number; totalLengthCm: number }> = {
    40: { count: 0, totalLengthCm: 0 },
    50: { count: 0, totalLengthCm: 0 },
    60: { count: 0, totalLengthCm: 0 },
    70: { count: 0, totalLengthCm: 0 },
  };

  let totalStandardPanels = 0;
  let totalStandardAreaSqm = 0;
  let totalFreeLengthCm = 0;
  const freeItems: RentalSummaryReport['freeItems'] = [];

  for (const panel of panels) {
    const h = FORMWORK_HEIGHTS.includes(panel.heightCm) ? panel.heightCm : 60;
    if (
      panel.type === 'standard' &&
      (panel.lengthCm === 120 || panel.lengthCm === 100 || panel.lengthCm === 50)
    ) {
      matrix[panel.lengthCm][h] += 1;
      totalsByLength[panel.lengthCm] += 1;
      totalsByHeight[h] += 1;
      totalStandardPanels += 1;
      totalStandardAreaSqm += (panel.lengthCm / 100) * (h / 100);
    } else {
      freeItems.push({
        id: panel.id,
        beamName: panel.beamName,
        side: panel.side,
        lengthCm: panel.lengthCm,
        heightCm: h,
        thicknessCm: FORMWORK_THICKNESS_CM,
        skuTheme: panel.skuTheme || getSkuTheme(panel.lengthCm, h, true),
      });
      freeTotalsByHeightCm[h].count += 1;
      freeTotalsByHeightCm[h].totalLengthCm += panel.lengthCm;
      totalFreeLengthCm += panel.lengthCm;
    }
  }

  return {
    matrix,
    totalsByLength,
    totalsByHeight,
    totalStandardPanels,
    totalStandardAreaSqm: Number(totalStandardAreaSqm.toFixed(2)),
    freeItems,
    freeTotalsByHeightCm,
    totalFreeLengthCm,
  };
}
