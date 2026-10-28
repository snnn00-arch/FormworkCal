import {
  BeamElement,
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
  FormworkHeight,
  getSkuTheme,
  PlacedPanel,
  Point,
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
 * Returns the 4 world-coordinate corners [p1, p2, p3, p4] of a PlacedPanel.
 */
export function getPlacedPanelPolygon(
  panel: PlacedPanel,
  parentBeam: BeamElement,
  pixelsPerCm: number
): [Point, Point, Point, Point] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const thicknessPx = FORMWORK_THICKNESS_CM * safeScale;

  const bDx = parentBeam.end.x - parentBeam.start.x;
  const bDy = parentBeam.end.y - parentBeam.start.y;
  const bLen = Math.hypot(bDx, bDy) || 1;
  const ux = bDx / bLen;
  const uy = bDy / bLen;
  const nx = -uy;
  const ny = ux;

  const isSingleEdge = parentBeam.attachMode === 'single_edge';
  const halfW = isSingleEdge ? 0 : (parentBeam.widthCm * safeScale) / 2;
  const sign = panel.side === 'left' ? 1 : -1;

  const sideCfg = panel.side === 'left' ? parentBeam.leftSide : parentBeam.rightSide;
  const startExtPx = (sideCfg.startExtensionCm || 0) * safeScale;

  const sideStartX = parentBeam.start.x + sign * nx * halfW - ux * startExtPx;
  const sideStartY = parentBeam.start.y + sign * ny * halfW - uy * startExtPx;

  const panelLenPx = panel.lengthCm * safeScale;
  const offsetPx = panel.offsetStartCm * safeScale;

  const p1 = {
    x: sideStartX + ux * offsetPx,
    y: sideStartY + uy * offsetPx,
  };
  const p2 = {
    x: p1.x + ux * panelLenPx,
    y: p1.y + uy * panelLenPx,
  };
  const p3 = {
    x: p2.x + sign * nx * thicknessPx,
    y: p2.y + sign * ny * thicknessPx,
  };
  const p4 = {
    x: p1.x + sign * nx * thicknessPx,
    y: p1.y + sign * ny * thicknessPx,
  };

  return [p1, p2, p3, p4];
}

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Automatically detects L-corners, T-junctions, and + intersections between beams/lines
 * and allocates non-overlapping extensions so Horizontal and Vertical formwork strips
 * butt cleanly without colliding at corners.
 */
