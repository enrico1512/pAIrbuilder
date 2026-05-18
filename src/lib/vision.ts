/**
 * Google Cloud Vision API Helper
 * Used to extract high-accuracy text from menu images.
 */

export async function performOCR(base64Image: string): Promise<string> {
  // Remove data:image/jpeg;base64, prefix if present
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

  try {
    const response = await fetch("/api/vision/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: cleanBase64 })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Vision Service Error: ${error.error || response.statusText}`);
    }

    const data = await response.json();
    const textAnnotation = data.responses[0]?.fullTextAnnotation;
    
    return textAnnotation?.text || "";
  } catch (error) {
    console.error("OCR Request Error:", error);
    return "";
  }
}
