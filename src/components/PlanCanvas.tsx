import React, { useRef, useState, useEffect } from 'react';
import {
  BeamElement,
  FORMWORK_THICKNESS_CM,
  PlacedPanel,
  Point,
} from '../types/formwork';
import { ZoomIn, ZoomOut, RotateCcw, Upload } from 'lucide-react';

interface PlanCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  pdfImageUrl: string | null;
  beams: BeamElement[];
  panels: PlacedPanel[];
  pixelsPerCm: number;
  selectedBeamId: string | null;
  onSelectBeam: (beamId: string | null) => void;
  activeTool: 'select' | 'draw_beam';
  onAddBeam: (start: Point, end: Point) => void;
  scaleMode: 'none' | 'manual_p1' | 'manual_p2';
  onCalibrationPointsSelected: (p1: Point, p2: Point) => void;
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  canvasRef,
  pdfImageUrl,
  beams,
  panels,
  pixelsPerCm,
  selectedBeamId,
  onSelectBeam,
  activeTool,
  onAddBeam,
  scaleMode,
  onCalibrationPointsSelected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Drawing beam state
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<Point | null>(null);

  // Calibration points state
  const [calibP1, setCalibP1] = useState<Point | null>(null);

  // Background PDF image object
  const [pdfImage, setPdfImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!pdfImageUrl) {
      setPdfImage(null);
      return;
    }
    const img = new Image();
    img.src = pdfImageUrl;
    img.onload = () => setPdfImage(img);
  }, [pdfImageUrl]);

  // Convert screen coordinates to world/plan coordinates
  const screenToWorld = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - pan.x) / zoom,
      y: (sy - pan.y) / zoom,
    };
  };

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas internal size
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. Draw Architectural Grid
    const gridSize = 50; // 50px grid
    const startX = -pan.x / zoom;
    const startY = -pan.y / zoom;
    const endX = startX + canvas.clientWidth / zoom;
    const endY = startY + canvas.clientHeight / zoom;

    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // 2. Draw PDF Background if available
    if (pdfImage) {
      ctx.drawImage(pdfImage, 0, 0);
    }

    // 3. Draw Beams
    for (const beam of beams) {
      const isSelected = beam.id === selectedBeamId;
      const bDx = beam.end.x - beam.start.x;
      const bDy = beam.end.y - beam.start.y;
      const bLen = Math.hypot(bDx, bDy) || 1;
      const ux = bDx / bLen;
      const uy = bDy / bLen;
      const nx = -uy;
      const ny = ux;

      const halfW = (beam.widthCm * pixelsPerCm) / 2;

      // Beam Body
      ctx.fillStyle = isSelected ? '#EFF6FF' : '#F8FAFC';
      ctx.strokeStyle = isSelected ? '#3B82F6' : '#94A3B8';
      ctx.lineWidth = (isSelected ? 2 : 1) / zoom;

      ctx.beginPath();
      ctx.moveTo(beam.start.x + nx * halfW, beam.start.y + ny * halfW);
      ctx.lineTo(beam.end.x + nx * halfW, beam.end.y + ny * halfW);
      ctx.lineTo(beam.end.x - nx * halfW, beam.end.y - ny * halfW);
      ctx.lineTo(beam.start.x - nx * halfW, beam.start.y - ny * halfW);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Beam Centerline
      ctx.strokeStyle = isSelected ? '#60A5FA' : '#CBD5E1';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(beam.start.x, beam.start.y);
      ctx.lineTo(beam.end.x, beam.end.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Beam Label
      const midX = (beam.start.x + beam.end.x) / 2;
      const midY = (beam.start.y + beam.end.y) / 2;
      ctx.fillStyle = isSelected ? '#1D4ED8' : '#334155';
      ctx.font = `600 ${Math.max(10, 11 / zoom)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(beam.name, midX, midY);
    }

    // 4. Draw Formwork Panels with Fixed 5cm Thickness
    const thicknessPx = FORMWORK_THICKNESS_CM * pixelsPerCm;

    for (const panel of panels) {
      const parentBeam = beams.find((b) => b.id === panel.beamId);
      if (!parentBeam) continue;

      const bDx = parentBeam.end.x - parentBeam.start.x;
      const bDy = parentBeam.end.y - parentBeam.start.y;
      const bLen = Math.hypot(bDx, bDy) || 1;
      const ux = bDx / bLen;
      const uy = bDy / bLen;
      const nx = -uy;
      const ny = ux;

      const halfW = (parentBeam.widthCm * pixelsPerCm) / 2;
      const sign = panel.side === 'left' ? 1 : -1;

      // Start point on beam edge
      const sideStartX = parentBeam.start.x + sign * nx * halfW;
      const sideStartY = parentBeam.start.y + sign * ny * halfW;

      // Panel length in pixels
      const panelLenPx = panel.lengthCm * pixelsPerCm;
      const offsetPx = panel.offsetStartCm * pixelsPerCm;

      // 4 corners of panel
      const p1x = sideStartX + ux * offsetPx;
      const p1y = sideStartY + uy * offsetPx;

      const p2x = p1x + ux * panelLenPx;
      const p2y = p1y + uy * panelLenPx;

      const p3x = p2x + sign * nx * thicknessPx;
      const p3y = p2y + sign * ny * thicknessPx;

      const p4x = p1x + sign * nx * thicknessPx;
      const p4y = p1y + sign * ny * thicknessPx;

      // Panel Theme
      const theme = panel.skuTheme;
      ctx.fillStyle = theme ? theme.fill : '#CBD5E1';
      ctx.strokeStyle = theme ? theme.stroke : '#475569';
      ctx.lineWidth = 1.2 / zoom;

      if (panel.type === 'free') {
        ctx.setLineDash([3 / zoom, 2 / zoom]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(p3x, p3y);
      ctx.lineTo(p4x, p4y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // Label on Panel
      if (panelLenPx * zoom > 22) {
        const pMidX = (p1x + p2x + p3x + p4x) / 4;
        const pMidY = (p1y + p2y + p3y + p4y) / 4;
        ctx.fillStyle = theme ? theme.stroke : '#1E293B';
        ctx.font = `700 ${Math.max(8, 9 / zoom)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const labelText =
          panel.type === 'free'
            ? `F${panel.lengthCm}×${panel.heightCm}`
            : `${panel.lengthCm}×${panel.heightCm}`;
        ctx.fillText(labelText, pMidX, pMidY);
      }
    }

    // 5. Draw Temporary Drawing Beam
    if (activeTool === 'draw_beam' && drawStart && currentMousePos) {
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]);
      ctx.beginPath();
      ctx.moveTo(drawStart.x, drawStart.y);
      ctx.lineTo(currentMousePos.x, currentMousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.fillStyle = '#3B82F6';
      ctx.beginPath();
      ctx.arc(drawStart.x, drawStart.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Draw Scale Calibration Points
    if (scaleMode !== 'none' && calibP1) {
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.arc(calibP1.x, calibP1.y, 6 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (currentMousePos) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(calibP1.x, calibP1.y);
        ctx.lineTo(currentMousePos.x, currentMousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }, [
    beams,
    panels,
    pdfImage,
    pan,
    zoom,
    selectedBeamId,
    activeTool,
    drawStart,
    currentMousePos,
    scaleMode,
    calibP1,
    pixelsPerCm,
  ]);

  // Mouse Handlers for Pan, Draw, Select, and Scale Calibration
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);

    // Scale calibration mode
    if (scaleMode !== 'none') {
      if (!calibP1) {
        setCalibP1(world);
      } else {
        onCalibrationPointsSelected(calibP1, world);
        setCalibP1(null);
      }
      return;
    }

    // Draw Beam Tool
    if (activeTool === 'draw_beam') {
      if (!drawStart) {
        setDrawStart(world);
      } else {
        if (Math.hypot(world.x - drawStart.x, world.y - drawStart.y) > 20) {
          onAddBeam(drawStart, world);
        }
        setDrawStart(null);
      }
      return;
    }

    // Select Beam Tool
    if (activeTool === 'select') {
      // Find clicked beam
      let foundBeamId: string | null = null;
      for (const b of beams) {
        const dx = b.end.x - b.start.x;
        const dy = b.end.y - b.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const u = ((world.x - b.start.x) * dx + (world.y - b.start.y) * dy) / (len * len);
        if (u >= 0 && u <= 1) {
          const projX = b.start.x + u * dx;
          const projY = b.start.y + u * dy;
          const dist = Math.hypot(world.x - projX, world.y - projY);
          const threshold = ((b.widthCm + 15) * pixelsPerCm) / 2;
          if (dist <= threshold) {
            foundBeamId = b.id;
            break;
          }
        }
      }

      if (foundBeamId) {
        onSelectBeam(foundBeamId);
        return;
      }
    }

    // Default: Start Panning
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setCurrentMousePos(world);

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.2), 5);

    // Zoom towards mouse pointer
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setPan({
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
    });
    setZoom(newZoom);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full w-full bg-[#F8FAFC] overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Floating Canvas Controls (Zoom In/Out/Reset) */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-white/95 backdrop-blur-xs p-1 rounded-lg border border-[#E2E8F0] shadow-sm">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.2, 5))}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 transition-colors"
          title="ซูมเข้า"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.2))}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 transition-colors"
          title="ซูมออก"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 50, y: 50 });
          }}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 transition-colors"
          title="รีเซ็ตมุมมอง (100%)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <span className="px-2 text-xs font-semibold text-slate-600 border-l border-slate-200">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Helper Notification Banner for Tool Modes */}
      {scaleMode !== 'none' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md flex items-center gap-2">
          <span>
            {calibP1
              ? 'คลิกจุดที่ 2 บนแปลนเพื่อสิ้นสุดการวัดระยะสเกล'
              : 'คลิกจุดที่ 1 บนแปลนเพื่อเริ่มเซตสเกล'}
          </span>
        </div>
      )}

      {activeTool === 'draw_beam' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md flex items-center gap-2">
          <span>
            {drawStart ? 'คลิกจุดสิ้นสุดของคาน' : 'คลิกจุดเริ่มต้นเพื่อวาดแนวคานใหม่'}
          </span>
        </div>
      )}

      {/* Empty State Guide when no PDF and no beams exist */}
      {!pdfImageUrl && beams.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4">
          <div className="bg-white/95 backdrop-blur-xs p-6 rounded-2xl border border-slate-200 shadow-sm text-center max-w-sm">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              เริ่มต้นคำนวณไม้แบบ
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              กดปุ่ม <span className="font-semibold text-blue-600">"นำเข้า PDF แปลนคาน"</span> ด้านบน ระบบจะอ่านสเกลและตรวจจับแนวคานพร้อมจัดเรียงไม้แบบให้อัตโนมัติทันที
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
