import React, { useState } from 'react';
import { PdfPageSummary } from '../utils/pdfLoader';
import { FileText, CheckCircle2, X, ArrowRight, Loader2 } from 'lucide-react';

interface PdfPageSelectorModalProps {
  isOpen: boolean;
  totalPages: number;
  pages: PdfPageSummary[];
  fileName: string;
  onSelectPage: (pageNumber: number) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const PdfPageSelectorModal: React.FC<PdfPageSelectorModalProps> = ({
  isOpen,
  totalPages,
  pages,
  fileName,
  onSelectPage,
  onClose,
  isLoading = false,
}) => {
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                เลือกหน้าแปลนคานที่ต้องการนำเข้า
              </h2>
              <p className="text-xs text-slate-500">
                ไฟล์: <span className="font-semibold text-slate-700">{fileName}</span> • พบทั้งหมด {totalPages} หน้า
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
            title="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Grid of Page Previews */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-600">
            กรุณาคลิกเลือกหน้าที่มีแบบแปลนคาน ระบบจะนำเข้าหน้านั้นด้วยความคมชัดสูงระดับ Ultra-HD Vector (~300 DPI) เพื่อความคมชัดสูงสุด
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {pages.map((p) => {
              const isSelected = selectedPageNum === p.pageNumber;
              return (
                <div
                  key={p.pageNumber}
                  onClick={() => !isLoading && setSelectedPageNum(p.pageNumber)}
                  className={`group relative flex flex-col rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-400 hover:shadow-xs'
                  }`}
                >
                  {/* Thumbnail Image Container */}
                  <div className="relative aspect-[4/3] bg-slate-100 flex items-center justify-center p-2 overflow-hidden border-b border-slate-100">
                    {p.thumbnailUrl ? (
                      <img
                        src={p.thumbnailUrl}
                        alt={`หน้า ${p.pageNumber}`}
                        className="max-h-full max-w-full object-contain shadow-xs rounded"
                      />
                    ) : (
                      <div className="text-slate-400 text-xs">กำลังโหลด...</div>
                    )}

                    {/* Selected Badge Checkmark */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white p-1 rounded-full shadow-md animate-scale-in">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Page Footer Label */}
                  <div className="p-2.5 flex items-center justify-between bg-white text-xs">
                    <span className="font-bold text-slate-800">หน้า {p.pageNumber}</span>
                    <span
                      className={`text-[11px] font-semibold ${
                        isSelected ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      {isSelected ? 'เลือกหน้านี้' : 'คลิกเลือก'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-500">
            เลือก: <span className="font-bold text-slate-900">หน้า {selectedPageNum}</span> จาก {totalPages} หน้า
          </span>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              ยกเลิก
            </button>

            <button
              onClick={() => onSelectPage(selectedPageNum)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังโหลดหน้า {selectedPageNum}...</span>
                </>
              ) : (
                <>
                  <span>นำเข้าหน้าที่ {selectedPageNum}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
