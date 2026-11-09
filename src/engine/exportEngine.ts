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

export interface HighResPlanOptions {
  printBoundary?: PrintBoundary | null;
  pdfImage?: HTMLImageElement | null;
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

    if (options.beams && options.beams.length > 0) {
      for (const b of options.beams) {
        minX = Math.min(minX, b.start.x, b.end.x);
        maxX = Math.max(maxX, b.start.x, b.end.x);
        minY = Math.min(minY, b.start.y, b.end.y);
        maxY = Math.max(maxY, b.start.y, b.end.y);
      }
    } else if (options.pdfImage && options.pdfImage.width > 0) {
      minX = 0;
      minY = 0;
      maxX = options.pdfImage.width;
      maxY = options.pdfImage.height;
    } else if (options.fallbackCanvas && options.fallbackCanvas.width > 0) {
      minX = 0;
      minY = 0;
      maxX = options.fallbackCanvas.width;
      maxY = options.fallbackCanvas.height;
    } else {
      minX = 0;
      minY = 0;
      maxX = 1414;
      maxY = 1000;
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
  // A3 paper frame width on paper is 252mm = 0.252m
  const paperScale = Math.max(1, Math.round(realWidthM / 0.252));

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
  } else if (options.fallbackCanvas && (!options.beams || options.beams.length === 0)) {
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

  // A3 Landscape Resolution: 4200 x 2970 px (10 px/mm @ 254 DPI, crisp and zoomable)
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

  // 1. Header Band
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, reportWidth, 180);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('รายงานสรุปแบบและการคำนวณไม้แบบสำเร็จรูป (Modular Formwork Report - A3)', 60, 65);

