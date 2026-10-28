import React, { useRef } from 'react';
import {
  Upload,
  Sliders,
  Maximize2,
  MousePointer,
  PenTool,
  Wand2,
  Download,
  Image as ImageIcon,
  ShieldCheck,
  Scan,
  Square,
  Copy,
} from 'lucide-react';
import { DrawingToolMode, FORMWORK_HEIGHTS, FormworkHeight } from '../types/formwork';

interface TopToolbarProps {
  onUploadPdf: (file: File) => void;
  scaleMode: 'none' | 'manual_p1' | 'manual_p2';
  onStartManualScale: () => void;
  onRunAutoScale: () => void;
  onAutoDetectBeams: () => void;
  currentScale: number;
  scaleNote: string;
  defaultHeight: FormworkHeight;
  onChangeDefaultHeight: (h: FormworkHeight) => void;
  defaultBeamWidthCm?: number;
  onChangeDefaultBeamWidthCm?: (w: number) => void;
  autoParallelPair?: boolean;
  onChangeAutoParallelPair?: (val: boolean) => void;
  activeTool: DrawingToolMode | 'draw_beam';
  onChangeActiveTool: (tool: DrawingToolMode) => void;
  onAutoPlaceFormwork: () => void;
  onExportCsv: () => void;
  onExportPng: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  onUploadPdf,
  scaleMode,
  onStartManualScale,
  onRunAutoScale,
  onAutoDetectBeams,
  currentScale,
  scaleNote,
  defaultHeight,
  onChangeDefaultHeight,
  defaultBeamWidthCm = 20,
  onChangeDefaultBeamWidthCm,
  autoParallelPair = true,
  onChangeAutoParallelPair,
  activeTool,
  onChangeActiveTool,
  onAutoPlaceFormwork,
  onExportCsv,
  onExportPng,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadPdf(file);
    }
  };

  return (
    <header className="bg-white border-b border-[#E2E8F0] px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shadow-xs">
      {/* Brand & File Actions */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 pr-2.5 border-r border-[#E2E8F0]">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-xs">
            FW
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#0F172A] leading-tight">
              คำนวณไม้แบบสำเร็จรูป
            </h1>
            <p className="text-[11px] text-[#64748B]">Line-Based Formwork CAD</p>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs"
          title="อัปโหลดไฟล์ PDF แปลนโครงสร้างคาน"
        >
          <Upload className="w-3.5 h-3.5 text-white" />
          <span>นำเข้า PDF แปลนคาน</span>
        </button>
      </div>

      {/* Center: Scale, Defaults & Drawing Tools */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Scale Controls */}
        <div
          className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-[#E2E8F0] text-xs"
          title={scaleNote}
        >
          <Sliders className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500 font-medium">สเกล:</span>
          <span className="font-semibold text-slate-800">
            {currentScale.toFixed(2)} px/ซม.
          </span>

          <button
            onClick={onRunAutoScale}
            className="ml-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            title="ค้นหาตัวเลขบอกระยะหรือมาตราส่วน 1:75 ใน PDF เพื่อเซตสเกลอัตโนมัติ"
          >
            Auto Scale
          </button>

          <button
            onClick={onStartManualScale}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              scaleMode !== 'none'
                ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="คลิก 2 จุดบนแปลนแล้วระบุระยะจริง"
          >
            <Maximize2 className="w-3 h-3 inline mr-1" />
            {scaleMode !== 'none' ? 'คลิก 2 จุดบนแปลน...' : 'Manual Scale'}
          </button>
        </div>

        {/* Thickness Indicator Badge */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>ความหนาไม้แบบ 5 ซม.</span>
        </div>

        {/* Default Beam Width (20 cm default, manual override) & Height Selector */}
        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-md border border-[#E2E8F0] text-xs">
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2" title="ความกว้างคานเริ่มต้น 20 ซม. (แก้ไขด้วยมือได้)">
            <span className="text-slate-500 font-medium">กว้างคาน:</span>
            <input
              type="number"
              min={10}
              max={100}
              value={defaultBeamWidthCm}
              onChange={(e) =>
                onChangeDefaultBeamWidthCm?.(Math.max(10, Number(e.target.value) || 20))
              }
              className="w-11 text-center font-bold text-slate-800 border border-slate-200 rounded px-1 py-0.5 outline-none"
            />
            <span className="text-slate-500">ซม.</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-medium">สูงเริ่มต้น:</span>
            <select
              value={defaultHeight}
              onChange={(e) => onChangeDefaultHeight(Number(e.target.value) as FormworkHeight)}
              className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
            >
              {FORMWORK_HEIGHTS.map((h) => (
                <option key={h} value={h}>
                  {h} ซม.
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drawing Tool Mode Toggle (Select + Method 1 Inner Perimeter + Method 2 Outer Perimeter) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs gap-0.5">
          <button
            onClick={() => onChangeActiveTool('select')}
            className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'select'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="คลิกเลือกเส้นไม้แบบบนแปลนเพื่อแก้ไข"
          >
            <MousePointer className="w-3 h-3" />
            <span>เลือก/แก้ไข</span>
          </button>

          {/* Method 1: Inner Perimeter (Line & Box) */}
          <button
            onClick={() => onChangeActiveTool('draw_inner_line')}
            className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'draw_inner_line' || activeTool === 'draw_beam'
                ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="วิธีที่ 1 (ลากเส้น): คลิกวาดคาน/เกาะไม้แบบโดยวัดจากเส้นขอบวงรอบใน"
          >
            <PenTool className="w-3 h-3" />
            <span>วาดคาน (วงใน)</span>
          </button>

          <button
            onClick={() => onChangeActiveTool('draw_inner_box')}
            className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'draw_inner_box'
                ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="วิธีที่ 1 (ตีกรอบสี่เหลี่ยม): คลิก 2 มุมของช่องพื้นด้านใน เพื่อเกาะไม้แบบครบ 4 ด้านรอบวงในทันที"
          >
            <Square className="w-3 h-3" />
            <span>ตีกรอบวงใน</span>
          </button>

          {/* Method 2: Outer Perimeter (Line & Box) */}
          <button
            onClick={() => onChangeActiveTool('draw_outer_line')}
            className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'draw_outer_line'
                ? 'bg-sky-600 text-white shadow-2xs font-semibold'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="วิธีที่ 2 (ลากเส้น): คลิกวาดคาน/เกาะไม้แบบโดยวัดจากเส้นขอบวงรอบนอก"
          >
            <PenTool className="w-3 h-3" />
            <span>วาดคาน (วงนอก)</span>
          </button>

          <button
            onClick={() => onChangeActiveTool('draw_outer_box')}
            className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'draw_outer_box'
                ? 'bg-sky-600 text-white shadow-2xs font-semibold'
                : 'text-slate-700 hover:bg-white/70'
            }`}
            title="วิธีที่ 2 (ตีกรอบสี่เหลี่ยม): คลิก 2 มุมของขอบนอกคาน เพื่อเกาะไม้แบบครบ 4 ด้านจากวงนอกทันที"
          >
            <Square className="w-3 h-3" />
            <span>ตีกรอบวงนอก</span>
          </button>
        </div>

        {/* Toggle Auto Parallel Pair (+20cm opposite edge) */}
        <label
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 select-none"
          title="เมื่อเปิด: เวลาวาดวงในหรือวงนอก ระบบจะสร้างเส้นคู่ขนานอีกฝั่งห่าง 20 ซม. พร้อมเกาะไม้แบบทั้ง 2 ฝั่งให้ทันที"
        >
          <input
            type="checkbox"
            checked={autoParallelPair}
            onChange={(e) => onChangeAutoParallelPair?.(e.target.checked)}
            className="rounded text-blue-600"
          />
          <Copy className="w-3 h-3 text-blue-600" />
          <span>คู่ขนาน {defaultBeamWidthCm} ซม.</span>
        </label>

        {/* Auto Detect Beams Action */}
        <button
          onClick={onAutoDetectBeams}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all shadow-2xs"
          title="สแกนรับรู้เส้นขอบคานจากไฟล์ PDF แล้วนำไม้แบบไปเกาะตามเส้นโดยตรง"
        >
          <Scan className="w-3.5 h-3.5 text-blue-600" />
          <span>สแกนตรวจจับคาน (Auto)</span>
        </button>

        {/* Auto Place Formwork Action */}
        <button
          onClick={onAutoPlaceFormwork}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 transition-all shadow-xs"
          title="คำนวณและจัดเรียงแผ่นไม้แบบ 50, 100, 120 ซม. พร้อมคิดมุมชนให้อัตโนมัติ"
        >
          <Wand2 className="w-3.5 h-3.5 text-amber-300" />
          <span>ออโต้จัดเรียงไม้แบบ</span>
        </button>
      </div>

      {/* Right: Export Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onExportPng}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white border border-[#E2E8F0] hover:bg-slate-50 transition-colors shadow-2xs"
          title="ส่งออกรูปภาพแปลนการวางไม้แบบ (PNG)"
        >
          <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>แปลน PNG</span>
        </button>

        <button
          onClick={onExportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-2xs"
          title="ดาวน์โหลดตารางสรุปจำนวนไม้แบบ 12 SKUs และไม้ตัดเสริมเป็นไฟล์ Excel CSV"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" />
          <span>สรุปสั่งเช่า (CSV)</span>
        </button>
      </div>
    </header>
  );
};
