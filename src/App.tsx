import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BeamElement,
  DEFAULT_BEAM_WIDTH_CM,
  DrawingToolMode,
  FormworkHeight,
  FormworkProjectData,
  Point,
} from './types/formwork';
import {
  applyAutoCornerExtensions,
  computeAllBeamPanels,
  computeRentalSummary,
} from './engine/formworkOptimizer';
import {
  calculateScaleFromTwoPoints,
  autoDetectScaleFromPlanData,
  RawTextItem,
  RawVectorLine,
} from './engine/scaleCalibrator';
import {
  autoDetectBeamsWithDiagnostics,
  createEdgesFromBoxTool,
  createEdgesFromLineTool,
  extractColumnSnapPoints,
  updateBoxGroupRectangle,
  ungroupBoxEdges,
  GridAxis,
  GridIntersection,
} from './engine/beamDetector';
import {
  downloadCsvFile,
  exportCanvasAsPng,
  exportFormworkPdfReport,
  generateRentalSummaryCsv,
  loadProjectFile,
  saveProjectFile,
} from './engine/exportEngine';
import { inspectPdfPages, loadPdfPage, PdfPageSummary } from './utils/pdfLoader';
import { TopToolbar } from './components/TopToolbar';
import { PlanCanvas } from './components/PlanCanvas';
import { RightSidebar } from './components/RightSidebar';
import { PdfPageSelectorModal } from './components/PdfPageSelectorModal';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Core State
  const [pdfImageUrl, setPdfImageUrl] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | undefined>(
    undefined
  );
  const [vectorLines, setVectorLines] = useState<RawVectorLine[]>([]);
  const [planTexts, setPlanTexts] = useState<RawTextItem[]>([]);

  // Multi-page PDF Selection State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfInspection, setPdfInspection] = useState<{
    totalPages: number;
    pages: PdfPageSummary[];
    file: File;
  } | null>(null);
  const [isLoadingPdfPage, setIsLoadingPdfPage] = useState(false);

  // Structural Grid System State
  const [gridAxes, setGridAxes] = useState<{
    horizontal: GridAxis[];
    vertical: GridAxis[];
  } | undefined>(undefined);
  const [gridIntersections, setGridIntersections] = useState<GridIntersection[]>([]);

  const [beams, setBeams] = useState<BeamElement[]>([]);
  const [pixelsPerCm, setPixelsPerCm] = useState<number>(1.2);
  const [scaleNote, setScaleNote] = useState<string>('สเกลเริ่มต้น 1.20 px/ซม.');
  const [scaleMode, setScaleMode] = useState<'none' | 'manual_p1' | 'manual_p2'>('none');

  // Default height set to 50 cm as requested
  const [defaultHeight, setDefaultHeight] = useState<FormworkHeight>(50);
  const [defaultBeamWidthCm, setDefaultBeamWidthCm] = useState<number>(DEFAULT_BEAM_WIDTH_CM);
  const [autoParallelPair, setAutoParallelPair] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<DrawingToolMode>('select');

  // Multi-Selection State
  const [selectedBeamIds, setSelectedBeamIds] = useState<string[]>([]);
  const selectedBeamId = selectedBeamIds[selectedBeamIds.length - 1] || null;

  // Undo / Redo History Stack
  const [past, setPast] = useState<BeamElement[][]>([]);
  const [future, setFuture] = useState<BeamElement[][]>([]);

  const updateBeamsWithHistory = (
    nextOrFn: BeamElement[] | ((prev: BeamElement[]) => BeamElement[])
  ) => {
    setBeams((curr) => {
      const next = typeof nextOrFn === 'function' ? nextOrFn(curr) : nextOrFn;
      setPast((p) => [...p.slice(-40), curr]);
      setFuture([]);
      return next;
    });
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, p.length - 1));
    setFuture((f) => [beams, ...f]);
    setBeams(previous);
    setSelectedBeamIds((prev) => prev.filter((id) => previous.some((b) => b.id === id)));
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, beams]);
    setBeams(next);
    setSelectedBeamIds((prev) => prev.filter((id) => next.some((b) => b.id === id)));
  };

  // Compute Placed Panels and Rental Summary
  const panels = useMemo(() => {
    return computeAllBeamPanels(beams, pixelsPerCm);
  }, [beams, pixelsPerCm]);

  const summary = useMemo(() => {
    return computeRentalSummary(panels);
  }, [panels]);

  // Magnetic Column Corner & Beam Intersection Snap Points for Manual Drawing
  const snapPoints = useMemo(() => {
    return extractColumnSnapPoints(
      vectorLines,
      planTexts,
      beams,
      pixelsPerCm,
      defaultBeamWidthCm,
      pdfDimensions
    );
  }, [vectorLines, planTexts, beams, pixelsPerCm, defaultBeamWidthCm, pdfDimensions]);

  // Selection Handler (with Shift-click toggle)
  const handleSelectBeam = (id: string | null, isShift = false) => {
    if (!id) {
      setSelectedBeamIds([]);
      return;
    }
    if (isShift) {
      setSelectedBeamIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setSelectedBeamIds([id]);
    }
  };

  const handleClearSelection = () => {
    setSelectedBeamIds([]);
  };

  // Action Handlers
  const loadSpecificPdfPage = async (file: File, pageNumber: number) => {
    try {
      setIsLoadingPdfPage(true);
      const loaded = await loadPdfPage(file, pageNumber, 3.0);
      const dims = { width: loaded.width, height: loaded.height };
      setPdfImageUrl(loaded.imageDataUrl);
      setPdfDimensions(dims);
      setVectorLines(loaded.vectorLines);
      setPlanTexts(loaded.texts);

      // 1. Auto scale detection
      const scaleResult = autoDetectScaleFromPlanData(loaded.vectorLines, loaded.texts);
      setPixelsPerCm(scaleResult.pixelsPerCm);
      setScaleNote(scaleResult.confidence);

      // 2. Auto line classification + Grid-First Detection (default height = 50 cm)
      if (loaded.vectorLines.length > 0) {
        const diag = autoDetectBeamsWithDiagnostics(
          loaded.vectorLines,
          scaleResult.pixelsPerCm,
          50,
          loaded.texts,
          dims
        );
        setGridAxes(diag.gridAxes);
        setGridIntersections(diag.gridIntersections);

        if (diag.beams.length > 0) {
          const withCorners = applyAutoCornerExtensions(diag.beams, scaleResult.pixelsPerCm);
          updateBeamsWithHistory(withCorners);
          setSelectedBeamIds(withCorners[0] ? [withCorners[0].id] : []);
          setIsPdfModalOpen(false);
          setPdfInspection(null);
          alert(
            `นำเข้า PDF หน้า ${pageNumber} สำเร็จ (ความคมชัดระดับ Ultra-HD Vector)!\n- สเกล: ${scaleResult.pixelsPerCm.toFixed(2)} px/ซม. (${scaleResult.confidence})\n- ค้นพบแกนกริดหลัก: แนวนอน ${diag.counts.horizontalGrids} แกน, แนวตั้ง ${diag.counts.verticalGrids} แกน\n- กำหนดจุดตัดกริด (Grid Intersections): ${diag.counts.gridIntersections} จุดตัด (A-1, B-2...)\n- วางคานหลักตามแนวกริดและตัดคานซอย: ${diag.beams.length} ช่วง (ความสูงเริ่มต้น 50 ซม.)`
          );
          return;
        }
      }

      setIsPdfModalOpen(false);
      setPdfInspection(null);
      alert(
        `นำเข้า PDF หน้า ${pageNumber} สำเร็จ (ความคมชัดระดับ Ultra-HD Vector)!\n- ตั้งสเกล: ${scaleResult.pixelsPerCm.toFixed(2)} px/ซม.\n- คุณสามารถกดปุ่ม "สแกนคาน (Auto 50 ซม.)" หรือเลือกเครื่องมือวาดคานวงใน / วงนอก ได้ทันทีครับ`
      );
    } catch (err) {
      console.error('Failed to load PDF page:', err);
      alert('ไม่สามารถโหลดหน้านี้ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoadingPdfPage(false);
    }
  };

  const handleUploadPdf = async (file: File) => {
    try {
      const inspection = await inspectPdfPages(file);
      if (inspection.totalPages > 1) {
        setPdfInspection({ ...inspection, file });
        setIsPdfModalOpen(true);
        return;
      }
      await loadSpecificPdfPage(file, 1);
    } catch (err) {
      console.error('Failed to load PDF:', err);
      alert('ไม่สามารถเปิดไฟล์ PDF นี้ได้ กรุณาลองใช้ไฟล์ PDF แปลนอื่น');
    }
  };

  const handleAutoDetectBeams = () => {
    if (!pdfImageUrl && vectorLines.length === 0) {
      alert('กรุณานำเข้าไฟล์ PDF แปลนคานก่อนครับ');
      return;
    }
    const diag = autoDetectBeamsWithDiagnostics(
      vectorLines,
      pixelsPerCm,
      50,
      planTexts,
      pdfDimensions
    );
    setGridAxes(diag.gridAxes);
    setGridIntersections(diag.gridIntersections);

    if (diag.beams.length === 0) {
      alert(
        `สแกนจำแนกเส้นเสร็จสิ้น:\n- ตัดกรอบกระดาษ/ตารางออก: ${diag.counts.borderOrTitleBlock} เส้น\n- พบแกนเส้นกริด: แนวนอน ${diag.counts.horizontalGrids} แกน, แนวตั้ง ${diag.counts.verticalGrids} แกน (${diag.counts.gridIntersections} จุดตัด)\n- ไม่พบคู่เส้นขนานของคานที่ชัดเจน คุณสามารถใช้ปุ่ม "ตีกรอบวงใน" หรือ "วาดคาน (วงใน)" คลิกเกาะไม้แบบตามเส้นบนแปลนได้ทันทีครับ`
      );
      return;
    }
    const withCorners = applyAutoCornerExtensions(diag.beams, pixelsPerCm);
    updateBeamsWithHistory(withCorners);
    setSelectedBeamIds(withCorners[0] ? [withCorners[0].id] : []);
    alert(
      `สแกนรับรู้โครงข่ายกริดและเกาะไม้แบบสำเร็จ!\n- ค้นพบแกนกริดหลัก: แนวนอน ${diag.counts.horizontalGrids} แกน, แนวตั้ง ${diag.counts.verticalGrids} แกน\n- กำหนดจุดตัดกริด (Grid Intersections): ${diag.counts.gridIntersections} จุดตัด (A-1, B-2...)\n- วางคานหลักตามแนวกริดและตัดคานซอย: ${diag.beams.length} ช่วง (ความสูง 50 ซม. ทั้งหมด, ไม้แบบหนา 5 ซม.)`
    );
  };

  const handleRunAutoScale = () => {
    const scaleResult = autoDetectScaleFromPlanData(vectorLines, planTexts);
    setPixelsPerCm(scaleResult.pixelsPerCm);
    setScaleNote(scaleResult.confidence);
    alert(`ตั้งสเกลอัตโนมัติสำเร็จ: ${scaleResult.pixelsPerCm.toFixed(2)} px/ซม.\n(${scaleResult.confidence})`);
  };

  const handleStartManualScale = () => {
    setScaleMode('manual_p1');
  };

  const handleCalibrationPointsSelected = (p1: Point, p2: Point) => {
    setScaleMode('none');
    const inputStr = window.prompt(
      'กรอกระยะทางจริงระหว่าง 2 จุดที่คลิก (หน่วยเป็น เซนติเมตร เช่น 400 ซม. หรือ 4 เมตร):',
      '400'
    );
    if (!inputStr) return;
    const realCm = parseFloat(inputStr);
    if (realCm > 0) {
      const newScale = calculateScaleFromTwoPoints(p1, p2, realCm);
      setPixelsPerCm(newScale);
      setScaleNote(`ตั้งสเกล Manual: ${newScale.toFixed(2)} px/ซม. (อ้างอิง ${realCm} ซม.)`);
    }
  };

  const handleAddBeam = (
    start: Point,
    end: Point,
    toolMode: DrawingToolMode | 'draw_beam' = activeTool
  ) => {
    const nextIdx = beams.length + 1;
    let createdEdges: BeamElement[] = [];

    if (toolMode === 'draw_inner_box') {
      createdEdges = createEdgesFromBoxTool(
        `S${nextIdx}`,
        start,
        end,
        'inner',
        defaultHeight,
        pixelsPerCm,
        defaultBeamWidthCm,
        autoParallelPair
      );
    } else if (toolMode === 'draw_outer_box') {
      createdEdges = createEdgesFromBoxTool(
        `S${nextIdx}`,
        start,
        end,
        'outer',
        defaultHeight,
        pixelsPerCm,
        defaultBeamWidthCm,
        autoParallelPair
      );
    } else if (toolMode === 'draw_outer_line') {
      createdEdges = createEdgesFromLineTool(
        `B${nextIdx}`,
        start,
        end,
        'outer',
        defaultHeight,
        pixelsPerCm,
        defaultBeamWidthCm,
        autoParallelPair
      );
    } else {
      createdEdges = createEdgesFromLineTool(
        `B${nextIdx}`,
        start,
        end,
        'inner',
        defaultHeight,
        pixelsPerCm,
        defaultBeamWidthCm,
        autoParallelPair
      );
    }

    if (createdEdges.length > 0) {
      const updated = applyAutoCornerExtensions([...beams, ...createdEdges], pixelsPerCm);
      updateBeamsWithHistory(updated);
      setSelectedBeamIds([createdEdges[0].id]);
      setActiveTool('select');
    }
  };

  const handleAutoPlaceFormwork = () => {
    const optimized = applyAutoCornerExtensions(beams, pixelsPerCm);
    const freshOptimized = optimized.map((b) => ({
      ...b,
      leftSide: { ...b.leftSide, customPanels: undefined },
      rightSide: { ...b.rightSide, customPanels: undefined },
    }));
    updateBeamsWithHistory(freshOptimized);
    alert('จัดเรียงแผ่นไม้แบบอัตโนมัติ (ป้องกันไม้แบบชน/ทับกัน และคิดความหนา 5 ซม.) เรียบร้อยแล้ว!');
  };

  const handleUpdateBeam = (updated: BeamElement) => {
    updateBeamsWithHistory((prev) =>
      applyAutoCornerExtensions(
        prev.map((b) => (b.id === updated.id ? updated : b)),
        pixelsPerCm
      )
    );
  };

  const handleMoveBeam = (
    beamId: string,
    newStart: Point,
    newEnd: Point,
    finalize = false
  ) => {
    if (finalize) {
      updateBeamsWithHistory((prev) =>
        applyAutoCornerExtensions(
          prev.map((b) => (b.id === beamId ? { ...b, start: newStart, end: newEnd } : b)),
          pixelsPerCm
        )
      );
    } else {
      setBeams((prev) =>
        prev.map((b) => (b.id === beamId ? { ...b, start: newStart, end: newEnd } : b))
      );
    }
  };

  const handleBatchMoveBeams = (
    origEdges: Array<{ id: string; start: Point; end: Point }>,
    dx: number,
    dy: number,
    finalize = false
  ) => {
    const origMap = new Map(origEdges.map((e) => [e.id, e]));
    if (finalize) {
      updateBeamsWithHistory((prev) =>
        applyAutoCornerExtensions(
          prev.map((b) => {
            const orig = origMap.get(b.id);
            if (!orig) return b;
            return {
              ...b,
              start: { x: orig.start.x + dx, y: orig.start.y + dy },
              end: { x: orig.end.x + dx, y: orig.end.y + dy },
              leftSide: { ...b.leftSide, customPanels: undefined },
              rightSide: { ...b.rightSide, customPanels: undefined },
            };
          }),
          pixelsPerCm
        )
      );
    } else {
      setBeams((prev) =>
        prev.map((b) => {
          const orig = origMap.get(b.id);
          if (!orig) return b;
          return {
            ...b,
            start: { x: orig.start.x + dx, y: orig.start.y + dy },
            end: { x: orig.end.x + dx, y: orig.end.y + dy },
          };
        })
      );
    }
  };

  const handleDeleteBeam = (beamId: string) => {
    updateBeamsWithHistory((prev) =>
      applyAutoCornerExtensions(
        prev.filter((b) => b.id !== beamId),
        pixelsPerCm
      )
    );
    setSelectedBeamIds((prev) => prev.filter((id) => id !== beamId));
  };

  const handleDeleteSelectedBeams = () => {
    if (selectedBeamIds.length === 0) return;
    updateBeamsWithHistory((prev) =>
      applyAutoCornerExtensions(
        prev.filter((b) => !selectedBeamIds.includes(b.id)),
        pixelsPerCm
      )
    );
    setSelectedBeamIds([]);
  };

  const handleBatchChangeHeight = (newHeight: FormworkHeight) => {
    if (selectedBeamIds.length === 0) return;
    updateBeamsWithHistory((prev) =>
      applyAutoCornerExtensions(
        prev.map((b) => {
          if (!selectedBeamIds.includes(b.id)) return b;
          return {
            ...b,
            defaultHeightCm: newHeight,
            leftSide: { ...b.leftSide, heightCm: newHeight, customPanels: undefined },
            rightSide: { ...b.rightSide, heightCm: newHeight, customPanels: undefined },
          };
        }),
        pixelsPerCm
      )
    );
  };

  const handleResizeBoxGroup = (
    boxGroupId: string,
    p1: Point,
    p2: Point,
    finalize = false
  ) => {
    if (finalize) {
      updateBeamsWithHistory((prev) => {
        const updated = updateBoxGroupRectangle(prev, boxGroupId, p1, p2);
        return applyAutoCornerExtensions(updated, pixelsPerCm);
      });
    } else {
      setBeams((prev) => updateBoxGroupRectangle(prev, boxGroupId, p1, p2));
    }
  };


  const handleUngroupBox = (boxGroupId: string) => {
    updateBeamsWithHistory((prev) =>
      applyAutoCornerExtensions(ungroupBoxEdges(prev, boxGroupId), pixelsPerCm)
    );
  };

  // Select Beams based on clicked matrix cell / totals / free cut
  const handleSelectBySku = (filter: {
    length?: number;
    height?: FormworkHeight;
    isFree?: boolean;
  }) => {
    let matchingPanels = panels;
    if (filter.isFree) {
      matchingPanels = matchingPanels.filter(
        (p) => p.type === 'free' && (!filter.height || p.heightCm === filter.height)
      );
    } else {
      matchingPanels = matchingPanels.filter(
        (p) =>
          p.type === 'standard' &&
          (!filter.length || p.lengthCm === filter.length) &&
          (!filter.height || p.heightCm === filter.height)
      );
    }
    const matchingBeamIds = Array.from(new Set(matchingPanels.map((p) => p.beamId)));
    setSelectedBeamIds(matchingBeamIds);
  };

  // Keyboard Shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo), Delete/Backspace, U (Ungroup), Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isCtrlOrMeta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (isCtrlOrMeta && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBeamIds.length > 0) {
        e.preventDefault();
        handleDeleteSelectedBeams();
      } else if ((e.key === 'u' || e.key === 'U') && selectedBeamId) {
        const selected = beams.find((b) => b.id === selectedBeamId);
        if (selected?.boxGroupId) {
          e.preventDefault();
          handleUngroupBox(selected.boxGroupId);
        }
      } else if (e.key === 'Escape') {
        if (activeTool !== 'select') {
          setActiveTool('select');
        } else if (selectedBeamIds.length > 0) {
          setSelectedBeamIds([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBeamIds, selectedBeamId, activeTool, beams, past, future]);

  const handleResetBeamToAuto = (beamId: string) => {
    updateBeamsWithHistory((prev) =>
      applyAutoCornerExtensions(
        prev.map((b) => {
          if (b.id !== beamId) return b;
          return {
            ...b,
            leftSide: { ...b.leftSide, customPanels: undefined },
            rightSide: { ...b.rightSide, customPanels: undefined },
          };
        }),
        pixelsPerCm
      )
    );
  };

  // Project Save and Load Handlers
  const handleSaveProject = () => {
    const projectData: FormworkProjectData = {
      version: '1.0',
      appName: 'ModularFormworkCalculator',
      savedAt: new Date().toISOString(),
      pixelsPerCm,
      scaleNote,
      defaultHeight,
      defaultBeamWidthCm,
      autoParallelPair,
      beams,
      pdfDimensions,
      pdfImageUrl,
    };
    saveProjectFile(projectData);
  };

  const handleLoadProject = async (file: File) => {
    try {
      const loaded = await loadProjectFile(file);
      setBeams(loaded.beams);
      setPixelsPerCm(loaded.pixelsPerCm);
      setScaleNote(loaded.scaleNote);
      setDefaultHeight(loaded.defaultHeight);
      setDefaultBeamWidthCm(loaded.defaultBeamWidthCm);
      setAutoParallelPair(loaded.autoParallelPair);
      setPdfDimensions(loaded.pdfDimensions);
      setPdfImageUrl(loaded.pdfImageUrl || null);
      setSelectedBeamIds(loaded.beams[0] ? [loaded.beams[0].id] : []);
      setPast([]);
      setFuture([]);
      alert(`โหลดโปรเจกต์สำเร็จ!\n- นำเข้าไม้แบบ ${loaded.beams.length} ช่วง\n- สเกล ${loaded.pixelsPerCm.toFixed(2)} px/ซม.`);
    } catch (err: any) {
      console.error('Failed to load project:', err);
      alert(`ไม่สามารถเปิดไฟล์โปรเจกต์ได้: ${err.message || 'รูปแบบไฟล์ไม่ถูกต้อง'}`);
    }
  };

  // Official PDF Report Export Handler
  const handleExportPdf = async () => {
    try {
      await exportFormworkPdfReport(canvasRef.current, summary, {
        scale: pixelsPerCm,
        totalBeams: beams.length,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('เกิดข้อผิดพลาดในการสร้างรายงาน PDF');
    }
  };

  const handleExportCsv = () => {
    const csv = generateRentalSummaryCsv(summary);
    downloadCsvFile(csv, 'modular-formwork-order.csv');
  };

  const handleExportPng = () => {
    exportCanvasAsPng(canvasRef.current, 'formwork-beam-layout.png');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F8FAFC]">
      {/* Top Minimal Toolbar */}
      <TopToolbar
        onUploadPdf={handleUploadPdf}
        scaleMode={scaleMode}
        onStartManualScale={handleStartManualScale}
        onRunAutoScale={handleRunAutoScale}
        onAutoDetectBeams={handleAutoDetectBeams}
        currentScale={pixelsPerCm}
        scaleNote={scaleNote}
        defaultHeight={defaultHeight}
        onChangeDefaultHeight={setDefaultHeight}
        defaultBeamWidthCm={defaultBeamWidthCm}
        onChangeDefaultBeamWidthCm={setDefaultBeamWidthCm}
        autoParallelPair={autoParallelPair}
        onChangeAutoParallelPair={setAutoParallelPair}
        activeTool={activeTool}
        onChangeActiveTool={setActiveTool}
        onAutoPlaceFormwork={handleAutoPlaceFormwork}
        onExportCsv={handleExportCsv}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        onUndo={handleUndo}
        canUndo={past.length > 0}
        onRedo={handleRedo}
        canRedo={future.length > 0}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      {/* Main Workspace: Interactive Canvas + Right Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <PlanCanvas
          canvasRef={canvasRef}
          pdfImageUrl={pdfImageUrl}
          vectorLines={vectorLines}
          gridAxes={gridAxes}
          gridIntersections={gridIntersections}
          beams={beams}
          panels={panels}
          snapPoints={snapPoints}
          pixelsPerCm={pixelsPerCm}
          selectedBeamId={selectedBeamId}
          selectedBeamIds={selectedBeamIds}
          onSelectBeam={handleSelectBeam}
          onMoveBeam={handleMoveBeam}
          onBatchMoveBeams={handleBatchMoveBeams}
          onDeleteBeam={handleDeleteBeam}
          onResizeBoxGroup={handleResizeBoxGroup}
          onUngroupBox={handleUngroupBox}
          activeTool={activeTool}
          onAddBeam={handleAddBeam}
          scaleMode={scaleMode}
          onCalibrationPointsSelected={handleCalibrationPointsSelected}
        />

        <RightSidebar
          summary={summary}
          beams={beams}
          selectedBeamIds={selectedBeamIds}
          onSelectBeam={handleSelectBeam}
          onSelectBySku={handleSelectBySku}
          onBatchChangeHeight={handleBatchChangeHeight}
          onDeleteSelectedBeams={handleDeleteSelectedBeams}
          onClearSelection={handleClearSelection}
          onUpdateBeam={handleUpdateBeam}
          onDeleteBeam={handleDeleteBeam}
          onResetBeamToAuto={handleResetBeamToAuto}
          onUngroupBox={handleUngroupBox}
        />
      </div>

      {/* Multi-Page PDF Selection Modal */}
      {pdfInspection && (
        <PdfPageSelectorModal
          isOpen={isPdfModalOpen}
          totalPages={pdfInspection.totalPages}
          pages={pdfInspection.pages}
          fileName={pdfInspection.file.name}
          onSelectPage={(pageNum) => {
            if (pdfInspection.file) {
              loadSpecificPdfPage(pdfInspection.file, pageNum);
            }
          }}
          onClose={() => {
            setIsPdfModalOpen(false);
            setPdfInspection(null);
          }}
          isLoading={isLoadingPdfPage}
        />
      )}
    </div>
  );
};

export default App;
