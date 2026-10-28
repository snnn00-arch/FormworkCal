import {
  BeamElement,
  DEFAULT_BEAM_WIDTH_CM,
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
  FormworkHeight,
  Point,
} from '../types/formwork';
import { applyAutoCornerExtensions } from './formworkOptimizer';
import { RawTextItem, RawVectorLine } from './scaleCalibrator';

let beamCounter = 1;

export type LineCategory =
  | 'border_or_titleblock'
  | 'grid_or_dimension'
  | 'beam_candidate';

export interface ClassifiedLine {
  line: RawVectorLine;
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  coord: number;  // y for horizontal, x for vertical
  start: number;  // minX for horizontal, minY for vertical
  end: number;    // maxX for horizontal, maxY for vertical
  length: number;
  category: LineCategory;
  reason?: string;
}

export interface GridAxis {
  orientation: 'horizontal' | 'vertical';
  coord: number; // y for horizontal grid line, x for vertical grid line
  start: number;
  end: number;
  label?: string;
}

export interface BeamDetectionDiagnostics {
  beams: BeamElement[];
  classifiedLines: ClassifiedLine[];
  gridAxes: {
    horizontal: GridAxis[];
    vertical: GridAxis[];
  };
  counts: {
    borderOrTitleBlock: number;
    gridOrDimension: number;
    beamCandidates: number;
    horizontalGrids: number;
    verticalGrids: number;
    gridGuidedBeams: number;
    detectedBeams: number;
  };
}

export function createBeamElement(
  name: string,
  start: Point,
  end: Point,
  heightCm: FormworkHeight = 60,
  widthCm: number = DEFAULT_BEAM_WIDTH_CM
): BeamElement {
  const id = `beam-${Date.now()}-${beamCounter++}`;
  return {
    id,
    name,
    start,
    end,
    widthCm,
    defaultHeightCm: heightCm,
    thicknessCm: FORMWORK_THICKNESS_CM,
    attachMode: 'dual_beam',
    leftSide: {
      side: 'left',
      enabled: true,
      heightCm,
      startExtensionCm: 0,
      endExtensionCm: 0,
    },
    rightSide: {
      side: 'right',
      enabled: true,
      heightCm,
      startExtensionCm: 0,
      endExtensionCm: 0,
    },
  };
}

/**
 * Creates a single-edge Formwork Line Element where 1 line = 1 formwork strip attached directly to the line.
 */
export function createFormworkEdgeElement(
  name: string,
  start: Point,
  end: Point,
  activeSide: 'left' | 'right' = 'left',
  heightCm: FormworkHeight = 60,
  edgeRole: 'inner' | 'outer' = 'inner',
  widthCm: number = DEFAULT_BEAM_WIDTH_CM,
  startExtensionCm = 0,
  endExtensionCm = 0,
  boxGroupId?: string,
  boxSide?: 'top' | 'right' | 'bottom' | 'left'
): BeamElement {
  const id = `edge-${Date.now()}-${beamCounter++}`;
  return {
    id,
    name,
    start,
    end,
    widthCm,
    defaultHeightCm: heightCm,
    thicknessCm: FORMWORK_THICKNESS_CM,
    attachMode: 'single_edge',
    edgeRole,
    boxGroupId,
    boxSide,
    leftSide: {
      side: 'left',
      enabled: activeSide === 'left',
      heightCm,
      startExtensionCm: activeSide === 'left' ? startExtensionCm : 0,
      endExtensionCm: activeSide === 'left' ? endExtensionCm : 0,
    },
    rightSide: {
      side: 'right',
      enabled: activeSide === 'right',
      heightCm,
      startExtensionCm: activeSide === 'right' ? startExtensionCm : 0,
      endExtensionCm: activeSide === 'right' ? endExtensionCm : 0,
    },
  };
}

/**
 * Updates all 4 edges belonging to a 4-corner rectangle group (วงรอบในจับขอบ 4 มุม)
 * when the user drags any of its 4 corner handles, so formwork panels auto-arrange inside!
 */
export function updateBoxGroupRectangle(
  beams: BeamElement[],
  boxGroupId: string,
  p1: Point,
  p2: Point
): BeamElement[] {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  if (maxX - minX < 15 || maxY - minY < 15) {
    return beams;
  }

  return beams.map((b) => {
    if (b.boxGroupId !== boxGroupId) return b;
    let newStart = b.start;
    let newEnd = b.end;
    if (b.boxSide === 'top') {
      newStart = { x: minX, y: minY };
      newEnd = { x: maxX, y: minY };
    } else if (b.boxSide === 'right') {
      newStart = { x: maxX, y: minY };
      newEnd = { x: maxX, y: maxY };
    } else if (b.boxSide === 'bottom') {
      newStart = { x: maxX, y: maxY };
      newEnd = { x: minX, y: maxY };
    } else if (b.boxSide === 'left') {
      newStart = { x: minX, y: maxY };
      newEnd = { x: minX, y: minY };
    }
    return {
      ...b,
      start: newStart,
      end: newEnd,
      leftSide: { ...b.leftSide, customPanels: undefined },
      rightSide: { ...b.rightSide, customPanels: undefined },
    };
  });
}

/**
 * Ungroups a 4-corner rectangle loop into 4 independent formwork lines (ตั้งไม้แบบเป็นเส้นๆ เหมือนเดิม).
 */
export function ungroupBoxEdges(beams: BeamElement[], boxGroupId: string): BeamElement[] {
  return beams.map((b) =>
    b.boxGroupId === boxGroupId
      ? { ...b, boxGroupId: undefined, boxSide: undefined }
      : b
  );
}

/**
 * Creates 1 or 2 Formwork Edge Lines from a user-drawn line (Inner Perimeter or Outer Perimeter).
 * - Snaps nearly-horizontal or nearly-vertical lines to orthogonal.
 * - If autoParallelPair is true, also creates the opposite parallel edge offset by beamWidthCm (default 20 cm).
 */
export function createEdgesFromLineTool(
  baseName: string,
  rawStart: Point,
  rawEnd: Point,
  role: 'inner' | 'outer',
  heightCm: FormworkHeight,
  pixelsPerCm: number,
  beamWidthCm: number = DEFAULT_BEAM_WIDTH_CM,
  autoParallelPair = true
): BeamElement[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const dx = rawEnd.x - rawStart.x;
  const dy = rawEnd.y - rawStart.y;

  // Orthogonal snap if within 12 degrees
  let start = { ...rawStart };
  let end = { ...rawEnd };
  if (Math.abs(dy) <= Math.abs(dx) * 0.22) {
    end = { x: rawEnd.x, y: rawStart.y };
  } else if (Math.abs(dx) <= Math.abs(dy) * 0.22) {
    end = { x: rawStart.x, y: rawEnd.y };
  }

  const sDx = end.x - start.x;
  const sDy = end.y - start.y;
  const sLen = Math.hypot(sDx, sDy) || 1;
  const ux = sDx / sLen;
  const uy = sDy / sLen;
  // Left normal (-uy, ux)
  const nx = -uy;
  const ny = ux;

  const widthPx = beamWidthCm * safeScale;
  const results: BeamElement[] = [];

  if (role === 'inner') {
    // Primary line is the Inner Edge: formwork strip protrudes toward 'right' (into the slab opening)
    // and the beam concrete body sits on the 'left' side (+nx, +ny).
    results.push(
      createFormworkEdgeElement(
        `${baseName} (ขอบใน)`,
        start,
        end,
        'right',
        heightCm,
        'inner',
        beamWidthCm,
        0,
        0
      )
    );

    if (autoParallelPair) {
      // Paired Outer Edge is offset by +beamWidthCm along (+nx, +ny) and extends by +beamWidthCm at both ends + 5cm formwork wrap
      const extPx = widthPx;
      const outerStart = {
        x: start.x + nx * widthPx - ux * extPx,
        y: start.y + ny * widthPx - uy * extPx,
      };
      const outerEnd = {
        x: end.x + nx * widthPx + ux * extPx,
        y: end.y + ny * widthPx + uy * extPx,
      };
      results.push(
        createFormworkEdgeElement(
          `${baseName} (ขอบนอก)`,
          outerStart,
          outerEnd,
          'left',
          heightCm,
          'outer',
          beamWidthCm,
          FORMWORK_THICKNESS_CM,
          FORMWORK_THICKNESS_CM
        )
      );
    }
  } else {
    // Primary line is the Outer Edge: formwork strip protrudes toward 'left' (+nx, +ny, outside the beam)
    // with +5cm formwork corner wrap.
    results.push(
      createFormworkEdgeElement(
        `${baseName} (ขอบนอก)`,
        start,
        end,
        'left',
        heightCm,
        'outer',
        beamWidthCm,
        FORMWORK_THICKNESS_CM,
        FORMWORK_THICKNESS_CM
      )
    );

    if (autoParallelPair) {
      // Paired Inner Edge is inset by -beamWidthCm along (-nx, -ny) and shortened by -beamWidthCm at both ends
      const shrinkPx = Math.min(widthPx, sLen * 0.35);
      const innerStart = {
        x: start.x - nx * widthPx + ux * shrinkPx,
        y: start.y - ny * widthPx + uy * shrinkPx,
      };
      const innerEnd = {
        x: end.x - nx * widthPx - ux * shrinkPx,
        y: end.y - ny * widthPx - uy * shrinkPx,
      };
      results.push(
        createFormworkEdgeElement(
          `${baseName} (ขอบใน)`,
          innerStart,
          innerEnd,
          'right',
          heightCm,
          'inner',
          beamWidthCm,
          0,
          0
        )
      );
    }
  }

  return results;
}

/**
 * Creates a 4-sided rectangular loop of Formwork Edge Lines from 2 corner clicks:
 * - role === 'inner': User clicked the INNER slab opening rectangle (วงรอบใน).
 *   Inner 4 edges have exact inner dimensions and are grouped into a 4-corner adjustable rectangle (boxGroupId);
 *   if autoParallelPair is true, outer 4 edges are expanded by +beamWidthCm (20 cm) on all sides + 5 cm corner wrap.
 * - role === 'outer': User clicked the OUTER building/bay perimeter rectangle (วงรอบนอก).
 *   Outer 4 edges have exact outer dimensions; if autoParallelPair is true, inner 4 edges are inset by -beamWidthCm (20 cm) on all sides.
 */
