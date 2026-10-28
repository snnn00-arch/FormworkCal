import jsPDF from 'jspdf';
import {
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
  FormworkProjectData,
  RentalSummaryReport,
  STANDARD_LENGTHS,
} from '../types/formwork';

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

/**
 * Export high-resolution A4 Landscape official PDF report
 * Contains: Plan Canvas image, Color Legend, Total Formwork Panels, Total Free-cut Timber Length, and 12 SKUs Matrix
 */
export async function exportFormworkPdfReport(
  canvas: HTMLCanvasElement | null,
  summary: RentalSummaryReport,
  metadata: {
    scale: number;
    totalBeams: number;
    projectName?: string;
  }
): Promise<void> {
  const reportWidth = 2380;
  const reportHeight = 1684; // 297mm x 210mm @ ~200 DPI

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
  ctx.fillRect(0, 0, reportWidth, 130);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('รายงานสรุปแบบและการคำนวณไม้แบบสำเร็จรูป (Modular Formwork Report)', 40, 50);

  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    'ตารางสรุปจำนวนไม้แบบ 12 SKUs • แปลนการจัดวาง • และระยะไม้ตัดเสริมรวม (ไม้แบบหนา 5 ซม.)',
    40,
    92
  );

  // Date and Metadata on Header Right
  const nowStr = new Date().toLocaleString('th-TH');
  ctx.textAlign = 'right';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(`วันที่ออกรายงาน: ${nowStr}`, reportWidth - 40, 50);
  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    `จำนวนช่วงไม้แบบ: ${metadata.totalBeams} ช่วง  |  สเกล: ${metadata.scale.toFixed(2)} px/ซม.`,
    reportWidth - 40,
    92
  );

  // 2. Left Column: Plan Layout & Color Legend
  const planBoxX = 40;
  const planBoxY = 160;
  const planBoxW = 1420;
  const planBoxH = 1460;

  // Plan Container Frame
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(planBoxX, planBoxY, planBoxW, planBoxH, 12);
  ctx.fill();
  ctx.stroke();

  // Plan Title
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('แปลนการจัดวางไม้แบบ (Formwork Placement Layout)', planBoxX + 24, planBoxY + 20);

  // Embed Plan Image from Canvas
  const planInnerX = planBoxX + 20;
  const planInnerY = planBoxY + 60;
  const planInnerW = planBoxW - 40;
  const planInnerH = planBoxH - 170;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(planInnerX, planInnerY, planInnerW, planInnerH);
  ctx.strokeRect(planInnerX, planInnerY, planInnerW, planInnerH);

  if (canvas && canvas.width > 0 && canvas.height > 0) {
    const scaleFactor = Math.min(planInnerW / canvas.width, planInnerH / canvas.height);
    const drawW = canvas.width * scaleFactor;
    const drawH = canvas.height * scaleFactor;
    const drawX = planInnerX + (planInnerW - drawW) / 2;
    const drawY = planInnerY + (planInnerH - drawH) / 2;
    ctx.drawImage(canvas, drawX, drawY, drawW, drawH);
  }

  // Color Legend at bottom of plan card
  const legendY = planBoxY + planBoxH - 85;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(planInnerX, legendY, planInnerW, 65, 8);
  ctx.fill();
  ctx.stroke();

  const legends = [
    { color: '#10B981', border: '#059669', label: '120 ซม. (เขียว)' },
    { color: '#0EA5E9', border: '#0284C7', label: '100 ซม. (ฟ้า)' },
    { color: '#F59E0B', border: '#D97706', label: '50 ซม. (ส้ม)' },
    { color: '#F43F5E', border: '#E11D48', label: 'ฟรี (ไม้ตัดเสริม)' },
    { color: '#334155', border: '#0F172A', label: 'แนวเส้นคาน (20 ซม.)' },
  ];

  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  let legX = planInnerX + 24;
  for (const leg of legends) {
    ctx.fillStyle = leg.color;
    ctx.strokeStyle = leg.border;
    ctx.lineWidth = 1.5;
    ctx.fillRect(legX, legendY + 22, 22, 22);
    ctx.strokeRect(legX, legendY + 22, 22, 22);

    ctx.fillStyle = '#1E293B';
    ctx.textAlign = 'left';
    ctx.fillText(leg.label, legX + 32, legendY + 34);
    legX += 270;
  }

  // 3. Right Column: Summary Cards, 12 SKUs Matrix & Free-Cut Infill
  const rightX = 1490;
  const rightY = 160;
  const rightW = reportWidth - rightX - 40;

  // KPI Highlight Cards
  const kpiCardH = 110;
  const kpiItems = [
    {
      title: 'รวมไม้แบบสำเร็จรูป',
      val: `${summary.totalStandardPanels} แผ่น`,
      sub: `พื้นที่เช่ารวม: ${summary.totalStandardAreaSqm.toFixed(2)} ตร.ม.`,
      bg: '#F0FDF4',
      border: '#86EFAC',
      text: '#166534',
    },
    {
      title: 'ระยะไม้ตัดเสริมรวม (Free Cut)',
      val: `${(summary.totalFreeLengthCm / 100).toFixed(2)} เมตร`,
      sub: `ระยะรวม ${summary.totalFreeLengthCm} ซม. (${summary.freeItems.length} จุด)`,
      bg: '#FFF1F2',
      border: '#FECDD3',
      text: '#9F1239',
    },
  ];

  for (let k = 0; k < kpiItems.length; k++) {
    const item = kpiItems[k];
    const cy = rightY + k * (kpiCardH + 16);
    ctx.fillStyle = item.bg;
    ctx.strokeStyle = item.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rightX, cy, rightW, kpiCardH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = item.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.title, rightX + 24, cy + 16);

    ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.val, rightX + 24, cy + 42);

    ctx.font = '15px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(item.sub, rightX + 24, cy + 82);
  }

  // 12 SKUs Matrix Table
  const tableY = rightY + 2 * (kpiCardH + 16) + 10;
  const tableH = 500;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(rightX, tableY, rightW, tableH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('ตารางแจกแจงไม้แบบ 12 SKUs สำหรับการสั่งเช่า', rightX + 24, tableY + 20);

  // Table Grid setup
  const tblStartX = rightX + 20;
  const tblStartY = tableY + 60;
  const tblW = rightW - 40;
  const colW = tblW / 6;
  const rowH = 68;

  const cols = ['ความยาว', 'สูง 40', 'สูง 50', 'สูง 60', 'สูง 70', 'รวม (แผ่น)'];

  // Table Header
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(tblStartX, tblStartY, tblW, 45);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  cols.forEach((c, idx) => {
    ctx.fillText(c, tblStartX + idx * colW + colW / 2, tblStartY + 22);
  });

  // Table Rows (120, 100, 50)
  STANDARD_LENGTHS.forEach((len, rIdx) => {
    const ry = tblStartY + 45 + rIdx * rowH;
    ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(tblStartX, ry, tblW, rowH);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(tblStartX, ry, tblW, rowH);

    // Row Label
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${len} ซม.`, tblStartX + colW / 2, ry + rowH / 2);

    // Columns 40, 50, 60, 70
    FORMWORK_HEIGHTS.forEach((h, hIdx) => {
      const count = summary.matrix[len][h];
      ctx.font = count > 0 ? 'bold 18px system-ui, sans-serif' : '16px system-ui, sans-serif';
      ctx.fillStyle = count > 0 ? '#2563EB' : '#94A3B8';
      ctx.fillText(
        count > 0 ? `${count}` : '-',
        tblStartX + (hIdx + 1) * colW + colW / 2,
        ry + rowH / 2
      );
    });

    // Row Total
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(
      `${summary.totalsByLength[len]}`,
      tblStartX + 5 * colW + colW / 2,
      ry + rowH / 2
    );
  });

  // Table Bottom Total Row
  const totalRy = tblStartY + 45 + STANDARD_LENGTHS.length * rowH;
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(tblStartX, totalRy, tblW, 55);
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tblStartX, totalRy, tblW, 55);

  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('รวมตามความสูง', tblStartX + colW / 2, totalRy + 27);

  FORMWORK_HEIGHTS.forEach((h, hIdx) => {
    ctx.fillText(
      `${summary.totalsByHeight[h]}`,
      tblStartX + (hIdx + 1) * colW + colW / 2,
      totalRy + 27
    );
  });

  // Grand Total Cell
  ctx.fillStyle = '#1D4ED8';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `${summary.totalStandardPanels}`,
    tblStartX + 5 * colW + colW / 2,
    totalRy + 27
  );

  // Free-Cut Infill Section Card (Bottom Right)
  const freeCardY = tableY + tableH + 16;
  const freeCardH = planBoxY + planBoxH - freeCardY;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(rightX, freeCardY, rightW, freeCardH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 19px system-ui, -apple-system, sans-serif';
  ctx.fillText('รายการระยะไม้ตัดเสริมหน้างาน (Free-Cut Infill)', rightX + 24, freeCardY + 20);

  if (summary.freeItems.length === 0) {
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#10B981';
    ctx.fillText('✓ ไม้แบบลงตัวพอดีทุกช่วง ไม่มีเศษไม้ตัดเสริม', rightX + 24, freeCardY + 60);
  } else {
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#475569';
    let lineY = freeCardY + 56;
    const maxItems = Math.min(summary.freeItems.length, 6);
    for (let i = 0; i < maxItems; i++) {
      const it = summary.freeItems[i];
      const sideText = it.side === 'left' ? 'ซ้าย' : 'ขวา';
      ctx.fillText(
        `• คาน ${it.beamName} (${sideText}): กว้าง ${it.lengthCm} ซม.  ×  สูง ${it.heightCm} ซม.  ×  หนา ${it.thicknessCm} ซม.`,
        rightX + 24,
        lineY
      );
      lineY += 28;
    }
    if (summary.freeItems.length > 6) {
      ctx.fillStyle = '#64748B';
      ctx.fillText(
        `... และอีก ${summary.freeItems.length - 6} รายการ (สามารถดูรายการทั้งหมดได้ในไฟล์ Excel CSV)`,
        rightX + 24,
        lineY
      );
    }
  }

  // Footer Note
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    'เอกสารทางการออกโดย: Modular Formwork CAD Calculator • ห้ามแก้ไขตัวเลขโดยพลการ',
    reportWidth - 40,
    reportHeight - 15
  );

  // Generate PDF via jsPDF
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const imgData = reportCanvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
  pdf.save('formwork-takeoff-report.pdf');
}
