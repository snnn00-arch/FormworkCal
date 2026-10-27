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

export interface BeamDetectionDiagnostics {
  beams: BeamElement[];
  classifiedLines: ClassifiedLine[];
  counts: {
    borderOrTitleBlock: number;
    gridOrDimension: number;
    beamCandidates: number;
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
  midX: number,
  midY: number,
  texts: RawTextItem[],
  usedLabels: Set<number>
): string | null {
  let bestIdx = -1;
  let bestDist = 75;

  for (let i = 0; i < texts.length; i++) {
    if (usedLabels.has(i)) continue;
    const t = texts[i].text.trim();
    if (!isBeamTagText(t)) continue;
    const d = Math.hypot(texts[i].x - midX, texts[i].y - midY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  if (bestIdx !== -1) {
    usedLabels.add(bestIdx);
    return texts[bestIdx].text.trim();
  }
  return null;
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
  const spanW = Math.max(maxX - (isFinite(minPageX) ? minPageX : 0), 400);
  const spanH = Math.max(maxY - (isFinite(minPageY) ? minPageY : 0), 300);

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

  for (const item of items) {
    if (item.orientation === 'diagonal') continue;

    // ---------------------------------------------------------
    // 1. Check PAPER BORDER & TITLE BLOCK (กรอบกระดาษ / ตารางข้างแบบ)
    // ---------------------------------------------------------
    if (item.orientation === 'horizontal') {
      const nearTopOrBottomMargin =
        pageDimensions && (item.coord < pageH * 0.085 || item.coord > pageH * 0.905);
      const isOuterDrawingFrame =
        lines.length >= 8 &&
        item.length > spanW * 0.65 &&
        (item.coord - minPageY < spanH * 0.06 || maxY - item.coord < spanH * 0.06);
      const spansEntireSheet =
        pageDimensions &&
        item.length > pageW * 0.72 &&
        (item.coord < pageH * 0.14 || item.coord > pageH * 0.86);
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
    } else if (item.orientation === 'vertical') {
      const nearLeftOrRightMargin =
        pageDimensions && (item.coord < pageW * 0.085 || item.coord > pageW * 0.905);
      const isOuterDrawingFrame =
        lines.length >= 8 &&
        item.length > spanH * 0.65 &&
        (item.coord - minPageX < spanW * 0.06 || maxX - item.coord < spanW * 0.06);
      const spansEntireSheet =
        pageDimensions &&
        item.length > pageH * 0.72 &&
        (item.coord < pageW * 0.14 || item.coord > pageW * 0.86);
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
      // Check if it has a twin of very similar length and aligned endpoints within 45px
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
    let touchesDimensionOrGridBubble = false;
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
        } else if (isDimensionText(txt.text) || isGridBubbleText(txt.text)) {
          touchesDimensionOrGridBubble = true;
        }
      }
    }

    if (touchesDimensionOrGridBubble && !touchesBeamTag) {
      item.category = 'grid_or_dimension';
      item.reason = 'dimension_or_grid_label_line';
      continue;
    }
  }

  // ---------------------------------------------------------
  // 3. Detect Dense Schedule / Legend Tables (ตารางถี่ๆ ที่ไม่ใช่คาน)
  // If >= 5 parallel lines of almost identical start/end are stacked within 35px intervals,
  // they belong to a schedule table or stair hatch, not beams.
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
 * Stage 2: Pairs only verified 'beam_candidate' lines that satisfy strict
 * structural beam symmetry (aligned start/end faces, realistic width, no inner lines).
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

  const counts = {
    borderOrTitleBlock: classifiedLines.filter((l) => l.category === 'border_or_titleblock').length,
    gridOrDimension: classifiedLines.filter((l) => l.category === 'grid_or_dimension').length,
    beamCandidates: classifiedLines.filter((l) => l.category === 'beam_candidate').length,
    detectedBeams: 0,
  };

  const candidates = classifiedLines.filter((l) => l.category === 'beam_candidate');

  // Beam width range: 10 cm to 40 cm (clamped safely for 1:100 and 1:50 drawings)
  const minWidthPx = Math.max(5, 8 * safeScale);
  const maxWidthPx = Math.max(38, 42 * safeScale);
  const minLengthPx = Math.max(45, 50 * safeScale);
  const targetWidthPx = 20 * safeScale;

  const usedIndices = new Set<number>();
  const usedLabelIndices = new Set<number>();
  const beams: BeamElement[] = [];
  let indexCounter = 1;

  for (let i = 0; i < candidates.length; i++) {
    if (usedIndices.has(i)) continue;
    const c1 = candidates[i];
    if (c1.length < minLengthPx) continue;

    let bestPartnerIdx = -1;
    let bestScore = Infinity;
    let bestGeom: { start: Point; end: Point; gapPx: number } | null = null;

    for (let j = i + 1; j < candidates.length; j++) {
      if (usedIndices.has(j)) continue;
      const c2 = candidates[j];
      if (c2.orientation !== c1.orientation) continue;
      if (c2.length < minLengthPx) continue;

      const gapPx = Math.abs(c1.coord - c2.coord);
      if (gapPx < minWidthPx || gapPx > maxWidthPx) continue;

      const overlapStart = Math.max(c1.start, c2.start);
      const overlapEnd = Math.min(c1.end, c2.end);
      const overlap = overlapEnd - overlapStart;
      if (overlap < minLengthPx) continue;

      // CRITICAL BEAM vs GRID CHECK:
      // A true beam's two parallel edges terminate at the same column/beam faces!
      // A grid line paired with a beam edge has a massive overshoot at one or both ends.
      const startDiff = Math.abs(c1.start - c2.start);
      const endDiff = Math.abs(c1.end - c2.end);
      const maxAllowedEndMismatch = Math.max(gapPx * 2.2, 35);
      const maxLen = Math.max(c1.length, c2.length);
      const overlapRatio = overlap / maxLen;

      if (startDiff > maxAllowedEndMismatch || endDiff > maxAllowedEndMismatch) {
        continue;
      }
      if (overlapRatio < 0.72) {
        continue;
      }

      // Aspect ratio check: beam length must be at least 2.5x its width
      if (overlap < gapPx * 2.5) {
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

      const score =
        Math.abs(gapPx - targetWidthPx) * 2.0 +
        (startDiff + endDiff) * 0.8 +
        Math.abs(c1.length - c2.length) * 0.4;

      if (score < bestScore) {
        bestScore = score;
        bestPartnerIdx = j;
        const midCoord = (c1.coord + c2.coord) / 2;
        bestGeom =
          c1.orientation === 'horizontal'
            ? {
                start: { x: overlapStart, y: midCoord },
                end: { x: overlapEnd, y: midCoord },
                gapPx,
              }
            : {
                start: { x: midCoord, y: overlapStart },
                end: { x: midCoord, y: overlapEnd },
                gapPx,
              };
      }
    }

    if (bestPartnerIdx !== -1 && bestGeom) {
      usedIndices.add(i);
      usedIndices.add(bestPartnerIdx);

      const midX = (bestGeom.start.x + bestGeom.end.x) / 2;
      const midY = (bestGeom.start.y + bestGeom.end.y) / 2;
      const detectedLabel = findNearestBeamLabel(midX, midY, texts, usedLabelIndices);
      const beamName = detectedLabel || `B${indexCounter++}`;
      const widthCm = Math.max(10, Math.round(bestGeom.gapPx / safeScale));

      beams.push(
        createBeamElement(beamName, bestGeom.start, bestGeom.end, defaultHeightCm, widthCm)
      );
    }
  }

  counts.detectedBeams = beams.length;
  return {
    beams,
    classifiedLines,
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