export function createEdgesFromBoxTool(
  basePrefix: string,
  p1: Point,
  p2: Point,
  role: 'inner' | 'outer',
  heightCm: FormworkHeight,
  pixelsPerCm: number,
  beamWidthCm: number = DEFAULT_BEAM_WIDTH_CM,
  autoParallelPair = true
): BeamElement[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const widthPx = beamWidthCm * safeScale;

  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  const inMinX = role === 'inner' ? minX : minX + widthPx;
  const inMaxX = role === 'inner' ? maxX : maxX - widthPx;
  const inMinY = role === 'inner' ? minY : minY + widthPx;
  const inMaxY = role === 'inner' ? maxY : maxY - widthPx;

  const outMinX = role === 'inner' ? minX - widthPx : minX;
  const outMaxX = role === 'inner' ? maxX + widthPx : maxX;
  const outMinY = role === 'inner' ? minY - widthPx : minY;
  const outMaxY = role === 'inner' ? maxY + widthPx : maxY;

  const edges: BeamElement[] = [];

  const addInnerLoop = () => {
    if (inMaxX - inMinX < 15 || inMaxY - inMinY < 15) return;
    const innerGroupId = `box-inner-${basePrefix}-${beamCounter}`;
    // Clockwise loop in screen coordinates (+Y down): 'left' points INWARD into the box!
    // Horizontal inner strips span full inner width (0, 0); Vertical inner strips butt between them (-5cm, -5cm) so corners never overlap!
    edges.push(
      createFormworkEdgeElement(
        `${basePrefix}-บน(ใน)`,
        { x: inMinX, y: inMinY },
        { x: inMaxX, y: inMinY },
        'left',
        heightCm,
        'inner',
        beamWidthCm,
        0,
        0,
        innerGroupId,
        'top'
      ),
      createFormworkEdgeElement(
        `${basePrefix}-ขวา(ใน)`,
        { x: inMaxX, y: inMinY },
        { x: inMaxX, y: inMaxY },
        'left',
        heightCm,
        'inner',
        beamWidthCm,
        -FORMWORK_THICKNESS_CM,
        -FORMWORK_THICKNESS_CM,
        innerGroupId,
        'right'
      ),
      createFormworkEdgeElement(
        `${basePrefix}-ล่าง(ใน)`,
        { x: inMaxX, y: inMaxY },
        { x: inMinX, y: inMaxY },
        'left',
        heightCm,
        'inner',
        beamWidthCm,
        0,
        0,
        innerGroupId,
        'bottom'
      ),
      createFormworkEdgeElement(
        `${basePrefix}-ซ้าย(ใน)`,
        { x: inMinX, y: inMaxY },
        { x: inMinX, y: inMinY },
        'left',
        heightCm,
        'inner',
        beamWidthCm,
        -FORMWORK_THICKNESS_CM,
        -FORMWORK_THICKNESS_CM,
        innerGroupId,
        'left'
      )
    );
  };

  const addOuterLoop = () => {
    if (outMaxX - outMinX < 15 || outMaxY - outMinY < 15) return;
    const outerGroupId = `box-outer-${basePrefix}-${beamCounter}`;
    if (role === 'outer') {
      // When user explicitly draws Outer Box (ตีกรอบวงนอก), use 'left' (inward in clockwise screen coords) so 100% of formwork stays INSIDE [outMinX..outMaxX, outMinY..outMaxY]!
      edges.push(
        createFormworkEdgeElement(
          `${basePrefix}-บน(นอก)`,
          { x: outMinX, y: outMinY },
          { x: outMaxX, y: outMinY },
          'left',
          heightCm,
          'outer',
          beamWidthCm,
          0,
          0,
          outerGroupId,
          'top'
        ),
        createFormworkEdgeElement(
          `${basePrefix}-ขวา(นอก)`,
          { x: outMaxX, y: outMinY },
          { x: outMaxX, y: outMaxY },
          'left',
          heightCm,
          'outer',
          beamWidthCm,
          -FORMWORK_THICKNESS_CM,
          -FORMWORK_THICKNESS_CM,
          outerGroupId,
          'right'
        ),
        createFormworkEdgeElement(
          `${basePrefix}-ล่าง(นอก)`,
          { x: outMaxX, y: outMaxY },
          { x: outMinX, y: outMaxY },
          'left',
          heightCm,
          'outer',
          beamWidthCm,
          0,
          0,
          outerGroupId,
          'bottom'
        ),
        createFormworkEdgeElement(
          `${basePrefix}-ซ้าย(นอก)`,
          { x: outMinX, y: outMaxY },
          { x: outMinX, y: outMinY },
          'left',
          heightCm,
          'outer',
          beamWidthCm,
          -FORMWORK_THICKNESS_CM,
          -FORMWORK_THICKNESS_CM,
          outerGroupId,
          'left'
        )
      );
    } else {
      // Paired outer loop expanded from Inner Box (ตีกรอบวงใน): 'right' points OUTWARD in clockwise screen coords.
      // Horizontal outer strips wrap the outer corners (+5cm, +5cm); Vertical outer strips butt flush (0, 0)
      edges.push(
        createFormworkEdgeElement(
          `${basePrefix}-บน(นอก)`,
          { x: outMinX, y: outMinY },
          { x: outMaxX, y: outMinY },
          'right',
          heightCm,
          'outer',
          beamWidthCm,
          FORMWORK_THICKNESS_CM,
          FORMWORK_THICKNESS_CM,
          outerGroupId,
          'top'
        ),
        createFormworkEdgeElement(
          `${basePrefix}-ขวา(นอก)`,
          { x: outMaxX, y: outMinY },
          { x: outMaxX, y: outMaxY },
          'right',
          heightCm,
          'outer',
          beamWidthCm,
          0,
          0,
          outerGroupId,
          'right'
        ),
        createFormworkEdgeElement(
          `${basePrefix}-ล่าง(นอก)`,
          { x: outMaxX, y: outMaxY },
          { x: outMinX, y: outMaxY },
          'right',
          heightCm,
          'outer',
          beamWidthCm,
          FORMWORK_THICKNESS_CM,
          FORMWORK_THICKNESS_CM,
          outerGroupId,
          'bottom'
        ),
        createFormworkEdgeElement(
          `${basePrefix}-ซ้าย(นอก)`,
          { x: outMinX, y: outMaxY },
          { x: outMinX, y: outMinY },
          'right',
          heightCm,
          'outer',
          beamWidthCm,
          0,
          0,
          outerGroupId,
          'left'
        )
      );
    }
  };

  if (role === 'inner') {
    addInnerLoop();
    if (autoParallelPair) addOuterLoop();
  } else {
    addOuterLoop();
    if (autoParallelPair) addInnerLoop();
  }

  return edges;
}

function isBeamTagText(text: string): boolean {
  const t = text.trim();
  // Matches "B1", "B1A", "GB1", "FB1", or combined "B1AT = +0.55" / "B1 T = +0.65" from SPW-FORCON-ST-261022-01
  return /^(?:G?B|FB|RB|CB|WB|SB|PB|คาน)[-_\s]?\d+[A-Z0-9-]*(?:\s*T\s*=.*)?$/i.test(t);
}

function normalizeBeamTagName(text: string): string {
  const t = text.trim();
  const m = t.match(/^((?:G?B|FB|RB|CB|WB|SB|PB|คาน)[-_\s]?\d+[A-Z0-9-]*?)(?:\s*T\s*=.*)?$/i);
  return m ? m[1].trim() : t;
}

/**
 * Infers beam formwork height (40, 50, 60, 70 cm) from nearby T = +0.65 / B = +0.15 elevation texts
 * in SPW-FORCON-ST-261022-01.pdf (e.g., 0.65 - 0.15 = 0.50m = 50cm).
 */
export function inferBeamHeightFromNearbyTexts(
  midX: number,
  midY: number,
  texts: RawTextItem[],
  fallbackHeight: FormworkHeight
): FormworkHeight {
  let topElev: number | null = null;
  let botElev: number | null = null;
  let bestTopDist = 95;
  let bestBotDist = 95;

  for (const item of texts) {
    const d = Math.hypot(item.x - midX, item.y - midY);
    if (d > 95) continue;
    const tMatch = item.text.match(/T\s*=\s*[+-]?(\d+\.\d{2})/i);
    if (tMatch && d < bestTopDist) {
      topElev = parseFloat(tMatch[1]);
      bestTopDist = d;
    }
    const bMatch = item.text.match(/B\s*=\s*[+-]?(\d+\.\d{2})/i);
    if (bMatch && d < bestBotDist) {
      botElev = parseFloat(bMatch[1]);
      bestBotDist = d;
    }
  }

  if (topElev !== null && botElev !== null && topElev > botElev) {
    const depthCm = Math.round((topElev - botElev) * 100);
    // Snap to closest standard FormworkHeight: 40, 50, 60, 70
    let closest: FormworkHeight = fallbackHeight;
    let minDiff = Infinity;
    for (const h of FORMWORK_HEIGHTS) {
      const diff = Math.abs(h - depthCm);
      if (diff < minDiff) {
        minDiff = diff;
        closest = h;
      }
    }
    if (minDiff <= 15) return closest;
  }

  return fallbackHeight;
}

function isDimensionText(text: string): boolean {
  const t = text.trim().replace(/,/g, '');
  return /^\d+\.\d{2,3}\s*(?:m|ม\.?)?$/i.test(t) || /^(?:[1-9]\d{2,4})\s*(?:mm|cm)?$/i.test(t);
}

function isGridBubbleText(text: string): boolean {
  const t = text.trim();
  return /^[A-Z]$/i.test(t) || /^(?:[1-9]|1\d|20)$/.test(t);
}

function isTitleBlockKeyword(text: string): boolean {
  const t = text.trim().toUpperCase();
  return (
    t.includes('PROJECT') ||
    t.includes('ARCHITECT') ||
    t.includes('ENGINEER') ||
    t.includes('DRAWING') ||
    t.includes('SCALE') ||
    t.includes('SHEET') ||
    t.includes('โครงการ') ||
    t.includes('วิศวกร') ||
    t.includes('สถาปนิก') ||
    t.includes('มาตราส่วน') ||
    t.includes('รายการประกอบแบบ') ||
    t.includes('สัญลักษณ์')
  );
}

