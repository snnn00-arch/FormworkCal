import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BeamElement,
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
  autoDetectBeamsFromVectorLines,
  createBeamElement,
  generateSampleBeamPlan,
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
  const [vectorLines, setVectorLines] = useState<RawVectorLine[]>([]);
  const [planTexts, setPlanTexts] = useState<RawTextItem[]>([]);

  const [beams, setBeams] = useState<BeamElement[]>([]);
  const [pixelsPerCm, setPixelsPerCm] = useState<number>(1.2);
  const [scaleNote, setScaleNote] = useState<string>('สเกลเริ่มต้น 1.20 px/ซม.');
  const [scaleMode, setScaleMode] = useState<'none' | 'manual_p1' | 'manual_p2'>('none');

  const [defaultHeight, setDefaultHeight] = useState<FormworkHeight>(60);
  const [activeTool, setActiveTool] = useState<'select' | 'draw_beam'>('select');
  const [selectedBeamId, setSelectedBeamId] = useState<string | null>(null);

  // Initialize with Sample Beam Plan on first load
  useEffect(() => {
    const sample = generateSampleBeamPlan();
    setPixelsPerCm(sample.pixelsPerCm);
    setVectorLines(sample.vectorLines);
    setPlanTexts(sample.texts);
    const optimized = applyAutoCornerExtensions(sample.beams, sample.pixelsPerCm);
    setBeams(optimized);
    setSelectedBeamId(optimized[0]?.id || null);
    setScaleNote('โหลดแปลนตัวอย่างพร้อมจัดเรียงไม้แบบสำเร็จรูป');
  }, []);

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
      setPdfImageUrl(loaded.imageDataUrl);
      setVectorLines(loaded.vectorLines);
      setPlanTexts(loaded.texts);

      // Auto scale detection
      const scaleResult = autoDetectScaleFromPlanData(loaded.vectorLines, loaded.texts);
      setPixelsPerCm(scaleResult.pixelsPerCm);
      setScaleNote(scaleResult.confidence);

      // If vectors detected, attempt auto beam detection
      if (loaded.vectorLines.length > 0) {
        const detected = autoDetectBeamsFromVectorLines(
          loaded.vectorLines,
          scaleResult.pixelsPerCm,
          defaultHeight
        );
        if (detected.length > 0) {
          const withCorners = applyAutoCornerExtensions(detected, scaleResult.pixelsPerCm);
          setBeams(withCorners);
          setSelectedBeamId(withCorners[0]?.id || null);
        }
      }
    } catch (err) {
      console.error('Failed to load PDF:', err);
      alert('ไม่สามารถเปิดไฟล์ PDF นี้ได้ กรุณาลองใช้ไฟล์ PDF แปลนอื่น');
    }
  };

  const handleLoadSamplePlan = () => {
    setPdfImageUrl(null);
    const sample = generateSampleBeamPlan();
    setPixelsPerCm(sample.pixelsPerCm);
    setVectorLines(sample.vectorLines);
    setPlanTexts(sample.texts);
    const optimized = applyAutoCornerExtensions(sample.beams, sample.pixelsPerCm);
    setBeams(optimized);
    setSelectedBeamId(optimized[0]?.id || null);
    setScaleNote('โหลดแปลนตัวอย่าง (2-Bay Floor Plan) พร้อมจัดเรียงไม้แบบ');
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

  const handleAddBeam = (start: Point, end: Point) => {
    const newName = `B${beams.length + 1}`;
    const newBeam = createBeamElement(newName, start, end, defaultHeight, 20);
    const updated = applyAutoCornerExtensions([...beams, newBeam], pixelsPerCm);
    setBeams(updated);
    setSelectedBeamId(newBeam.id);
    setActiveTool('select');
  };

  const handleAutoPlaceFormwork = () => {
    const optimized = applyAutoCornerExtensions(beams, pixelsPerCm);
    // Clear custom panels so everything re-optimizes cleanly
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
        onLoadSamplePlan={handleLoadSamplePlan}
        scaleMode={scaleMode}
        onStartManualScale={handleStartManualScale}
        onRunAutoScale={handleRunAutoScale}
        currentScale={pixelsPerCm}
        scaleNote={scaleNote}
        defaultHeight={defaultHeight}
        onChangeDefaultHeight={setDefaultHeight}
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
