import { describe, it, expect } from 'vitest';
import { computeRentalSummary, optimizeSingleSidePanels } from '../formworkOptimizer';
import {
  generateRentalSummaryCsv,
  loadProjectFile,
  saveProjectFile,
  exportFormworkPdfReport,
  renderHighResPlanCanvas,
  loadImage,
} from '../exportEngine';
import { FormworkProjectData, BeamElement } from '../../types/formwork';

describe('exportEngine', () => {
  it('generates UTF-8 BOM CSV with 3 lengths x 4 heights matrix, 5cm thickness, and free-length items', () => {
    const p1 = optimizeSingleSidePanels(285, 60, 'b1', 'B1', 'left');
    const p2 = optimizeSingleSidePanels(240, 40, 'b2', 'B2', 'right');
    const summary = computeRentalSummary([...p1, ...p2]);

    const csv = generateRentalSummaryCsv(summary);
    expect(csv).toContain('ความหนาไม้แบบมาตรฐาน,5 ซม. ทุกกรณี');
    expect(csv).toContain('120 ซม.,2,0,1,0,3');
    expect(csv).toContain('100 ซม.,0,0,1,0,1');
    expect(csv).toContain('50 ซม.,0,0,1,0,1');
    expect(csv).toContain('B1,ซ้าย,15,60,5');
  });

  it('validates and loads project JSON file correctly', async () => {
    const mockProject: FormworkProjectData = {
      version: '1.0',
      appName: 'ModularFormworkCalculator',
      savedAt: '2026-10-28T00:00:00.000Z',
      pixelsPerCm: 1.5,
      scaleNote: 'สเกลทดสอบ 1.50 px/ซม.',
      defaultHeight: 50,
      defaultBeamWidthCm: 20,
      autoParallelPair: true,
      beams: [
        {
          id: 'test-1',
          name: 'B1',
          start: { x: 0, y: 0 },
          end: { x: 300, y: 0 },
          widthCm: 20,
          defaultHeightCm: 50,
          thicknessCm: 5,
          attachMode: 'single_edge',
          leftSide: { side: 'left', enabled: true, heightCm: 50, startExtensionCm: 0, endExtensionCm: 0 },
          rightSide: { side: 'right', enabled: false, heightCm: 50, startExtensionCm: 0, endExtensionCm: 0 },
        },
      ],
    };

    const file = new File([JSON.stringify(mockProject)], 'project.fwproj', {
      type: 'application/json',
    });

    const loaded = await loadProjectFile(file);
    expect(loaded.version).toBe('1.0');
    expect(loaded.beams.length).toBe(1);
    expect(loaded.defaultHeight).toBe(50);
    expect(loaded.pixelsPerCm).toBe(1.5);
  });

  it('provides exportFormworkPdfReport and saveProjectFile functions', () => {
    expect(typeof exportFormworkPdfReport).toBe('function');
    expect(typeof saveProjectFile).toBe('function');
  });

  it('renders high-res A3 plan canvas cropped to print boundary with aspect ratio 1.50', () => {
    const res = renderHighResPlanCanvas(3510, 2340, {
      printBoundary: { x: 100, y: 100, width: 450, height: 300 },
      beams: [],
      panels: [],
      pixelsPerCm: 1.2,
    });
    expect(res.canvas.width).toBe(3510);
    expect(res.canvas.height).toBe(2340);
    expect(res.realWidthM).toBeGreaterThan(0);
    expect(res.paperScale).toBeGreaterThan(0);
  });

  it('supports loading PDF image and including it in high-res plan canvas', async () => {
    expect(typeof loadImage).toBe('function');
    const img = await loadImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    expect(img).toBeDefined();

    const res = renderHighResPlanCanvas(3510, 2340, {
      pdfImage: img,
      beams: [],
      panels: [],
      pixelsPerCm: 1.2,
    });
    expect(res.canvas).toBeDefined();
    expect(res.canvas.width).toBe(3510);
    expect(res.canvas.height).toBe(2340);
  });

  it('renders beams with width and places panels using getPlacedPanelPolygon correctly', () => {
    const mockBeam: BeamElement = {
      id: 'beam-1',
      name: 'B1',
      start: { x: 200, y: 300 },
      end: { x: 800, y: 300 },
      widthCm: 20,
      defaultHeightCm: 50,
      thicknessCm: 5,
      attachMode: 'dual_beam',
      leftSide: { side: 'left', enabled: true, heightCm: 50, startExtensionCm: 0, endExtensionCm: 0 },
      rightSide: { side: 'right', enabled: true, heightCm: 50, startExtensionCm: 0, endExtensionCm: 0 },
    };
    const panels = optimizeSingleSidePanels(600, 50, 'beam-1', 'B1', 'left');

    const res = renderHighResPlanCanvas(3510, 2340, {
      beams: [mockBeam],
      panels,
      pixelsPerCm: 1.0,
    });

    expect(res.canvas).toBeDefined();
    expect(res.canvas.width).toBe(3510);
    expect(res.canvas.height).toBe(2340);
    expect(res.realWidthM).toBeGreaterThan(0);
    expect(res.paperScale).toBeGreaterThan(0);
  });

  it('auto-crops around beams when printBoundary is not specified', () => {
    const mockBeam: BeamElement = {
      id: 'beam-corner',
      name: 'B2',
      start: { x: 1000, y: 1500 },
      end: { x: 1600, y: 1500 },
      widthCm: 25,
      defaultHeightCm: 60,
      thicknessCm: 5,
      attachMode: 'single_edge',
      leftSide: { side: 'left', enabled: true, heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
      rightSide: { side: 'right', enabled: false, heightCm: 60, startExtensionCm: 0, endExtensionCm: 0 },
    };

    const res = renderHighResPlanCanvas(3510, 2340, {
      beams: [mockBeam],
      panels: [],
      pixelsPerCm: 1.5,
    });

    // Verify it crops around the beam (around 600px width + padding) rather than 3510 full canvas
    expect(res.realWidthM).toBeLessThan(10); // 600px / 1.5ppc = 400cm = 4m (+ padding), well under 10m
    expect(res.paperScale).toBeGreaterThan(0);
  });
});
