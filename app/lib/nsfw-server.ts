import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

// Allowed image types with their magic numbers
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'image/heic': [0x00, 0x00, 0x00, 0x18],
  'image/heif': [0x00, 0x00, 0x00, 0x20],
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_IMAGE_SIZE = 1024; // 1KB minimum to prevent empty/tiny files
const MAX_DIMENSION = 10000; // 10,000 pixels max dimension

export interface ServerNsfwResult {
  safe: boolean;
  reason?: string;
}

export async function validateImageServerSide(file: File): Promise<ServerNsfwResult> {
  // Check file size
  if (file.size > MAX_IMAGE_SIZE) {
    return { safe: false, reason: `Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)` };
  }
  if (file.size < MIN_IMAGE_SIZE) {
    return { safe: false, reason: `Image too small (min ${MIN_IMAGE_SIZE} bytes)` };
  }

  // Check MIME type
  if (!file.type || !ALLOWED_IMAGE_TYPES[file.type as keyof typeof ALLOWED_IMAGE_TYPES]) {
    return { safe: false, reason: `Invalid image type: ${file.type || 'unknown'}` };
  }

  // Validate magic numbers to prevent file type spoofing
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const expectedMagic = ALLOWED_IMAGE_TYPES[file.type as keyof typeof ALLOWED_IMAGE_TYPES];
    
    for (let i = 0; i < expectedMagic.length; i++) {
      if (bytes[i] !== expectedMagic[i]) {
        return { safe: false, reason: `File does not match declared type ${file.type}` };
      }
    }
  } catch (e) {
    return { safe: false, reason: 'Failed to validate file header' };
  }

  // Check filename for suspicious patterns
  const suspiciousPatterns = [
    /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i,
    /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.sh$/i,
    /\$.*\$/i, /<script/i, /javascript:/i,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(file.name)) {
      return { safe: false, reason: 'Suspicious filename pattern detected' };
    }
  }

  return { safe: true };
}

export async function validateImageFromStorage(path: string): Promise<ServerNsfwResult> {
  try {
    const storageRef = ref(storage, path);
    const url = await getDownloadURL(storageRef);
    
    // Fetch the file to validate
    const response = await fetch(url);
    if (!response.ok) {
      return { safe: false, reason: 'Failed to fetch image from storage' };
    }
    
    const blob = await response.blob();
    const file = new File([blob], path.split('/').pop() || 'image', { type: blob.type });
    
    return validateImageServerSide(file);
  } catch (e) {
    return { safe: false, reason: 'Failed to validate image from storage' };
  }
}

// Add this to the create-listing route for server-side validation
export async function validateListingImages(images: File[]): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const result = await validateImageServerSide(images[i]);
    if (!result.safe) {
      errors.push(`Image ${i + 1}: ${result.reason}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
