import React, { useState } from 'react';
import {
  BeamElement,
  FORMWORK_HEIGHTS,
  FORMWORK_THICKNESS_CM,
  getSkuTheme,
  RentalSummaryReport,
  STANDARD_LENGTHS,
} from '../types/formwork';
import {
  Layers,
  Edit3,
  Palette,
  Trash2,
  RotateCcw,
  AlertCircle,
  Scissors,
} from 'lucide-react';

interface RightSidebarProps {
  summary: RentalSummaryReport;
  beams: BeamElement[];
  selectedBeamId: string | null;
  onSelectBeam: (beamId: string | null) => void;
  onUpdateBeam: (updated: BeamElement) => void;
  onDeleteBeam: (beamId: string) => void;
  onResetBeamToAuto: (beamId: string) => void;
  onUngroupBox?: (boxGroupId: string) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  summary,
  beams,
  selectedBeamId,
  onSelectBeam,
  onUpdateBeam,
  onDeleteBeam,
  onResetBeamToAuto,
  onUngroupBox,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'edit' | 'colors'>('summary');
  const selectedBeam = beams.find((b) => b.id === selectedBeamId);

  // If a beam is selected and user is on summary tab, auto-switch to edit if preferred, or keep tabs flexible
  return (
    <aside className="w-96 bg-white border-l border-[#E2E8F0] flex flex-col h-full overflow-hidden shadow-xs">
      {/* Sidebar Header Tabs */}
      <div className="flex border-b border-[#E2E8F0] bg-slate-50 p-1 gap-1 text-xs font-medium">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'summary'
              ? 'bg-white text-slate-900 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>สรุปเช่าแบบ</span>
        </button>

        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'edit'
              ? 'bg-white text-slate-900 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>แก้ไขคาน {selectedBeam ? `(${selectedBeam.name})` : ''}</span>
        </button>

        <button
          onClick={() => setActiveTab('colors')}
          className={`py-1.5 px-2.5 rounded flex items-center justify-center gap-1 transition-all ${
            activeTab === 'colors'
              ? 'bg-white text-slate-900 shadow-2xs font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="ดูตารางสีแยก SKU ทั้ง 12 ขนาด"
        >
          <Palette className="w-3.5 h-3.5 text-amber-500" />
          <span>สี SKU</span>
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ================= TAB 1: SUMMARY ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                  รวมไม้แบบเช่ามาตรฐาน
                </span>
                <span className="text-2xl font-bold text-slate-900 leading-tight">
                  {summary.totalStandardPanels}{' '}
                  <span className="text-xs font-normal text-slate-500">แผ่น</span>
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  พื้นที่รวม {summary.totalStandardAreaSqm} ตร.ม.
                </span>
              </div>

              <div className="bg-rose-50/60 border border-rose-200 rounded-lg p-3">
                <span className="text-[11px] font-medium text-rose-600 uppercase tracking-wider block">
                  รวมระยะความยาวฟรี
                </span>
                <span className="text-2xl font-bold text-rose-900 leading-tight">
                  {summary.totalFreeLengthCm}{' '}
                  <span className="text-xs font-normal text-rose-500">ซม.</span>
                </span>
                <span className="text-[11px] text-rose-600 block mt-0.5">
                  ไม้ตัดเสริม {summary.freeItems.length} จุดหน้างาน
                </span>
              </div>
            </div>

            {/* 12-SKU Matrix Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  ตารางสรุปจำนวนแผ่น (12 SKUs)
                </h3>
                <span className="text-[11px] text-slate-500">
                  หนา {FORMWORK_THICKNESS_CM} ซม. ทุกขนาด
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-center">
                      <th className="py-2 px-2 text-left">ยาว \ สูง</th>
                      {FORMWORK_HEIGHTS.map((h) => (
                        <th key={h} className="py-2 px-1 text-center">
                          สูง {h} ซม.
                        </th>
                      ))}
                      <th className="py-2 px-2 text-right bg-slate-200/60">รวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-center">
                    {STANDARD_LENGTHS.map((len) => (
                      <tr key={len} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-2 text-left font-bold text-slate-800">
                          {len} ซม.
                        </td>
                        {FORMWORK_HEIGHTS.map((h) => {
                          const count = summary.matrix[len][h];
                          const theme = getSkuTheme(len, h);
                          return (
                            <td key={h} className="py-2 px-1">
                              {count > 0 ? (
                                <span
                                  className="inline-block px-1.5 py-0.5 rounded font-bold text-xs"
                                  style={{
                                    backgroundColor: theme.badgeBg,
                                    color: theme.badgeText,
                                    border: `1px solid ${theme.stroke}`,
                                  }}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-right font-bold text-slate-900 bg-slate-50">
                          {summary.totalsByLength[len]}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100/90 font-bold text-slate-800 border-t-2 border-slate-300">
                      <td className="py-2 px-2 text-left">รวมตามความสูง</td>
                      {FORMWORK_HEIGHTS.map((h) => (
                        <td key={h} className="py-2 px-1 text-center">
                          {summary.totalsByHeight[h]}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-right text-emerald-800 bg-slate-200/80">
                        {summary.totalStandardPanels}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Free Length Summary Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                  ระยะความยาวฟรี (ไม้ตัดเสริม)
                </h3>
                <span className="text-[11px] text-rose-600">
                  {summary.freeItems.length} รายการ
                </span>
              </div>

              {/* Free length breakdown by height */}
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {FORMWORK_HEIGHTS.map((h) => {
                  const stat = summary.freeTotalsByHeightCm[h];
                  const theme = getSkuTheme(1, h, true);
                  return (
                    <div
                      key={h}
                      className="p-2 rounded border text-center"
                      style={{
                        backgroundColor: theme.badgeBg,
                        borderColor: theme.stroke,
                      }}
                    >
                      <span className="text-[10px] font-bold block" style={{ color: theme.badgeText }}>
                        สูง {h} ซม.
                      </span>
                      <span className="text-sm font-extrabold block" style={{ color: theme.badgeText }}>
                        {stat.totalLengthCm}{' '}
                        <span className="text-[10px] font-normal">ซม.</span>
                      </span>
                      <span className="text-[10px] opacity-75" style={{ color: theme.badgeText }}>
                        ({stat.count} ชิ้น)
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Free items list */}
              {summary.freeItems.length > 0 ? (
                <div className="max-h-48 overflow-y-auto border border-rose-200 rounded-lg divide-y divide-rose-100 text-xs bg-rose-50/30">
                  {summary.freeItems.map((item, idx) => (
                    <div
                      key={`${item.id}-${idx}`}
                      className="px-3 py-1.5 flex items-center justify-between hover:bg-rose-100/50"
                    >
                      <div>
                        <span className="font-semibold text-rose-950">
                          {item.beamName}
                        </span>{' '}
                        <span className="text-[11px] text-rose-600">
                          (ฝั่ง{item.side === 'left' ? 'ซ้าย' : 'ขวา'})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-700 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded text-[11px]">
                          ฟรี {item.lengthCm} ซม.
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          (สูง {item.heightCm})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-2 bg-slate-50 rounded border border-dashed border-slate-200">
                  ไม่มีเศษความยาวฟรี (จัดเรียงแผ่นมาตรฐานลงตัว 100%)
                </p>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: EDIT INSPECTOR ================= */}
        {activeTab === 'edit' && (
          <div className="space-y-4">
            {/* Quick Beam Selector */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                เลือกคานบนแปลน:
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-md">
                {beams.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBeam(b.id)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                      b.id === selectedBeamId
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedBeam ? (
              <div className="space-y-4 pt-2 border-t border-slate-200 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">
                    แก้ไขคานและแผ่นไม้แบบ: {selectedBeam.name}
                  </h4>
                  <button
                    onClick={() => onDeleteBeam(selectedBeam.id)}
                    className="text-rose-600 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                    title="ลบคานนี้"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Formwork Side Name */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">
                    ชื่อด้านไม้แบบ
                  </label>
                  <input
                    type="text"
                    value={selectedBeam.name}
                    onChange={(e) =>
                      onUpdateBeam({ ...selectedBeam, name: e.target.value })
                    }
                    className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white font-semibold text-slate-800"
                  />
                </div>

                {/* Set Formwork Height */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                    ปรับความสูงไม้แบบด้านนี้:
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {FORMWORK_HEIGHTS.map((h) => (
                      <button
                        key={h}
                        onClick={() =>
                          onUpdateBeam({
                            ...selectedBeam,
                            defaultHeightCm: h,
                            leftSide: { ...selectedBeam.leftSide, heightCm: h, customPanels: undefined },
                            rightSide: { ...selectedBeam.rightSide, heightCm: h, customPanels: undefined },
                          })
                        }
                        className={`py-1 rounded font-bold text-xs border transition-all ${
                          selectedBeam.leftSide.heightCm === h &&
                          selectedBeam.rightSide.heightCm === h
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                        title={`ตั้งความสูงทั้งสองฝั่ง ${h} ซม.`}
                      >
                        {h} ซม.
                      </button>
                    ))}
                  </div>
                </div>

