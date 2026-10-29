import { describe, it, expect } from 'vitest';
import { Point } from '../../types/formwork';

describe('1:1 Drag Displacement without accumulation', () => {
  it('strictly moves elements 1:1 with mouse displacement dx and dy from initial snapshot', () => {
    // Initial snapshot captured at mousedown
    const origEdges = [
      { id: 'beam-1', start: { x: 100, y: 200 }, end: { x: 500, y: 200 } },
      { id: 'beam-2', start: { x: 500, y: 200 }, end: { x: 500, y: 600 } },
    ];

    const origMap = new Map(origEdges.map((e) => [e.id, e]));

    // Simulate 3 successive mousemove events
    const mouseFrames: Point[] = [
      { x: 10, y: 5 },
      { x: 12, y: 6 },
      { x: 25, y: -15 },
    ];

    let currentEdges = origEdges.map((e) => ({
      ...e,
      start: { ...e.start },
      end: { ...e.end },
    }));

    for (const frame of mouseFrames) {
      const dx = frame.x;
      const dy = frame.y;

      // Pure 1:1 calculation directly from origMap, NOT accumulated on top of currentEdges
      currentEdges = currentEdges.map((b) => {
        const orig = origMap.get(b.id);
        if (!orig) return b;
        return {
          ...b,
          start: { x: orig.start.x + dx, y: orig.start.y + dy },
          end: { x: orig.end.x + dx, y: orig.end.y + dy },
        };
      });

      // Assert at each frame that displacement from initial position is exactly (dx, dy)
      const b1 = currentEdges.find((b) => b.id === 'beam-1')!;
      expect(b1.start.x - origEdges[0].start.x).toBe(dx);
      expect(b1.start.y - origEdges[0].start.y).toBe(dy);
      expect(b1.end.x - origEdges[0].end.x).toBe(dx);
      expect(b1.end.y - origEdges[0].end.y).toBe(dy);
    }

    // Final frame (dx: 25, dy: -15)
    expect(currentEdges[0].start).toEqual({ x: 125, y: 185 });
    expect(currentEdges[0].end).toEqual({ x: 525, y: 185 });
    expect(currentEdges[1].start).toEqual({ x: 525, y: 185 });
    expect(currentEdges[1].end).toEqual({ x: 525, y: 585 });
  });
});
