import { describe, it, expect } from 'vitest';
import { computeRentalSummary, optimizeSingleSidePanels } from '../formworkOptimizer';
import { generateRentalSummaryCsv } from '../exportEngine';

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
});