function findNearestBeamLabel(
  start: Point,
  end: Point,
  orientation: 'horizontal' | 'vertical',
  texts: RawTextItem[],
  usedLabels: Set<number>,
  maxOrthogonalDist = 42
): string | null {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  let bestIdx = -1;
  let bestScore = Infinity;

  for (let i = 0; i < texts.length; i++) {
    if (usedLabels.has(i)) continue;
    const t = texts[i].text.trim();
    if (!isBeamTagText(t)) continue;

    const tx = texts[i].x;
    const ty = texts[i].y;

    if (orientation === 'horizontal') {
      const orthoDist = Math.abs(ty - midY);
      const inlineDist = Math.abs(tx - midX);
      const isNearEndpoint = Math.abs(tx - minX) <= 15 || Math.abs(tx - maxX) <= 15;
      if (orthoDist <= maxOrthogonalDist && tx >= minX - 8 && tx <= maxX + 8) {
        const score = orthoDist * 3 + inlineDist * 0.6 + (isNearEndpoint ? 120 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    } else {
      const orthoDist = Math.abs(tx - midX);
      const inlineDist = Math.abs(ty - midY);
      const isNearEndpoint = Math.abs(ty - minY) <= 15 || Math.abs(ty - maxY) <= 15;
      if (orthoDist <= maxOrthogonalDist && ty >= minY - 8 && ty <= maxY + 8) {
        const score = orthoDist * 3 + inlineDist * 0.6 + (isNearEndpoint ? 120 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
  }

  if (bestIdx !== -1) {
    usedLabels.add(bestIdx);
    return normalizeBeamTagName(texts[bestIdx].text);
  }
  return null;
}

/**
 * Collinearly merges split segments along the same coordinate (e.g. a beam edge broken by an intersecting column/grid line)
 */
function mergeCollinearCandidateSegments(
  candidates: ClassifiedLine[],
  maxCoordDiff = 3.0,
  maxInlineGap = 42
): ClassifiedLine[] {
  if (candidates.length === 0) return [];
  const result: ClassifiedLine[] = [];

  for (const orient of ['horizontal', 'vertical'] as const) {
    const group = candidates
      .filter((c) => c.orientation === orient)
      .sort((a, b) => a.coord - b.coord || a.start - b.start);

    const merged: ClassifiedLine[] = [];
    for (const seg of group) {
      let didMerge = false;
      for (let i = merged.length - 1; i >= 0; i--) {
        const m = merged[i];
        if (Math.abs(seg.coord - m.coord) > maxCoordDiff) {
          if (seg.coord - m.coord > maxCoordDiff * 2) break;
          continue;
        }
        // Check if overlapping or separated by a small column/grid intersection gap
        if (seg.start <= m.end + maxInlineGap && seg.end >= m.start - maxInlineGap) {
          const newStart = Math.min(m.start, seg.start);
          const newEnd = Math.max(m.end, seg.end);
          const newCoord = (m.coord * m.length + seg.coord * seg.length) / (m.length + seg.length || 1);
          m.start = newStart;
          m.end = newEnd;
          m.coord = newCoord;
          m.length = newEnd - newStart;
          m.line =
            orient === 'horizontal'
              ? { x1: newStart, y1: newCoord, x2: newEnd, y2: newCoord }
              : { x1: newCoord, y1: newStart, x2: newCoord, y2: newEnd };
          didMerge = true;
          break;
        }
      }
      if (!didMerge) {
        merged.push({ ...seg, line: { ...seg.line } });
      }
    }
    result.push(...merged);
  }

  return result;
}

/**
 * Extracts structural Grid Axes (X-grids and Y-grids) from classified grid lines,
 * grid bubble texts (A, B, C / 1, 2, 3), and symmetrical centerline clusters.
 */
export function extractGridAxes(
  classifiedLines: ClassifiedLine[],
  texts: RawTextItem[] = []
): { horizontal: GridAxis[]; vertical: GridAxis[] } {
  const horizMap: GridAxis[] = [];
  const vertMap: GridAxis[] = [];

  const addOrMergeAxis = (
    list: GridAxis[],
    orientation: 'horizontal' | 'vertical',
    coord: number,
    start: number,
    end: number,
    label?: string
  ) => {
    const existing = list.find((g) => Math.abs(g.coord - coord) <= 8);
    if (existing) {
      existing.coord = (existing.coord + coord) / 2;
      existing.start = Math.min(existing.start, start);
      existing.end = Math.max(existing.end, end);
      if (label && !existing.label) existing.label = label;
    } else {
      list.push({ orientation, coord, start, end, label });
    }
  };

  // 1. From lines explicitly classified as grid lines (dashed_grid_line, full_span_grid_line, or grid bubble lines)
  const gridLines = classifiedLines.filter(
    (l) =>
      l.category === 'grid_or_dimension' &&
      (l.reason === 'dashed_grid_line' ||
        l.reason === 'full_span_grid_line' ||
        l.reason === 'grid_bubble_line')
  );

  for (const gl of gridLines) {
    if (gl.orientation === 'horizontal') {
      addOrMergeAxis(horizMap, 'horizontal', gl.coord, gl.start, gl.end);
    } else if (gl.orientation === 'vertical') {
      addOrMergeAxis(vertMap, 'vertical', gl.coord, gl.start, gl.end);
    }
  }

  // 2. Also infer grid axes from symmetric pairs of beam candidates (since main beams sit on grid axes!)
  const beamCandidates = classifiedLines.filter((l) => l.category === 'beam_candidate');
  for (let i = 0; i < beamCandidates.length; i++) {
    for (let j = i + 1; j < beamCandidates.length; j++) {
      const a = beamCandidates[i];
      const b = beamCandidates[j];
      if (a.orientation !== b.orientation) continue;
      const gap = Math.abs(a.coord - b.coord);
      if (gap >= 8 && gap <= 42) {
        const overlapStart = Math.max(a.start, b.start);
        const overlapEnd = Math.min(a.end, b.end);
        if (overlapEnd - overlapStart >= 60) {
          const midCoord = (a.coord + b.coord) / 2;
          if (a.orientation === 'horizontal') {
            addOrMergeAxis(horizMap, 'horizontal', midCoord, overlapStart, overlapEnd);
          } else if (a.orientation === 'vertical') {
            addOrMergeAxis(vertMap, 'vertical', midCoord, overlapStart, overlapEnd);
          }
        }
      }
    }
  }

  // 3. Attach Grid Bubble Labels (A, B, C / 1, 2, 3) if near the axis
  for (const txt of texts) {
    if (!isGridBubbleText(txt.text)) continue;
    for (const h of horizMap) {
      if (Math.abs(txt.y - h.coord) <= 18) {
        h.label = txt.text.trim();
      }
    }
    for (const v of vertMap) {
      if (Math.abs(txt.x - v.coord) <= 18) {
        v.label = txt.text.trim();
      }
    }
  }

  horizMap.sort((a, b) => a.coord - b.coord);
  vertMap.sort((a, b) => a.coord - b.coord);

  return { horizontal: horizMap, vertical: vertMap };
}

/**
 * Stage 1: Classifies raw lines into:
 * - 'border_or_titleblock' (กรอบกระดาษ / ตารางรายการประกอบแบบ)
 * - 'grid_or_dimension' (เส้นกริดเสา / เส้นบอกระยะ)
 * - 'beam_candidate' (เส้นที่มีโอกาสเป็นขอบคานจริง)
 */
export function classifyPlanLines(
  lines: RawVectorLine[],
  texts: RawTextItem[] = [],
  pageDimensions?: { width: number; height: number }
): ClassifiedLine[] {
  if (lines.length === 0) return [];

  // Infer page bounding box if not explicitly passed
  let maxX = pageDimensions?.width || 0;
  let maxY = pageDimensions?.height || 0;
  let minPageX = Infinity;
  let minPageY = Infinity;

  for (const l of lines) {
    maxX = Math.max(maxX, l.x1, l.x2);
    maxY = Math.max(maxY, l.y1, l.y2);
    minPageX = Math.min(minPageX, l.x1, l.x2);
    minPageY = Math.min(minPageY, l.y1, l.y2);
  }

  const pageW = Math.max(maxX, 600);
  const pageH = Math.max(maxY, 450);

  // Compute drawing content span excluding outer 8.5% paper border lines
  let contentMinX = Infinity;
  let contentMaxX = 0;
  let contentMinY = Infinity;
  let contentMaxY = 0;
  for (const l of lines) {
    const lx1 = Math.min(l.x1, l.x2);
    const lx2 = Math.max(l.x1, l.x2);
    const ly1 = Math.min(l.y1, l.y2);
    const ly2 = Math.max(l.y1, l.y2);
    if (pageDimensions) {
      if (ly1 < pageH * 0.085 || ly2 > pageH * 0.905) continue;
      if (lx1 < pageW * 0.085 || lx2 > pageW * 0.905) continue;
    }
    contentMinX = Math.min(contentMinX, lx1);
    contentMaxX = Math.max(contentMaxX, lx2);
    contentMinY = Math.min(contentMinY, ly1);
    contentMaxY = Math.max(contentMaxY, ly2);
  }

  const spanW = Math.max(
    contentMaxX > contentMinX ? contentMaxX - contentMinX : maxX - (isFinite(minPageX) ? minPageX : 0),
    350
  );
  const spanH = Math.max(
    contentMaxY > contentMinY ? contentMaxY - contentMinY : maxY - (isFinite(minPageY) ? minPageY : 0),
    250
  );

  // Prepare normalized line objects
  const items: ClassifiedLine[] = lines.map((line) => {
    const dx = Math.abs(line.x2 - line.x1);
    const dy = Math.abs(line.y2 - line.y1);
    const length = Math.hypot(dx, dy);

    if (dy <= dx * 0.1) {
      return {
        line,
        orientation: 'horizontal',
        coord: (line.y1 + line.y2) / 2,
        start: Math.min(line.x1, line.x2),
        end: Math.max(line.x1, line.x2),
        length,
        category: 'beam_candidate',
      };
    } else if (dx <= dy * 0.1) {
      return {
        line,
        orientation: 'vertical',
        coord: (line.x1 + line.x2) / 2,
        start: Math.min(line.y1, line.y2),
        end: Math.max(line.y1, line.y2),
        length,
        category: 'beam_candidate',
      };
    } else {
      return {
        line,
        orientation: 'diagonal',
        coord: 0,
        start: 0,
        end: length,
        length,
        category: 'grid_or_dimension',
        reason: 'diagonal_non_orthogonal',
      };
    }
  });

  // Identify Title Block zones from title block keywords in PDF texts
  const titleBlockPoints = texts.filter((t) => isTitleBlockKeyword(t.text));
  const hasRightTitleBlock =
    titleBlockPoints.filter((t) => t.x > pageW * 0.72).length >= 2;
  const hasBottomTitleBlock =
    titleBlockPoints.filter((t) => t.y > pageH * 0.78 && t.x > pageW * 0.45).length >= 2;

  // Group collinear segments along the same axis (within 2.5 px) to detect dashed grid lines
  const horizByCoord = items.filter((it) => it.orientation === 'horizontal');
  const vertByCoord = items.filter((it) => it.orientation === 'vertical');

  // Pre-check which lines have a Grid Bubble (A, B, C / 1, 2, 3) at their endpoints (within 65px of start or end)
  const hasGridBubbleNearLine = (item: ClassifiedLine): boolean => {
    return texts.some((txt) => {
      if (!isGridBubbleText(txt.text)) return false;
      const distToCoord =
        item.orientation === 'horizontal'
          ? Math.abs(txt.y - item.coord)
          : Math.abs(txt.x - item.coord);
      const posAlong = item.orientation === 'horizontal' ? txt.x : txt.y;
      const nearStartOrEnd =
        Math.abs(posAlong - item.start) <= 65 || Math.abs(posAlong - item.end) <= 65;
      return distToCoord <= 20 && nearStartOrEnd;
    });
  };

  for (const item of items) {
    if (item.orientation === 'diagonal') continue;

    const isConfirmedGridLine = hasGridBubbleNearLine(item);

    // ---------------------------------------------------------
    // 1. Check PAPER BORDER & TITLE BLOCK (กรอบกระดาษ / ตารางข้างแบบ)
    // Never classify a confirmed Grid Line (with Grid Bubble A,B,C / 1,2,3) as a paper border!
    // ---------------------------------------------------------
    if (!isConfirmedGridLine && item.orientation === 'horizontal') {
      const nearTopOrBottomMargin =
        pageDimensions && (item.coord < pageH * 0.085 || item.coord > pageH * 0.905);
      const isOuterDrawingFrame =
        !pageDimensions &&
        lines.length >= 8 &&
        item.length > spanW * 0.72 &&
        (item.coord - minPageY < spanH * 0.05 || maxY - item.coord < spanH * 0.05);
      const spansEntireSheet =
        pageDimensions &&
        item.length > pageW * 0.72 &&
        (item.coord < pageH * 0.12 || item.coord > pageH * 0.88);
      const inRightTitleBlock =
        hasRightTitleBlock && item.start > pageW * 0.72;
      const inBottomTitleBlock =
        hasBottomTitleBlock && item.coord > pageH * 0.78 && item.start > pageW * 0.45;

      if (
        nearTopOrBottomMargin ||
        isOuterDrawingFrame ||
        spansEntireSheet ||
        inRightTitleBlock ||
        inBottomTitleBlock
      ) {
        item.category = 'border_or_titleblock';
        item.reason = 'paper_border_or_titleblock';
        continue;
      }
    } else if (!isConfirmedGridLine && item.orientation === 'vertical') {
      const nearLeftOrRightMargin =
        pageDimensions && (item.coord < pageW * 0.085 || item.coord > pageW * 0.905);
      const isOuterDrawingFrame =
        !pageDimensions &&
        lines.length >= 8 &&
        item.length > spanH * 0.72 &&
        (item.coord - minPageX < spanW * 0.05 || maxX - item.coord < spanW * 0.05);
      const spansEntireSheet =
        pageDimensions &&
        item.length > pageH * 0.72 &&
        (item.coord < pageW * 0.12 || item.coord > pageW * 0.88);
      const inRightTitleBlock =
        hasRightTitleBlock && item.coord > pageW * 0.72;
      const inBottomTitleBlock =
        hasBottomTitleBlock && item.start > pageH * 0.78 && item.coord > pageW * 0.45;

      if (
        nearLeftOrRightMargin ||
        isOuterDrawingFrame ||
        spansEntireSheet ||
        inRightTitleBlock ||
        inBottomTitleBlock
      ) {
        item.category = 'border_or_titleblock';
        item.reason = 'paper_border_or_titleblock';
        continue;
      }
    }

    // ---------------------------------------------------------
    // 2. Check GRID LINES & DIMENSION LINES (เส้นกริด / เส้นบอกระยะ)
    // ---------------------------------------------------------
    if (isConfirmedGridLine) {
      item.category = 'grid_or_dimension';
      item.reason = 'grid_bubble_line';
      continue;
    }

    const sameAxisPool = item.orientation === 'horizontal' ? horizByCoord : vertByCoord;
    const collinearSegments = sameAxisPool.filter(
      (other) => Math.abs(other.coord - item.coord) <= 2.5
    );

    // 2a. Dashed / Centerline Grid Pattern: >= 3 collinear short segments along the same line
    const shortCollinearCount = collinearSegments.filter((s) => s.length < 130).length;
    if (collinearSegments.length >= 4 && shortCollinearCount >= 3) {
      item.category = 'grid_or_dimension';
      item.reason = 'dashed_grid_line';
      continue;
    }

    // 2b. Full-Span Grid Line: A single continuous line spanning > 78% of the entire drawing width/height
    // that shoots past normal bays (unless there is a matching twin of the same length)
    const maxDrawingSpan = item.orientation === 'horizontal' ? spanW : spanH;
    if (lines.length > 8 && item.length > maxDrawingSpan * 0.82) {
      const hasAlignedTwin = sameAxisPool.some(
        (other) =>
          other !== item &&
          Math.abs(other.coord - item.coord) >= 5 &&
          Math.abs(other.coord - item.coord) <= 50 &&
          Math.abs(other.start - item.start) <= 25 &&
          Math.abs(other.end - item.end) <= 25
      );
      if (!hasAlignedTwin) {
        item.category = 'grid_or_dimension';
        item.reason = 'full_span_grid_line';
        continue;
      }
    }

    // 2c. Dimension Line / Grid Bubble Line: passes directly through dimension text or grid bubble text
    // WITHOUT having a beam tag nearby
    let touchesDimension = false;
    let touchesGridBubble = false;
    let touchesBeamTag = false;

    for (const txt of texts) {
      const tx = txt.x;
      const ty = txt.y;
      const distToCoord =
        item.orientation === 'horizontal'
          ? Math.abs(ty - item.coord)
          : Math.abs(tx - item.coord);
      const posAlong = item.orientation === 'horizontal' ? tx : ty;

      if (posAlong >= item.start - 35 && posAlong <= item.end + 35 && distToCoord <= 14) {
        if (isBeamTagText(txt.text)) {
          touchesBeamTag = true;
        } else if (isDimensionText(txt.text)) {
          touchesDimension = true;
        } else if (isGridBubbleText(txt.text)) {
          touchesGridBubble = true;
        }
      }
    }

    if ((touchesDimension || touchesGridBubble) && !touchesBeamTag) {
      item.category = 'grid_or_dimension';
      item.reason = touchesGridBubble ? 'grid_bubble_line' : 'dimension_or_grid_label_line';
      continue;
    }
  }

  // ---------------------------------------------------------
  // 3. Detect Dense Schedule / Legend Tables (ตารางถี่ๆ ที่ไม่ใช่คาน)
  // ---------------------------------------------------------
  for (const pool of [horizByCoord, vertByCoord]) {
    const candidates = pool
      .filter((it) => it.category === 'beam_candidate')
      .sort((a, b) => a.coord - b.coord);

    for (let i = 0; i < candidates.length; i++) {
      const base = candidates[i];
      const tableGroup = [base];
      for (let j = i + 1; j < candidates.length; j++) {
        const next = candidates[j];
        const prev = tableGroup[tableGroup.length - 1];
        const gap = next.coord - prev.coord;
        if (
          gap >= 6 &&
          gap <= 32 &&
          Math.abs(next.start - base.start) <= 15 &&
          Math.abs(next.end - base.end) <= 15
        ) {
          tableGroup.push(next);
        } else if (next.coord - prev.coord > 35) {
          break;
        }
      }

      if (tableGroup.length >= 5) {
        for (const tblLine of tableGroup) {
          tblLine.category = 'border_or_titleblock';
          tblLine.reason = 'dense_schedule_table';
        }
      }
    }
  }

  return items;
}

/**
 * Stage 2: Grid-Guided + Parallel-Edge Beam Detection
 * - Uses detected Grid Axes (เส้นกริด) as structural reference lines!
 *   1. Main Beams ON Grid Lines (คานหลักที่วางทับแนวเส้นกริด หรือมีขอบคานขนาบเส้นกริด)
 *   2. Beams CROSSING Between Perpendicular Grid Lines (คานที่พาดตัดระหว่างเส้นกริดเสา)
 *   3. Beam Labels (เช่น B1, GB1) sitting on a grid bay between two perpendicular grid lines
 */
export function autoDetectBeamsWithDiagnostics(
  lines: RawVectorLine[],
  pixelsPerCm: number,
  defaultHeightCm: FormworkHeight = 60,
  texts: RawTextItem[] = [],
  pageDimensions?: { width: number; height: number }
): BeamDetectionDiagnostics {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const classifiedLines = classifyPlanLines(lines, texts, pageDimensions);
  const gridAxes = extractGridAxes(classifiedLines, texts);

  // Merge collinear candidate segments that were broken by column/grid intersections
  const rawCandidates = classifiedLines.filter((l) => l.category === 'beam_candidate');
  const candidates = mergeCollinearCandidateSegments(rawCandidates, 3.0, Math.max(35, 35 * safeScale));

  const counts = {
    borderOrTitleBlock: classifiedLines.filter((l) => l.category === 'border_or_titleblock').length,
    gridOrDimension: classifiedLines.filter((l) => l.category === 'grid_or_dimension').length,
    beamCandidates: candidates.length,
    horizontalGrids: gridAxes.horizontal.length,
    verticalGrids: gridAxes.vertical.length,
    gridGuidedBeams: 0,
    detectedBeams: 0,
  };

  // Beam width range: 10 cm to 40 cm
  const minWidthPx = Math.max(5, 8 * safeScale);
  const maxWidthPx = Math.max(40, 45 * safeScale);
  const minLengthPx = Math.max(45, 50 * safeScale);
  const targetWidthPx = 20 * safeScale;

  const usedIndices = new Set<number>();
  const usedLabelIndices = new Set<number>();
  const beams: BeamElement[] = [];
  let indexCounter = 1;

  // Helper to check if a beam already exists at the same location
  const isDuplicateBeam = (start: Point, end: Point, orientation: 'horizontal' | 'vertical'): boolean => {
    const coord = orientation === 'horizontal' ? start.y : start.x;
    const bStart = orientation === 'horizontal' ? Math.min(start.x, end.x) : Math.min(start.y, end.y);
    const bEnd = orientation === 'horizontal' ? Math.max(start.x, end.x) : Math.max(start.y, end.y);

    return beams.some((existing) => {
      const isExHoriz = Math.abs(existing.end.y - existing.start.y) <= Math.abs(existing.end.x - existing.start.x);
      const exOrient = isExHoriz ? 'horizontal' : 'vertical';
      if (exOrient !== orientation) return false;
      const exCoord = isExHoriz ? existing.start.y : existing.start.x;
      if (Math.abs(exCoord - coord) > maxWidthPx * 0.75) return false;

      const exStart = isExHoriz
        ? Math.min(existing.start.x, existing.end.x)
        : Math.min(existing.start.y, existing.end.y);
      const exEnd = isExHoriz
        ? Math.max(existing.start.x, existing.end.x)
        : Math.max(existing.start.y, existing.end.y);
      const overlap = Math.min(bEnd, exEnd) - Math.max(bStart, exStart);
      return overlap > Math.min(bEnd - bStart, exEnd - exStart) * 0.5;
    });
  };

  // Helper to snap beam endpoints to perpendicular grid intersections if close (within 32px)
  const snapEndpointsToPerpGrids = (
    startCoord: number,
    endCoord: number,
    orientation: 'horizontal' | 'vertical'
  ): { start: number; end: number; crossesGridCount: number } => {
    const perpGrids = orientation === 'horizontal' ? gridAxes.vertical : gridAxes.horizontal;
    let snappedStart = startCoord;
    let snappedEnd = endCoord;
    const snapTol = Math.max(25, 28 * safeScale);

    for (const pg of perpGrids) {
      if (Math.abs(pg.coord - startCoord) <= snapTol) {
        snappedStart = pg.coord;
      }
      if (Math.abs(pg.coord - endCoord) <= snapTol) {
        snappedEnd = pg.coord;
      }
    }

    const crossesGridCount = perpGrids.filter(
      (pg) => pg.coord >= Math.min(snappedStart, snappedEnd) - snapTol && pg.coord <= Math.max(snappedStart, snappedEnd) + snapTol
    ).length;

    return {
      start: Math.min(snappedStart, snappedEnd),
      end: Math.max(snappedStart, snappedEnd),
      crossesGridCount,
    };
  };

  // =========================================================================
  // PASS 1: Detect Parallel Beam Candidate Pairs (prioritizing beams ON or CROSSING Grid Lines!)
  // =========================================================================
  for (let i = 0; i < candidates.length; i++) {
    if (usedIndices.has(i)) continue;
    const c1 = candidates[i];
    if (c1.length < minLengthPx) continue;
    if (c1.orientation === 'diagonal') continue;
    const orient: 'horizontal' | 'vertical' = c1.orientation;

    const parallelGrids = orient === 'horizontal' ? gridAxes.horizontal : gridAxes.vertical;

    let bestPartnerIdx = -1;
    let bestScore = Infinity;
    let bestGeom: {
      start: Point;
      end: Point;
      gapPx: number;
      isGridGuided: boolean;
    } | null = null;

    for (let j = i + 1; j < candidates.length; j++) {
      if (usedIndices.has(j)) continue;
      const c2 = candidates[j];
      if (c2.orientation !== orient) continue;
      if (c2.length < minLengthPx) continue;

      const gapPx = Math.abs(c1.coord - c2.coord);
      if (gapPx < minWidthPx || gapPx > maxWidthPx) continue;

      const overlapStart = Math.max(c1.start, c2.start);
      const overlapEnd = Math.min(c1.end, c2.end);
      const overlap = overlapEnd - overlapStart;
      if (overlap < minLengthPx) continue;

      const midCoord = (c1.coord + c2.coord) / 2;

      // Check if this pair straddles or sits on a parallel Grid Line!
      const onParallelGrid = parallelGrids.some(
        (g) => Math.abs(g.coord - midCoord) <= Math.max(gapPx * 0.85, 18)
      );

      // Check if this pair spans between or crosses perpendicular Grid Lines!
      const snapped = snapEndpointsToPerpGrids(overlapStart, overlapEnd, orient);
      const crossesPerpGrids = snapped.crossesGridCount >= 2;
      const isGridGuided = onParallelGrid || crossesPerpGrids;

      // Endpoint alignment check (more forgiving when confirmed by a Grid Line!)
      const startDiff = Math.abs(c1.start - c2.start);
      const endDiff = Math.abs(c1.end - c2.end);
      const maxAllowedEndMismatch = isGridGuided
        ? Math.max(gapPx * 3.5, 65)
        : Math.max(gapPx * 2.2, 35);
      const maxLen = Math.max(c1.length, c2.length);
      const overlapRatio = overlap / maxLen;

      if (startDiff > maxAllowedEndMismatch || endDiff > maxAllowedEndMismatch) {
        continue;
      }
      if (overlapRatio < (isGridGuided ? 0.58 : 0.72)) {
        continue;
      }

      // Aspect ratio check
      if (overlap < gapPx * 2.2) {
        continue;
      }

      // Ensure there isn't another candidate beam line right inside the gap
      const minCoord = Math.min(c1.coord, c2.coord);
      const maxCoord = Math.max(c1.coord, c2.coord);
      const hasInnerParallelLine = candidates.some(
        (other, idx) =>
          idx !== i &&
          idx !== j &&
          other.orientation === c1.orientation &&
          other.coord > minCoord + 2.5 &&
          other.coord < maxCoord - 2.5 &&
          Math.min(other.end, overlapEnd) - Math.max(other.start, overlapStart) > overlap * 0.5
      );
      if (hasInnerParallelLine) continue;

      // Grid-guided pairs receive a strong priority bonus (lower score = better)
      const gridBonus = (onParallelGrid ? -25 : 0) + (crossesPerpGrids ? -15 : 0);
      const score =
        Math.abs(gapPx - targetWidthPx) * 2.0 +
        (startDiff + endDiff) * 0.6 +
        Math.abs(c1.length - c2.length) * 0.3 +
        gridBonus;

      if (score < bestScore) {
        bestScore = score;
        bestPartnerIdx = j;
        const finalStart = crossesPerpGrids ? snapped.start : overlapStart;
        const finalEnd = crossesPerpGrids ? snapped.end : overlapEnd;

        bestGeom =
          c1.orientation === 'horizontal'
            ? {
                start: { x: finalStart, y: midCoord },
                end: { x: finalEnd, y: midCoord },
                gapPx,
                isGridGuided,
              }
            : {
                start: { x: midCoord, y: finalStart },
                end: { x: midCoord, y: finalEnd },
                gapPx,
                isGridGuided,
              };
      }
    }

    if (bestPartnerIdx !== -1 && bestGeom) {
      usedIndices.add(i);
      usedIndices.add(bestPartnerIdx);

      const detectedLabel = findNearestBeamLabel(
        bestGeom.start,
        bestGeom.end,
        orient,
        texts,
        usedLabelIndices
      );
      const beamName = detectedLabel || `B${indexCounter++}`;
      const midX = (bestGeom.start.x + bestGeom.end.x) / 2;
      const midY = (bestGeom.start.y + bestGeom.end.y) / 2;
      const inferredHeight = inferBeamHeightFromNearbyTexts(midX, midY, texts, defaultHeightCm);

      if (bestGeom.isGridGuided) {
        counts.gridGuidedBeams++;
      }

      // Always default beam width to 20 cm (DEFAULT_BEAM_WIDTH_CM); user can edit manually if needed
      beams.push(
        createBeamElement(
          beamName,
          bestGeom.start,
          bestGeom.end,
          inferredHeight,
          DEFAULT_BEAM_WIDTH_CM
        )
      );
    }
  }

  // =========================================================================
  // PASS 2: Single-Edge + Grid-Centerline Recovery (เมื่อเส้นกริดบังขอบคานด้านหนึ่ง หรือเจอขอบคานขนานติดกับเส้นกริด)
  // If an unused beam_candidate runs parallel and adjacent to a known Grid Axis (within 4..26px),
  // or a Beam Label (B1, GB1...) sits directly on a Grid Axis bay between two perpendicular grids,
  // reconstruct the beam along that Grid Axis!
  // =========================================================================
  for (let i = 0; i < candidates.length; i++) {
    if (usedIndices.has(i)) continue;
    const c = candidates[i];
    if (c.length < minLengthPx) continue;
    if (c.orientation === 'diagonal') continue;

    const parallelGrids = c.orientation === 'horizontal' ? gridAxes.horizontal : gridAxes.vertical;
    const nearGrid = parallelGrids.find((g) => {
      const dist = Math.abs(c.coord - g.coord);
      return dist >= 3.5 && dist <= maxWidthPx * 0.65;
    });

    if (nearGrid) {
      const snapped = snapEndpointsToPerpGrids(c.start, c.end, c.orientation);
      const beamCoord = nearGrid.coord;

      const startPt: Point =
        c.orientation === 'horizontal'
          ? { x: snapped.start, y: beamCoord }
          : { x: beamCoord, y: snapped.start };
      const endPt: Point =
        c.orientation === 'horizontal'
          ? { x: snapped.end, y: beamCoord }
          : { x: beamCoord, y: snapped.end };

      if (!isDuplicateBeam(startPt, endPt, c.orientation)) {
        usedIndices.add(i);
        const detectedLabel = findNearestBeamLabel(
          startPt,
          endPt,
          c.orientation,
          texts,
          usedLabelIndices
        );
        const beamName = detectedLabel || `B${indexCounter++}`;
        const midX = (startPt.x + endPt.x) / 2;
        const midY = (startPt.y + endPt.y) / 2;
        const inferredHeight = inferBeamHeightFromNearbyTexts(midX, midY, texts, defaultHeightCm);

        counts.gridGuidedBeams++;
        beams.push(
          createBeamElement(beamName, startPt, endPt, inferredHeight, DEFAULT_BEAM_WIDTH_CM)
        );
      }
    }
  }

  // =========================================================================
  // PASS 3: Grid-Intersection + Beam Tag Recovery (คานที่มีป้ายชื่อ B1/GB1 วางอยู่บนเส้นกริดระหว่างเสา)
  // If a beam tag (e.g. "B1", "GB2") is next to a Grid Axis between two perpendicular Grid Axes,
  // ensure that grid bay has a beam even if its solid lines were faint in the PDF scan.
  // =========================================================================
  for (let tIdx = 0; tIdx < texts.length; tIdx++) {
    if (usedLabelIndices.has(tIdx)) continue;
    const txt = texts[tIdx];
    if (!isBeamTagText(txt.text)) continue;
    const cleanTagName = normalizeBeamTagName(txt.text);

    // Find closest horizontal and vertical grid axes within 35px
    const nearHGrid = gridAxes.horizontal
      .filter((g) => Math.abs(txt.y - g.coord) <= 35)
      .sort((a, b) => Math.abs(txt.y - a.coord) - Math.abs(txt.y - b.coord))[0];
    const nearVGrid = gridAxes.vertical
      .filter((g) => Math.abs(txt.x - g.coord) <= 35)
      .sort((a, b) => Math.abs(txt.x - a.coord) - Math.abs(txt.x - b.coord))[0];

    const distH = nearHGrid ? Math.abs(txt.y - nearHGrid.coord) : Infinity;
    const distV = nearVGrid ? Math.abs(txt.x - nearVGrid.coord) : Infinity;

    // Try whichever grid axis the label is closer to first
    const tryHorizontal = (): boolean => {
      if (!nearHGrid || gridAxes.vertical.length < 2) return false;
      const leftGrids = gridAxes.vertical.filter((vg) => vg.coord < txt.x - 10);
      const rightGrids = gridAxes.vertical.filter((vg) => vg.coord > txt.x + 10);
      const vLeft = leftGrids[leftGrids.length - 1];
      const vRight = rightGrids[0];

      if (vLeft && vRight && vRight.coord - vLeft.coord >= minLengthPx) {
        const startPt = { x: vLeft.coord, y: nearHGrid.coord };
        const endPt = { x: vRight.coord, y: nearHGrid.coord };
        if (!isDuplicateBeam(startPt, endPt, 'horizontal')) {
          usedLabelIndices.add(tIdx);
          counts.gridGuidedBeams++;
          const midX = (startPt.x + endPt.x) / 2;
          const midY = (startPt.y + endPt.y) / 2;
          const inferredHeight = inferBeamHeightFromNearbyTexts(midX, midY, texts, defaultHeightCm);
          beams.push(
            createBeamElement(cleanTagName, startPt, endPt, inferredHeight, DEFAULT_BEAM_WIDTH_CM)
          );
          return true;
        }
      }
      return false;
    };

    const tryVertical = (): boolean => {
      if (!nearVGrid || gridAxes.horizontal.length < 2) return false;
      const topGrids = gridAxes.horizontal.filter((hg) => hg.coord < txt.y - 10);
      const bottomGrids = gridAxes.horizontal.filter((hg) => hg.coord > txt.y + 10);
      const hTop = topGrids[topGrids.length - 1];
      const hBottom = bottomGrids[0];

      if (hTop && hBottom && hBottom.coord - hTop.coord >= minLengthPx) {
        const startPt = { x: nearVGrid.coord, y: hTop.coord };
        const endPt = { x: nearVGrid.coord, y: hBottom.coord };
        if (!isDuplicateBeam(startPt, endPt, 'vertical')) {
          usedLabelIndices.add(tIdx);
          counts.gridGuidedBeams++;
          const midX = (startPt.x + endPt.x) / 2;
          const midY = (startPt.y + endPt.y) / 2;
          const inferredHeight = inferBeamHeightFromNearbyTexts(midX, midY, texts, defaultHeightCm);
          beams.push(
            createBeamElement(cleanTagName, startPt, endPt, inferredHeight, DEFAULT_BEAM_WIDTH_CM)
          );
          return true;
        }
      }
      return false;
    };

    if (distV < distH) {
      if (!tryVertical()) tryHorizontal();
    } else {
      if (!tryHorizontal()) tryVertical();
    }
  }

  // =========================================================================
  // PASS 4: Snap Secondary Beam (คานซอย) Endpoints to Perpendicular Main Beams
  // Ensures T-junctions where secondary beams meet main beams are cleanly registered
  // so main beam formwork splits around secondary beams and never covers them.
  // =========================================================================
  const tJunctionSnapTol = Math.max(32, 32 * safeScale);
  for (const b of beams) {
    const isH = Math.abs(b.end.x - b.start.x) >= Math.abs(b.end.y - b.start.y);
    for (const other of beams) {
      if (other.id === b.id) continue;
      const otherIsH = Math.abs(other.end.x - other.start.x) >= Math.abs(other.end.y - other.start.y);
      if (otherIsH === isH) continue;

      if (isH) {
        // b is Horizontal (y = bY), other is Vertical (x = oX, y in [oMinY, oMaxY])
        const bY = (b.start.y + b.end.y) / 2;
        const oX = (other.start.x + other.end.x) / 2;
        const oMinY = Math.min(other.start.y, other.end.y) - tJunctionSnapTol;
        const oMaxY = Math.max(other.start.y, other.end.y) + tJunctionSnapTol;
        if (bY >= oMinY && bY <= oMaxY) {
          if (Math.abs(b.start.x - oX) <= tJunctionSnapTol) {
            b.start = { x: oX, y: b.start.y };
          }
          if (Math.abs(b.end.x - oX) <= tJunctionSnapTol) {
            b.end = { x: oX, y: b.end.y };
          }
        }
      } else {
        // b is Vertical (x = bX), other is Horizontal (y = oY, x in [oMinX, oMaxX])
        const bX = (b.start.x + b.end.x) / 2;
        const oY = (other.start.y + other.end.y) / 2;
        const oMinX = Math.min(other.start.x, other.end.x) - tJunctionSnapTol;
        const oMaxX = Math.max(other.start.x, other.end.x) + tJunctionSnapTol;
        if (bX >= oMinX && bX <= oMaxX) {
          if (Math.abs(b.start.y - oY) <= tJunctionSnapTol) {
            b.start = { x: b.start.x, y: oY };
          }
          if (Math.abs(b.end.y - oY) <= tJunctionSnapTol) {
            b.end = { x: b.end.x, y: oY };
          }
        }
      }
    }
  }

  // =========================================================================
  // PASS 5: Convert Detected Structural Spans into Individual Formwork Sides (ไม้แบบแต่ละด้าน)
  // Abolishes the 2-sided beam object ("คาน") in output: creates independent single_edge
  // formwork lines for each side (บน, ล่าง, ซ้าย, ขวา) and carves out T-junction / Cross-junction
  // openings so formwork never covers intersecting secondary beams (คานซอย).
  // =========================================================================
  const formworkSides = convertDetectedBeamsToFormworkSides(beams, safeScale);
  const cleanSides = applyAutoCornerExtensions(formworkSides, safeScale);
  counts.detectedBeams = cleanSides.length;
  return {
    beams: cleanSides,
    classifiedLines,
    gridAxes,
    counts,
  };
}

function subtractLinearIntervals(
  start: number,
  end: number,
  cutouts: Array<{ start: number; end: number }>,
  minSegLen: number
): Array<{ start: number; end: number }> {
  let segments: Array<{ start: number; end: number }> = [{ start, end }];
  for (const cut of cutouts) {
    const next: Array<{ start: number; end: number }> = [];
    for (const seg of segments) {
      if (cut.end <= seg.start + 0.5 || cut.start >= seg.end - 0.5) {
        next.push(seg);
      } else {
        if (cut.start - seg.start >= minSegLen) {
          next.push({ start: seg.start, end: cut.start });
        }
        if (seg.end - cut.end >= minSegLen) {
          next.push({ start: cut.end, end: seg.end });
        }
      }
    }
    segments = next;
  }
  return segments.filter((s) => s.end - s.start >= minSegLen);
}

/**
 * Splits each detected beam span into independent single_edge formwork sides (ไม้แบบแต่ละด้าน: บน/ล่าง or ซ้าย/ขวา)
 * and automatically carves out perpendicular beam intersections (L-corners, T-junction คานซอย, Cross-junctions).
 */
export function convertDetectedBeamsToFormworkSides(
  rawBeams: BeamElement[],
  safeScale: number
): BeamElement[] {
  const sides: BeamElement[] = [];
  const tol = Math.max(20, 22 * safeScale);
  const minSegLen = Math.max(12, 12 * safeScale);

  for (const b of rawBeams) {
    const isH = Math.abs(b.end.x - b.start.x) >= Math.abs(b.end.y - b.start.y);
    const widthCm = b.widthCm || DEFAULT_BEAM_WIDTH_CM;
    const halfW = (widthCm * safeScale) / 2;

    if (isH) {
      const bY = (b.start.y + b.end.y) / 2;
      const bMinX = Math.min(b.start.x, b.end.x);
      const bMaxX = Math.max(b.start.x, b.end.x);
      const topY = bY - halfW;
      const botY = bY + halfW;

      let topStartX = bMinX;
      let topEndX = bMaxX;
      const topCutouts: Array<{ start: number; end: number }> = [];

      let botStartX = bMinX;
      let botEndX = bMaxX;
      const botCutouts: Array<{ start: number; end: number }> = [];

      for (const other of rawBeams) {
        if (other.id === b.id) continue;
        const otherIsH = Math.abs(other.end.x - other.start.x) >= Math.abs(other.end.y - other.start.y);
        if (otherIsH) continue;

        const oX = (other.start.x + other.end.x) / 2;
        const oMinY = Math.min(other.start.y, other.end.y);
        const oMaxY = Math.max(other.start.y, other.end.y);
        const oHalfW = ((other.widthCm || DEFAULT_BEAM_WIDTH_CM) * safeScale) / 2;

        if (
          oX >= bMinX - oHalfW - tol &&
          oX <= bMaxX + oHalfW + tol &&
          bY >= oMinY - halfW - tol &&
          bY <= oMaxY + halfW + tol
        ) {
          const goesUp = oMinY < bY - tol * 0.25;
          const goesDown = oMaxY > bY + tol * 0.25;

          if (goesUp) {
            topCutouts.push({ start: oX - oHalfW, end: oX + oHalfW });
          } else {
            if (Math.abs(oX - bMinX) <= oHalfW + tol) {
              topStartX = Math.min(topStartX, oX - oHalfW);
            }
            if (Math.abs(oX - bMaxX) <= oHalfW + tol) {
              topEndX = Math.max(topEndX, oX + oHalfW);
            }
          }

          if (goesDown) {
            botCutouts.push({ start: oX - oHalfW, end: oX + oHalfW });
          } else {
            if (Math.abs(oX - bMinX) <= oHalfW + tol) {
              botStartX = Math.min(botStartX, oX - oHalfW);
            }
            if (Math.abs(oX - bMaxX) <= oHalfW + tol) {
              botEndX = Math.max(botEndX, oX + oHalfW);
            }
          }
        }
      }

      const topSegs = subtractLinearIntervals(topStartX, topEndX, topCutouts, minSegLen);
      topSegs.forEach((seg, idx) => {
        const suffix = topSegs.length > 1 ? `-บน(${idx + 1})` : `-บน`;
        sides.push(
          createFormworkEdgeElement(
            `${b.name}${suffix}`,
            { x: seg.start, y: topY },
            { x: seg.end, y: topY },
            'right',
            b.defaultHeightCm,
            'outer',
            widthCm,
            0,
            0
          )
        );
      });

      const botSegs = subtractLinearIntervals(botStartX, botEndX, botCutouts, minSegLen);
      botSegs.forEach((seg, idx) => {
        const suffix = botSegs.length > 1 ? `-ล่าง(${idx + 1})` : `-ล่าง`;
        sides.push(
          createFormworkEdgeElement(
            `${b.name}${suffix}`,
            { x: seg.start, y: botY },
            { x: seg.end, y: botY },
            'left',
            b.defaultHeightCm,
            'inner',
            widthCm,
            0,
            0
          )
        );
      });
    } else {
      const bX = (b.start.x + b.end.x) / 2;
      const bMinY = Math.min(b.start.y, b.end.y);
      const bMaxY = Math.max(b.start.y, b.end.y);
      const leftX = bX - halfW;
      const rightX = bX + halfW;

      let leftStartY = bMinY;
      let leftEndY = bMaxY;
      const leftCutouts: Array<{ start: number; end: number }> = [];

      let rightStartY = bMinY;
      let rightEndY = bMaxY;
      const rightCutouts: Array<{ start: number; end: number }> = [];

      for (const other of rawBeams) {
        if (other.id === b.id) continue;
        const otherIsH = Math.abs(other.end.x - other.start.x) >= Math.abs(other.end.y - other.start.y);
        if (!otherIsH) continue;

        const oY = (other.start.y + other.end.y) / 2;
        const oMinX = Math.min(other.start.x, other.end.x);
        const oMaxX = Math.max(other.start.x, other.end.x);
        const oHalfW = ((other.widthCm || DEFAULT_BEAM_WIDTH_CM) * safeScale) / 2;

        if (
          oY >= bMinY - oHalfW - tol &&
          oY <= bMaxY + oHalfW + tol &&
          bX >= oMinX - halfW - tol &&
          bX <= oMaxX + halfW + tol
        ) {
          const goesLeft = oMinX < bX - tol * 0.25;
          const goesRight = oMaxX > bX + tol * 0.25;

          if (goesLeft) {
            leftCutouts.push({ start: oY - oHalfW, end: oY + oHalfW });
          } else {
            if (Math.abs(oY - bMinY) <= oHalfW + tol) {
              leftStartY = Math.min(leftStartY, oY - oHalfW);
            }
            if (Math.abs(oY - bMaxY) <= oHalfW + tol) {
              leftEndY = Math.max(leftEndY, oY + oHalfW);
            }
          }

          if (goesRight) {
            rightCutouts.push({ start: oY - oHalfW, end: oY + oHalfW });
          } else {
            if (Math.abs(oY - bMinY) <= oHalfW + tol) {
              rightStartY = Math.min(rightStartY, oY - oHalfW);
            }
            if (Math.abs(oY - bMaxY) <= oHalfW + tol) {
              rightEndY = Math.max(rightEndY, oY + oHalfW);
            }
          }
        }
      }

      const leftSegs = subtractLinearIntervals(leftStartY, leftEndY, leftCutouts, minSegLen);
      leftSegs.forEach((seg, idx) => {
        const suffix = leftSegs.length > 1 ? `-ซ้าย(${idx + 1})` : `-ซ้าย`;
        sides.push(
          createFormworkEdgeElement(
            `${b.name}${suffix}`,
            { x: leftX, y: seg.start },
            { x: leftX, y: seg.end },
            'left',
            b.defaultHeightCm,
            'outer',
            widthCm,
            0,
            0
          )
        );
      });

      const rightSegs = subtractLinearIntervals(rightStartY, rightEndY, rightCutouts, minSegLen);
      rightSegs.forEach((seg, idx) => {
        const suffix = rightSegs.length > 1 ? `-ขวา(${idx + 1})` : `-ขวา`;
        sides.push(
          createFormworkEdgeElement(
            `${b.name}${suffix}`,
            { x: rightX, y: seg.start },
            { x: rightX, y: seg.end },
            'right',
            b.defaultHeightCm,
            'inner',
            widthCm,
            0,
            0
          )
        );
      });
    }
  }

  return groupClosedInnerBayLoops(sides, safeScale);
}

/**
 * Finds closed 4-sided inner bay loops (วงรอบในของไม้แบบ) among detected formwork sides
 * and groups each 4-sided loop into a 4-corner adjustable rectangle (boxGroupId)
 * that auto-arranges formwork inside and can be ungrouped into individual lines at any time.
 */
function groupClosedInnerBayLoops(
  sides: BeamElement[],
  safeScale: number
): BeamElement[] {
  const cornerTol = Math.max(8, 10 * safeScale);
  const usedIds = new Set<string>();
  let bayCounter = 1;

  for (const topSeg of sides) {
    if (usedIds.has(topSeg.id) || topSeg.boxGroupId) continue;
    const isTopH =
      Math.abs(topSeg.end.x - topSeg.start.x) >= Math.abs(topSeg.end.y - topSeg.start.y);
    if (!isTopH) continue;
    // Top of an inner bay has downward (+Y) formwork normal: for left->right (end.x > start.x), leftSide.enabled is true
    const inMinX = Math.min(topSeg.start.x, topSeg.end.x);
    const inMaxX = Math.max(topSeg.start.x, topSeg.end.x);
    const inMinY = (topSeg.start.y + topSeg.end.y) / 2;
    const topNormalY =
      (topSeg.end.x >= topSeg.start.x ? 1 : -1) *
      (topSeg.leftSide.enabled !== false ? 1 : -1);
    if (topNormalY <= 0) continue;

    // Find matching right vertical segment at x ≈ inMaxX starting at y ≈ inMinY with leftward (-X) formwork normal
    const rightSeg = sides.find((s) => {
      if (usedIds.has(s.id) || s.id === topSeg.id || s.boxGroupId) return false;
      const isV = Math.abs(s.end.y - s.start.y) > Math.abs(s.end.x - s.start.x);
      if (!isV) return false;
      const sx = (s.start.x + s.end.x) / 2;
      const sMinY = Math.min(s.start.y, s.end.y);
      const normalX =
        (s.end.y >= s.start.y ? -1 : 1) * (s.leftSide.enabled !== false ? 1 : -1);
      return (
        normalX < 0 &&
        Math.abs(sx - inMaxX) <= cornerTol &&
        Math.abs(sMinY - inMinY) <= cornerTol
      );
    });
    if (!rightSeg) continue;

    const inMaxY = Math.max(rightSeg.start.y, rightSeg.end.y);
    if (inMaxY - inMinY < 20) continue;

    // Find matching bottom horizontal segment at y ≈ inMaxY spanning [inMinX, inMaxX] with upward (-Y) formwork normal
    const botSeg = sides.find((s) => {
      if (usedIds.has(s.id) || s.id === topSeg.id || s.boxGroupId) return false;
      const isH = Math.abs(s.end.x - s.start.x) >= Math.abs(s.end.y - s.start.y);
      if (!isH) return false;
      const sy = (s.start.y + s.end.y) / 2;
      const sMinX = Math.min(s.start.x, s.end.x);
      const sMaxX = Math.max(s.start.x, s.end.x);
      const normalY =
        (s.end.x >= s.start.x ? 1 : -1) * (s.leftSide.enabled !== false ? 1 : -1);
      return (
        normalY < 0 &&
        Math.abs(sy - inMaxY) <= cornerTol &&
        Math.abs(sMinX - inMinX) <= cornerTol &&
        Math.abs(sMaxX - inMaxX) <= cornerTol
      );
    });
    if (!botSeg) continue;

    // Find matching left vertical segment at x ≈ inMinX spanning [inMinY, inMaxY] with rightward (+X) formwork normal
    const leftSeg = sides.find((s) => {
      if (usedIds.has(s.id) || s.id === rightSeg.id || s.boxGroupId) return false;
      const isV = Math.abs(s.end.y - s.start.y) > Math.abs(s.end.x - s.start.x);
      if (!isV) return false;
      const sx = (s.start.x + s.end.x) / 2;
      const sMinY = Math.min(s.start.y, s.end.y);
      const sMaxY = Math.max(s.start.y, s.end.y);
      const normalX =
        (s.end.y >= s.start.y ? -1 : 1) * (s.leftSide.enabled !== false ? 1 : -1);
      return (
        normalX > 0 &&
        Math.abs(sx - inMinX) <= cornerTol &&
        Math.abs(sMinY - inMinY) <= cornerTol &&
        Math.abs(sMaxY - inMaxY) <= cornerTol
      );
    });
    if (!leftSeg) continue;

    const groupId = `auto-inner-bay-${bayCounter++}`;
    usedIds.add(topSeg.id);
    usedIds.add(rightSeg.id);
    usedIds.add(botSeg.id);
    usedIds.add(leftSeg.id);

    // Normalize all 4 segments into a clockwise inner rectangle loop with 'left' inward active side
    topSeg.start = { x: inMinX, y: inMinY };
    topSeg.end = { x: inMaxX, y: inMinY };
    topSeg.edgeRole = 'inner';
    topSeg.boxGroupId = groupId;
    topSeg.boxSide = 'top';
    topSeg.leftSide = { ...topSeg.leftSide, enabled: true, startExtensionCm: 0, endExtensionCm: 0 };
    topSeg.rightSide = { ...topSeg.rightSide, enabled: false, startExtensionCm: 0, endExtensionCm: 0 };

    rightSeg.start = { x: inMaxX, y: inMinY };
    rightSeg.end = { x: inMaxX, y: inMaxY };
    rightSeg.edgeRole = 'inner';
    rightSeg.boxGroupId = groupId;
    rightSeg.boxSide = 'right';
    rightSeg.leftSide = {
      ...rightSeg.leftSide,
      enabled: true,
      startExtensionCm: -FORMWORK_THICKNESS_CM,
      endExtensionCm: -FORMWORK_THICKNESS_CM,
    };
    rightSeg.rightSide = { ...rightSeg.rightSide, enabled: false, startExtensionCm: 0, endExtensionCm: 0 };

    botSeg.start = { x: inMaxX, y: inMaxY };
    botSeg.end = { x: inMinX, y: inMaxY };
    botSeg.edgeRole = 'inner';
    botSeg.boxGroupId = groupId;
    botSeg.boxSide = 'bottom';
    botSeg.leftSide = { ...botSeg.leftSide, enabled: true, startExtensionCm: 0, endExtensionCm: 0 };
    botSeg.rightSide = { ...botSeg.rightSide, enabled: false, startExtensionCm: 0, endExtensionCm: 0 };

    leftSeg.start = { x: inMinX, y: inMaxY };
    leftSeg.end = { x: inMinX, y: inMinY };
    leftSeg.edgeRole = 'inner';
    leftSeg.boxGroupId = groupId;
    leftSeg.boxSide = 'left';
    leftSeg.leftSide = {
      ...leftSeg.leftSide,
      enabled: true,
      startExtensionCm: -FORMWORK_THICKNESS_CM,
      endExtensionCm: -FORMWORK_THICKNESS_CM,
    };
    leftSeg.rightSide = { ...leftSeg.rightSide, enabled: false, startExtensionCm: 0, endExtensionCm: 0 };
  }

  return sides;
}

export interface SnapPoint {
  x: number;
  y: number;
  kind: 'column_corner' | 'line_corner' | 'beam_endpoint';
  label: string;
}

/**
 * Extracts magnetic Snap Points at Column Corners (มุมเสา), PDF Vector Line Intersections,
 * and Existing Beam Corners so manual drawing tools snap accurately to columns on imported plans.
 */
export function extractColumnSnapPoints(
  lines: RawVectorLine[],
  texts: RawTextItem[],
  beams: BeamElement[],
  pixelsPerCm: number,
  beamWidthCm: number = DEFAULT_BEAM_WIDTH_CM,
  pageDimensions?: { width: number; height: number }
): SnapPoint[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const halfW = (beamWidthCm * safeScale) / 2;
  const rawPoints: SnapPoint[] = [];

  if (lines.length > 0) {
    const classified = classifyPlanLines(lines, texts, pageDimensions);
    const grids = extractGridAxes(classified, texts);

    // 1. 4 Column Corners around every Grid Intersection (มุมเสารอบจุดตัดกริด)
    for (const vg of grids.vertical) {
      for (const hg of grids.horizontal) {
        const cx = vg.coord;
        const cy = hg.coord;
        rawPoints.push(
          { x: cx - halfW, y: cy - halfW, kind: 'column_corner', label: 'มุมเสา' },
          { x: cx + halfW, y: cy - halfW, kind: 'column_corner', label: 'มุมเสา' },
          { x: cx - halfW, y: cy + halfW, kind: 'column_corner', label: 'มุมเสา' },
          { x: cx + halfW, y: cy + halfW, kind: 'column_corner', label: 'มุมเสา' }
        );
      }
    }

    // 2. Intersections of Horizontal & Vertical beam/column lines directly from the PDF plan
    const horizLines = classified.filter(
      (c) => c.category === 'beam_candidate' && c.orientation === 'horizontal'
    );
    const vertLines = classified.filter(
      (c) => c.category === 'beam_candidate' && c.orientation === 'vertical'
    );
    const intersectTol = Math.max(8, 8 * safeScale);

    for (const hl of horizLines) {
      for (const vl of vertLines) {
        if (
          vl.coord >= hl.start - intersectTol &&
          vl.coord <= hl.end + intersectTol &&
          hl.coord >= vl.start - intersectTol &&
          hl.coord <= vl.end + intersectTol
        ) {
          rawPoints.push({
            x: vl.coord,
            y: hl.coord,
            kind: 'column_corner',
            label: 'มุมเสา/คาน',
          });
        }
      }
    }
  }

  // 3. Corners and endpoints of existing beams on canvas
  for (const b of beams) {
    rawPoints.push(
      { x: b.start.x, y: b.start.y, kind: 'beam_endpoint', label: 'มุมคาน' },
      { x: b.end.x, y: b.end.y, kind: 'beam_endpoint', label: 'มุมคาน' }
    );
    if (b.attachMode !== 'single_edge') {
      const dx = b.end.x - b.start.x;
      const dy = b.end.y - b.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const hw = ((b.widthCm || beamWidthCm) * safeScale) / 2;
      rawPoints.push(
        { x: b.start.x + nx * hw, y: b.start.y + ny * hw, kind: 'column_corner', label: 'มุมเสา/คาน' },
        { x: b.start.x - nx * hw, y: b.start.y - ny * hw, kind: 'column_corner', label: 'มุมเสา/คาน' },
        { x: b.end.x + nx * hw, y: b.end.y + ny * hw, kind: 'column_corner', label: 'มุมเสา/คาน' },
        { x: b.end.x - nx * hw, y: b.end.y - ny * hw, kind: 'column_corner', label: 'มุมเสา/คาน' }
      );
    }
  }

  // Deduplicate points within 2.5 px
  const deduped: SnapPoint[] = [];
  for (const pt of rawPoints) {
    const exists = deduped.some((d) => Math.hypot(d.x - pt.x, d.y - pt.y) < 2.5);
    if (!exists) {
      deduped.push(pt);
    }
  }

  return deduped;
}

export function autoDetectBeamsFromVectorLines(
  lines: RawVectorLine[],
  pixelsPerCm: number,
  defaultHeightCm: FormworkHeight = 60,
  texts: RawTextItem[] = [],
  pageDimensions?: { width: number; height: number }
): BeamElement[] {
  return autoDetectBeamsWithDiagnostics(
    lines,
    pixelsPerCm,
    defaultHeightCm,
    texts,
    pageDimensions
  ).beams;
}

export function generateSampleBeamPlan(): {
  beams: BeamElement[];
  pixelsPerCm: number;
  vectorLines: RawVectorLine[];
  texts: RawTextItem[];
} {
  const pixelsPerCm = 1.2;
  const x0 = 120;
  const x1 = x0 + 400 * pixelsPerCm;
  const x2 = x1 + 350 * pixelsPerCm;
  const y0 = 120;
  const y1 = y0 + 300 * pixelsPerCm;

  const beams: BeamElement[] = [
    createBeamElement('B1 (บนซ้าย)', { x: x0, y: y0 }, { x: x1, y: y0 }, 60, 20),
    createBeamElement('B2 (บนขวา)', { x: x1, y: y0 }, { x: x2, y: y0 }, 60, 20),
    createBeamElement('B3 (ล่างซ้าย)', { x: x0, y: y1 }, { x: x1, y: y1 }, 50, 20),
    createBeamElement('B4 (ล่างขวา)', { x: x1, y: y1 }, { x: x2, y: y1 }, 50, 20),
    createBeamElement('B5 (ซ้ายสุด)', { x: x0, y: y0 }, { x: x0, y: y1 }, 70, 20),
    createBeamElement('B6 (คานกลาง)', { x: x1, y: y0 }, { x: x1, y: y1 }, 60, 20),
    createBeamElement('B7 (ขวาสุด)', { x: x2, y: y0 }, { x: x2, y: y1 }, 40, 20),
  ];

  const halfW = 10 * pixelsPerCm;
  const vectorLines: RawVectorLine[] = [
    { x1: x0, y1: y0 - 45, x2: x1, y2: y0 - 45 },
    { x1: x1, y1: y0 - 45, x2: x2, y2: y0 - 45 },
  ];

  for (const b of beams) {
    const isH = Math.abs(b.end.y - b.start.y) < 1;
    if (isH) {
      vectorLines.push(
        { x1: b.start.x, y1: b.start.y - halfW, x2: b.end.x, y2: b.end.y - halfW },
        { x1: b.start.x, y1: b.start.y + halfW, x2: b.end.x, y2: b.end.y + halfW }
      );
    } else {
      vectorLines.push(
        { x1: b.start.x - halfW, y1: b.start.y, x2: b.end.x - halfW, y2: b.end.y },
        { x1: b.start.x + halfW, y1: b.start.y, x2: b.end.x + halfW, y2: b.end.y }
      );
    }
  }

  const texts: RawTextItem[] = [
    { text: '4.00', x: (x0 + x1) / 2, y: y0 - 52 },
    { text: '3.50', x: (x1 + x2) / 2, y: y0 - 52 },
    { text: '3.00', x: x0 - 55, y: (y0 + y1) / 2 },
  ];

  return { beams, pixelsPerCm, vectorLines, texts };
}
