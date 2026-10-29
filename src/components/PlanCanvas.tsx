import React, { useRef, useState, useEffect } from 'react';
import {
  BeamElement,
  DrawingToolMode,
  PlacedPanel,
  Point,
} from '../types/formwork';
import { SnapPoint } from '../engine/beamDetector';
import { RawVectorLine } from '../engine/scaleCalibrator';
import { getBeamLengthCm, getPlacedPanelPolygon } from '../engine/formworkOptimizer';
import { ZoomIn, ZoomOut, RotateCcw, Upload, Trash2, Move, Scissors } from 'lucide-react';

interface PlanCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  pdfImageUrl: string | null;
  vectorLines?: RawVectorLine[];
  beams: BeamElement[];
  panels: PlacedPanel[];
  snapPoints?: SnapPoint[];
  pixelsPerCm: number;
  selectedBeamId?: string | null;
  selectedBeamIds?: string[];
  onSelectBeam: (beamId: string | null, isShift?: boolean) => void;
  onMoveBeam?: (beamId: string, newStart: Point, newEnd: Point, finalize?: boolean) => void;
  onBatchMoveBeams?: (
    origEdges: Array<{ id: string; start: Point; end: Point }>,
    dx: number,
    dy: number,
    finalize?: boolean
  ) => void;
  onDeleteBeam?: (beamId: string) => void;
  onResizeBoxGroup?: (boxGroupId: string, anchorPt: Point, newCornerPt: Point, finalize?: boolean) => void;
  onUngroupBox?: (boxGroupId: string) => void;
  activeTool: DrawingToolMode | 'draw_beam';
  onAddBeam: (start: Point, end: Point, toolMode?: DrawingToolMode | 'draw_beam') => void;
  scaleMode: 'none' | 'manual_p1' | 'manual_p2';
  onCalibrationPointsSelected: (p1: Point, p2: Point) => void;
}

interface DragBeamState {
  beamId: string;
  boxGroupId?: string;
  mode: 'move_beam' | 'move_start' | 'move_end' | 'resize_box_corner' | 'move_box' | 'move_multi';
  cornerKey?: 'nw' | 'ne' | 'se' | 'sw';
  anchorPt?: Point;
  startMouse: Point;
  origStart: Point;
  origEnd: Point;
  origEdges?: Array<{ id: string; start: Point; end: Point }>;
  multiBeamIds?: string[];
  hasMoved: boolean;
}

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function isPointInOrNearPolygon(
  pt: Point,
  poly: [Point, Point, Point, Point],
  tolPx: number
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  if (inside) return true;

  for (let i = 0; i < 4; i++) {
    if (pointToSegmentDist(pt, poly[i], poly[(i + 1) % 4]) <= tolPx) {
      return true;
    }
  }
  return false;
}

