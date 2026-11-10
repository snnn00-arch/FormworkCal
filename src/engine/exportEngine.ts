import jsPDF from 'jspdf';
import {
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
  FormworkProjectData,
  RentalSummaryReport,
  STANDARD_LENGTHS,
  BeamElement,
  PlacedPanel,
  PrintBoundary,
} from '../types/formwork';
import { GridAxis, GridIntersection } from './beamDetector';

export function generateRentalSummaryCsv(summary: RentalSummaryReport): string {
  const lines: string[] = [];
  lines.push('ตารางสรุปจำนวนไม้แบบสำเร็จรูปสำหรับเช่า (Modular Beam Formwork Summary)');
  lines.push(`ความหนาไม้แบบมาตรฐาน,${FORMWORK_THICKNESS_CM} ซม. ทุกกรณี`);
  lines.push('');
  lines.push(
    'ความยาวมาตรฐาน / ความสูง,สูง 40 ซม. (แผ่น),สูง 50 ซม. (แผ่น),สูง 60 ซม. (แผ่น),สูง 70 ซม. (แผ่น),รวมทั้งหมด (แผ่น)'
  );

  for (const len of STANDARD_LENGTHS) {
    const row = FORMWORK_HEIGHTS.map((h) => summary.matrix[len][h]);
    lines.push(`${len} ซม.,${row.join(',')},${summary.totalsByLength[len]}`);
  }

  const heightSums = FORMWORK_HEIGHTS.map((h) => summary.totalsByHeight[h]);
  lines.push(`รวมตามความสูง (แผ่น),${heightSums.join(',')},${summary.totalStandardPanels}`);
  lines.push(`พื้นที่ไม้แบบเช่ารวม (ตร.ม.),${summary.totalStandardAreaSqm}`);
  lines.push('');
  lines.push('รายการระยะความยาวฟรี (ไม้ตัดเสริมหน้างาน)');
  lines.push('ชื่อคาน,ฝั่งคาน,ความยาวฟรี (ซม.),ความสูง (ซม.),ความหนา (ซม.)');

  for (const item of summary.freeItems) {
    const sideLabel = item.side === 'left' ? 'ซ้าย' : 'ขวา';
    lines.push(
      `${item.beamName},${sideLabel},${item.lengthCm},${item.heightCm},${item.thicknessCm}`
    );
  }

  lines.push(`รวมความยาวฟรีทั้งหมด (ซม.),${summary.totalFreeLengthCm}`);
  return '\uFEFF' + lines.join('\n');
}

export function downloadCsvFile(
  csvContent: string,
  filename = 'formwork-rental-summary.csv'
): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCanvasAsPng(
  canvas: HTMLCanvasElement | null,
  filename = 'formwork-layout-plan.png'
): void {
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Save project data to a JSON (.fwproj / .json) file and trigger download
 */
export function saveProjectFile(
  projectData: FormworkProjectData,
  filename = `formwork-project-${new Date().toISOString().slice(0, 10)}.fwproj`
): void {
  const jsonStr = JSON.stringify(projectData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Load and validate project data from a user-selected JSON file
 */
export async function loadProjectFile(file: File): Promise<FormworkProjectData> {
  let text = '';
  if (typeof file.text === 'function') {
    text = await file.text();
  } else if (typeof FileReader !== 'undefined') {
    text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  } else {
    throw new Error('สภาพแวดล้อมไม่รองรับการอ่านไฟล์');
  }
  const data = JSON.parse(text);

  if (!data || typeof data !== 'object') {
    throw new Error('ไฟล์ข้อมูลไม่ถูกต้อง');
  }
  if (!Array.isArray(data.beams)) {
    throw new Error('ไฟล์โปรเจกต์ต้องมีข้อมูลไม้แบบ (beams)');
  }

  return {
    version: '1.0',
    appName: 'ModularFormworkCalculator',
    savedAt: data.savedAt || new Date().toISOString(),
    projectName: data.projectName,
    pixelsPerCm: typeof data.pixelsPerCm === 'number' && data.pixelsPerCm > 0 ? data.pixelsPerCm : 1.2,
    scaleNote: data.scaleNote || 'สเกลที่โหลดจากโปรเจกต์',
    defaultHeight: FORMWORK_HEIGHTS.includes(data.defaultHeight) ? data.defaultHeight : 50,
    defaultBeamWidthCm: typeof data.defaultBeamWidthCm === 'number' ? data.defaultBeamWidthCm : 20,
    autoParallelPair: data.autoParallelPair ?? true,
    beams: data.beams,
    pdfDimensions: data.pdfDimensions,
    pdfImageUrl: data.pdfImageUrl || null,
  };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
    if (typeof Image === 'undefined' || isJsdom) {
      const mockImg = (typeof Image !== 'undefined' ? new Image() : {}) as HTMLImageElement;
      mockImg.src = url;
      mockImg.width = 1000;
      mockImg.height = 700;
      resolve(mockImg);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve(img);
      }
    };

    img.onload = finish;
    img.onerror = finish;
    img.src = url;

    if (img.complete) {
      finish();
    }

    setTimeout(finish, 2500);
  });
}

