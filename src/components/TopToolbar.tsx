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
} from 'lucide-react';
import { FORMWORK_HEIGHTS, FormworkHeight } from '../types/formwork';

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
  activeTool: 'select' | 'draw_beam';
  onChangeActiveTool: (tool: 'select' | 'draw_beam') => void;
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
    <header className="bg-white border-b border-[#E2E8F0] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      {/* Brand & File Actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-[#E2E8F0]">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-xs">
            FW
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#0F172A] leading-tight">
              คำนวณไม้แบบสำเร็จรูป
            </h1>
            <p className="text-[11px] text-[#64748B]">Modular Formwork CAD</p>
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

      {/* Center: Scale & Tool Controls */}
      <div className="flex items-center gap-2">
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
            title="ค้นหาตัวเลขบอกระยะใน PDF เพื่อเซตสเกลอัตโนมัติ"
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

        {/* Default Height Selector */}
        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-[#E2E8F0] text-xs">
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

        {/* Tool Mode Toggle */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
          <button
            onClick={() => onChangeActiveTool('select')}
            className={`px-2.5 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'select'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MousePointer className="w-3 h-3" />
            <span>เลือก/แก้ไข</span>
          </button>
          <button
            onClick={() => onChangeActiveTool('draw_beam')}
            className={`px-2.5 py-1 rounded flex items-center gap-1 font-medium transition-all ${
              activeTool === 'draw_beam'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenTool className="w-3 h-3" />
            <span>วาดคาน</span>
          </button>
        </div>

        {/* Auto Detect Beams Action */}
        <button
          onClick={onAutoDetectBeams}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all shadow-2xs"
          title="สแกนอ่านแนวคานจากไฟล์ PDF และสร้างคานให้อัตโนมัติ"
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
