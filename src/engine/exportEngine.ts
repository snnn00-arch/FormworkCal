import {
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
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
