import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker for Vite environment
try {
  // @ts-ignore - Vite specific import
  import('pdfjs-dist/build/pdf.worker?url').then(m => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = m.default;
  }).catch(err => {
    console.error("Failed to load local PDF worker, falling back to CDN:", err);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  });
} catch (e) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/**
 * Converts a PDF page to a base64 image string
 */
export async function renderPDFPageToImage(pdf: any, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 }); // Balanced scale for quality vs performance
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error("Could not create canvas context");
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;
  
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
}

/**
 * Extracts text AND potential images from a PDF file
 */
export async function parsePDFDetailed(file: File): Promise<{ text: string, images: string[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = "";
    const images: string[] = [];
    
    const pageIndices = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    
    // Process pages in small batches to avoid memory overload while maintaining speed
    const BATCH_SIZE = 2;
    for (let i = 0; i < pageIndices.length; i += BATCH_SIZE) {
        const batch = pageIndices.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (pageNum) => {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            const items = textContent.items as any[];
            let pageText = "";
            
            if (items.length > 0) {
                items.sort((a, b) => {
                    if (Math.abs(a.transform[5] - b.transform[5]) < 5) {
                        return a.transform[4] - b.transform[4];
                    }
                    return b.transform[5] - a.transform[5];
                });

                let lastY = -1;
                for (const item of items) {
                    if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                        pageText += "\n";
                    } else if (lastY !== -1) {
                        pageText += "  ";
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }
            }
            
            let pageImage: string | null = null;
            // Threshold updated to 50 chars for better fallback to vision on complex layouts
            if (items.length < 100 || pageText.length < 50) {
                // Adaptive scaling: higher for image-only pages
                const scale = pageText.length < 20 ? 1.8 : 1.2;
                const canvas = document.createElement('canvas');
                const viewport = page.getViewport({ scale });
                const context = canvas.getContext('2d');
                if (context) {
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await (page as any).render({ canvasContext: context, viewport } as any).promise;
                    pageImage = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                }
            }
            
            return { text: pageText, image: pageImage, pageNum };
        }));

        for (const res of results) {
            if (res.text) fullText += `--- PAGE ${res.pageNum} ---\n${res.text}\n\n`;
            if (res.image) images.push(res.image);
        }
    }
    
    return { text: fullText, images };
  } catch (err) {
    console.error("PDF parsing error:", err);
    throw new Error("Impossibile leggere il file PDF.");
  }
}

/**
 * Compatibility wrapper for PDF text extraction
 */
export async function parsePDF(file: File): Promise<string> {
  const result = await parsePDFDetailed(file);
  return result.text;
}

/**
 * Extracts text from an Excel file (.xlsx, .xls, .csv)
 */
export async function parseExcel(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        let text = '';
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          text += `--- SHEET: ${sheetName} ---\n`;
          text += XLSX.utils.sheet_to_txt(worksheet) + '\n\n';
        });
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

/**
 * Extracts text from a Word file (.docx)
 */
export async function parseWord(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    console.error("Word parsing error:", err);
    throw new Error("Impossibile leggere il file Word.");
  }
}
