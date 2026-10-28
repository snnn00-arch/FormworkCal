import { describe, it, expect } from 'vitest';
import { computeRentalSummary, optimizeSingleSidePanels } from '../formworkOptimizer';
import {
  generateRentalSummaryCsv,
  loadProjectFile,
  saveProjectFile,
  exportFormworkPdfReport,
} from '../exportEngine';
import { FormworkProjectData } from '../../types/formwork';

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
});
