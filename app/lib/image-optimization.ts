/**
 * Image Optimization Utility for Firebase Storage
 * 
 * Features:
 * - Client-side image compression before upload
 * - Thumbnail generation
 * - Duplicate image detection (hash-based)
 * - Format conversion (WebP preferred)
 */

export interface CompressedImage {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  format: string;
}

export interface Thumbnail {
  blob: Blob;
  width: number;
  height: number;
  format: string;
}

export interface ImageHash {
  hash: string;
  algorithm: "perceptual" | "md5";
}

// Configuration
const COMPRESSION_CONFIG = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  format: "image/webp" as const,
  thumbnailSize: 300,
  thumbnailQuality: 0.75,
};

/**
 * Compress an image file before upload
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    img.onload = () => {
      // Calculate dimensions maintaining aspect ratio
      let { width, height } = calculateDimensions(
        img.width,
        img.height,
        COMPRESSION_CONFIG.maxWidth,
        COMPRESSION_CONFIG.maxHeight
      );

      canvas.width = width;
      canvas.height = height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with compression
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }

          resolve({
            blob,
            originalSize: file.size,
            compressedSize: blob.size,
            width,
            height,
            format: COMPRESSION_CONFIG.format,
          });
        },
        COMPRESSION_CONFIG.format,
        COMPRESSION_CONFIG.quality
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate a thumbnail from an image
 */
export async function generateThumbnail(file: File): Promise<Thumbnail> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    img.onload = () => {
      // Calculate thumbnail dimensions
      let { width, height } = calculateDimensions(
        img.width,
        img.height,
        COMPRESSION_CONFIG.thumbnailSize,
        COMPRESSION_CONFIG.thumbnailSize
      );

      canvas.width = width;
      canvas.height = height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to generate thumbnail"));
            return;
          }

          resolve({
            blob,
            width,
            height,
            format: COMPRESSION_CONFIG.format,
          });
        },
        COMPRESSION_CONFIG.format,
        COMPRESSION_CONFIG.thumbnailQuality
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Calculate dimensions maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = (maxHeight / height) * width;
    height = maxHeight;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Generate perceptual hash for duplicate detection
 * Uses a simple average hash algorithm
 */
export async function generateImageHash(file: File): Promise<ImageHash> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    img.onload = () => {
      // Resize to small size for hash (8x8)
      const hashSize = 8;
      canvas.width = hashSize;
      canvas.height = hashSize;

      // Draw grayscale image
      ctx.drawImage(img, 0, 0, hashSize, hashSize);
      const imageData = ctx.getImageData(0, 0, hashSize, hashSize);
      const data = imageData.data;

      // Calculate average brightness
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Use luminance formula: 0.299*R + 0.587*G + 0.114*B
        const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += brightness;
      }
      const avg = sum / (hashSize * hashSize);

      // Generate hash based on comparison to average
      let hash = "";
      for (let i = 0; i < data.length; i += 4) {
        const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        hash += brightness > avg ? "1" : "0";
      }

      resolve({
        hash,
        algorithm: "perceptual",
      });
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Compare two image hashes for similarity
 * Returns similarity percentage (0-100)
 */
export function compareImageHashes(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 0;

  let matches = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) matches++;
  }

  return (matches / hash1.length) * 100;
}

/**
 * Check if image is likely a duplicate based on hash similarity
 */
export function isLikelyDuplicate(
  newHash: string,
  existingHashes: string[],
  similarityThreshold: number = 90
): boolean {
  for (const existingHash of existingHashes) {
    const similarity = compareImageHashes(newHash, existingHash);
    if (similarity >= similarityThreshold) {
      return true;
    }
  }
  return false;
}

/**
 * Batch compress multiple images
 */
export async function compressImages(files: File[]): Promise<CompressedImage[]> {
  const results: CompressedImage[] = [];

  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      results.push(compressed);
    } catch (error) {
      console.error(`Failed to compress ${file.name}:`, error);
      // Add original file if compression fails
      results.push({
        blob: file,
        originalSize: file.size,
        compressedSize: file.size,
        width: 0,
        height: 0,
        format: file.type,
      });
    }
  }

  return results;
}

/**
 * Calculate compression ratio
 */
export function calculateCompressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return ((originalSize - compressedSize) / originalSize) * 100;
}

/**
 * Estimate storage savings for a set of images
 */
export function estimateStorageSavings(images: CompressedImage[]): {
  originalTotal: number;
  compressedTotal: number;
  savings: number;
  savingsPercentage: number;
} {
  const originalTotal = images.reduce((sum, img) => sum + img.originalSize, 0);
  const compressedTotal = images.reduce((sum, img) => sum + img.compressedSize, 0);
  const savings = originalTotal - compressedTotal;
  const savingsPercentage = calculateCompressionRatio(originalTotal, compressedTotal);

  return {
    originalTotal,
    compressedTotal,
    savings,
    savingsPercentage,
  };
}