export function applyAutoCornerExtensions(
  beams: BeamElement[],
  pixelsPerCm: number
): BeamElement[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const snapThresholdPx = 28 * safeScale; // within 28 cm

  // 1. Deduplicate identical overlapping collinear edges/beams
  const deduplicated: BeamElement[] = [];
  for (const b of beams) {
    const isH = Math.abs(b.end.x - b.start.x) >= Math.abs(b.end.y - b.start.y);
    const bCoord = isH ? (b.start.y + b.end.y) / 2 : (b.start.x + b.end.x) / 2;
    const bMin = isH ? Math.min(b.start.x, b.end.x) : Math.min(b.start.y, b.end.y);
    const bMax = isH ? Math.max(b.start.x, b.end.x) : Math.max(b.start.y, b.end.y);
    const bSpan = Math.max(1, bMax - bMin);

    const isDup = deduplicated.some((ex) => {
      if ((ex.attachMode || 'dual_beam') !== (b.attachMode || 'dual_beam')) return false;
      const exH = Math.abs(ex.end.x - ex.start.x) >= Math.abs(ex.end.y - ex.start.y);
      if (exH !== isH) return false;
      const exCoord = exH ? (ex.start.y + ex.end.y) / 2 : (ex.start.x + ex.end.x) / 2;
      if (Math.abs(exCoord - bCoord) > 4 * safeScale) return false;
      const exMin = exH ? Math.min(ex.start.x, ex.end.x) : Math.min(ex.start.y, ex.end.y);
      const exMax = exH ? Math.max(ex.start.x, ex.end.x) : Math.max(ex.start.y, ex.end.y);
      const overlap = Math.min(bMax, exMax) - Math.max(bMin, exMin);
      return overlap > Math.min(bSpan, Math.max(1, exMax - exMin)) * 0.8;
    });

    if (!isDup) {
      deduplicated.push(b);
    }
  }

  return deduplicated.map((beam) => {
    const bDx = beam.end.x - beam.start.x;
    const bDy = beam.end.y - beam.start.y;
    const bLen = Math.hypot(bDx, bDy) || 1;
    const ux = bDx / bLen;
    const uy = bDy / bLen;
    // Left normal (-uy, ux)
    const nx = -uy;
    const ny = ux;
    const isHorizontal = Math.abs(bDx) >= Math.abs(bDy);

    // Single-edge mode (วาดคานวงใน / วงนอก / ตีกรอบวงใน / วงนอก)
    if (beam.attachMode === 'single_edge') {
      const leftActive = beam.leftSide.enabled !== false;
      const rightActive = beam.rightSide.enabled !== false;
      const activeSign = leftActive ? 1 : -1;

      const cornerTol = Math.max(8, 12 * safeScale);
      const computeSingleEdgeCornerExt = (pt: Point, currentExt: number): number => {
        let bestPartner: BeamElement | null = null;
        let bestDist = Infinity;

        for (const other of deduplicated) {
          if (other.id === beam.id) continue;
          const oDx = other.end.x - other.start.x;
          const oDy = other.end.y - other.start.y;
          const otherIsH = Math.abs(oDx) >= Math.abs(oDy);
          if (otherIsH === isHorizontal) continue;

          const d = pointToSegmentDist(pt, other.start, other.end);
          if (d <= cornerTol && d < bestDist) {
            bestDist = d;
            bestPartner = other;
          }
        }

        if (!bestPartner) {
          return currentExt;
        }

        const distStart = Math.hypot(pt.x - bestPartner.start.x, pt.y - bestPartner.start.y);
        const distEnd = Math.hypot(pt.x - bestPartner.end.x, pt.y - bestPartner.end.y);

        // If pt lands in the middle/interior of bestPartner (T-junction against a continuous formwork line)
        if (distStart > cornerTol && distEnd > cornerTol) {
          const pDx = bestPartner.end.x - bestPartner.start.x;
          const pDy = bestPartner.end.y - bestPartner.start.y;
          const pLen = Math.hypot(pDx, pDy) || 1;
          const pNx = -pDy / pLen;
          const pNy = pDx / pLen;
          const pSign = bestPartner.leftSide.enabled !== false ? 1 : -1;
          const bMid = {
            x: (beam.start.x + beam.end.x) / 2,
            y: (beam.start.y + beam.end.y) / 2,
          };
          const dotPartnerN =
            (bMid.x - pt.x) * (pNx * pSign) + (bMid.y - pt.y) * (pNy * pSign);
          return dotPartnerN > 0 ? -FORMWORK_THICKNESS_CM : 0;
        }

        const farPt = distStart <= distEnd ? bestPartner.end : bestPartner.start;
        const dotActiveN =
          (farPt.x - pt.x) * (nx * activeSign) + (farPt.y - pt.y) * (ny * activeSign);

        if (dotActiveN > 0) {
          // Formwork is on the INSIDE of the corner (e.g., ตีกรอบวงนอก where formwork stays inside the drawn box, or inner corner)
          // Never overshoot the corner (0 for horizontal, -5cm for vertical so corners never overlap and never leave the drawn box!)
          return isHorizontal ? 0 : -FORMWORK_THICKNESS_CM;
        } else {
          // Formwork is on the OUTSIDE of the corner (e.g., outer corner wrap)
          return isHorizontal ? FORMWORK_THICKNESS_CM : 0;
        }
      };

      const curStartExt = leftActive
        ? beam.leftSide.startExtensionCm || 0
        : beam.rightSide.startExtensionCm || 0;
      const curEndExt = leftActive
        ? beam.leftSide.endExtensionCm || 0
        : beam.rightSide.endExtensionCm || 0;

      const extStart = computeSingleEdgeCornerExt(beam.start, curStartExt);
      const extEnd = computeSingleEdgeCornerExt(beam.end, curEndExt);

      return {
        ...beam,
        thicknessCm: FORMWORK_THICKNESS_CM,
        leftSide: {
          ...beam.leftSide,
          startExtensionCm: leftActive ? extStart : 0,
          endExtensionCm: leftActive ? extEnd : 0,
        },
        rightSide: {
          ...beam.rightSide,
          startExtensionCm: rightActive ? extStart : 0,
          endExtensionCm: rightActive ? extEnd : 0,
        },
      };
    }

    // Dual-beam mode (from Auto-Detect or standard centerline beams)
    const computeEndpointExtensions = (
      pt: Point,
      dirSign: 1 | -1 // -1 for start, +1 for end
    ): { leftExt: number; rightExt: number } => {
      let leftExt: number | null = null;
      let rightExt: number | null = null;

      // Check if another collinear beam continues straight past this endpoint
      const hasCollinearContinuation = deduplicated.some((other) => {
        if (other.id === beam.id) return false;
        const oDx = other.end.x - other.start.x;
        const oDy = other.end.y - other.start.y;
        const otherIsH = Math.abs(oDx) >= Math.abs(oDy);
        if (otherIsH !== isHorizontal) return false;
        const distToStart = Math.hypot(pt.x - other.start.x, pt.y - other.start.y);
        const distToEnd = Math.hypot(pt.x - other.end.x, pt.y - other.end.y);
        if (Math.min(distToStart, distToEnd) > snapThresholdPx) return false;
        const oMid = { x: (other.start.x + other.end.x) / 2, y: (other.start.y + other.end.y) / 2 };
        const dotU = (oMid.x - pt.x) * (ux * dirSign) + (oMid.y - pt.y) * (uy * dirSign);
        return dotU > 5 * safeScale;
      });

      for (const other of deduplicated) {
        if (other.id === beam.id) continue;
        const oDx = other.end.x - other.start.x;
        const oDy = other.end.y - other.start.y;
        const otherIsH = Math.abs(oDx) >= Math.abs(oDy);
        if (otherIsH === isHorizontal) continue;

        const dist = pointToSegmentDist(pt, other.start, other.end);
        if (dist > snapThresholdPx) continue;

        const halfPerpW = Math.round((other.widthCm || 20) / 2);
        const dotN1 = ((other.start.x - pt.x) * nx + (other.start.y - pt.y) * ny) / safeScale;
        const dotN2 = ((other.end.x - pt.x) * nx + (other.end.y - pt.y) * ny) / safeScale;
        const maxDotN = Math.max(dotN1, dotN2);
        const minDotN = Math.min(dotN1, dotN2);

        const extendsLeft = maxDotN > halfPerpW + 4;
        const extendsRight = minDotN < -(halfPerpW + 4);

        // Inner corner on Left side (+n): perpendicular beam blocks Left side
        if (extendsLeft) {
          leftExt = isHorizontal ? -halfPerpW : -(halfPerpW + FORMWORK_THICKNESS_CM);
        } else if (extendsRight && !hasCollinearContinuation) {
          // Outer L-corner on Left side: Horizontal wraps (+halfW + 5cm), Vertical butts flush (+halfW)
          leftExt = isHorizontal ? halfPerpW + FORMWORK_THICKNESS_CM : halfPerpW;
        }

        // Inner corner on Right side (-n): perpendicular beam blocks Right side
        if (extendsRight) {
          rightExt = isHorizontal ? -halfPerpW : -(halfPerpW + FORMWORK_THICKNESS_CM);
        } else if (extendsLeft && !hasCollinearContinuation) {
          // Outer L-corner on Right side: Horizontal wraps (+halfW + 5cm), Vertical butts flush (+halfW)
          rightExt = isHorizontal ? halfPerpW + FORMWORK_THICKNESS_CM : halfPerpW;
        }
      }

      return {
        leftExt: leftExt ?? 0,
        rightExt: rightExt ?? 0,
      };
    };

    const startExts = computeEndpointExtensions(beam.start, -1);
    const endExts = computeEndpointExtensions(beam.end, 1);

    return {
      ...beam,
      thicknessCm: FORMWORK_THICKNESS_CM,
      leftSide: {
        ...beam.leftSide,
        startExtensionCm: startExts.leftExt,
        endExtensionCm: endExts.leftExt,
      },
      rightSide: {
        ...beam.rightSide,
        startExtensionCm: startExts.rightExt,
        endExtensionCm: endExts.rightExt,
      },
    };
  });
}

