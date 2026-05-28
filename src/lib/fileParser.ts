// @e965/xlsx = fork patchato di SheetJS community (xlsx@0.18.5 ha
// CVE-2023-30533 Prototype Pollution + CVE-2024-22363 ReDoS non patched).
// API identica, drop-in. Swap 28 mag 2026 (audit security).
import * as XLSX from '@e965/xlsx';
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
            
            // Always render every page as image so AI vision can read graphical/design menus
            // Use lower scale for pages with good text to save bandwidth
            let pageImage: string | null = null;
            const hasGoodText = pageText.length >= 200 && items.length >= 50;
            const scale = hasGoodText ? 1.0 : 1.5;
            const quality = hasGoodText ? 0.6 : 0.75;
            try {
                const canvas = document.createElement('canvas');
                const viewport = page.getViewport({ scale });
                const context = canvas.getContext('2d');
                if (context) {
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await (page as any).render({ canvasContext: context, viewport } as any).promise;
                    pageImage = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                }
            } catch (renderErr) {
                console.warn(`Page ${pageNum} image render failed:`, renderErr);
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

/**
 * Extracts text from a PowerPoint .pptx file.
 *
 * PPTX = ZIP che contiene `ppt/slides/slideN.xml` per ogni slide. Ogni slide ha
 * elementi `<a:t>...testo...</a:t>` con il testo dei placeholder/text frames.
 * Uso JSZip + DOMParser (browser-native) per estrarre tutto il testo nello
 * stesso formato delle altre funzioni parse* (string lineare).
 *
 * NOTA: il formato .ppt legacy (PowerPoint 97-2003, binario) NON è supportato —
 * solo .pptx (Office Open XML). Se l'utente carica un .ppt, parseFile fallirà
 * con errore esplicito.
 */
export async function parsePPTX(file: File): Promise<string> {
  try {
    const { default: JSZip } = await import('jszip');
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slidePaths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
        const nb = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
        return na - nb;
      });

    if (slidePaths.length === 0) {
      throw new Error("Nessuna slide trovata nel file .pptx");
    }

    const parser = new DOMParser();
    let text = '';
    for (const path of slidePaths) {
      const slideNum = parseInt(path.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      const xmlStr = await zip.files[path].async('string');
      const xml = parser.parseFromString(xmlStr, 'text/xml');
      // <a:t> = text run dentro le shape PPT
      const runs = xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't');
      const slideText: string[] = [];
      for (let i = 0; i < runs.length; i++) {
        const t = runs[i].textContent?.trim();
        if (t) slideText.push(t);
      }
      if (slideText.length > 0) {
        text += `--- SLIDE ${slideNum} ---\n${slideText.join(' ')}\n\n`;
      }
    }
    return text;
  } catch (err) {
    console.error("PPTX parsing error:", err);
    throw new Error("Impossibile leggere il file PowerPoint (.pptx). Il formato .ppt legacy non è supportato — convertilo in .pptx.");
  }
}
