import { RawTextItem, RawVectorLine } from '../engine/scaleCalibrator';

export interface LoadedPdfPlan {
  imageDataUrl: string;
  width: number;
  height: number;
  vectorLines: RawVectorLine[];
  texts: RawTextItem[];
}

/**
 * Extracts horizontal and vertical lines from canvas image data
 * Works on CAD vector renders and scanned architectural drawings
 */
function extractLinesFromImageData(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): RawVectorLine[] {
  const lines: RawVectorLine[] = [];
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Helper to check if pixel is dark (part of drawing line)
  const isDark = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    return a > 100 && (r + g + b) / 3 < 180;
  };

  const minLineLen = 60; // minimum 60 pixels to be a structural line
  const step = 4; // sample every 4 pixels for high performance

  // 1. Scan horizontal lines
  for (let y = 10; y < height - 10; y += step) {
    let startX = -1;
    for (let x = 0; x < width; x += step) {
      if (isDark(x, y)) {
        if (startX === -1) startX = x;
      } else {
        if (startX !== -1) {
          const len = x - startX;
          if (len >= minLineLen) {
            lines.push({ x1: startX, y1: y, x2: x, y2: y });
          }
          startX = -1;
        }
      }
    }
    if (startX !== -1 && width - startX >= minLineLen) {
      lines.push({ x1: startX, y1: y, x2: width, y2: y });
    }
  }

  // 2. Scan vertical lines
  for (let x = 10; x < width - 10; x += step) {
    let startY = -1;
    for (let y = 0; y < height; y += step) {
      if (isDark(x, y)) {
        if (startY === -1) startY = y;
      } else {
        if (startY !== -1) {
          const len = y - startY;
          if (len >= minLineLen) {
            lines.push({ x1: x, y1: startY, x2: x, y2: y });
          }
          startY = -1;
        }
      }
    }
    if (startY !== -1 && height - startY >= minLineLen) {
      lines.push({ x1: x, y1: startY, x2: x, y2: height });
    }
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
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;
  const ctx = offscreen.getContext('2d');
  if (ctx) {
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  // Extract Text Layer
  const textContent = await page.getTextContent();
  const texts: RawTextItem[] = [];
  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const tx = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      texts.push({ text: item.str.trim(), x: tx[0], y: tx[1] });
    }
  }

  // Extract Lines (from vector and image analysis)
  const vectorLines: RawVectorLine[] = [];

  // 1. Try extracting path operations from PDF Operator List
  try {
    const opList = await page.getOperatorList();
    const fnArray = opList.fnArray;
    const argsArray = opList.argsArray;
    let currX = 0;
    let currY = 0;

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      // constructPath: args[0] = sub-ops, args[1] = coords
      if (fn === pdfjsLib.OPS.constructPath && Array.isArray(args) && args.length >= 2) {
        const subOps = args[0];
        const coords = args[1];
        let cIdx = 0;

        for (let j = 0; j < subOps.length; j++) {
          const op = subOps[j];
          if (op === pdfjsLib.OPS.moveTo) {
            const pt = viewport.convertToViewportPoint(coords[cIdx], coords[cIdx + 1]);
            currX = pt[0];
            currY = pt[1];
            cIdx += 2;
          } else if (op === pdfjsLib.OPS.lineTo) {
            const pt = viewport.convertToViewportPoint(coords[cIdx], coords[cIdx + 1]);
            const nextX = pt[0];
            const nextY = pt[1];
            if (Math.hypot(nextX - currX, nextY - currY) >= 30) {
              vectorLines.push({ x1: currX, y1: currY, x2: nextX, y2: nextY });
            }
            currX = nextX;
            currY = nextY;
            cIdx += 2;
          } else if (op === pdfjsLib.OPS.rectangle) {
            const rx = coords[cIdx];
            const ry = coords[cIdx + 1];
            const rw = coords[cIdx + 2];
            const rh = coords[cIdx + 3];
            const p1 = viewport.convertToViewportPoint(rx, ry);
            const p2 = viewport.convertToViewportPoint(rx + rw, ry + rh);
            const minX = Math.min(p1[0], p2[0]);
            const maxX = Math.max(p1[0], p2[0]);
            const minY = Math.min(p1[1], p2[1]);
            const maxY = Math.max(p1[1], p2[1]);

            if (maxX - minX >= 30) {
              vectorLines.push({ x1: minX, y1: minY, x2: maxX, y2: minY });
              vectorLines.push({ x1: minX, y1: maxY, x2: maxX, y2: maxY });
            }
            if (maxY - minY >= 30) {
              vectorLines.push({ x1: minX, y1: minY, x2: minX, y2: maxY });
              vectorLines.push({ x1: maxX, y1: minY, x2: maxX, y2: maxY });
            }
            cIdx += 4;
          }
        }
      }
    }
  } catch (e) {
    console.warn('PDF operator list extraction fallback to image lines:', e);
  }

  // 2. If vector operator list produced few lines, run canvas image line detection fallback
  if (vectorLines.length < 5 && ctx) {
    const scanned = extractLinesFromImageData(ctx, viewport.width, viewport.height);
    vectorLines.push(...scanned);
  }

  return {
    imageDataUrl: offscreen.toDataURL('image/png'),
    width: viewport.width,
    height: viewport.height,
    vectorLines,
    texts,
  };
}