  ctx.font = '24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    'ตารางสรุปจำนวนไม้แบบ 12 SKUs • แปลนการจัดวางความคมชัดระดับ Ultra-HD • และระยะไม้ตัดเสริมรวม (ไม้แบบหนา 5 ซม.)',
    60,
    125
  );

  // Date and Metadata on Header Right
  const nowStr = new Date().toLocaleString('th-TH');
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(`วันที่ออกรายงาน: ${nowStr}`, reportWidth - 60, 65);

  const safeScale = metadata.pixelsPerCm || metadata.scale || 1.2;
  const totalBeams = metadata.totalBeams ?? (metadata.beams ? metadata.beams.length : 0);

  // 2. Left Column: Plan Layout & Color Legend (Width 2600, Height 2680)
  const planBoxX = 60;
  const planBoxY = 220;
  const planBoxW = 2600;
  const planBoxH = 2660;

  // Plan Container Frame
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(planBoxX, planBoxY, planBoxW, planBoxH, 16);
  ctx.fill();
  ctx.stroke();

  // Render Plan Image using high-definition vector renderer
  const planInnerX = planBoxX + 40;
  const planInnerY = planBoxY + 80;
  const planInnerW = 2520;
  const planInnerH = 1782; // 2520 / 1782 = 1.41414... (Exact A3 paper aspect ratio)

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.fillRect(planInnerX, planInnerY, planInnerW, planInnerH);
  ctx.strokeRect(planInnerX, planInnerY, planInnerW, planInnerH);

  const planResult = renderHighResPlanCanvas(planInnerW, planInnerH, {
    printBoundary: metadata.printBoundary,
    pdfImage: metadata.pdfImage,
    vectorLines: metadata.vectorLines,
    gridAxes: metadata.gridAxes,
    gridIntersections: metadata.gridIntersections,
    beams: metadata.beams,
    panels: metadata.panels,
    pixelsPerCm: safeScale,
    fallbackCanvas: canvas,
  });

  if (planResult.canvas && planResult.canvas.width > 0) {
    ctx.drawImage(planResult.canvas, planInnerX, planInnerY, planInnerW, planInnerH);
  } else if (canvas && canvas.width > 0) {
    const scaleFactor = Math.min(planInnerW / canvas.width, planInnerH / canvas.height);
    const drawW = canvas.width * scaleFactor;
    const drawH = canvas.height * scaleFactor;
    const drawX = planInnerX + (planInnerW - drawW) / 2;
    const drawY = planInnerY + (planInnerH - drawH) / 2;
    ctx.drawImage(canvas, drawX, drawY, drawW, drawH);
  }

  // Plan Title & Scale info
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('แปลนการจัดวางไม้แบบ (Formwork Placement Layout)', planBoxX + 40, planBoxY + 30);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#2563EB';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `ขอบเขตพิมพ์ A3: ${planResult.realWidthM.toFixed(2)} ม. × ${planResult.realHeightM.toFixed(2)} ม. (สเกลบนกระดาษ A3: ~1:${planResult.paperScale})`,
    planBoxX + planBoxW - 40,
    planBoxY + 34
  );

  // Header Subtitle right
  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    `จำนวนคาน: ${totalBeams} ช่วง  |  สเกลแปลน: ${safeScale.toFixed(2)} px/ซม.  |  สเกล A3: 1:${planResult.paperScale}`,
    reportWidth - 60,
    125
  );

  // Color Legend Card below Plan Image
  const legendY = planInnerY + planInnerH + 30;
  const legendH = 110;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(planInnerX, legendY, planInnerW, legendH, 12);
  ctx.fill();
  ctx.stroke();

  const legends = [
    { color: '#10B981', border: '#059669', label: '120 ซม. (เขียว)' },
    { color: '#0EA5E9', border: '#0284C7', label: '100 ซม. (ฟ้า)' },
    { color: '#F59E0B', border: '#D97706', label: '50 ซม. (ส้ม)' },
    { color: '#F43F5E', border: '#E11D48', label: 'ฟรี (ไม้ตัดเสริม)' },
    { color: '#1E293B', border: '#0F172A', label: 'แนวเส้นคาน (หนา 5 ซม.)' },
  ];

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  let legX = planInnerX + 40;
  for (const leg of legends) {
    ctx.fillStyle = leg.color;
    ctx.strokeStyle = leg.border;
    ctx.lineWidth = 2;
    ctx.fillRect(legX, legendY + 38, 34, 34);
    ctx.strokeRect(legX, legendY + 38, 34, 34);

    ctx.fillStyle = '#1E293B';
    ctx.textAlign = 'left';
    ctx.fillText(leg.label, legX + 46, legendY + 56);
    legX += 480;
  }

  // Technical Note Card at bottom of plan column
  const noteY = legendY + legendH + 20;
  const noteH = planBoxY + planBoxH - noteY - 30;
  ctx.fillStyle = '#EFF6FF';
  ctx.strokeStyle = '#BFDBFE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(planInnerX, noteY, planInnerW, noteH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1E40AF';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('📌 ข้อแนะนำการใช้งานและการติดตั้งไม้แบบหน้างาน (A3 Standard Specifications):', planInnerX + 28, noteY + 24);

  ctx.fillStyle = '#1E3A8A';
  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    '• ไม้แบบทุกชิ้นเป็นแบบสำเร็จรูปหนา 5 ซม. ติดตั้งเกาะตามแนวขอบแปลนคานที่กำหนดไว้ในรูปด้านบนอย่างแม่นยำ',
    planInnerX + 28,
    noteY + 70
  );
  ctx.fillText(
    '• ช่วงคานที่ลงท้ายด้วยระยะฟรี (สีแดง) ให้ใช้ไม้ตัดเสริมหน้างานประกบเข้ากับจุดต่อตามขนาดที่ระบุในตารางด้านขวา',
    planInnerX + 28,
    noteY + 110
  );
  ctx.fillText(
    `• สเกลพิมพ์บนกระดาษ A3 แนวนอน (420 × 297 มม.) เท่ากับมาตราส่วนประมาณ 1:${planResult.paperScale} วัดระยะจากขอบเขตพิมพ์ได้โดยตรง`,
    planInnerX + 28,
    noteY + 150
  );

  // 3. Right Column: Summary Cards, 12 SKUs Matrix & Free-Cut Infill (Width 1440)
  const rightX = 2700;
  const rightY = 220;
  const rightW = reportWidth - rightX - 60;

  // KPI Highlight Cards
  const kpiCardH = 150;
  const kpiItems = [
    {
      title: 'รวมไม้แบบสำเร็จรูปสำหรับเช่า',
      val: `${summary.totalStandardPanels} แผ่น`,
      sub: `พื้นที่เช่ารวม: ${summary.totalStandardAreaSqm.toFixed(2)} ตร.ม. (หนา 5 ซม.)`,
      bg: '#F0FDF4',
      border: '#86EFAC',
      text: '#166534',
    },
    {
      title: 'ระยะไม้ตัดเสริมรวม (Free Cut Infill)',
      val: `${(summary.totalFreeLengthCm / 100).toFixed(2)} เมตร`,
      sub: `ระยะรวม ${summary.totalFreeLengthCm} ซม. (${summary.freeItems.length} จุด)`,
      bg: '#FFF1F2',
      border: '#FECDD3',
      text: '#9F1239',
    },
  ];

  for (let k = 0; k < kpiItems.length; k++) {
    const item = kpiItems[k];
    const cy = rightY + k * (kpiCardH + 20);
    ctx.fillStyle = item.bg;
    ctx.strokeStyle = item.border;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(rightX, cy, rightW, kpiCardH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = item.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.title, rightX + 32, cy + 22);

    ctx.font = 'bold 44px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.val, rightX + 32, cy + 58);

    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(item.sub, rightX + 32, cy + 112);
  }

  // 12 SKUs Matrix Table
  const tableY = rightY + 2 * (kpiCardH + 20) + 10;
  const tableH = 880;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(rightX, tableY, rightW, tableH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('ตารางแจกแจงไม้แบบ 12 SKUs สำหรับการสั่งเช่า', rightX + 32, tableY + 28);

  // Table Grid setup
  const tblStartX = rightX + 30;
  const tblStartY = tableY + 80;
  const tblW = rightW - 60;
  const colW = tblW / 6;
  const rowH = 120;

  const cols = ['ความยาว', 'สูง 40', 'สูง 50', 'สูง 60', 'สูง 70', 'รวม (แผ่น)'];

  // Table Header
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(tblStartX, tblStartY, tblW, 70);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  cols.forEach((c, idx) => {
    ctx.fillText(c, tblStartX + idx * colW + colW / 2, tblStartY + 35);
  });

  // Table Rows (120, 100, 50)
  STANDARD_LENGTHS.forEach((len, rIdx) => {
    const ry = tblStartY + 70 + rIdx * rowH;
    ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(tblStartX, ry, tblW, rowH);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tblStartX, ry, tblW, rowH);

    // Row Label
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${len} ซม.`, tblStartX + colW / 2, ry + rowH / 2);

    // Columns 40, 50, 60, 70
    FORMWORK_HEIGHTS.forEach((h, hIdx) => {
      const count = summary.matrix[len][h];
      ctx.font = count > 0 ? 'bold 28px system-ui, sans-serif' : '22px system-ui, sans-serif';
      ctx.fillStyle = count > 0 ? '#2563EB' : '#94A3B8';
      ctx.fillText(
        count > 0 ? `${count}` : '-',
        tblStartX + (hIdx + 1) * colW + colW / 2,
        ry + rowH / 2
      );
    });

    // Row Total
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(
      `${summary.totalsByLength[len]}`,
      tblStartX + 5 * colW + colW / 2,
      ry + rowH / 2
    );
  });

  // Table Bottom Total Row
  const totalRy = tblStartY + 70 + STANDARD_LENGTHS.length * rowH;
  const totalRowH = 80;
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(tblStartX, totalRy, tblW, totalRowH);
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 2;
  ctx.strokeRect(tblStartX, totalRy, tblW, totalRowH);

  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('รวมตามความสูง', tblStartX + colW / 2, totalRy + totalRowH / 2);

  FORMWORK_HEIGHTS.forEach((h, hIdx) => {
    ctx.fillText(
      `${summary.totalsByHeight[h]}`,
      tblStartX + (hIdx + 1) * colW + colW / 2,
      totalRy + totalRowH / 2
    );
  });

  // Grand Total Cell
  ctx.fillStyle = '#1D4ED8';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `${summary.totalStandardPanels}`,
    tblStartX + 5 * colW + colW / 2,
    totalRy + totalRowH / 2
  );

  // Free-Cut Infill Section Card (Bottom Right)
  const freeCardY = tableY + tableH + 20;
  const freeCardH = planBoxY + planBoxH - freeCardY;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(rightX, freeCardY, rightW, freeCardH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('รายการระยะไม้ตัดเสริมหน้างาน (Free-Cut Infill)', rightX + 32, freeCardY + 28);

  if (summary.freeItems.length === 0) {
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#10B981';
    ctx.fillText('✓ ไม้แบบลงตัวพอดีทุกช่วง ไม่มีเศษไม้ตัดเสริม', rightX + 32, freeCardY + 90);
  } else {
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#475569';
    let lineY = freeCardY + 84;
    const maxItems = Math.min(summary.freeItems.length, 12);
    for (let i = 0; i < maxItems; i++) {
      const it = summary.freeItems[i];
      const sideText = it.side === 'left' ? 'ซ้าย' : 'ขวา';
      ctx.fillText(
        `• คาน ${it.beamName} (${sideText}): กว้าง ${it.lengthCm} ซม.  ×  สูง ${it.heightCm} ซม.  ×  หนา ${it.thicknessCm} ซม.`,
        rightX + 32,
        lineY
      );
      lineY += 42;
    }
    if (summary.freeItems.length > 12) {
      ctx.fillStyle = '#64748B';
      ctx.fillText(
        `... และอีก ${summary.freeItems.length - 12} รายการ (สามารถดูรายการทั้งหมดได้ในไฟล์ Excel CSV)`,
        rightX + 32,
        lineY
      );
    }
  }

  // Footer Note
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    'เอกสารทางการออกโดย: Modular Formwork CAD Calculator (A3 Landscape) • ห้ามแก้ไขตัวเลขโดยพลการ',
    reportWidth - 60,
    reportHeight - 20
  );

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
