# Firebase Storage Optimization Implementation

**Date:** June 22, 2026
**Purpose:** Reduce Firebase Storage costs and improve performance

---

## Implementation Summary

### 1. Image Compression Before Upload
**File:** `app/lib/image-optimization.ts`

**Features:**
- Client-side compression using Canvas API
- Maximum dimensions: 1920x1920px
- Quality: 85%
- Format: WebP (preferred for better compression)
- Maintains aspect ratio

**Configuration:**
```typescript
const COMPRESSION_CONFIG = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  format: "image/webp",
  thumbnailSize: 300,
  thumbnailQuality: 0.75,
};
```

**Usage:**
```typescript
import { compressImage, compressImages } from "../lib/image-optimization";

// Single image
const compressed = await compressImage(file);
console.log(`Original: ${compressed.originalSize} bytes`);
console.log(`Compressed: ${compressed.compressedSize} bytes`);
console.log(`Savings: ${calculateCompressionRatio(...)}`);

// Batch compression
const compressedImages = await compressImages(files);
```

### 2. Thumbnail Generation
**File:** `app/lib/image-optimization.ts`

**Features:**
- Automatic thumbnail generation from uploaded images
- Size: 300x300px (maintaining aspect ratio)
- Quality: 75%
- Format: WebP

**Usage:**
```typescript
import { generateThumbnail } from "../lib/image-optimization";

const thumbnail = await generateThumbnail(file);
// Upload to listings/{userId}/thumbnails/{fileName}
```

### 3. Duplicate Image Detection
**File:** `app/lib/image-optimization.ts`

**Features:**
- Perceptual hash algorithm (8x8 average hash)
- Hash-based comparison
- Configurable similarity threshold (default: 90%)
- Prevents duplicate uploads

**Usage:**
```typescript
import { generateImageHash, isLikelyDuplicate } from "../lib/image-optimization";

// Generate hash for new image
const hash = await generateImageHash(file);

// Check against existing hashes
const existingHashes = ["11001010...", "10110011..."];
const isDuplicate = isLikelyDuplicate(hash.hash, existingHashes, 90);

if (isDuplicate) {
  console.warn("Duplicate image detected");
}
```

### 4. Lifecycle Policies
**File:** `storage.rules`

**Changes:**
- Added thumbnail path support
- Note: Firebase Storage lifecycle policies must be configured via gcloud CLI or Firebase Console

**Recommended Lifecycle Policies (to be configured via gcloud):**
```bash
# Delete old listing images after 90 days
gsutil lifecycle set lifecycle.json gs://sky-drop-de459.appspot.com
```

**lifecycle.json:**
```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 90,
          "matchesPrefix": ["listings/"]
        }
      },
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 30,
          "matchesPrefix": ["listings/*/thumbnails/"]
        }
      }
    ]
  }
}
```

### 5. Unused Image Cleanup
**File:** `app/api/admin/cleanup-storage/route.ts`

**Features:**
- Identifies unused images (not referenced in any listing)
- Dry-run mode for testing
- Deletes old thumbnails (older than 30 days)
- Reports freed space and deleted count

**Usage:**
```bash
# Dry run (test without deleting)
POST /api/admin/cleanup-storage
{
  "dryRun": true
}

# Actual cleanup
POST /api/admin/cleanup-storage
{
  "dryRun": false
}
```

**Response:**
```json
{
  "success": true,
  "dryRun": true,
  "deletedImages": 47,
  "freedSpaceBytes": 15728640,
  "freedSpaceMB": 15.0,
  "errors": []
}
```

---

## Storage Savings Estimates

### Baseline Assumptions

**Current State (No Optimization):**
- Average listing image size: 2.5 MB (JPEG, high quality)
- Average images per listing: 4
- New listings per day (100 users): 5
- New listings per day (1,000 users): 50
- New listings per day (10,000 users): 500
- New listings per day (100,000 users): 5,000

**With Optimization:**
- Average compressed image size: 500 KB (WebP, 85% quality)
- Compression ratio: 80% reduction
- Thumbnail size: 30 KB per image
- Duplicate detection: 5% duplicate upload rate

### Monthly Storage Savings

#### 100 Users
**Current Storage:**
- 5 listings/day × 4 images × 2.5 MB = 50 MB/day
- 50 MB/day × 30 days = 1,500 MB/month = 1.5 GB/month

