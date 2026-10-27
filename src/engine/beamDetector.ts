import {
  BeamElement,
  FORMWORK_THICKNESS_CM,
  FormworkHeight,
  Point,
} from '../types/formwork';
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
  widthCm = 20
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
    leftSide: {
      side: 'left',
      heightCm,
      startExtensionCm: 0,
      endExtensionCm: 0,
    },
    rightSide: {
      side: 'right',
      heightCm,
      startExtensionCm: 0,
      endExtensionCm: 0,
    },
  };
}

function isBeamTagText(text: string): boolean {
  const t = text.trim();
  return /^(?:G?B|FB|RB|CB|WB|SB|PB|คาน)[-_\s]?\d+[A-Z0-9-]*$/i.test(t);
}

function isDimensionText(text: string): boolean {
  const t = text.trim().replace(/,/g, '');
  return /^\d+\.\d{2}\s*(?:m|ม\.?)?$/i.test(t) || /^(?:[1-9]\d{2,4})\s*(?:mm|cm)?$/i.test(t);
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
  maxOrthogonalDist = 38
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
    return texts[bestIdx].text.trim();
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
      const widthCm = Math.max(10, Math.round(bestGeom.gapPx / safeScale));

      if (bestGeom.isGridGuided) {
        counts.gridGuidedBeams++;
      }

      beams.push(
        createBeamElement(beamName, bestGeom.start, bestGeom.end, defaultHeightCm, widthCm)
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
      const halfWidthPx = Math.max(6, Math.abs(c.coord - nearGrid.coord));
      const estGapPx = Math.min(maxWidthPx, Math.max(minWidthPx, halfWidthPx * 2));
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
        const widthCm = Math.max(15, Math.round(estGapPx / safeScale));

        counts.gridGuidedBeams++;
        beams.push(createBeamElement(beamName, startPt, endPt, defaultHeightCm, widthCm));
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
          beams.push(createBeamElement(txt.text.trim(), startPt, endPt, defaultHeightCm, 20));
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
          beams.push(createBeamElement(txt.text.trim(), startPt, endPt, defaultHeightCm, 20));
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

  counts.detectedBeams = beams.length;
  return {
    beams,
    classifiedLines,
    gridAxes,
    counts,
  };
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
