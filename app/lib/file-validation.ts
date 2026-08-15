// Magic bytes for common file types to prevent spoofing
const FILE_SIGNATURES: Record<string, Uint8Array> = {
  "image/jpeg": new Uint8Array([0xFF, 0xD8, 0xFF]),
  "image/png": new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  "image/webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  "image/gif": new Uint8Array([0x47, 0x49, 0x46, 0x38]),
  "application/pdf": new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  "application/msword": new Uint8Array([0xD0, 0xCF, 0x11, 0xE0]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
  "text/plain": new Uint8Array([]), // Text files have no magic bytes, handled separately
};

function matchesSignature(buffer: Uint8Array, signature: Uint8Array): boolean {
  if (signature.length === 0) return true; // No signature check needed
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

export async function validateFileSignature(file: Blob, expectedType: string): Promise<boolean> {
  const signature = FILE_SIGNATURES[expectedType];
  if (!signature) return true; // Unknown type, skip validation
  
  if (signature.length === 0) {
    // For text files, check if it's actually text by trying to read it
    try {
      const text = await file.text();
      return text.length > 0;
    } catch {
      return false;
    }
  }
  
  const buffer = await file.slice(0, signature.length).arrayBuffer();
  if (!matchesSignature(new Uint8Array(buffer), signature)) return false;

  // RIFF is a container format; require the WebP subtype rather than accepting
  // arbitrary RIFF files (WAV/AVI) submitted with an image/webp MIME type.
  if (expectedType === "image/webp") {
    const webpHeader = new Uint8Array(await file.slice(8, 12).arrayBuffer());
    return String.fromCharCode(...webpHeader) === "WEBP";
  }

  return true;
}

/**
 * Image uploads must be a recognized binary image, not active text disguised
 * behind an image MIME type or appended to a valid image as a polyglot.
 */
export async function validateImageUpload(file: Blob, expectedType: string): Promise<boolean> {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(expectedType)) {
    return false;
  }
  if (!(await validateFileSignature(file, expectedType))) return false;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(bytes).toLowerCase();
  return !/<(?:!doctype|html|svg|script|iframe|object|embed|body)\b/.test(text);
}

export function isSafeFileName(fileName: string): boolean {
  const unsafePatterns = [
    /\.\./, // Directory traversal
    /[<>:"|?*]/, // Invalid Windows chars
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Reserved Windows names
    /\.exe$/i, // Executables
    /\.bat$/i, // Batch files
    /\.cmd$/i, // Command scripts
    /\.scr$/i, // Screensavers
    /\.pif$/i, // PIF files
  ];
  
  return !unsafePatterns.some(pattern => pattern.test(fileName));
}

export function sanitizeFileName(fileName: string): string {
  // Remove unsafe characters
  return fileName
    .replace(/[<>:"|?*]/g, "")
    .replace(/\.\./g, "")
    .substring(0, 255); // Limit length
}