**With Compression:**
- 5 listings/day × 4 images × 0.5 MB = 10 MB/day
- 10 MB/day × 30 days = 300 MB/month = 0.3 GB/month

**Savings:**
- Storage: 1.2 GB/month (80% reduction)
- Cost (Firebase Storage): $0.31/month → $0.08/month
- **Monthly Savings: $0.23/month**

#### 1,000 Users
**Current Storage:**
- 50 listings/day × 4 images × 2.5 MB = 500 MB/day
- 500 MB/day × 30 days = 15,000 MB/month = 15 GB/month

**With Compression:**
- 50 listings/day × 4 images × 0.5 MB = 100 MB/day
- 100 MB/day × 30 days = 3,000 MB/month = 3 GB/month

**Savings:**
- Storage: 12 GB/month (80% reduction)
- Cost (Firebase Storage): $3.12/month → $0.62/month
- CDN cost reduction: 12 GB × $0.15/GB = $1.80/month
- **Monthly Savings: $4.30/month**

#### 10,000 Users
**Current Storage:**
- 500 listings/day × 4 images × 2.5 MB = 5,000 MB/day
- 5,000 MB/day × 30 days = 150,000 MB/month = 150 GB/month

**With Compression:**
- 500 listings/day × 4 images × 0.5 MB = 1,000 MB/day
- 1,000 MB/day × 30 days = 30,000 MB/month = 30 GB/month

**Savings:**
- Storage: 120 GB/month (80% reduction)
- Cost (Firebase Storage): $31.20/month → $6.24/month
- CDN cost reduction: 120 GB × $0.15/GB = $18.00/month
- **Monthly Savings: $43.16/month**

#### 100,000 Users
**Current Storage:**
- 5,000 listings/day × 4 images × 2.5 MB = 50,000 MB/day
- 50,000 MB/day × 30 days = 1,500,000 MB/month = 1,500 GB/month

**With Compression:**
- 5,000 listings/day × 4 images × 0.5 MB = 10,000 MB/day
- 10,000 MB/day × 30 days = 300,000 MB/month = 300 GB/month

**Savings:**
- Storage: 1,200 GB/month (80% reduction)
- Cost (Firebase Storage): $312.00/month → $62.40/month
- CDN cost reduction: 1,200 GB × $0.15/GB = $180.00/month
- **Monthly Savings: $429.60/month**

### Additional Savings from Cleanup

**Assumptions:**
- 10% of listings are deleted/expired monthly
- Images not cleaned up currently
- Cleanup removes 100% of orphaned images

**Additional Monthly Savings:**

| User Count | Orphaned Images | Storage Freed | Monthly Savings |
|------------|----------------|---------------|-----------------|
| 100 | 20 | 50 MB | $0.01 |
| 1,000 | 200 | 500 MB | $0.10 |
| 10,000 | 2,000 | 5 GB | $1.00 |
| 100,000 | 20,000 | 50 GB | $10.00 |

### Total Monthly Savings Summary

| User Count | Storage Savings | CDN Savings | Cleanup Savings | Total Monthly Savings |
|------------|-----------------|-------------|-----------------|----------------------|
| 100 | $0.23 | $0.00 | $0.01 | **$0.24** |
| 1,000 | $2.50 | $1.80 | $0.10 | **$4.40** |
| 10,000 | $25.00 | $18.00 | $1.00 | **$44.00** |
| 100,000 | $250.00 | $180.00 | $10.00 | **$440.00** |

---

## Implementation Steps

### Step 1: Update Listing Upload Flow
**File:** `app/post/ai/page.tsx`

**Changes Required:**
1. Import compression utilities
2. Compress images before upload
3. Generate thumbnails
4. Store image hashes for duplicate detection
5. Upload compressed images and thumbnails

**Example Integration:**
```typescript
import { compressImage, generateThumbnail, generateImageHash } from "../lib/image-optimization";

// In upload handler
const compressedImages = [];
const thumbnails = [];
const hashes = [];

for (const file of imageFiles) {
  const compressed = await compressImage(file);
  const thumbnail = await generateThumbnail(file);
  const hash = await generateImageHash(file);
  
  compressedImages.push(compressed);
  thumbnails.push(thumbnail);
  hashes.push(hash);
  
  // Upload compressed image
  const storageRef = ref(storage, `listings/${user.uid}/${Date.now()}.webp`);
  await uploadBytes(storageRef, compressed.blob);
  
  // Upload thumbnail
  const thumbRef = ref(storage, `listings/${user.uid}/thumbnails/${Date.now()}.webp`);
  await uploadBytes(thumbRef, thumbnail.blob);
}
```

