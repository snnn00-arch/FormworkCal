import { RawTextItem, RawVectorLine } from '../engine/scaleCalibrator';

export interface LoadedPdfPlan {
  imageDataUrl: string;
  width: number;
  height: number;
  vectorLines: RawVectorLine[];
  texts: RawTextItem[];
}

interface Segment1D {
  coord: number; // y for horizontal, x for vertical
  start: number;
  end: number;
}

/**
 * Merges adjacent 1px scanlines (e.g. from a 2-3px thick line stroke) into a single crisp line
 */
function mergeAdjacentSegments(segments: Segment1D[], maxCoordGap = 3.5): Segment1D[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.coord - b.coord || a.start - b.start);
  const merged: Segment1D[] = [];

  for (const seg of sorted) {
    let foundMatch = false;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i];
      if (seg.coord - m.coord > maxCoordGap) break;

      const overlapStart = Math.max(seg.start, m.start);
      const overlapEnd = Math.min(seg.end, m.end);
      const overlap = overlapEnd - overlapStart;
      const minLen = Math.min(seg.end - seg.start, m.end - m.start);

      // Same stroke thickness cluster or collinear continuation
      if (overlap >= minLen * 0.5 || Math.abs(seg.start - m.end) <= 6 || Math.abs(m.start - seg.end) <= 6) {
        m.coord = (m.coord + seg.coord) / 2;
        m.start = Math.min(m.start, seg.start);
        m.end = Math.max(m.end, seg.end);
        foundMatch = true;
        break;
      }
    }
    if (!foundMatch) {
      merged.push({ ...seg });
    }
  }

  return merged;
}

/**
 * Extracts solid horizontal and vertical lines directly from the rendered PDF canvas pixels.
 * Because this reads directly from the rendered viewport canvas, coordinates are 100% aligned
 * with the PDF image drawn at (0, 0) on the interactive PlanCanvas.
 */
export function extractLinesFromImageData(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): RawVectorLine[] {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Check if pixel is part of a dark/colored drawing stroke against the white PDF background
  const isStrokePixel = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a < 80) return false;
    const lum = (r + g + b) / 3;
    return lum < 215;
  };

  // Ignore outer 2.5% page border frame
  const marginX = Math.max(12, Math.round(width * 0.025));
  const marginY = Math.max(12, Math.round(height * 0.025));
  const minLineLen = 45;
  const maxGapBridge = 3; // bridge 1-3px anti-alias or crossing gaps

  const rawHoriz: Segment1D[] = [];
  const rawVert: Segment1D[] = [];

  // 1. Scan every row (1px precision) for solid horizontal lines
  for (let y = marginY; y < height - marginY; y += 1) {
    let startX = -1;
    let lastStrokeX = -1;
    let strokeCount = 0;

    for (let x = marginX; x < width - marginX; x += 1) {
      if (isStrokePixel(x, y)) {
        if (startX === -1) startX = x;
        lastStrokeX = x;
        strokeCount++;
      } else if (startX !== -1 && x - lastStrokeX > maxGapBridge) {
        const totalLen = lastStrokeX - startX + 1;
        const fillRatio = strokeCount / totalLen;
        // Require >= 0.78 fill ratio to reject dashed grid lines (- - - -)
        if (totalLen >= minLineLen && fillRatio >= 0.78) {
          rawHoriz.push({ coord: y, start: startX, end: lastStrokeX });
        }
        startX = -1;
        lastStrokeX = -1;
        strokeCount = 0;
      }
    }
    if (startX !== -1) {
      const totalLen = lastStrokeX - startX + 1;
      const fillRatio = strokeCount / totalLen;
      if (totalLen >= minLineLen && fillRatio >= 0.78) {
        rawHoriz.push({ coord: y, start: startX, end: lastStrokeX });
      }
    }
  }

  // 2. Scan every column (1px precision) for solid vertical lines
  for (let x = marginX; x < width - marginX; x += 1) {
    let startY = -1;
    let lastStrokeY = -1;
    let strokeCount = 0;

    for (let y = marginY; y < height - marginY; y += 1) {
      if (isStrokePixel(x, y)) {
        if (startY === -1) startY = y;
        lastStrokeY = y;
        strokeCount++;
      } else if (startY !== -1 && y - lastStrokeY > maxGapBridge) {
        const totalLen = lastStrokeY - startY + 1;
        const fillRatio = strokeCount / totalLen;
        if (totalLen >= minLineLen && fillRatio >= 0.78) {
          rawVert.push({ coord: x, start: startY, end: lastStrokeY });
        }
        startY = -1;
        lastStrokeY = -1;
        strokeCount = 0;
      }
    }
    if (startY !== -1) {
      const totalLen = lastStrokeY - startY + 1;
      const fillRatio = strokeCount / totalLen;
      if (totalLen >= minLineLen && fillRatio >= 0.78) {
        rawVert.push({ coord: x, start: startY, end: lastStrokeY });
      }
    }
  }

  const mergedHoriz = mergeAdjacentSegments(rawHoriz, 3.5);
  const mergedVert = mergeAdjacentSegments(rawVert, 3.5);

  const lines: RawVectorLine[] = [];
  for (const h of mergedHoriz) {
    // Reject full-page border lines (> 90% of page width)
    if (h.end - h.start > width * 0.9) continue;
    lines.push({ x1: h.start, y1: h.coord, x2: h.end, y2: h.coord });
  }
  for (const v of mergedVert) {
    if (v.end - v.start > height * 0.9) continue;
    lines.push({ x1: v.coord, y1: v.start, x2: v.coord, y2: v.end });
  }

  return lines;
}

export async function loadPdfFirstPage(file: File): Promise<LoadedPdfPlan> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });

  const offscreen = document.createElement('canvas');
  offscreen.width = Math.round(viewport.width);
  offscreen.height = Math.round(viewport.height);
  const ctx = offscreen.getContext('2d');
  if (ctx) {
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  // Extract Text Layer in exact viewport pixel coordinates
  const textContent = await page.getTextContent();
  const texts: RawTextItem[] = [];
  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const tx = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      texts.push({ text: item.str.trim(), x: tx[0], y: tx[1] });
    }
  }

  // Extract Lines directly from the rendered canvas so they overlay 100% accurately on the PDF plan
  const vectorLines: RawVectorLine[] = ctx
    ? extractLinesFromImageData(ctx, offscreen.width, offscreen.height)
    : [];

  return {
    imageDataUrl: offscreen.toDataURL('image/png'),
    width: offscreen.width,
    height: offscreen.height,
    vectorLines,
    texts,
  };
}
