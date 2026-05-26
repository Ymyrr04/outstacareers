import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface RenderedPage {
  index: number; // 0-based
  dataUrl: string;
  width: number; // CSS width used
  height: number;
}

/**
 * Loads a PDF and renders each page to a data URL at the given target width.
 * Returns rendered pages in order.
 */
export async function renderPdfPages(pdfUrl: string, targetWidth = 900): Promise<RenderedPage[]> {
  // Download as blob first to bypass CORS (signed Supabase URLs work fine for fetch)
  const resp = await fetch(pdfUrl);
  const buf = await resp.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: RenderedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = targetWidth / v1.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ index: i - 1, dataUrl: canvas.toDataURL("image/png"), width: vp.width, height: vp.height });
  }
  return out;
}