interface StripDescriptor {
  beamIdx: number;
  beam: BeamElement;
  side: 'left' | 'right';
  isHorizontal: boolean;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  sign: 1 | -1;
  sideStartX: number;
  sideStartY: number;
  totalSideLengthCm: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function subtractInterval(
  intervals: Array<[number, number]>,
  cutStart: number,
  cutEnd: number
): Array<[number, number]> {
  if (cutEnd <= cutStart) return intervals;
  const next: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    if (cutEnd <= a || cutStart >= b) {
      next.push([a, b]);
    } else {
      if (cutStart > a) next.push([a, cutStart]);
      if (cutEnd < b) next.push([cutEnd, b]);
    }
  }
  return next;
}

export function computeAllBeamPanels(
  beams: BeamElement[],
  pixelsPerCm: number
): PlacedPanel[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const thicknessPx = FORMWORK_THICKNESS_CM * safeScale;
  const allPanels: PlacedPanel[] = [];

  // Precompute strip bounding descriptors for all active auto-placed sides
  const strips: StripDescriptor[] = [];

  beams.forEach((beam, beamIdx) => {
    const baseLengthCm = getBeamLengthCm(beam, safeScale);
    const bDx = beam.end.x - beam.start.x;
    const bDy = beam.end.y - beam.start.y;
    const bLen = Math.hypot(bDx, bDy) || 1;
    const ux = bDx / bLen;
    const uy = bDy / bLen;
    const nx = -uy;
    const ny = ux;
    const isHorizontal = Math.abs(bDx) >= Math.abs(bDy);
    const isSingleEdge = beam.attachMode === 'single_edge';
    const halfW = isSingleEdge ? 0 : (beam.widthCm * safeScale) / 2;

    for (const sideKey of ['leftSide', 'rightSide'] as const) {
      const sideCfg = beam[sideKey];
      if (sideCfg.enabled === false) continue;

      const sign: 1 | -1 = sideCfg.side === 'left' ? 1 : -1;
      const startExtPx = (sideCfg.startExtensionCm || 0) * safeScale;
      const totalSideLengthCm = Math.max(
        0,
        baseLengthCm + (sideCfg.startExtensionCm || 0) + (sideCfg.endExtensionCm || 0)
      );
      const totalLenPx = totalSideLengthCm * safeScale;

      const sideStartX = beam.start.x + sign * nx * halfW - ux * startExtPx;
      const sideStartY = beam.start.y + sign * ny * halfW - uy * startExtPx;

      const c1 = { x: sideStartX, y: sideStartY };
      const c2 = { x: sideStartX + ux * totalLenPx, y: sideStartY + uy * totalLenPx };
      const c3 = { x: c2.x + sign * nx * thicknessPx, y: c2.y + sign * ny * thicknessPx };
      const c4 = { x: c1.x + sign * nx * thicknessPx, y: c1.y + sign * ny * thicknessPx };

      strips.push({
        beamIdx,
        beam,
        side: sideCfg.side,
        isHorizontal,
        ux,
        uy,
        nx,
        ny,
        sign,
        sideStartX,
        sideStartY,
        totalSideLengthCm,
        minX: Math.min(c1.x, c2.x, c3.x, c4.x),
        maxX: Math.max(c1.x, c2.x, c3.x, c4.x),
        minY: Math.min(c1.y, c2.y, c3.y, c4.y),
        maxY: Math.max(c1.y, c2.y, c3.y, c4.y),
      });
    }
  });

  // Generate collision-free panels for each strip
  for (let sIdx = 0; sIdx < strips.length; sIdx++) {
    const st = strips[sIdx];
    const sideCfg = st.side === 'left' ? st.beam.leftSide : st.beam.rightSide;

    if (sideCfg.customPanels && sideCfg.customPanels.length > 0) {
      let offset = 0;
      for (const cp of sideCfg.customPanels) {
        allPanels.push({
          ...cp,
          beamId: st.beam.id,
          beamName: st.beam.name,
          side: sideCfg.side,
          thicknessCm: FORMWORK_THICKNESS_CM,
          offsetStartCm: offset,
          skuTheme: cp.skuTheme || getSkuTheme(cp.lengthCm, cp.heightCm, cp.type === 'free'),
        });
        offset += cp.lengthCm;
      }
      continue;
    }

    let intervals: Array<[number, number]> = [[0, st.totalSideLengthCm]];

    // 1. Cut out interior T-junctions & + Cross-junctions where a perpendicular beam (เช่น คานซอย)
    // branches off or crosses this side of the beam, so formwork NEVER covers the secondary beam!
    for (const other of beams) {
      if (other.id === st.beam.id) continue;
      if (other.attachMode === 'single_edge') continue;
      const oDx = other.end.x - other.start.x;
      const oDy = other.end.y - other.start.y;
      const otherIsH = Math.abs(oDx) >= Math.abs(oDy);
      if (otherIsH === st.isHorizontal) continue;

      // Project other's start and end onto st's outward normal (st.nx * st.sign, st.ny * st.sign)
      const d1Cm =
        (((other.start.x - st.beam.start.x) * st.nx +
          (other.start.y - st.beam.start.y) * st.ny) *
          st.sign) /
        safeScale;
      const d2Cm =
        (((other.end.x - st.beam.start.x) * st.nx +
          (other.end.y - st.beam.start.y) * st.ny) *
          st.sign) /
        safeScale;
      const minOutwardCm = Math.min(d1Cm, d2Cm);
      const maxOutwardCm = Math.max(d1Cm, d2Cm);

      // If other reaches or crosses st.beam (minOutwardCm <= 28cm) AND extends outward onto st.side (maxOutwardCm >= 12cm)
      if (minOutwardCm <= 28 && maxOutwardCm >= 12) {
        const otherMid = {
          x: (other.start.x + other.end.x) / 2,
          y: (other.start.y + other.end.y) / 2,
        };
        const centerCm =
          ((otherMid.x - st.sideStartX) * st.ux + (otherMid.y - st.sideStartY) * st.uy) /
          safeScale;

        // If this secondary beam / perpendicular beam hits inside the span of st
        if (centerCm > 5 && centerCm < st.totalSideLengthCm - 5) {
          const halfOtherW = Math.round((other.widthCm || 20) / 2);
          const halfCutCm = st.isHorizontal
            ? halfOtherW
            : halfOtherW + FORMWORK_THICKNESS_CM;
          intervals = subtractInterval(intervals, centerCm - halfCutCm, centerCm + halfCutCm);
        }
      }
    }

    // 2. Cut out any 2D strip-vs-strip overlap with higher-priority strips
    // Priority: Horizontal strips > Vertical strips; then earlier beamIdx > later beamIdx
    for (let oIdx = 0; oIdx < strips.length; oIdx++) {
      if (oIdx === sIdx) continue;
      const otherSt = strips[oIdx];
      if (otherSt.beam.id === st.beam.id && otherSt.side === st.side) continue;

      const otherHasPriority =
        (otherSt.isHorizontal && !st.isHorizontal) ||
        (otherSt.isHorizontal === st.isHorizontal && oIdx < sIdx);
      if (!otherHasPriority) continue;

      const ovMinX = Math.max(st.minX, otherSt.minX);
      const ovMaxX = Math.min(st.maxX, otherSt.maxX);
      const ovMinY = Math.max(st.minY, otherSt.minY);
      const ovMaxY = Math.min(st.maxY, otherSt.maxY);

      if (ovMaxX - ovMinX > 0.8 * safeScale && ovMaxY - ovMinY > 0.8 * safeScale) {
        // Project the overlapping box onto st's direction vector (ux, uy)
        const c1 =
          ((ovMinX - st.sideStartX) * st.ux + (ovMinY - st.sideStartY) * st.uy) / safeScale;
        const c2 =
          ((ovMaxX - st.sideStartX) * st.ux + (ovMinY - st.sideStartY) * st.uy) / safeScale;
        const c3 =
          ((ovMaxX - st.sideStartX) * st.ux + (ovMaxY - st.sideStartY) * st.uy) / safeScale;
        const c4 =
          ((ovMinX - st.sideStartX) * st.ux + (ovMaxY - st.sideStartY) * st.uy) / safeScale;

        const cutStart = Math.floor(Math.min(c1, c2, c3, c4));
        const cutEnd = Math.ceil(Math.max(c1, c2, c3, c4));
        intervals = subtractInterval(intervals, cutStart, cutEnd);
      }
    }

    // 3. Optimize standard + free panels within each unobstructed interval
    let segIdx = 1;
    for (const [segStart, segEnd] of intervals) {
      const cleanStart = Math.round(segStart);
      const cleanLen = Math.round(segEnd - segStart);
      if (cleanLen <= 0) continue;

      const segPanels = optimizeSingleSidePanels(
        cleanLen,
        sideCfg.heightCm,
        st.beam.id,
        st.beam.name,
        sideCfg.side
      );
      for (const p of segPanels) {
        allPanels.push({
          ...p,
          id: `${p.id}-s${segIdx}`,
          offsetStartCm: cleanStart + p.offsetStartCm,
        });
      }
      segIdx++;
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
