export const FORMWORK_THICKNESS_CM = 5 as const;
export const STANDARD_LENGTHS = [120, 100, 50] as const;
export const FORMWORK_HEIGHTS = [40, 50, 60, 70] as const;

export type StandardPanelLength = (typeof STANDARD_LENGTHS)[number];
export type FormworkHeight = (typeof FORMWORK_HEIGHTS)[number];

export interface Point {
  x: number;
  y: number;
}

export interface SkuColorTheme {
  fill: string;
  stroke: string;
  badgeBg: string;
  badgeText: string;
  nameTh: string;
}

export const SKU_COLOR_MAP: Record<string, SkuColorTheme> = {
  // 120 cm Series (Emerald Green Family)
  '120x40': {
    fill: '#6EE7B7',
    stroke: '#059669',
    badgeBg: '#D1FAE5',
    badgeText: '#065F46',
    nameTh: '120×40 ซม. (เขียวมิ้นต์)',
  },
  '120x50': {
    fill: '#34D399',
    stroke: '#047857',
    badgeBg: '#A7F3D0',
    badgeText: '#064E3B',
    nameTh: '120×50 ซม. (เขียวสว่าง)',
  },
  '120x60': {
    fill: '#10B981',
    stroke: '#065F46',
    badgeBg: '#6EE7B7',
    badgeText: '#022C22',
    nameTh: '120×60 ซม. (เขียวมรกต)',
  },
  '120x70': {
    fill: '#059669',
    stroke: '#022C22',
    badgeBg: '#34D399',
    badgeText: '#022C22',
    nameTh: '120×70 ซม. (เขียวเข้ม)',
  },

  // 100 cm Series (Blue Family)
  '100x40': {
    fill: '#7DD3FC',
    stroke: '#0284C7',
    badgeBg: '#E0F2FE',
    badgeText: '#075985',
    nameTh: '100×40 ซม. (ฟ้าสว่าง)',
  },
  '100x50': {
    fill: '#38BDF8',
    stroke: '#0369A1',
    badgeBg: '#BAE6FD',
    badgeText: '#0C4A6E',
    nameTh: '100×50 ซม. (ฟ้าน้ำทะเล)',
  },
  '100x60': {
    fill: '#3B82F6',
    stroke: '#1D4ED8',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    nameTh: '100×60 ซม. (น้ำเงินรอยัล)',
  },
  '100x70': {
    fill: '#2563EB',
    stroke: '#1E3A8A',
    badgeBg: '#BFDBFE',
    badgeText: '#172554',
    nameTh: '100×70 ซม. (น้ำเงินเข้ม)',
  },

  // 50 cm Series (Amber / Orange Family)
  '50x40': {
    fill: '#FDE68A',
    stroke: '#D97706',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E',
    nameTh: '50×40 ซม. (เหลืองทองอ่อน)',
  },
  '50x50': {
    fill: '#FBBF24',
    stroke: '#B45309',
    badgeBg: '#FDE68A',
    badgeText: '#78350F',
    nameTh: '50×50 ซม. (เหลืองอำพัน)',
  },
  '50x60': {
    fill: '#F59E0B',
    stroke: '#92400E',
    badgeBg: '#FCD34D',
    badgeText: '#451A03',
    nameTh: '50×60 ซม. (ส้มอำพัน)',
  },
  '50x70': {
    fill: '#D97706',
    stroke: '#78350F',
    badgeBg: '#FBBF24',
    badgeText: '#451A03',
    nameTh: '50×70 ซม. (ส้มอิฐเข้ม)',
  },

  // Free-length Filler Series (Rose / Red Family)
  'free-40': {
    fill: '#FDA4AF',
    stroke: '#E11D48',
    badgeBg: '#FFE4E6',
    badgeText: '#9F1239',
    nameTh: 'ฟรี×40 ซม. (ชมพูอ่อน)',
  },
  'free-50': {
    fill: '#FB7185',
    stroke: '#BE123C',
    badgeBg: '#FECDD3',
    badgeText: '#881337',
    nameTh: 'ฟรี×50 ซม. (กุหลาบ)',
  },
  'free-60': {
    fill: '#F43F5E',
    stroke: '#9F1239',
    badgeBg: '#FDA4AF',
    badgeText: '#4C0519',
    nameTh: 'ฟรี×60 ซม. (แดงกุหลาบ)',
  },
  'free-70': {
    fill: '#E11D48',
    stroke: '#881337',
    badgeBg: '#FB7185',
    badgeText: '#4C0519',
    nameTh: 'ฟรี×70 ซม. (ทับทิมเข้ม)',
  },
};

export function getSkuTheme(
  lengthCm: number,
  heightCm: FormworkHeight,
  isFree = false
): SkuColorTheme {
  const key = isFree ? `free-${heightCm}` : `${lengthCm}x${heightCm}`;
  return (
    SKU_COLOR_MAP[key] || {
      fill: '#CBD5E1',
      stroke: '#475569',
      badgeBg: '#F1F5F9',
      badgeText: '#1E293B',
      nameTh: `${lengthCm}×${heightCm} ซม.`,
    }
  );
}

export const DEFAULT_BEAM_WIDTH_CM = 20 as const;

export type DrawingToolMode =
  | 'select'
  | 'draw_inner_line'
  | 'draw_outer_line'
  | 'draw_inner_box'
  | 'draw_outer_box';

export interface PlacedPanel {
  id: string;
  beamId: string;
  beamName: string;
  side: 'left' | 'right';
  type: 'standard' | 'free';
  lengthCm: number;
  heightCm: FormworkHeight;
  thicknessCm: 5;
  offsetStartCm: number;
  skuTheme?: SkuColorTheme;
}

export interface BeamSideConfig {
  side: 'left' | 'right';
  enabled?: boolean; // defaults to true; when false, this side generates 0 panels
  heightCm: FormworkHeight;
  startExtensionCm: number; // +5 cm when wrapping outer corner, or 0
  endExtensionCm: number;   // +5 cm when wrapping outer corner, or 0
  customPanels?: PlacedPanel[];
}

export interface BeamElement {
  id: string;
  name: string;
  start: Point;
  end: Point;
  widthCm: number; // defaults to 20 cm
  defaultHeightCm: FormworkHeight;
  thicknessCm: 5;
  /**
   * 'single_edge': start->end is the exact beam edge line on the plan (1 line = 1 formwork strip attached directly to the line).
   * 'dual_beam': start->end is the beam centerline with left/right edges offset by widthCm / 2.
   */
  attachMode?: 'single_edge' | 'dual_beam';
  edgeRole?: 'inner' | 'outer';
  leftSide: BeamSideConfig;
  rightSide: BeamSideConfig;
}

export interface FreeLengthItemSummary {
  id: string;
  beamName: string;
  side: 'left' | 'right';
  lengthCm: number;
  heightCm: FormworkHeight;
  thicknessCm: 5;
  skuTheme: SkuColorTheme;
}

export interface RentalSummaryReport {
  matrix: Record<StandardPanelLength, Record<FormworkHeight, number>>;
  totalsByLength: Record<StandardPanelLength, number>;
  totalsByHeight: Record<FormworkHeight, number>;
  totalStandardPanels: number;
  totalStandardAreaSqm: number;
  freeItems: FreeLengthItemSummary[];
  freeTotalsByHeightCm: Record<FormworkHeight, { count: number; totalLengthCm: number }>;
  totalFreeLengthCm: number;
}