                {/* Single-Edge Mode Quick Flip Side + Corner Extensions */}
                {selectedBeam.attachMode === 'single_edge' ? (
                  <div className="space-y-3">
                    {/* 4-Corner Box Group Card with Ungroup Action */}
                    {selectedBeam.boxGroupId && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-bold text-amber-900 block">
                              สี่เหลี่ยมวงรอบใน (จับขอบ 4 มุม)
                            </span>
                            <span className="text-[10px] text-amber-700">
                              ลากมุมทั้ง 4 บนแปลนเพื่อปรับขนาด • ไม้แบบจัดออโต้ภายใน
                            </span>
                          </div>
                        </div>
                        {onUngroupBox && (
                          <button
                            onClick={() => onUngroupBox(selectedBeam.boxGroupId!)}
                            className="w-full py-1.5 px-2 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                          >
                            <Scissors className="w-3.5 h-3.5 text-amber-700" />
                            <span>แยกกลุ่มเป็นเส้นเดี่ยว (Ungroup)</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-indigo-900 block">
                          ไม้แบบด้านเดี่ยว ({selectedBeam.edgeRole === 'outer' ? 'ด้านนอก' : 'ด้านใน'})
                        </span>
                        <span className="text-[10px] text-indigo-700">
                          ไม้แบบหนา 5 ซม. เกาะที่ฝั่ง{selectedBeam.leftSide.enabled !== false ? 'ซ้าย' : 'ขวา'}ของเส้น
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const leftWasActive = selectedBeam.leftSide.enabled !== false;
                          onUpdateBeam({
                            ...selectedBeam,
                            leftSide: {
                              ...selectedBeam.leftSide,
                              enabled: !leftWasActive,
                            },
                            rightSide: {
                              ...selectedBeam.rightSide,
                              enabled: leftWasActive,
                            },
                          });
                        }}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] shadow-2xs transition-colors"
                      >
                        สลับฝั่งเกาะ (Flip)
                      </button>
                    </div>

                    {/* Active Side Corner Extension Toggles */}
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                      <span className="font-bold text-slate-800 block text-xs">
                        การอมมุมปลายไม้แบบด้านนี้
                      </span>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-600">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={
                              (selectedBeam.leftSide.enabled !== false
                                ? selectedBeam.leftSide.startExtensionCm
                                : selectedBeam.rightSide.startExtensionCm) > 0
                            }
                            onChange={(e) => {
                              const ext = e.target.checked ? FORMWORK_THICKNESS_CM : 0;
                              onUpdateBeam({
                                ...selectedBeam,
                                leftSide: {
                                  ...selectedBeam.leftSide,
                                  startExtensionCm:
                                    selectedBeam.leftSide.enabled !== false ? ext : 0,
                                  customPanels: undefined,
                                },
                                rightSide: {
                                  ...selectedBeam.rightSide,
                                  startExtensionCm:
                                    selectedBeam.rightSide.enabled !== false ? ext : 0,
                                  customPanels: undefined,
                                },
                              });
                            }}
                          />
                          <span>อมมุมต้นเส้น (+5 ซม.)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={
                              (selectedBeam.leftSide.enabled !== false
                                ? selectedBeam.leftSide.endExtensionCm
                                : selectedBeam.rightSide.endExtensionCm) > 0
                            }
                            onChange={(e) => {
                              const ext = e.target.checked ? FORMWORK_THICKNESS_CM : 0;
                              onUpdateBeam({
                                ...selectedBeam,
                                leftSide: {
                                  ...selectedBeam.leftSide,
                                  endExtensionCm:
                                    selectedBeam.leftSide.enabled !== false ? ext : 0,
                                  customPanels: undefined,
                                },
                                rightSide: {
                                  ...selectedBeam.rightSide,
                                  endExtensionCm:
                                    selectedBeam.rightSide.enabled !== false ? ext : 0,
                                  customPanels: undefined,
                                },
                              });
                            }}
                          />
                          <span>อมมุมท้ายเส้น (+5 ซม.)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Legacy Dual-Side fallback */}
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedBeam.leftSide.enabled !== false}
                            onChange={(e) =>
                              onUpdateBeam({
                                ...selectedBeam,
                                leftSide: { ...selectedBeam.leftSide, enabled: e.target.checked },
                              })
                            }
                          />
                          <span>ฝั่งซ้าย (Left Side)</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* Reset Auto button */}
                <button
                  onClick={() => onResetBeamToAuto(selectedBeam.id)}
                  className="w-full py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>คำนวณจัดเรียงใหม่อัตโนมัติ (Reset Auto)</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 mb-1">
                  ยังไม่ได้เลือกคาน
                </p>
                <p className="text-[11px] text-slate-500">
                  คลิกที่คานบนแปลน หรือเลือกจากรายชื่อคานด้านบนเพื่อแก้ไข
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: SKU COLORS LEGEND ================= */}
        {activeTab === 'colors' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                ตารางสีมาตรฐานประจำ SKU
              </h4>
              <p className="text-[11px] text-slate-500">
                ระบบแยกสีตามขนาดความยาว 3 หมวด (เขียว 120, ฟ้า 100, ส้ม 50) และเฉดความเข้มตามความสูง 4 ระดับ (40, 50, 60, 70 ซม.)
              </p>
            </div>

            {/* Standard Lengths color breakdown */}
            <div className="space-y-3">
              {STANDARD_LENGTHS.map((len) => (
                <div key={len} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-800 block mb-2">
                    หมวดความยาว {len} ซม.
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {FORMWORK_HEIGHTS.map((h) => {
                      const theme = getSkuTheme(len, h);
                      return (
                        <div
                          key={h}
                          className="flex items-center gap-2 p-1.5 rounded bg-white border border-slate-200 shadow-2xs"
                        >
                          <div
                            className="w-4 h-4 rounded border shrink-0"
                            style={{
                              backgroundColor: theme.fill,
                              borderColor: theme.stroke,
                            }}
                          />
                          <div className="truncate">
                            <span className="font-bold text-slate-800 block leading-tight">
                              {len}×{h} ซม.
                            </span>
                            <span className="text-[10px] text-slate-500 block truncate">
                              {theme.nameTh.split('(')[1]?.replace(')', '') || ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Free Length filler colors */}
              <div className="border border-rose-200 rounded-lg p-2.5 bg-rose-50/30">
                <span className="text-xs font-bold text-rose-900 block mb-2">
                  หมวดระยะความยาวฟรี (ไม้ตัดเสริมหน้างาน)
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {FORMWORK_HEIGHTS.map((h) => {
                    const theme = getSkuTheme(1, h, true);
                    return (
                      <div
                        key={h}
                        className="flex items-center gap-2 p-1.5 rounded bg-white border border-rose-200 shadow-2xs"
                      >
                        <div
                          className="w-4 h-4 rounded border-2 border-dashed shrink-0"
                          style={{
                            backgroundColor: theme.fill,
                            borderColor: theme.stroke,
                          }}
                        />
                        <div className="truncate">
                          <span className="font-bold text-rose-950 block leading-tight">
                            ฟรี×{h} ซม.
                          </span>
                          <span className="text-[10px] text-rose-600 block truncate">
                            เส้นประ {theme.nameTh.split('(')[1]?.replace(')', '') || ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
