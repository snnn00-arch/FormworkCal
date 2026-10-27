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
  for (const item of texts) {
    const cleaned = item.text.trim().replace(/,/g, '');
    // Match meters like "4.00", "3.50m", or millimeters/centimeters like "4000", "400"
    const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(m|cm|mm)?$/i);
    if (!match) continue;

    const rawVal = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();
    let lengthCm = 0;

    if (unit === 'm' || (cleaned.includes('.') && rawVal >= 1 && rawVal <= 20)) {
      lengthCm = rawVal * 100;
    } else if (unit === 'mm' || rawVal >= 1000) {
      lengthCm = rawVal / 10;
    } else if (rawVal >= 50 && rawVal < 1000) {
      lengthCm = rawVal;
    }

    if (lengthCm < 50) continue;

    // Find nearest horizontal or vertical line of plausible pixel length
    let bestLine: RawVectorLine | null = null;
    let bestDist = Infinity;

    for (const line of lines) {
      const pxLen = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
      if (pxLen < 40) continue;
      const midX = (line.x1 + line.x2) / 2;
      const midY = (line.y1 + line.y2) / 2;
      const dist = Math.hypot(item.x - midX, item.y - midY);
      if (dist < 120 && dist < bestDist) {
        bestDist = dist;
        bestLine = line;
      }
    }

    if (bestLine) {
      const pxLen = Math.hypot(bestLine.x2 - bestLine.x1, bestLine.y2 - bestLine.y1);
      const scale = Number((pxLen / lengthCm).toFixed(4));
      if (scale >= 0.1 && scale <= 10) {
        return {
          pixelsPerCm: scale,
          confidence: `ตรวจพบเส้นบอกระยะ ${item.text} (${lengthCm} ซม.) อัตโนมัติ`,
        };
      }
    }
  }

  return {
    pixelsPerCm: 1.5,
    confidence: 'สเกลเริ่มต้นมาตรฐาน 1:100 (1.5 px/ซม.)',
  };
}
