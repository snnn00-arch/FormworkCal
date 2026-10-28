import React, { useState, useMemo, useRef } from 'react';
import {
  BeamElement,
  DEFAULT_BEAM_WIDTH_CM,
  DrawingToolMode,
  FormworkHeight,
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
} from './engine/beamDetector';
import {
  downloadCsvFile,
  exportCanvasAsPng,
  generateRentalSummaryCsv,
} from './engine/exportEngine';
import { loadPdfFirstPage } from './utils/pdfLoader';
import { TopToolbar } from './components/TopToolbar';
import { PlanCanvas } from './components/PlanCanvas';
import { RightSidebar } from './components/RightSidebar';

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Core State
  const [pdfImageUrl, setPdfImageUrl] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | undefined>(
    undefined
  );
  const [vectorLines, setVectorLines] = useState<RawVectorLine[]>([]);
  const [planTexts, setPlanTexts] = useState<RawTextItem[]>([]);

  const [beams, setBeams] = useState<BeamElement[]>([]);
  const [pixelsPerCm, setPixelsPerCm] = useState<number>(1.2);
  const [scaleNote, setScaleNote] = useState<string>('สเกลเริ่มต้น 1.20 px/ซม.');
  const [scaleMode, setScaleMode] = useState<'none' | 'manual_p1' | 'manual_p2'>('none');

  const [defaultHeight, setDefaultHeight] = useState<FormworkHeight>(60);
  const [defaultBeamWidthCm, setDefaultBeamWidthCm] = useState<number>(DEFAULT_BEAM_WIDTH_CM);
  const [autoParallelPair, setAutoParallelPair] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<DrawingToolMode>('select');
  const [selectedBeamId, setSelectedBeamId] = useState<string | null>(null);

  // Compute Placed Panels and Rental Summary
  const panels = useMemo(() => {
    return computeAllBeamPanels(beams, pixelsPerCm);
  }, [beams, pixelsPerCm]);

  const summary = useMemo(() => {
    return computeRentalSummary(panels);
  }, [panels]);

  // Action Handlers
  const handleUploadPdf = async (file: File) => {
    try {
      const loaded = await loadPdfFirstPage(file);
      const dims = { width: loaded.width, height: loaded.height };
      setPdfImageUrl(loaded.imageDataUrl);
      setPdfDimensions(dims);
      setVectorLines(loaded.vectorLines);
      setPlanTexts(loaded.texts);

      // 1. Auto scale detection
      const scaleResult = autoDetectScaleFromPlanData(loaded.vectorLines, loaded.texts);
      setPixelsPerCm(scaleResult.pixelsPerCm);
      setScaleNote(scaleResult.confidence);

      // 2. Auto line classification + Grid-Referenced Beam Line Detection
      if (loaded.vectorLines.length > 0) {
        const diag = autoDetectBeamsWithDiagnostics(
          loaded.vectorLines,
          scaleResult.pixelsPerCm,
          defaultHeight,
          loaded.texts,
          dims
        );
        if (diag.beams.length > 0) {
          const withCorners = applyAutoCornerExtensions(diag.beams, scaleResult.pixelsPerCm);
          setBeams(withCorners);
          setSelectedBeamId(withCorners[0]?.id || null);
          alert(
            `นำเข้า PDF สำเร็จ!\n- สเกล: ${scaleResult.pixelsPerCm.toFixed(2)} px/ซม. (${scaleResult.confidence})\n- ตัดเส้นกรอบกระดาษ/ตาราง: ${diag.counts.borderOrTitleBlock} เส้น\n- ตรวจพบแกนเส้นกริดอ้างอิง: แนวนอน ${diag.counts.horizontalGrids} แกน, แนวตั้ง ${diag.counts.verticalGrids} แกน\n- รับรู้เส้นขอบและนำไม้แบบไปเกาะตามเส้น: ${diag.beams.length} ช่วง (ความกว้างคานเริ่มต้น 20 ซม.)`
          );
          return;
        }
      }

      alert(
        `นำเข้า PDF สำเร็จ!\n- ตั้งสเกล: ${scaleResult.pixelsPerCm.toFixed(2)} px/ซม.\n- คุณสามารถกดปุ่ม "สแกนตรวจจับคาน (Auto)" หรือเลือกเครื่องมือ "วาดคาน (วงใน)" / "วาดคาน (วงนอก)" เพื่อเกาะไม้แบบตามเส้นได้ทันทีครับ`
      );
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
      defaultHeight,
      planTexts,
      pdfDimensions
    );
    if (diag.beams.length === 0) {
      alert(
        `สแกนจำแนกเส้นเสร็จสิ้น:\n- ตัดกรอบกระดาษ/ตารางออก: ${diag.counts.borderOrTitleBlock} เส้น\n- พบแกนเส้นกริดอ้างอิง: แนวนอน ${diag.counts.horizontalGrids} แกน, แนวตั้ง ${diag.counts.verticalGrids} แกน\n- ไม่พบคู่เส้นขนานของคานที่ชัดเจน คุณสามารถใช้ปุ่ม "วาดคาน (วงใน)" หรือ "วาดคาน (วงนอก)" คลิกเกาะไม้แบบตามเส้นบนแปลนได้ทันทีครับ`
      );
      return;
    }
    const withCorners = applyAutoCornerExtensions(diag.beams, pixelsPerCm);
    setBeams(withCorners);
    setSelectedBeamId(withCorners[0]?.id || null);
    alert(
      `สแกนรับรู้เส้นและเกาะไม้แบบสำเร็จ!\n- ตัดเส้นกรอบกระดาษ/ตารางออก: ${diag.counts.borderOrTitleBlock} เส้น\n- ใช้แกนเส้นกริดอ้างอิง: แนวนอน ${diag.counts.horizontalGrids} แกน, แนวตั้ง ${diag.counts.verticalGrids} แกน\n- เกาะไม้แบบตามเส้นคานจริง: ${diag.beams.length} ช่วง (กว้างมาตรฐาน 20 ซม., ไม้แบบหนา 5 ซม.)`
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
      // 'draw_inner_line' or legacy 'draw_beam'
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
      setBeams(updated);
      setSelectedBeamId(createdEdges[0].id);
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
    setBeams(freshOptimized);
    alert('จัดเรียงแผ่นไม้แบบอัตโนมัติ (คิดความหนา 5 ซม. และระยะอมมุมชน) เรียบร้อยแล้ว!');
  };

  const handleUpdateBeam = (updated: BeamElement) => {
    setBeams((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  const handleDeleteBeam = (beamId: string) => {
    setBeams((prev) => prev.filter((b) => b.id !== beamId));
    if (selectedBeamId === beamId) {
      setSelectedBeamId(null);
    }
  };

  const handleResetBeamToAuto = (beamId: string) => {
    setBeams((prev) =>
      prev.map((b) => {
        if (b.id !== beamId) return b;
        return {
          ...b,
          leftSide: { ...b.leftSide, customPanels: undefined },
          rightSide: { ...b.rightSide, customPanels: undefined },
        };
      })
    );
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
      />

      {/* Main Workspace: Interactive Canvas + Right Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <PlanCanvas
          canvasRef={canvasRef}
          pdfImageUrl={pdfImageUrl}
          beams={beams}
          panels={panels}
          pixelsPerCm={pixelsPerCm}
          selectedBeamId={selectedBeamId}
          onSelectBeam={setSelectedBeamId}
          activeTool={activeTool}
          onAddBeam={handleAddBeam}
          scaleMode={scaleMode}
          onCalibrationPointsSelected={handleCalibrationPointsSelected}
        />

        <RightSidebar
          summary={summary}
          beams={beams}
          selectedBeamId={selectedBeamId}
          onSelectBeam={setSelectedBeamId}
          onUpdateBeam={handleUpdateBeam}
          onDeleteBeam={handleDeleteBeam}
          onResetBeamToAuto={handleResetBeamToAuto}
        />
      </div>
    </div>
  );
};

export default App;