export interface HighResPlanOptions {
  printBoundary?: PrintBoundary | null;
  pdfImage?: HTMLImageElement | null;
  pdfImageUrl?: string | null;
  vectorLines?: { x1: number; y1: number; x2: number; y2: number }[];
  gridAxes?: {
    horizontal: GridAxis[];
    vertical: GridAxis[];
  };
  gridIntersections?: GridIntersection[];
  beams?: BeamElement[];
  panels?: PlacedPanel[];
  pixelsPerCm: number;
  fallbackCanvas?: HTMLCanvasElement | null;
}

/**
 * Renders plan at high-definition vector resolution cropped to printBoundary (or auto-fitted to beams/PDF)
 * Constrained strictly to the report plan frame aspect ratio (2520 x 1782 = 1.414:1, matching A3 paper).
 */
export function renderHighResPlanCanvas(
  targetW: number,
  targetH: number,
  options: HighResPlanOptions
): { canvas: HTMLCanvasElement; realWidthM: number; realHeightM: number; paperScale: number } {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  const targetRatio = targetW / targetH; // 2520 / 1782 = 1.41414... (A3 paper aspect ratio)
  let cropBox: { x: number; y: number; width: number; height: number };

  if (options.printBoundary && options.printBoundary.width > 20 && options.printBoundary.height > 20) {
    cropBox = { ...options.printBoundary };
  } else {
    // Auto-fit to all beams or PDF image
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    if (options.pdfImage && options.pdfImage.width > 0) {
      minX = 0;
      minY = 0;
      maxX = options.pdfImage.width;
      maxY = options.pdfImage.height;
      if (options.beams && options.beams.length > 0) {
        for (const b of options.beams) {
          minX = Math.min(minX, b.start.x, b.end.x);
          maxX = Math.max(maxX, b.start.x, b.end.x);
          minY = Math.min(minY, b.start.y, b.end.y);
          maxY = Math.max(maxY, b.start.y, b.end.y);
        }
      }
    } else if (options.beams && options.beams.length > 0) {
      for (const b of options.beams) {
        minX = Math.min(minX, b.start.x, b.end.x);
        maxX = Math.max(maxX, b.start.x, b.end.x);
        minY = Math.min(minY, b.start.y, b.end.y);
        maxY = Math.max(maxY, b.start.y, b.end.y);
      }
    } else if (options.fallbackCanvas && options.fallbackCanvas.width > 0) {
      minX = 0;
      minY = 0;
      maxX = options.fallbackCanvas.width;
      maxY = options.fallbackCanvas.height;
    } else {
      minX = 0;
      minY = 0;
      maxX = 3510;
      maxY = 2340;
    }

    // Add 8% comfortable breathing margin
    const spanX = Math.max(100, maxX - minX);
    const spanY = Math.max(70, maxY - minY);
    const padX = spanX * 0.08;
    const padY = spanY * 0.08;
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;

    let bw = maxX - minX;
    let bh = maxY - minY;
    const currentRatio = bw / bh;

    // Enforce targetRatio (1.414)
    if (currentRatio > targetRatio) {
      const targetBh = bw / targetRatio;
      const diffY = (targetBh - bh) / 2;
      minY -= diffY;
      bh = targetBh;
    } else {
      const targetBw = bh * targetRatio;
      const diffX = (targetBw - bw) / 2;
      minX -= diffX;
      bw = targetBw;
    }
    cropBox = { x: minX, y: minY, width: bw, height: bh };
  }

  // Real-world metric dimensions
  const safePpc = options.pixelsPerCm > 0 ? options.pixelsPerCm : 1.2;
  const realWidthM = cropBox.width / safePpc / 100;
  const realHeightM = cropBox.height / safePpc / 100;
  // A3 paper frame width on paper (targetW on 4200px A3 sheet is (targetW / 4200) * 0.420 m)
  const frameWidthOnPaperM = (targetW / 4200) * 0.42;
  const paperScale = Math.max(1, Math.round(realWidthM / (frameWidthOnPaperM || 0.351)));

  if (!ctx) {
    return { canvas, realWidthM, realHeightM, paperScale };
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  // Transform coordinates so crop region fills target canvas completely
  const scale = targetW / cropBox.width;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-cropBox.x, -cropBox.y);

  // Background PDF image
  if (options.pdfImage && options.pdfImage.width > 0) {
    ctx.drawImage(options.pdfImage, 0, 0);
  } else if (options.fallbackCanvas) {
    ctx.drawImage(options.fallbackCanvas, 0, 0);
  }

  // Architectural CAD Vector Lines Overlay
  if (options.vectorLines && options.vectorLines.length > 0) {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = Math.max(1, 1.2 / scale);
    ctx.beginPath();
    for (const vl of options.vectorLines) {
      ctx.moveTo(vl.x1, vl.y1);
      ctx.lineTo(vl.x2, vl.y2);
    }
    ctx.stroke();
  }

  // Structural Grid Lines
  if (options.gridAxes) {
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = Math.max(1, 1.5 / scale);
    ctx.setLineDash([8 / scale, 6 / scale]);
    for (const hg of options.gridAxes.horizontal) {
      ctx.beginPath();
      ctx.moveTo(hg.start, hg.coord);
      ctx.lineTo(hg.end, hg.coord);
      ctx.stroke();
    }
    for (const vg of options.gridAxes.vertical) {
      ctx.beginPath();
      ctx.moveTo(vg.coord, vg.start);
      ctx.lineTo(vg.coord, vg.end);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Grid Intersections
  if (options.gridIntersections && options.gridIntersections.length > 0) {
    ctx.fillStyle = '#475569';
    for (const gi of options.gridIntersections) {
      ctx.beginPath();
      ctx.arc(gi.x, gi.y, 4 / scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Beams & Formwork Panels
  const beams = options.beams || [];
  const panels = options.panels || [];

  // Draw Beam Lines
  for (const b of beams) {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = Math.max(2, 3 / scale);
    ctx.beginPath();
    ctx.moveTo(b.start.x, b.start.y);
    ctx.lineTo(b.end.x, b.end.y);
    ctx.stroke();
  }

  // Draw Formwork Panels with crisp colors and labels
  const SKU_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
    '120': { fill: '#10B981', stroke: '#047857', text: '#FFFFFF' },
    '100': { fill: '#0EA5E9', stroke: '#0369A1', text: '#FFFFFF' },
    '50':  { fill: '#F59E0B', stroke: '#B45309', text: '#FFFFFF' },
    'free': { fill: '#F43F5E', stroke: '#BE123C', text: '#FFFFFF' },
  };

  const thicknessPx = 5 * safePpc;

  for (const p of panels) {
    const parentBeam = beams.find((b) => b.id === p.beamId);
    if (!parentBeam) continue;

    const bDx = parentBeam.end.x - parentBeam.start.x;
    const bDy = parentBeam.end.y - parentBeam.start.y;
    const bLen = Math.hypot(bDx, bDy) || 1;
    const ux = bDx / bLen;
    const uy = bDy / bLen;
    const nx = -uy;
    const ny = ux;
    const sign = p.side === 'left' ? 1 : -1;

    const panelLenPx = p.lengthCm * safePpc;
    const startOffsetPx = p.offsetStartCm * safePpc;

    const p0x = parentBeam.start.x + ux * startOffsetPx;
    const p0y = parentBeam.start.y + uy * startOffsetPx;
    const p1x = p0x + ux * panelLenPx;
    const p1y = p0y + uy * panelLenPx;
    const p2x = p1x + nx * sign * thicknessPx;
    const p2y = p1y + ny * sign * thicknessPx;
    const p3x = p0x + nx * sign * thicknessPx;
    const p3y = p0y + ny * sign * thicknessPx;

    const themeKey = p.type === 'free' ? 'free' : String(p.lengthCm);
    const theme = SKU_COLORS[themeKey] || SKU_COLORS['50'];

    ctx.fillStyle = theme.fill;
    ctx.strokeStyle = theme.stroke;
    ctx.lineWidth = Math.max(1, 1.5 / scale);
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Centered length text label
    if (panelLenPx * scale > 16) {
      const centerX = (p0x + p2x) / 2;
      const centerY = (p0y + p2y) / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      let angle = Math.atan2(uy, ux);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        angle += Math.PI;
      }
      ctx.rotate(angle);
      ctx.fillStyle = theme.text;
      const fontSize = Math.max(10, Math.min(14 / scale, thicknessPx * 0.75));
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${p.lengthCm}`, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();

  return { canvas, realWidthM, realHeightM, paperScale };
}

export interface PdfReportMetadata {
  scale?: number;
  totalBeams?: number;
  projectName?: string;
  printBoundary?: PrintBoundary | null;
  pdfImage?: HTMLImageElement | null;
  pdfImageUrl?: string | null;
  vectorLines?: { x1: number; y1: number; x2: number; y2: number }[];
  gridAxes?: {
    horizontal: GridAxis[];
    vertical: GridAxis[];
  };
  gridIntersections?: GridIntersection[];
  beams?: BeamElement[];
  panels?: PlacedPanel[];
  pixelsPerCm?: number;
}

/**
 * Export high-resolution A3 Landscape official PDF report
 * Contains: High-res Plan (cropped to A3 print boundary), Color Legend, Total Formwork Panels,
 * Total Free-cut Timber Length, and 12 SKUs Matrix (lengths 120, 100, 50 x heights 40, 50, 60, 70).
 */
export async function exportFormworkPdfReport(
  arg1: HTMLCanvasElement | null | RentalSummaryReport,
  arg2: RentalSummaryReport | PdfReportMetadata,
  arg3?: PdfReportMetadata | HTMLCanvasElement | null
): Promise<void> {
  // Support both (canvas, summary, metadata) and (summary, metadata, canvas)
  let canvas: HTMLCanvasElement | null = null;
  let summary: RentalSummaryReport;
  let metadata: PdfReportMetadata = {};

  if (arg1 && typeof arg1 === 'object' && 'matrix' in arg1) {
    summary = arg1 as RentalSummaryReport;
    metadata = (arg2 as PdfReportMetadata) || {};
    canvas = (arg3 as HTMLCanvasElement) || null;
  } else {
    canvas = arg1 as HTMLCanvasElement | null;
    summary = arg2 as RentalSummaryReport;
    metadata = (arg3 as PdfReportMetadata) || {};
  }

  // A3 Landscape Resolution: 4200 x 2970 px (10 px/mm @ 254 DPI, ultra-crisp & zoomable)
  const reportWidth = 4200;
  const reportHeight = 2970;

  const reportCanvas = document.createElement('canvas');
  reportCanvas.width = reportWidth;
  reportCanvas.height = reportHeight;
  const ctx = reportCanvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, reportWidth, reportHeight);

  // Outer Drawing Sheet Margins & Frame (ขอบแบบพิมพ์ A3 ตามรูปตัวอย่าง)
  const marginX = 60;
  const marginY = 60;
  const sheetW = reportWidth - marginX * 2; // 4080 px
  const sheetH = reportHeight - marginY * 2; // 2850 px

  // Outer Solid Border
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  ctx.strokeRect(marginX, marginY, sheetW, sheetH);

  // Layout Coordinates:
  // 1. กรอบใหญ่ (Top-Left Main Plan Box): W = 3510, H = 2340 (Aspect Ratio = 1.500)
  // 2. ด้านล่าง (Bottom Strip): W = 3510, H = 510
  // 3. ด้านขวา (Right Column): W = 570, H = 2850
  const planBoxX = marginX; // 60
  const planBoxY = marginY; // 60
  const planBoxW = 3510;
  const planBoxH = 2340;

  const rightColX = marginX + planBoxW; // 3570
  const rightColY = marginY; // 60
  const rightColW = sheetW - planBoxW; // 570

  const bottomBoxX = marginX; // 60
  const bottomBoxY = marginY + planBoxH; // 2400
  const bottomBoxW = planBoxW; // 3510
  const bottomBoxH = sheetH - planBoxH; // 510

  // Draw Vertical Divider Line (separating Main & Bottom from Right Column)
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rightColX, marginY);
  ctx.lineTo(rightColX, marginY + sheetH);
  ctx.stroke();

  // Draw Horizontal Divider Line (separating Main Plan from Bottom Strip)
  ctx.beginPath();
  ctx.moveTo(marginX, bottomBoxY);
  ctx.lineTo(rightColX, bottomBoxY);
  ctx.stroke();

  // =========================================================================
  // 1. กรอบใหญ่ (TOP-LEFT MAIN PLAN BOX - 3510 x 2340 px)
  // =========================================================================
  const safeScale = metadata.pixelsPerCm || metadata.scale || 1.2;
  const totalBeams = metadata.totalBeams ?? (metadata.beams ? metadata.beams.length : 0);

  // Preload PDF plan image if available
  let pdfImg: HTMLImageElement | null = metadata.pdfImage || null;
  if (!pdfImg && metadata.pdfImageUrl) {
    try {
      pdfImg = await loadImage(metadata.pdfImageUrl);
    } catch (err) {
      console.warn('Could not load pdfImageUrl for PDF report:', err);
    }
  }

  const planResult = renderHighResPlanCanvas(planBoxW, planBoxH, {
    printBoundary: metadata.printBoundary,
    pdfImage: pdfImg,
    pdfImageUrl: metadata.pdfImageUrl,
    vectorLines: metadata.vectorLines,
    gridAxes: metadata.gridAxes,
    gridIntersections: metadata.gridIntersections,
    beams: metadata.beams,
    panels: metadata.panels,
    pixelsPerCm: safeScale,
    fallbackCanvas: canvas,
  });

  if (planResult.canvas && planResult.canvas.width > 0) {
    ctx.drawImage(planResult.canvas, planBoxX, planBoxY, planBoxW, planBoxH);
  } else if (canvas && canvas.width > 0) {
    const scaleFactor = Math.min(planBoxW / canvas.width, planBoxH / canvas.height);
    const drawW = canvas.width * scaleFactor;
    const drawH = canvas.height * scaleFactor;
    const drawX = planBoxX + (planBoxW - drawW) / 2;
    const drawY = planBoxY + (planBoxH - drawH) / 2;
    ctx.drawImage(canvas, drawX, drawY, drawW, drawH);
  }

  // Floating Title Badge (Top-Left inside plan box)
  const titleBadgeX = planBoxX + 24;
  const titleBadgeY = planBoxY + 24;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(titleBadgeX, titleBadgeY, 580, 56, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('แบบแปลนการจัดวางไม้แบบคาน (Formwork Plan)', titleBadgeX + 20, titleBadgeY + 28);

  // Floating Scale Badge (Top-Right inside plan box)
  const scaleText = `ขอบเขต: ${planResult.realWidthM.toFixed(2)} × ${planResult.realHeightM.toFixed(2)} ม.  |  มาตราส่วน A3: ~1:${planResult.paperScale}`;
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  const scaleTextW = ctx.measureText(scaleText).width;
  const scaleBadgeW = scaleTextW + 48;
  const scaleBadgeX = planBoxX + planBoxW - scaleBadgeW - 24;
  const scaleBadgeY = planBoxY + 24;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = '#BFDBFE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(scaleBadgeX, scaleBadgeY, scaleBadgeW, 56, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1D4ED8';
  ctx.textAlign = 'center';
  ctx.fillText(scaleText, scaleBadgeX + scaleBadgeW / 2, scaleBadgeY + 28);

  // =========================================================================
  // 2. ด้านล่าง (BOTTOM DETAILS STRIP - 3510 x 510 px)
  // แบ่งเป็น 2 ส่วน: ตาราง 12 SKUs Matrix (ซ้าย) + รายการไม้ตัดเสริมหน้างาน & ข้อกำหนด (ขวา)
  // =========================================================================
  const bottomInnerPad = 20;

  // 2A. ตารางสรุป 12 SKUs สำหรับการสั่งเช่า (Zone ซ้าย, กว้าง 2180 px)
  const matrixCardX = bottomBoxX + bottomInnerPad;
  const matrixCardY = bottomBoxY + bottomInnerPad;
  const matrixCardW = 2180;
  const matrixCardH = bottomBoxH - bottomInnerPad * 2;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(matrixCardX, matrixCardY, matrixCardW, matrixCardH, 12);
  ctx.fill();
  ctx.stroke();

  // Matrix Card Header
  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('ตารางสรุปจำนวนไม้แบบ 12 SKUs สำหรับการสั่งเช่า', matrixCardX + 24, matrixCardY + 18);

  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('ความหนาไม้แบบมาตรฐาน 5 ซม. ทุกขนาด (Lengths 120, 100, 50 ซม. × Heights 40, 50, 60, 70 ซม.)', matrixCardX + 660, matrixCardY + 22);

  // 12 SKUs Table
  const tblX = matrixCardX + 20;
  const tblY = matrixCardY + 62;
  const tblW = matrixCardW - 40; // 2140 px
  const colW0 = 360;
  const colWHeight = 350; // 4 columns = 1400 px
  const colWTotal = tblW - colW0 - colWHeight * 4; // 380 px

  const cols = [
    { label: 'ความยาวมาตรฐาน', w: colW0 },
    { label: 'สูง 40 ซม.', w: colWHeight },
    { label: 'สูง 50 ซม.', w: colWHeight },
    { label: 'สูง 60 ซม.', w: colWHeight },
    { label: 'สูง 70 ซม.', w: colWHeight },
    { label: 'รวม (แผ่น)', w: colWTotal },
  ];

  // Table Header Row (Height: 58 px)
  const headerH = 58;
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.roundRect(tblX, tblY, tblW, headerH, [8, 8, 0, 0]);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let curColX = tblX;
  for (const c of cols) {
    ctx.fillText(c.label, curColX + c.w / 2, tblY + headerH / 2);
    curColX += c.w;
  }

  // Table Body Rows (120, 100, 50 cm) - Row Height: 80 px
  const rowH = 80;
  STANDARD_LENGTHS.forEach((len, rIdx) => {
    const ry = tblY + headerH + rIdx * rowH;
    ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(tblX, ry, tblW, rowH);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tblX, ry, tblW, rowH);

    // Row Label (Length)
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${len} ซม.`, tblX + colW0 / 2, ry + rowH / 2);

    // Height Columns (40, 50, 60, 70)
    FORMWORK_HEIGHTS.forEach((h, hIdx) => {
      const count = summary.matrix[len][h];
      const cellX = tblX + colW0 + hIdx * colWHeight;

      // Small vertical grid line
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cellX, ry);
      ctx.lineTo(cellX, ry + rowH);
      ctx.stroke();

      ctx.font = count > 0 ? 'bold 36px system-ui, sans-serif' : '24px system-ui, sans-serif';
      ctx.fillStyle = count > 0 ? '#1D4ED8' : '#94A3B8';
      ctx.fillText(count > 0 ? `${count}` : '-', cellX + colWHeight / 2, ry + rowH / 2);
    });

    // Row Total Column
    const totalColX = tblX + colW0 + 4 * colWHeight;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(totalColX, ry);
    ctx.lineTo(totalColX, ry + rowH);
    ctx.stroke();

    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`${summary.totalsByLength[len]}`, totalColX + colWTotal / 2, ry + rowH / 2);
  });

  // Table Bottom Total Row (รวมตามความสูง - Height: 88 px)
  const totalRy = tblY + headerH + STANDARD_LENGTHS.length * rowH;
  const totalRowH = 88;
  ctx.fillStyle = '#EFF6FF';
  ctx.beginPath();
  ctx.roundRect(tblX, totalRy, tblW, totalRowH, [0, 0, 8, 8]);
  ctx.fill();

  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 2;
  ctx.strokeRect(tblX, totalRy, tblW, totalRowH);

  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('รวมตามความสูง', tblX + colW0 / 2, totalRy + totalRowH / 2);

  FORMWORK_HEIGHTS.forEach((h, hIdx) => {
    const cellX = tblX + colW0 + hIdx * colWHeight;
    ctx.fillStyle = '#1E40AF';
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${summary.totalsByHeight[h]}`, cellX + colWHeight / 2, totalRy + totalRowH / 2);
  });

  // Grand Total Cell
  const grandTotalX = tblX + colW0 + 4 * colWHeight;
  ctx.fillStyle = '#1D4ED8';
  ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${summary.totalStandardPanels}`, grandTotalX + colWTotal / 2, totalRy + totalRowH / 2);

  // 2B. รายการไม้ตัดเสริมหน้างาน & ข้อกำหนด (Zone ขวา, กว้าง 1260 px)
  const freeCardX = matrixCardX + matrixCardW + 20;
  const freeCardY = matrixCardY;
  const freeCardW = bottomBoxW - (matrixCardW + bottomInnerPad * 2 + 20);
  const freeCardH = matrixCardH;

  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(freeCardX, freeCardY, freeCardW, freeCardH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('รายการระยะไม้ตัดเสริมหน้างาน (Free-Cut Infill)', freeCardX + 24, freeCardY + 18);

  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('เศษความยาวไม้ที่ต้องตัดเสริมประกบเข้ากับจุดต่อคาน (ความหนา 5 ซม.)', freeCardX + 24, freeCardY + 54);

  // Free Items List
  if (summary.freeItems.length === 0) {
    const greenPillY = freeCardY + 110;
    ctx.fillStyle = '#DCFCE7';
    ctx.strokeStyle = '#86EFAC';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(freeCardX + 24, greenPillY, freeCardW - 48, 80, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#15803D';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓ ไม้แบบลงตัวพอดีทุกช่วง ไม่มีเศษไม้ตัดเสริมหน้างาน', freeCardX + freeCardW / 2, greenPillY + 40);
  } else {
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#9F1239';
    let lineY = freeCardY + 95;
    const maxItems = Math.min(summary.freeItems.length, 6);
    for (let i = 0; i < maxItems; i++) {
      const it = summary.freeItems[i];
      const sideText = it.side === 'left' ? 'ซ้าย' : 'ขวา';
      ctx.fillText(
        `• คาน ${it.beamName} (${sideText}): กว้าง ${it.lengthCm} ซม.  ×  สูง ${it.heightCm} ซม.  ×  หนา ${it.thicknessCm} ซม.`,
        freeCardX + 24,
        lineY
      );
      lineY += 38;
    }
    if (summary.freeItems.length > 6) {
      ctx.fillStyle = '#64748B';
      ctx.font = '20px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        `... และอีก ${summary.freeItems.length - 6} รายการ (ดูรายละเอียดทั้งหมดในไฟล์ Excel CSV)`,
        freeCardX + 24,
        lineY
      );
    }
  }

  // Specifications & Notes at bottom of free card
  const specY = freeCardY + freeCardH - 95;
  ctx.fillStyle = '#EFF6FF';
  ctx.strokeStyle = '#BFDBFE';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(freeCardX + 20, specY, freeCardW - 40, 78, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1E40AF';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('📌 ข้อกำหนด: ไม้แบบทุกชิ้นเป็นแบบสำเร็จรูปหนา 5 ซม. เกาะตามแนวขอบแปลนคาน', freeCardX + 34, specY + 14);

  ctx.fillStyle = '#1E3A8A';
  ctx.font = '19px system-ui, -apple-system, sans-serif';
  ctx.fillText(`• สเกลพิมพ์บนกระดาษ A3 แนวนอน (420 × 297 มม.) เท่ากับมาตราส่วนประมาณ 1:${planResult.paperScale}`, freeCardX + 34, specY + 44);

  // =========================================================================
  // 3. ด้านขวา (RIGHT COLUMN / TITLE BLOCK - 570 x 2850 px)
  // Stacked architectural Title Block cards with large, clear, bold fonts
  // =========================================================================
  const rightPad = 22;
  const colCardX = rightColX + rightPad;
  const colCardW = rightColW - rightPad * 2; // 526 px

  // 3A. Card 1: Logo & Sheet Title (Y: 80, H: 270)
  const c1Y = rightColY + 20;
  const c1H = 270;
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.roundRect(colCardX, c1Y, colCardW, c1H, 12);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('MODULAR FORMWORK CAD', colCardX + colCardW / 2, c1Y + 26);

  ctx.font = '19px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('ระบบคำนวณและถอดแบบไม้แบบสำเร็จรูป', colCardX + colCardW / 2, c1Y + 68);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(colCardX + 30, c1Y + 110);
  ctx.lineTo(colCardX + colCardW - 30, c1Y + 110);
  ctx.stroke();

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.fillText('แบบแปลนติดตั้งไม้แบบคาน', colCardX + colCardW / 2, c1Y + 140);

  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText('FORMWORK PLACEMENT PLAN (A3)', colCardX + colCardW / 2, c1Y + 195);

  // 3B. Card 2: ข้อมูลโครงการและแบบ (Y: 375, H: 440)
  const c2Y = c1Y + c1H + 20;
  const c2H = 440;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(colCardX, c2Y, colCardW, c2H, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('ข้อมูลแบบและโครงการ', colCardX + 24, c2Y + 20);

  const projRows = [
    { label: 'โครงการ:', val: metadata.projectName || 'โครงการก่อสร้างอาคาร คสล.' },
    { label: 'วันที่ออกรายงาน:', val: new Date().toLocaleDateString('th-TH') },
    { label: 'มาตราส่วน A3:', val: `~1:${planResult.paperScale}`, isBoldBlue: true },
    { label: 'ขอบเขตพิมพ์:', val: `${planResult.realWidthM.toFixed(2)} × ${planResult.realHeightM.toFixed(2)} ม.` },
    { label: 'สเกลภาพแปลน:', val: `${safeScale.toFixed(2)} px/ซม.` },
    { label: 'จำนวนคานรวม:', val: `${totalBeams} ช่วงคาน` },
  ];

  let pRowY = c2Y + 70;
  for (const r of projRows) {
    ctx.fillStyle = '#475569';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(r.label, colCardX + 24, pRowY);

    ctx.textAlign = 'right';
    ctx.fillStyle = r.isBoldBlue ? '#2563EB' : '#0F172A';
    ctx.font = r.isBoldBlue
      ? 'bold 28px system-ui, -apple-system, sans-serif'
      : 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(r.val, colCardX + colCardW - 24, pRowY);

    pRowY += 58;
  }

  // 3C. Card 3: สรุปยอดรวมไม้แบบเช่า (KPI 1 - Y: 835, H: 340)
  const c3Y = c2Y + c2H + 20;
  const c3H = 340;
  ctx.fillStyle = '#F0FDF4';
  ctx.strokeStyle = '#86EFAC';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(colCardX, c3Y, colCardW, c3H, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#166534';
  ctx.textAlign = 'left';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillText('รวมไม้แบบสำเร็จรูปสำหรับเช่า', colCardX + 24, c3Y + 22);

  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#15803D';
  ctx.fillText(`${summary.totalStandardPanels} แผ่น`, colCardX + 24, c3Y + 70);

  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#166534';
  ctx.fillText(`พื้นที่เช่ารวม: ${summary.totalStandardAreaSqm.toFixed(2)} ตร.ม.`, colCardX + 24, c3Y + 190);

  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#15803D';
  ctx.fillText('ความหนามาตรฐาน: 5.0 ซม. ทุกแผ่น', colCardX + 24, c3Y + 240);

  // 3D. Card 4: สรุปไม้ตัดเสริมหน้างาน (KPI 2 - Y: 1195, H: 340)
  const c4Y = c3Y + c3H + 20;
  const c4H = 340;
  ctx.fillStyle = '#FFF1F2';
  ctx.strokeStyle = '#FECDD3';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(colCardX, c4Y, colCardW, c4H, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9F1239';
  ctx.textAlign = 'left';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillText('ระยะไม้ตัดเสริมรวม (Free-Cut)', colCardX + 24, c4Y + 22);

  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#BE123C';
  ctx.fillText(`${(summary.totalFreeLengthCm / 100).toFixed(2)} ม.`, colCardX + 24, c4Y + 70);

  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#9F1239';
  ctx.fillText(`รวมระยะ ${summary.totalFreeLengthCm} ซม. (${summary.freeItems.length} จุดต่อ)`, colCardX + 24, c4Y + 190);

  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#BE123C';
  ctx.fillText('ตัดไม้เสริมประกบตามขนาดจริงหน้างาน', colCardX + 24, c4Y + 240);

  // 3E. Card 5: สัญลักษณ์และสีไม้แบบ (Y: 1555, H: 580)
  const c5Y = c4Y + c4H + 20;
  const c5H = 580;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(colCardX, c5Y, colCardW, c5H, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('สัญลักษณ์สีไม้แบบ (Panel SKUs)', colCardX + 24, c5Y + 22);

  const legendItems = [
    { color: '#10B981', border: '#059669', label: 'แผ่น 120 ซม. (สีเขียว)' },
    { color: '#0EA5E9', border: '#0284C7', label: 'แผ่น 100 ซม. (สีฟ้า)' },
    { color: '#F59E0B', border: '#D97706', label: 'แผ่น 50 ซม. (สีส้ม)' },
    { color: '#F43F5E', border: '#E11D48', label: 'ฟรี / ไม้ตัดเสริม (สีแดง)' },
    { color: '#1E293B', border: '#0F172A', label: 'แนวเส้นขอบคาน (หนา 5 ซม.)' },
    { color: '#2563EB', border: '#1D4ED8', label: 'จุดตัดกริดคาน (Grid Nodes)' },
  ];

  let legItemY = c5Y + 80;
  for (const it of legendItems) {
    ctx.fillStyle = it.color;
    ctx.strokeStyle = it.border;
    ctx.lineWidth = 2.5;
    ctx.fillRect(colCardX + 24, legItemY, 44, 44);
    ctx.strokeRect(colCardX + 24, legItemY, 44, 44);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, colCardX + 86, legItemY + 22);

    legItemY += 76;
  }

  // 3F. Card 6: ช่องลงนามตรวจแบบและตราประทับ (Y: 2155, H: 695)
  const c6Y = c5Y + c5H + 20;
  const c6H = sheetH - (c6Y - marginY) - 20;
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(colCardX, c6Y, colCardW, c6H, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('การตรวจแบบและการอนุมัติ', colCardX + 24, c6Y + 20);

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('ผู้จัดทำแบบ (Drawn By):', colCardX + 24, c6Y + 72);

  ctx.font = '22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('ลายมือชื่อ: ....................................................', colCardX + 24, c6Y + 112);
  ctx.fillText('วันที่: .......... / .......... / ..........', colCardX + 24, c6Y + 152);

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('วิศวกรผู้ตรวจแบบ (Checked By):', colCardX + 24, c6Y + 212);

  ctx.font = '22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('ลายมือชื่อ: ....................................................', colCardX + 24, c6Y + 252);
  ctx.fillText('วันที่: .......... / .......... / ..........', colCardX + 24, c6Y + 292);

  // Bottom Stamp in Card 6
  const stampY = c6Y + c6H - 120;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(colCardX + 20, stampY, colCardW - 40, 1.5);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('A3 LANDSCAPE (420 × 297 mm)', colCardX + colCardW / 2, stampY + 18);

  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText('ULTRA-HD VECTOR RESOLUTION (254 DPI)', colCardX + colCardW / 2, stampY + 54);

  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('MODULAR FORMWORK CAD CALCULATOR', colCardX + colCardW / 2, stampY + 84);

  // Generate A3 Landscape PDF via jsPDF
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3',
  });

  const imgData = reportCanvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, 420, 297);
  pdf.save(`formwork-report-A3-${new Date().toISOString().slice(0, 10)}.pdf`);
}
