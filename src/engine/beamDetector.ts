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

export function autoDetectBeamsFromVectorLines(
  lines: RawVectorLine[],
  pixelsPerCm: number,
  defaultHeightCm: FormworkHeight = 60
): BeamElement[] {
  const safeScale = pixelsPerCm > 0 ? pixelsPerCm : 1;
  const minWidthPx = 12 * safeScale;
  const maxWidthPx = 45 * safeScale;
  const minLengthPx = 60 * safeScale;

  const usedIndices = new Set<number>();
  const beams: BeamElement[] = [];
  let indexCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    if (usedIndices.has(i)) continue;
    const l1 = lines[i];
    const len1 = Math.hypot(l1.x2 - l1.x1, l1.y2 - l1.y1);
    if (len1 < minLengthPx) continue;

    const isHoriz1 = Math.abs(l1.y2 - l1.y1) <= Math.abs(l1.x2 - l1.x1) * 0.15;
    const isVert1 = Math.abs(l1.x2 - l1.x1) <= Math.abs(l1.y2 - l1.y1) * 0.15;
    if (!isHoriz1 && !isVert1) continue;

    for (let j = i + 1; j < lines.length; j++) {
      if (usedIndices.has(j)) continue;
      const l2 = lines[j];
      const len2 = Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1);
      if (len2 < minLengthPx) continue;

      if (isHoriz1) {
        const isHoriz2 = Math.abs(l2.y2 - l2.y1) <= Math.abs(l2.x2 - l2.x1) * 0.15;
        if (!isHoriz2) continue;
        const y1 = (l1.y1 + l1.y2) / 2;
        const y2 = (l2.y1 + l2.y2) / 2;
        const gapPx = Math.abs(y1 - y2);
        const minX1 = Math.min(l1.x1, l1.x2);
        const maxX1 = Math.max(l1.x1, l1.x2);
        const minX2 = Math.min(l2.x1, l2.x2);
        const maxX2 = Math.max(l2.x1, l2.x2);
        const overlap = Math.min(maxX1, maxX2) - Math.max(minX1, minX2);

        if (gapPx >= minWidthPx && gapPx <= maxWidthPx && overlap >= minLengthPx * 0.7) {
          usedIndices.add(i);
          usedIndices.add(j);
          const midY = (y1 + y2) / 2;
          const startX = Math.max(minX1, minX2);
          const endX = Math.min(maxX1, maxX2);
          const widthCm = Math.round(gapPx / safeScale);
          beams.push(
            createBeamElement(
              `B${indexCounter++}`,
              { x: startX, y: midY },
              { x: endX, y: midY },
              defaultHeightCm,
              widthCm
            )
          );
          break;
        }
      } else if (isVert1) {
        const isVert2 = Math.abs(l2.x2 - l2.x1) <= Math.abs(l2.y2 - l2.y1) * 0.15;
        if (!isVert2) continue;
        const x1 = (l1.x1 + l1.x2) / 2;
        const x2 = (l2.x1 + l2.x2) / 2;
        const gapPx = Math.abs(x1 - x2);
        const minY1 = Math.min(l1.y1, l1.y2);
        const maxY1 = Math.max(l1.y1, l1.y2);
        const minY2 = Math.min(l2.y1, l2.y2);
        const maxY2 = Math.max(l2.y1, l2.y2);
        const overlap = Math.min(maxY1, maxY2) - Math.max(minY1, minY2);

        if (gapPx >= minWidthPx && gapPx <= maxWidthPx && overlap >= minLengthPx * 0.7) {
          usedIndices.add(i);
          usedIndices.add(j);
          const midX = (x1 + x2) / 2;
          const startY = Math.max(minY1, minY2);
          const endY = Math.min(maxY1, maxY2);
          const widthCm = Math.round(gapPx / safeScale);
          beams.push(
            createBeamElement(
              `B${indexCounter++}`,
              { x: midX, y: startY },
              { x: midX, y: endY },
              defaultHeightCm,
              widthCm
            )
          );
          break;
        }
      }
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
  const pixelsPerCm = 1.2; // 1 cm = 1.2 px
  // 2-bay structural floor beam plan:
  // Bay X1: 400 cm (480 px), Bay X2: 350 cm (420 px)
  // Bay Y1: 300 cm (360 px)
  const x0 = 120;
  const x1 = x0 + 400 * pixelsPerCm; // 600
  const x2 = x1 + 350 * pixelsPerCm; // 1020
  const y0 = 120;
  const y1 = y0 + 300 * pixelsPerCm; // 480

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
    // Dimension reference line for 4.00 m
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
