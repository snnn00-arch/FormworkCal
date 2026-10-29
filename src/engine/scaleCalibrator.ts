import { Point } from '../types/formwork';

export interface RawVectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RawTextItem {
  text: string;
  x: number;
  y: number;
}

export interface RawVectorCircle {
  cx: number;
  cy: number;
  radius: number;
  box?: { minX: number; maxX: number; minY: number; maxY: number };
}

export function calculateScaleFromTwoPoints(
  p1: Point,
  p2: Point,
  realDistanceCm: number
): number {
  const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (realDistanceCm <= 0 || pixelDist <= 0) return 1.0;
  return Number((pixelDist / realDistanceCm).toFixed(4));
}

export function autoDetectScaleFromPlanData(
  lines: RawVectorLine[],
  texts: RawTextItem[]
): { pixelsPerCm: number; confidence: string } {
  // 1. Check dimension numbers (e.g. "4.00", "4.000", "3.400", "18.400", "400") matched with nearby line length
  for (const item of texts) {
    const cleaned = item.text.trim().replace(/,/g, '');
    const match = cleaned.match(/^(\d+(?:\.\d{1,3})?)\s*(m|cm|mm|ม\.?)?$/i);
    if (!match) continue;

    const rawVal = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();
    let lengthCm = 0;

    if (unit === 'm' || unit.startsWith('ม') || (cleaned.includes('.') && rawVal >= 0.8 && rawVal <= 35)) {
      lengthCm = rawVal * 100;
    } else if (unit === 'mm' || rawVal >= 1000) {
      lengthCm = rawVal / 10;
    } else if (rawVal >= 50 && rawVal < 1000) {
      lengthCm = rawVal;
    }

    if (lengthCm < 80) continue;

    // Find nearest horizontal or vertical line of plausible pixel length
    let bestLine: RawVectorLine | null = null;
    let bestDist = Infinity;

    for (const line of lines) {
      const pxLen = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
      if (pxLen < 40) continue;
      const midX = (line.x1 + line.x2) / 2;
      const midY = (line.y1 + line.y2) / 2;
      const dist = Math.hypot(item.x - midX, item.y - midY);
      if (dist < 130 && dist < bestDist) {
        bestDist = dist;
        bestLine = line;
      }
    }

    if (bestLine) {
      const pxLen = Math.hypot(bestLine.x2 - bestLine.x1, bestLine.y2 - bestLine.y1);
      const scale = Number((pxLen / lengthCm).toFixed(4));
      if (scale >= 0.25 && scale <= 10) {
        return {
          pixelsPerCm: scale,
          confidence: `ตรวจพบเส้นบอกระยะ ${item.text} (${Math.round(lengthCm)} ซม.) อัตโนมัติ`,
        };
      }
    }
  }

  // 2. Check Title Block Scale text (e.g. "1 : 75", "1:100", "1:50")
  // At 72 DPI * 1.5 viewport scale = 108 DPI -> 1 cm on paper = 108 / 2.54 = 42.5197 px on screen
  for (const item of texts) {
    const scaleMatch = item.text.trim().match(/^1\s*:\s*(\d{2,3})$/);
    if (scaleMatch) {
      const ratio = parseInt(scaleMatch[1], 10);
      if (ratio >= 20 && ratio <= 500) {
        const pxPerCmOnPaper = (72 * 1.5) / 2.54; // 42.5197 px per paper cm
        const realPxPerCm = Number((pxPerCmOnPaper / ratio).toFixed(4));
        return {
          pixelsPerCm: realPxPerCm,
          confidence: `อ่านจากมาตราส่วนในแบบ 1:${ratio} (${realPxPerCm.toFixed(2)} px/ซม.)`,
        };
      }
    }
  }

  return {
    pixelsPerCm: 1.5,
    confidence: 'สเกลเริ่มต้นมาตรฐาน 1:100 (1.5 px/ซม.)',
  };
}