### Step 2: Configure Lifecycle Policies (via gcloud)
```bash
# Create lifecycle.json file
cat > lifecycle.json << EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 90,
          "matchesPrefix": ["listings/"]
        }
      },
      {
        "action": { "type": "Delete" },
        "condition": {
          "age": 30,
          "matchesPrefix": ["listings/*/thumbnails/"]
        }
      }
    ]
  }
}
EOF

# Apply to Firebase Storage
gsutil lifecycle set lifecycle.json gs://sky-drop-de459.appspot.com
```

### Step 3: Schedule Regular Cleanup
**Option A:** Use Firebase Cloud Functions (cron)
**Option B:** Manual monthly cleanup via admin panel
**Option C:** Vercel cron job calling `/api/admin/cleanup-storage`

**Example Vercel Cron (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/admin/cleanup-storage",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

### Step 4: Monitor Storage Usage
Add storage monitoring to admin dashboard:
```javascript
const storage = getStorage();
const [files] = await storage.bucket().getFiles({ prefix: "listings/" });
const totalSize = files.reduce((sum, file) => sum + Number(file.metadata.size), 0);
```

---

## Performance Impact

### Upload Time
- **Before:** 2.5 MB image upload @ 5 Mbps = 4 seconds
- **After:** 0.5 MB image upload @ 5 Mbps = 0.8 seconds
- **Improvement:** 80% faster uploads

### Download Time
- **Before:** 2.5 MB image download @ 10 Mbps = 2 seconds
- **After:** 0.5 MB image download @ 10 Mbps = 0.4 seconds
- **Improvement:** 80% faster downloads

### Client-Side Processing
- Compression time: ~200ms per image (client-side)
- Thumbnail generation: ~100ms per image (client-side)
- Hash generation: ~50ms per image (client-side)
- **Total overhead:** ~350ms per image (acceptable)

---

## Risk Assessment

### Potential Issues
1. **Browser Compatibility:** Canvas API required (IE11 not supported)
2. **WebP Support:** Older browsers may not support WebP
3. **Hash Collisions:** Perceptual hash may have false positives (mitigated by 90% threshold)
4. **Lossy Compression:** Some quality loss at 85% (acceptable for marketplace images)

### Mitigations
- Fallback to original format if WebP not supported
- Keep original image size limit as safety net
- Allow users to opt-out of compression
- Implement manual re-upload option

---

## Next Steps

1. **Immediate (Today):**
   - Review and test image compression library
   - Test on various image types and sizes

2. **Short-term (This Week):**
   - Integrate compression into listing upload flow
   - Test duplicate detection
   - Configure lifecycle policies

3. **Medium-term (This Month):**
   - Implement thumbnail generation
   - Set up scheduled cleanup
   - Add storage monitoring to admin dashboard

4. **Long-term (This Quarter):**
   - Monitor actual savings
   - Adjust compression parameters based on quality feedback
   - Implement CDN caching optimization

---

## Files Modified/Created

**Created:**
- `app/lib/image-optimization.ts` - Image compression, thumbnails, duplicate detection
- `app/api/admin/cleanup-storage/route.ts` - Unused image cleanup API
- `FIREBASE_STORAGE_OPTIMIZATION.md` - This documentation

**Modified:**
- `storage.rules` - Added thumbnail path support

**To Be Modified:**
- `app/post/ai/page.tsx` - Integrate compression into upload flow
- `vercel.json` - Add cleanup cron job (optional)

---

## Conclusion

**Expected Monthly Savings:**
- 100 users: $0.24/month
- 1,000 users: $4.40/month
- 10,000 users: $44.00/month
- 100,000 users: $440.00/month

**Key Benefits:**
- 80% reduction in storage costs
- 80% faster upload/download times
- Automatic duplicate detection
- Automated cleanup of orphaned images
- Better user experience with faster page loads

**Implementation Effort:**
- Image compression library: 4 hours
- Integration into upload flow: 2 hours
- Lifecycle policies: 1 hour
- Cleanup automation: 1 hour
- Testing and monitoring: 2 hours

**Total Effort:** 10 hours
**ROI:** 44x monthly return at 10K users
