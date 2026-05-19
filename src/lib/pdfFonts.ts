/**
 * Helper per caricare font Unicode in jspdf.
 *
 * Perché esiste questo file:
 *   I 14 font "core" di jspdf (Helvetica, Times, Courier...) NON supportano
 *   correttamente i caratteri Unicode estesi (accenti francesi, virgolette
 *   curve, ecc.). Per generare PDF leggibili in italiano/francese/inglese
 *   serve embeddare un font TrueType custom.
 *
 *   Liberation Sans è un font open-source metricamente compatibile con
 *   Helvetica/Arial — visivamente quasi identico, ma con copertura Unicode
 *   completa per il latino esteso.
 *
 * I file .b64 sono in public/fonts/ e contengono i TTF codificati base64.
 * Vengono caricati la prima volta che si genera un PDF e poi cachati in memoria.
 */
import type { jsPDF } from 'jspdf';

const FONT_FAMILY = 'LiberationSans';

const FONT_FILES = {
  normal: '/fonts/liberation-sans-regular.b64',
  bold: '/fonts/liberation-sans-bold.b64',
  italic: '/fonts/liberation-sans-italic.b64',
} as const;

type FontStyle = keyof typeof FONT_FILES;

// Cache in memoria del base64 di ogni stile, per evitare fetch ripetuti.
const fontCache: Partial<Record<FontStyle, string>> = {};

async function fetchFontBase64(style: FontStyle): Promise<string> {
  if (fontCache[style]) return fontCache[style]!;
  const url = FONT_FILES[style];
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`[pdfFonts] impossibile caricare ${url}: ${resp.status}`);
  }
  const text = (await resp.text()).trim();
  fontCache[style] = text;
  return text;
}

/**
 * Registra Liberation Sans (Regular, Bold, Italic) come font del PDF
 * e lo imposta come font corrente.
 *
 * Se il caricamento fallisce per qualche motivo (rete, file mancante),
 * cade in fallback su Helvetica con un warning in console — il PDF
 * non sarà multilingua-friendly ma almeno si genera.
 *
 * @returns il nome del font da passare a doc.setFont(...) — 'LiberationSans'
 *          se l'embed è riuscito, 'helvetica' se è caduto in fallback.
 */
export async function ensurePdfFont(doc: jsPDF): Promise<string> {
  try {
    const [regular, bold, italic] = await Promise.all([
      fetchFontBase64('normal'),
      fetchFontBase64('bold'),
      fetchFontBase64('italic'),
    ]);

    // VFS = "Virtual File System" interno di jspdf:
    // i file vanno prima registrati nel VFS, poi mappati a un font logico.
    (doc as any).addFileToVFS(`${FONT_FAMILY}-Regular.ttf`, regular);
    (doc as any).addFont(`${FONT_FAMILY}-Regular.ttf`, FONT_FAMILY, 'normal');

    (doc as any).addFileToVFS(`${FONT_FAMILY}-Bold.ttf`, bold);
    (doc as any).addFont(`${FONT_FAMILY}-Bold.ttf`, FONT_FAMILY, 'bold');

    (doc as any).addFileToVFS(`${FONT_FAMILY}-Italic.ttf`, italic);
    (doc as any).addFont(`${FONT_FAMILY}-Italic.ttf`, FONT_FAMILY, 'italic');

    doc.setFont(FONT_FAMILY, 'normal');
    return FONT_FAMILY;
  } catch (e) {
    console.warn(
      '[pdfFonts] Fallback su Helvetica — caratteri accentati potrebbero non renderizzare bene:',
      e
    );
    doc.setFont('helvetica', 'normal');
    return 'helvetica';
  }
}
