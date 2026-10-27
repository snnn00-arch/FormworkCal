import { RawTextItem, RawVectorLine } from '../engine/scaleCalibrator';

export interface LoadedPdfPlan {
  imageDataUrl: string;
  width: number;
  height: number;
  vectorLines: RawVectorLine[];
  texts: RawTextItem[];
}

export async function loadPdfFirstPage(file: File): Promise<LoadedPdfPlan> {
  const pdfjsLib = await import('pdfjs-dist');
  // Configure worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });

  const offscreen = document.createElement('canvas');
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;
  const ctx = offscreen.getContext('2d');
  if (ctx) {
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  const textContent = await page.getTextContent();
  const texts: RawTextItem[] = [];
  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const tx = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      texts.push({ text: item.str.trim(), x: tx[0], y: tx[1] });
    }
  }

  return {
    imageDataUrl: offscreen.toDataURL('image/png'),
    width: viewport.width,
    height: viewport.height,
    vectorLines: [],
    texts,
  };
}
