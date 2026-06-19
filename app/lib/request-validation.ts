import { NextRequest } from 'next/server';
import { badRequest } from './api-error-handler';

const DEFAULT_MAX_BODY_SIZE = 512 * 1024; // 512KB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export async function validateRequestSize(
  req: NextRequest,
  maxSize: number = DEFAULT_MAX_BODY_SIZE
): Promise<{ valid: boolean; error?: string }> {
  const contentLength = req.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSize) {
      return {
        valid: false,
        error: `Request body too large (max ${maxSize / 1024}KB)`,
      };
    }
  }
  
  return { valid: true };
}

export function validateImageSize(size: number): { valid: boolean; error?: string } {
  if (size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`,
    };
  }
  
  if (size < 1024) {
    return {
      valid: false,
      error: 'Image too small (min 1KB)',
    };
  }
  
  return { valid: true };
}

export function validateImageCount(count: number, max: number = 10): { valid: boolean; error?: string } {
  if (count > max) {
    return {
      valid: false,
      error: `Too many images (max ${max})`,
    };
  }
  
  if (count < 1) {
    return {
      valid: false,
      error: 'At least one image is required',
    };
  }
  
  return { valid: true };
}
