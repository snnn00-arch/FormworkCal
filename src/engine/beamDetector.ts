import {
  BeamElement,
  FORMWORK_THICKNESS_CM,
  FormworkHeight,
  Point,
} from '../types/formwork';
import { RawTextItem, RawVectorLine } from './scaleCalibrator';

let beamCounter = 1;

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

function findNearestBeamLabel(
  midX: number,
  midY: number,
  texts: RawTextItem[],
  usedLabels: Set<number>
): string | null {
  let bestIdx = -1;
  let bestDist = 75; // within 75 px of beam midpoint

  for (let i = 0; i < texts.length; i++) {
    if (usedLabels.has(i)) continue;
    const t = texts[i].text.trim();
    // Match structural beam tags such as B1, B2, GB1, FB1, RB1, CB1, WB1, B-1
    if (!/^(?:G?B|FB|RB|CB|WB|SB)[-_\s]?\d+[A-Z]?$/i.test(t)) continue;
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

export function autoDetectBeamsFromVectorLines(
  lines: RawVectorLine[],
  pixelsPerCm: number,
  defaultHeightCm: FormworkHeight = 60,
  texts: RawTextItem[] = []
): BeamElement[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  // Support both zoomed-out (1:100) and zoomed-in (1:50) PDF plans
  const minWidthPx = Math.max(5, 8 * safeScale);
  const maxWidthPx = Math.max(42, 45 * safeScale);
  const minLengthPx = Math.max(45, 50 * safeScale);
  const targetWidthPx = 20 * safeScale;

  const usedIndices = new Set<number>();
  const usedLabelIndices = new Set<number>();
  const beams: BeamElement[] = [];
  let indexCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    if (usedIndices.has(i)) continue;
    const l1 = lines[i];
    const len1 = Math.hypot(l1.x2 - l1.x1, l1.y2 - l1.y1);
    if (len1 < minLengthPx) continue;

    const isHoriz1 = Math.abs(l1.y2 - l1.y1) <= Math.abs(l1.x2 - l1.x1) * 0.12;
    const isVert1 = Math.abs(l1.x2 - l1.x1) <= Math.abs(l1.y2 - l1.y1) * 0.12;
    if (!isHoriz1 && !isVert1) continue;

    let bestPartnerIdx = -1;
    let bestScore = Infinity;
    let bestBeamGeom: { start: Point; end: Point; gapPx: number } | null = null;

    for (let j = i + 1; j < lines.length; j++) {
      if (usedIndices.has(j)) continue;
      const l2 = lines[j];
      const len2 = Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1);
      if (len2 < minLengthPx) continue;

      if (isHoriz1) {
        const isHoriz2 = Math.abs(l2.y2 - l2.y1) <= Math.abs(l2.x2 - l2.x1) * 0.12;
        if (!isHoriz2) continue;

        const y1 = (l1.y1 + l1.y2) / 2;
        const y2 = (l2.y1 + l2.y2) / 2;
        const gapPx = Math.abs(y1 - y2);
        if (gapPx < minWidthPx || gapPx > maxWidthPx) continue;

        const minX1 = Math.min(l1.x1, l1.x2);
        const maxX1 = Math.max(l1.x1, l1.x2);
        const minX2 = Math.min(l2.x1, l2.x2);
        const maxX2 = Math.max(l2.x1, l2.x2);
        const overlapStart = Math.max(minX1, minX2);
        const overlapEnd = Math.min(maxX1, maxX2);
        const overlap = overlapEnd - overlapStart;
        const minSegLen = Math.min(len1, len2);

        if (overlap >= minLengthPx && overlap >= minSegLen * 0.65) {
          // Prefer gap closest to 20cm beam width and high length similarity
          const score =
            Math.abs(gapPx - targetWidthPx) * 2 + Math.abs(len1 - len2) * 0.25;
          if (score < bestScore) {
            bestScore = score;
            bestPartnerIdx = j;
            const midY = (y1 + y2) / 2;
            bestBeamGeom = {
              start: { x: overlapStart, y: midY },
              end: { x: overlapEnd, y: midY },
              gapPx,
            };
          }
        }
      } else if (isVert1) {
        const isVert2 = Math.abs(l2.x2 - l2.x1) <= Math.abs(l2.y2 - l2.y1) * 0.12;
        if (!isVert2) continue;

        const x1 = (l1.x1 + l1.x2) / 2;
        const x2 = (l2.x1 + l2.x2) / 2;
        const gapPx = Math.abs(x1 - x2);
        if (gapPx < minWidthPx || gapPx > maxWidthPx) continue;

        const minY1 = Math.min(l1.y1, l1.y2);
        const maxY1 = Math.max(l1.y1, l1.y2);
        const minY2 = Math.min(l2.y1, l2.y2);
        const maxY2 = Math.max(l2.y1, l2.y2);
        const overlapStart = Math.max(minY1, minY2);
        const overlapEnd = Math.min(maxY1, maxY2);
        const overlap = overlapEnd - overlapStart;
        const minSegLen = Math.min(len1, len2);

        if (overlap >= minLengthPx && overlap >= minSegLen * 0.65) {
          const score =
            Math.abs(gapPx - targetWidthPx) * 2 + Math.abs(len1 - len2) * 0.25;
          if (score < bestScore) {
            bestScore = score;
            bestPartnerIdx = j;
            const midX = (x1 + x2) / 2;
            bestBeamGeom = {
              start: { x: midX, y: overlapStart },
              end: { x: midX, y: overlapEnd },
              gapPx,
            };
          }
        }
      }
    }

    if (bestPartnerIdx !== -1 && bestBeamGeom) {
      usedIndices.add(i);
      usedIndices.add(bestPartnerIdx);
      const midX = (bestBeamGeom.start.x + bestBeamGeom.end.x) / 2;
      const midY = (bestBeamGeom.start.y + bestBeamGeom.end.y) / 2;
      const detectedLabel = findNearestBeamLabel(midX, midY, texts, usedLabelIndices);
      const beamName = detectedLabel || `B${indexCounter++}`;
      const widthCm = Math.max(10, Math.round(bestBeamGeom.gapPx / safeScale));

      beams.push(
        createBeamElement(
          beamName,
          bestBeamGeom.start,
          bestBeamGeom.end,
          defaultHeightCm,
          widthCm
        )
      );
    }
  }

  return beams;
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