function findNearestSnapPoint(
  pt: Point,
  snapPoints: SnapPoint[],
  maxDistPx: number
): SnapPoint | null {
  let best: SnapPoint | null = null;
  let bestDist = maxDistPx;
  for (const sp of snapPoints) {
    const d = Math.hypot(pt.x - sp.x, pt.y - sp.y);
    if (d <= bestDist) {
      bestDist = d;
      best = sp;
    }
  }
  return best;
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  canvasRef,
  pdfImageUrl,
  vectorLines = [],
  beams,
  panels,
  snapPoints = [],
  pixelsPerCm,
  selectedBeamId = null,
  selectedBeamIds,
  onSelectBeam,
  onMoveBeam,
  onBatchMoveBeams,
  onDeleteBeam,
  onResizeBoxGroup,
  onUngroupBox,
  activeTool,
  onAddBeam,
  scaleMode,
  onCalibrationPointsSelected,
}) => {
  const effectiveSelectedIds = selectedBeamIds || (selectedBeamId ? [selectedBeamId] : []);
  const primarySelectedId = effectiveSelectedIds[effectiveSelectedIds.length - 1] || null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Interactive dragging state for moving a selected beam or formwork strip
  const [dragState, setDragState] = useState<DragBeamState | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  // Drawing line / box state + Magnetic Column Corner Snap state
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<Point | null>(null);
  const [activeSnap, setActiveSnap] = useState<SnapPoint | null>(null);

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
    img.onload = () => {
      setPdfImage(img);
      const canvas = canvasRef.current;
      if (canvas && img.width > 0 && img.height > 0) {
        const cw = canvas.clientWidth || 900;
        const ch = canvas.clientHeight || 650;
        const fitZoom = Math.min(cw / img.width, ch / img.height) * 0.92;
        const clampedZoom = Math.min(Math.max(fitZoom, 0.25), 2.5);
        setZoom(clampedZoom);
        setPan({
          x: Math.round((cw - img.width * clampedZoom) / 2),
          y: Math.round((ch - img.height * clampedZoom) / 2),
        });
      }
    };
  }, [pdfImageUrl, canvasRef]);

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

    // 2b. Draw Crisp Native CAD Vector Lines Overlay (infinitely sharp at any zoom level)
    if (vectorLines && vectorLines.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = Math.max(0.75, 1.2 / zoom);
      ctx.beginPath();
      for (const line of vectorLines) {
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw ONLY Recognized Edge Lines (NO solid beam block covering the PDF plan!)
    for (const beam of beams) {
      const isSelected = effectiveSelectedIds.includes(beam.id);
      const bDx = beam.end.x - beam.start.x;
      const bDy = beam.end.y - beam.start.y;
      const bLen = Math.hypot(bDx, bDy) || 1;
      const ux = bDx / bLen;
      const uy = bDy / bLen;
      const nx = -uy;
      const ny = ux;

      if (beam.attachMode === 'single_edge') {
        ctx.strokeStyle = isSelected
          ? '#2563EB'
          : beam.edgeRole === 'outer'
          ? '#0284C7'
          : '#4F46E5';
        ctx.lineWidth = (isSelected ? 2.8 : 1.5) / zoom;
        ctx.beginPath();
        ctx.moveTo(beam.start.x, beam.start.y);
        ctx.lineTo(beam.end.x, beam.end.y);
        ctx.stroke();
      } else {
        const halfW = (beam.widthCm * pixelsPerCm) / 2;
        ctx.strokeStyle = isSelected ? '#2563EB' : '#475569';
        ctx.lineWidth = (isSelected ? 2.5 : 1.3) / zoom;

        if (beam.leftSide.enabled !== false) {
          ctx.beginPath();
          ctx.moveTo(beam.start.x + nx * halfW, beam.start.y + ny * halfW);
          ctx.lineTo(beam.end.x + nx * halfW, beam.end.y + ny * halfW);
          ctx.stroke();
        }
        if (beam.rightSide.enabled !== false) {
          ctx.beginPath();
          ctx.moveTo(beam.start.x - nx * halfW, beam.start.y - ny * halfW);
          ctx.lineTo(beam.end.x - nx * halfW, beam.end.y - ny * halfW);
          ctx.stroke();
        }
      }

      // Small unobtrusive label pill when selected or zoomed in
      const midX = (beam.start.x + beam.end.x) / 2;
      const midY = (beam.start.y + beam.end.y) / 2;
      if (isSelected || bLen * zoom > 65) {
        ctx.fillStyle = isSelected ? '#1D4ED8' : '#0F172A';
        ctx.font = `600 ${Math.max(9, 10 / zoom)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(beam.name, midX, midY);
      }
    }

    // 4. Draw Formwork Panels Attached Directly to Edge Lines (Fixed 5cm Thickness)
    for (const panel of panels) {
      const parentBeam = beams.find((b) => b.id === panel.beamId);
      if (!parentBeam) continue;

      const [p1, p2, p3, p4] = getPlacedPanelPolygon(panel, parentBeam, pixelsPerCm);
      const panelLenPx = panel.lengthCm * pixelsPerCm;
      const isParentSelected = effectiveSelectedIds.includes(parentBeam.id);
      const isPanelClicked = panel.id === selectedPanelId;

      const theme = panel.skuTheme;
      ctx.fillStyle = theme ? theme.fill : '#CBD5E1';
      ctx.strokeStyle = isPanelClicked
        ? '#1D4ED8'
        : isParentSelected
        ? '#2563EB'
        : theme
        ? theme.stroke
        : '#475569';
      ctx.lineWidth = (isPanelClicked ? 2.4 : isParentSelected ? 1.8 : 1.2) / zoom;

      if (panel.type === 'free') {
        ctx.setLineDash([3 / zoom, 2 / zoom]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.globalAlpha = isParentSelected ? 0.96 : 0.88;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.stroke();
      ctx.setLineDash([]);

      // Label on Panel
      if (panelLenPx * zoom > 22) {
        const pMidX = (p1.x + p2.x + p3.x + p4.x) / 4;
        const pMidY = (p1.y + p2.y + p3.y + p4.y) / 4;
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

    // 4b. Draw Interactive Drag Handles: 4 Corner Handles for Box Group, or 2 Endpoints for Single Line
    const selectedBeam = beams.find((b) => b.id === primarySelectedId);
    if (selectedBeam && effectiveSelectedIds.length <= 1) {
      if (selectedBeam.boxGroupId) {
        const boxEdges = beams.filter((b) => b.boxGroupId === selectedBeam.boxGroupId);
        if (boxEdges.length > 0) {
          const bMinX = Math.min(...boxEdges.flatMap((b) => [b.start.x, b.end.x]));
          const bMaxX = Math.max(...boxEdges.flatMap((b) => [b.start.x, b.end.x]));
          const bMinY = Math.min(...boxEdges.flatMap((b) => [b.start.y, b.end.y]));
          const bMaxY = Math.max(...boxEdges.flatMap((b) => [b.start.y, b.end.y]));

          // Dashed box group boundary
          ctx.strokeStyle = '#4F46E5';
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([6 / zoom, 3 / zoom]);
          ctx.strokeRect(bMinX, bMinY, bMaxX - bMinX, bMaxY - bMinY);
          ctx.setLineDash([]);

          // 4 Square Corner Handles (จับขอบ 4 มุม)
          const hSize = 10 / zoom;
          const corners = [
            { x: bMinX, y: bMinY },
            { x: bMaxX, y: bMinY },
            { x: bMaxX, y: bMaxY },
            { x: bMinX, y: bMaxY },
          ];

          for (const c of corners) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#4F46E5';
            ctx.lineWidth = 2.4 / zoom;
            ctx.fillRect(c.x - hSize / 2, c.y - hSize / 2, hSize, hSize);
            ctx.strokeRect(c.x - hSize / 2, c.y - hSize / 2, hSize, hSize);
          }

          // Badge above rectangle
          const wCm = Math.round((bMaxX - bMinX) / pixelsPerCm);
          const hCm = Math.round((bMaxY - bMinY) / pixelsPerCm);
          ctx.fillStyle = '#312E81';
          ctx.font = `700 ${Math.max(10, 11 / zoom)}px "Plus Jakarta Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(
            `สี่เหลี่ยมวงใน: ${wCm} × ${hCm} ซม. (จับขอบ 4 มุม)`,
            (bMinX + bMaxX) / 2,
            bMinY - 7 / zoom
          );
        }
      } else {
        const handleRadius = 5.5 / zoom;
        for (const pt of [selectedBeam.start, selectedBeam.end]) {
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 2.2 / zoom;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 5. Draw Temporary Drawing Line or Box Preview + Column Corner Snap Indicator
    const isDrawingTool = activeTool !== 'select';
    if (isDrawingTool && snapPoints.length > 0) {
      // Subtle guide dots at column corners when in manual drawing mode
      ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      const dotR = 2.2 / zoom;
      for (const sp of snapPoints) {
        if (sp.x >= startX && sp.x <= endX && sp.y >= startY && sp.y <= endY) {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (isDrawingTool && drawStart && currentMousePos) {
      const isBoxTool = activeTool === 'draw_inner_box' || activeTool === 'draw_outer_box';
      const isOuter = activeTool === 'draw_outer_line' || activeTool === 'draw_outer_box';

      ctx.strokeStyle = isOuter ? '#0284C7' : '#4F46E5';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]);

      if (isBoxTool) {
        const rx = Math.min(drawStart.x, currentMousePos.x);
        const ry = Math.min(drawStart.y, currentMousePos.y);
        const rw = Math.abs(currentMousePos.x - drawStart.x);
        const rh = Math.abs(currentMousePos.y - drawStart.y);
        ctx.strokeRect(rx, ry, rw, rh);
      } else {
        ctx.beginPath();
        ctx.moveTo(drawStart.x, drawStart.y);
        ctx.lineTo(currentMousePos.x, currentMousePos.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Point circle
      ctx.fillStyle = isOuter ? '#0284C7' : '#4F46E5';
      ctx.beginPath();
      ctx.arc(drawStart.x, drawStart.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5b. Draw Active Magnetic Column Corner Snap Box (□ Snap มุมเสา)
    if (
      activeSnap &&
      (isDrawingTool ||
        dragState?.mode === 'move_start' ||
        dragState?.mode === 'move_end')
    ) {
      const boxHalf = 6.5 / zoom;
      ctx.strokeStyle = '#10B981';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
      ctx.lineWidth = 2.2 / zoom;
      ctx.fillRect(
        activeSnap.x - boxHalf,
        activeSnap.y - boxHalf,
        boxHalf * 2,
        boxHalf * 2
      );
      ctx.strokeRect(
        activeSnap.x - boxHalf,
        activeSnap.y - boxHalf,
        boxHalf * 2,
        boxHalf * 2
      );

      // Snap label badge
      ctx.fillStyle = '#047857';
      ctx.font = `700 ${Math.max(9, 10 / zoom)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        `Snap: ${activeSnap.label}`,
        activeSnap.x + 8 / zoom,
        activeSnap.y - 6 / zoom
      );
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
    snapPoints,
    activeSnap,
    dragState,
    pdfImage,
    vectorLines,
    pan,
    zoom,
    selectedBeamId,
    selectedPanelId,
    activeTool,
    drawStart,
    currentMousePos,
    scaleMode,
    calibP1,
    pixelsPerCm,
  ]);

  // Mouse Handlers for Pan, Draw, Select, Drag-Move, and Scale Calibration
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rawWorld = screenToWorld(e.clientX, e.clientY);
    const snapTolPx = 16 / zoom;
    const snapped =
      activeTool !== 'select' && snapPoints.length > 0
        ? findNearestSnapPoint(rawWorld, snapPoints, snapTolPx)
        : null;
    const world: Point = snapped ? { x: snapped.x, y: snapped.y } : rawWorld;

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

    // Draw Line or Box Tool (Inner / Outer Perimeter) with Column Corner Snapping
    if (activeTool !== 'select') {
      if (!drawStart) {
        setDrawStart(world);
      } else {
        if (Math.hypot(world.x - drawStart.x, world.y - drawStart.y) > 15) {
          onAddBeam(drawStart, world, activeTool);
        }
        setDrawStart(null);
        setActiveSnap(null);
      }
      return;
    }

    // Select & Drag Mode ('select')
    if (activeTool === 'select') {
      const isShift = e.shiftKey;
      const currentSelected = beams.find((b) => b.id === primarySelectedId);

      // 1. Check 4 corner handles of currently selected box group first (only in single selection)
      if (effectiveSelectedIds.length <= 1 && currentSelected?.boxGroupId) {
        const boxEdges = beams.filter((b) => b.boxGroupId === currentSelected.boxGroupId);
        if (boxEdges.length > 0) {
          const bMinX = Math.min(...boxEdges.flatMap((b) => [b.start.x, b.end.x]));
          const bMaxX = Math.max(...boxEdges.flatMap((b) => [b.start.x, b.end.x]));
          const bMinY = Math.min(...boxEdges.flatMap((b) => [b.start.y, b.end.y]));
          const bMaxY = Math.max(...boxEdges.flatMap((b) => [b.start.y, b.end.y]));
          const cornerTol = 14 / zoom;

          // NW corner -> anchor SE
          if (Math.hypot(world.x - bMinX, world.y - bMinY) <= cornerTol) {
            setDragState({
              beamId: currentSelected.id,
              boxGroupId: currentSelected.boxGroupId,
              mode: 'resize_box_corner',
              cornerKey: 'nw',
              anchorPt: { x: bMaxX, y: bMaxY },
              startMouse: world,
              origStart: { x: bMinX, y: bMinY },
              origEnd: { x: bMaxX, y: bMaxY },
              hasMoved: false,
            });
            return;
          }
          // NE corner -> anchor SW
          if (Math.hypot(world.x - bMaxX, world.y - bMinY) <= cornerTol) {
            setDragState({
              beamId: currentSelected.id,
              boxGroupId: currentSelected.boxGroupId,
              mode: 'resize_box_corner',
              cornerKey: 'ne',
              anchorPt: { x: bMinX, y: bMaxY },
              startMouse: world,
              origStart: { x: bMinX, y: bMinY },
              origEnd: { x: bMaxX, y: bMaxY },
              hasMoved: false,
            });
            return;
          }
          // SE corner -> anchor NW
          if (Math.hypot(world.x - bMaxX, world.y - bMaxY) <= cornerTol) {
            setDragState({
              beamId: currentSelected.id,
              boxGroupId: currentSelected.boxGroupId,
              mode: 'resize_box_corner',
              cornerKey: 'se',
              anchorPt: { x: bMinX, y: bMinY },
              startMouse: world,
              origStart: { x: bMinX, y: bMinY },
              origEnd: { x: bMaxX, y: bMaxY },
              hasMoved: false,
            });
            return;
          }
          // SW corner -> anchor NE
          if (Math.hypot(world.x - bMinX, world.y - bMaxY) <= cornerTol) {
            setDragState({
              beamId: currentSelected.id,
              boxGroupId: currentSelected.boxGroupId,
              mode: 'resize_box_corner',
              cornerKey: 'sw',
              anchorPt: { x: bMaxX, y: bMinY },
              startMouse: world,
              origStart: { x: bMinX, y: bMinY },
              origEnd: { x: bMaxX, y: bMaxY },
              hasMoved: false,
            });
            return;
          }
        }
      }

      // 1b. Check endpoint handles of currently selected single beam (only in single selection)
      if (effectiveSelectedIds.length <= 1 && currentSelected && !currentSelected.boxGroupId) {
        const handleTol = 11 / zoom;
        if (Math.hypot(world.x - currentSelected.start.x, world.y - currentSelected.start.y) <= handleTol) {
          setDragState({
            beamId: currentSelected.id,
            mode: 'move_start',
            startMouse: world,
            origStart: { ...currentSelected.start },
            origEnd: { ...currentSelected.end },
            hasMoved: false,
          });
          return;
        }
        if (Math.hypot(world.x - currentSelected.end.x, world.y - currentSelected.end.y) <= handleTol) {
          setDragState({
            beamId: currentSelected.id,
            mode: 'move_end',
            startMouse: world,
            origStart: { ...currentSelected.start },
            origEnd: { ...currentSelected.end },
            hasMoved: false,
          });
          return;
        }
      }

      // 2. Check if user clicked directly on a Formwork Panel polygon ("กดไม้แบบบนจอ")
      const panelHitTol = Math.max(4 / zoom, 2);
      for (let i = panels.length - 1; i >= 0; i--) {
        const p = panels[i];
        const parentBeam = beams.find((b) => b.id === p.beamId);
        if (!parentBeam) continue;
        const poly = getPlacedPanelPolygon(p, parentBeam, pixelsPerCm);
        if (isPointInOrNearPolygon(world, poly, panelHitTol)) {
          if (isShift) {
            onSelectBeam(parentBeam.id, true);
            return;
          }
          if (effectiveSelectedIds.includes(parentBeam.id) && effectiveSelectedIds.length > 1) {
            const movingBeams = beams.filter((b) => effectiveSelectedIds.includes(b.id));
            setDragState({
              beamId: parentBeam.id,
              mode: 'move_multi',
              multiBeamIds: effectiveSelectedIds,
              origEdges: movingBeams.map((b) => ({ id: b.id, start: { ...b.start }, end: { ...b.end } })),
              startMouse: rawWorld,
              origStart: { ...parentBeam.start },
              origEnd: { ...parentBeam.end },
              hasMoved: false,
            });
            return;
          }
          setSelectedPanelId(p.id);
          onSelectBeam(parentBeam.id, false);
          const boxEdges = parentBeam.boxGroupId
            ? beams.filter((b) => b.boxGroupId === parentBeam.boxGroupId)
            : [parentBeam];
          setDragState({
            beamId: parentBeam.id,
            boxGroupId: parentBeam.boxGroupId,
            mode: parentBeam.boxGroupId ? 'move_box' : 'move_beam',
            origEdges: boxEdges.map((b) => ({ id: b.id, start: { ...b.start }, end: { ...b.end } })),
            startMouse: rawWorld,
            origStart: { ...parentBeam.start },
            origEnd: { ...parentBeam.end },
            hasMoved: false,
          });
          return;
        }
      }

      // 3. Check if user clicked on a Beam / Edge Line ("หรือกดเลือกคาน")
      let foundBeam: BeamElement | null = null;
      let bestDist = Infinity;

      for (const b of beams) {
        const dist = pointToSegmentDist(world, b.start, b.end);
        const threshold = Math.max(14 / zoom, ((b.widthCm + 16) * pixelsPerCm) / 2);
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist;
          foundBeam = b;
        }
      }

      if (foundBeam) {
        if (isShift) {
          onSelectBeam(foundBeam.id, true);
          return;
        }
        if (effectiveSelectedIds.includes(foundBeam.id) && effectiveSelectedIds.length > 1) {
          const movingBeams = beams.filter((b) => effectiveSelectedIds.includes(b.id));
          setDragState({
            beamId: foundBeam.id,
            mode: 'move_multi',
            multiBeamIds: effectiveSelectedIds,
            origEdges: movingBeams.map((b) => ({ id: b.id, start: { ...b.start }, end: { ...b.end } })),
            startMouse: rawWorld,
            origStart: { ...foundBeam.start },
            origEnd: { ...foundBeam.end },
            hasMoved: false,
          });
          return;
        }
        setSelectedPanelId(null);
        onSelectBeam(foundBeam.id, false);
        const boxEdges = foundBeam.boxGroupId
          ? beams.filter((b) => b.boxGroupId === foundBeam.boxGroupId)
          : [foundBeam];
        setDragState({
          beamId: foundBeam.id,
          boxGroupId: foundBeam.boxGroupId,
          mode: foundBeam.boxGroupId ? 'move_box' : 'move_beam',
          origEdges: boxEdges.map((b) => ({ id: b.id, start: { ...b.start }, end: { ...b.end } })),
          startMouse: rawWorld,
          origStart: { ...foundBeam.start },
          origEnd: { ...foundBeam.end },
          hasMoved: false,
        });
        return;
      }

      // Clicked empty space -> clear selection
      if (!isShift) {
        setSelectedPanelId(null);
        onSelectBeam(null, false);
      }
    }

    // Default: Start Panning
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rawWorld = screenToWorld(e.clientX, e.clientY);
    const snapTolPx = 16 / zoom;
    const shouldSnap =
      activeTool !== 'select' ||
      dragState?.mode === 'move_start' ||
      dragState?.mode === 'move_end' ||
      dragState?.mode === 'resize_box_corner';
    const nearestSnap =
      shouldSnap && snapPoints.length > 0
        ? findNearestSnapPoint(rawWorld, snapPoints, snapTolPx)
        : null;

    setActiveSnap(nearestSnap);
    const world: Point = nearestSnap ? { x: nearestSnap.x, y: nearestSnap.y } : rawWorld;
    setCurrentMousePos(world);

    // Dragging a 4-corner box group or individual formwork strip
    if (dragState) {
      const dx = rawWorld.x - dragState.startMouse.x;
      const dy = rawWorld.y - dragState.startMouse.y;
      if (!dragState.hasMoved && Math.hypot(dx, dy) < 2 / zoom) {
        return;
      }

      if (dragState.mode === 'resize_box_corner' && onResizeBoxGroup && dragState.anchorPt && dragState.boxGroupId) {
        const cornerPt = nearestSnap ? { x: nearestSnap.x, y: nearestSnap.y } : rawWorld;
        onResizeBoxGroup(dragState.boxGroupId, dragState.anchorPt, cornerPt, false);
      } else if (
        (dragState.mode === 'move_multi' || dragState.mode === 'move_box' || dragState.mode === 'move_beam') &&
        onBatchMoveBeams &&
        dragState.origEdges
      ) {
        onBatchMoveBeams(dragState.origEdges, dx, dy, false);
      } else if (dragState.mode === 'move_start' && onMoveBeam) {
        let nextStart = nearestSnap
          ? { x: nearestSnap.x, y: nearestSnap.y }
          : { x: dragState.origStart.x + dx, y: dragState.origStart.y + dy };
        if (!nearestSnap) {
          if (Math.abs(nextStart.y - dragState.origEnd.y) <= 8 / zoom) {
            nextStart = { x: nextStart.x, y: dragState.origEnd.y };
          } else if (Math.abs(nextStart.x - dragState.origEnd.x) <= 8 / zoom) {
            nextStart = { x: dragState.origEnd.x, y: nextStart.y };
          }
        }
        onMoveBeam(dragState.beamId, nextStart, dragState.origEnd, false);
      } else if (dragState.mode === 'move_end' && onMoveBeam) {
        let nextEnd = nearestSnap
          ? { x: nearestSnap.x, y: nearestSnap.y }
          : { x: dragState.origEnd.x + dx, y: dragState.origEnd.y + dy };
        if (!nearestSnap) {
          if (Math.abs(nextEnd.y - dragState.origStart.y) <= 8 / zoom) {
            nextEnd = { x: nextEnd.x, y: dragState.origStart.y };
          } else if (Math.abs(nextEnd.x - dragState.origStart.x) <= 8 / zoom) {
            nextEnd = { x: dragState.origStart.x, y: nextEnd.y };
          }
        }
        onMoveBeam(dragState.beamId, dragState.origStart, nextEnd, false);
      }

      if (!dragState.hasMoved) {
        setDragState((prev) => (prev ? { ...prev, hasMoved: true } : null));
      }
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragState) {
      if (dragState.hasMoved) {
        const rawWorld = screenToWorld(e.clientX, e.clientY);
        if (dragState.mode === 'resize_box_corner' && onResizeBoxGroup && dragState.anchorPt && dragState.boxGroupId) {
          const cornerPt = activeSnap ? { x: activeSnap.x, y: activeSnap.y } : currentMousePos || { x: 0, y: 0 };
          onResizeBoxGroup(dragState.boxGroupId, dragState.anchorPt, cornerPt, true);
        } else if (
          (dragState.mode === 'move_multi' || dragState.mode === 'move_box' || dragState.mode === 'move_beam') &&
          onBatchMoveBeams &&
          dragState.origEdges
        ) {
          const dx = rawWorld.x - dragState.startMouse.x;
          const dy = rawWorld.y - dragState.startMouse.y;
          onBatchMoveBeams(dragState.origEdges, dx, dy, true);
        } else if (onMoveBeam) {
          const targetBeam = beams.find((b) => b.id === dragState.beamId);
          if (targetBeam) {
            onMoveBeam(targetBeam.id, targetBeam.start, targetBeam.end, true);
          }
        }
      }
      setDragState(null);
    }
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.2), 5);

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

  const getToolBannerText = (): string | null => {
    switch (activeTool) {
      case 'draw_inner_line':
      case 'draw_beam':
        return drawStart
          ? 'คลิกจุดสิ้นสุดของเส้นขอบใน (ระบบจะเอาไม้แบบไปเกาะตามเส้นขอบในโดยไม่ชนกัน)'
          : 'วิธีที่ 1 (ลากเส้นวงใน): คลิกจุดเริ่มต้นบนเส้นขอบด้านในของคาน';
      case 'draw_inner_box':
        return drawStart
          ? 'คลิกมุมตรงข้ามของช่องพื้นด้านใน เพื่อสร้างไม้แบบเกาะครบ 4 ด้านรอบวงใน'
          : 'วิธีที่ 1 (ตีกรอบวงใน): คลิกมุมที่ 1 ของขอบด้านในช่องพื้น (เช่น S1-S4)';
      case 'draw_outer_line':
        return drawStart
          ? 'คลิกจุดสิ้นสุดของเส้นขอบนอก (ระบบจะเอาไม้แบบไปเกาะตามเส้นขอบนอก + อมมุมชน)'
          : 'วิธีที่ 2 (ลากเส้นวงนอก): คลิกจุดเริ่มต้นบนเส้นขอบด้านนอกของคาน';
      case 'draw_outer_box':
        return drawStart
          ? 'คลิกมุมตรงข้ามของขอบนอกคาน เพื่อสร้างไม้แบบเกาะครบ 4 ด้านรอบวงนอก'
          : 'วิธีที่ 2 (ตีกรอบวงนอก): คลิกมุมที่ 1 ของเส้นขอบด้านนอกคาน';
      default:
        return null;
    }
  };

  const bannerText = getToolBannerText();
  const selectedBeamObj = beams.find((b) => b.id === primarySelectedId) || null;

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
        className={`w-full h-full block ${
          dragState
            ? 'cursor-grabbing'
            : activeTool === 'select'
            ? 'cursor-default'
            : 'cursor-crosshair'
        }`}
      />

      {/* Floating Selection Quick-Action Bar */}
      {effectiveSelectedIds.length > 1 && activeTool === 'select' && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-xs px-3 py-2 rounded-xl border border-blue-300 shadow-md flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Move className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold text-blue-950">
              เลือก {effectiveSelectedIds.length} เส้นพร้อมกัน
            </span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              • ลากเส้นเพื่อขยับพร้อมกัน หรือกด Delete เพื่อลบทั้งชุด
            </span>
          </div>
          {onDeleteBeam && (
            <button
              onClick={() => {
                effectiveSelectedIds.forEach((id) => onDeleteBeam(id));
              }}
              title="ลบไม้แบบที่เลือกทั้งหมด (หรือกด Delete บนคีย์บอร์ด)"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ลบทั้งหมด ({effectiveSelectedIds.length})</span>
            </button>
          )}
        </div>
      )}

      {effectiveSelectedIds.length === 1 && selectedBeamObj && activeTool === 'select' && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-xs px-3 py-2 rounded-xl border border-blue-200 shadow-md flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Move className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold text-slate-800">{selectedBeamObj.name}</span>
            <span className="text-slate-500">
              ({getBeamLengthCm(selectedBeamObj, pixelsPerCm)} ซม.)
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              • คลิกค้างเพื่อลากขยับ หรือดึงจุดปลาย
            </span>
          </div>
          {selectedBeamObj.boxGroupId && onUngroupBox && (
            <button
              onClick={() => onUngroupBox(selectedBeamObj.boxGroupId!)}
              title="แยกกลุ่มไม้แบบเป็นเส้นเดี่ยว (Ungroup) เพื่อให้ตั้งไม้แบบเป็นเส้นๆ เหมือนเดิมได้"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>แยกกลุ่ม (Ungroup)</span>
            </button>
          )}
          {onDeleteBeam && (
            <button
              onClick={() => onDeleteBeam(selectedBeamObj.id)}
              title="ลบคาน/ไม้แบบนี้ (หรือกดปุ่ม Delete บนคีย์บอร์ด)"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ลบ (Delete)</span>
            </button>
          )}
        </div>
      )}

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

      {bannerText && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-md flex items-center gap-2">
          <span>{bannerText}</span>
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
              เริ่มต้นคำนวณไม้แบบ (เกาะตามเส้นแปลน)
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              กดปุ่ม <span className="font-semibold text-blue-600">"นำเข้า PDF แปลนคาน"</span> ด้านบน ระบบจะอ่านสเกล รับรู้เส้นขอบคาน และนำไม้แบบไปเกาะตามเส้นให้อัตโนมัติ หรือเลือกวาดจาก <span className="font-semibold text-indigo-600">วงรอบใน</span> / <span className="font-semibold text-sky-600">วงรอบนอก</span> ได้ทันที
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

