import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 Storage Configuration
 *
 * R2 is S3-compatible, so we use the AWS SDK with R2's endpoint.
 *
 * Environment variables required:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 API token access key
 * - R2_SECRET_ACCESS_KEY: R2 API token secret
 * - R2_BUCKET_NAME: Name of the R2 bucket
 * - R2_PUBLIC_URL: Public URL for accessing files (custom domain or R2.dev URL)
 */

// Validate required environment variables
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Lazy initialization to avoid errors during build time
let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const accountId = getRequiredEnv("R2_ACCOUNT_ID");
    const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");

    _s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _s3Client;
}

export function getBucketName(): string {
  return getRequiredEnv("R2_BUCKET_NAME");
}

export function getPublicUrl(): string {
  return getRequiredEnv("R2_PUBLIC_URL");
}

/**
 * Allowed MIME types for uploads
 */
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/**
 * Check if a content type is allowed
 */
export function isAllowedContentType(
  contentType: string,
): contentType is AllowedContentType {
  return ALLOWED_CONTENT_TYPES.includes(contentType as AllowedContentType);
}

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Presigned URL expiration time in seconds (5 minutes)
 */
export const PRESIGNED_URL_EXPIRATION = 300;

/**
 * Get file extension from content type
 */
export function getExtensionFromContentType(contentType: string): string {
  const extensionMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
  };
  return extensionMap[contentType] || ".jpg";
}

/**
 * Generate a presigned URL for uploading a file to R2
 *
 * @param key - The object key (path) in the bucket
 * @param contentType - The MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default: 300)
 * @returns Presigned URL for PUT operation
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = PRESIGNED_URL_EXPIRATION,
): Promise<string> {
  const client = getS3Client();
  const bucketName = getBucketName();

  // Don't bake ContentLength into the signed command. AWS SDK v3
  // bakes it as `x-amz-decoded-content-length` / Content-Length and
  // R2 then enforces an *exact* byte match — meaning every upload
  // failed with 403 unless the file was exactly MAX_FILE_SIZE bytes.
  // The size cap should be enforced via bucket policy (cap object
  // size) or by the client before requesting the URL; here we just
  // sign for content-type so the upload survives.
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const signedUrl = await getSignedUrl(client, command, {
    expiresIn,
    signableHeaders: new Set(["content-type"]),
  });

  return signedUrl;
}

/**
 * Generate the public URL for an uploaded file
 *
 * @param key - The object key (path) in the bucket
 * @returns Public URL for the file
 */
export function getFilePublicUrl(key: string): string {
  const publicUrl = getPublicUrl();
  // Ensure no double slashes
  const baseUrl = publicUrl.endsWith("/") ? publicUrl.slice(0, -1) : publicUrl;
  return `${baseUrl}/${key}`;
}

/**
 * Generate the object key for evidence files
 *
 * @param companyId - The company ID
 * @param filename - The generated unique filename
 * @returns Object key for the evidence file
 */
export function generateEvidenceKey(
  companyId: string,
  filename: string,
): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `evidence/${companyId}/${date}/${filename}`;
}

/**
 * Generate a unique filename with UUID
 *
 * @param originalFilename - The original filename
 * @param contentType - The MIME type for extension fallback
 * @returns Unique filename with UUID prefix
 */
export function generateUniqueFilename(
  originalFilename: string,
  contentType: string,
): string {
  const uuid = crypto.randomUUID();

  // Extract extension from original filename or use content type
  const originalExt = originalFilename.includes(".")
    ? `.${originalFilename.split(".").pop()?.toLowerCase()}`
    : getExtensionFromContentType(contentType);

  // Sanitize the original filename (remove special chars, keep alphanumeric and hyphens)
  const sanitizedName = originalFilename
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[^a-zA-Z0-9-_]/g, "-") // Replace special chars with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length

  return `${uuid}-${sanitizedName || "file"}${originalExt}`;
}

/**
 * Generate a filename based on tracking ID
 *
 * @param trackingId - The order tracking ID
 * @param contentType - The MIME type for extension
 * @param index - Optional index for multiple photos (1, 2, 3...)
 * @returns Filename like "TRACK123.jpg" or "TRACK123_2.jpg"
 */
export function generateTrackingFilename(
  trackingId: string,
  contentType: string,
  index?: number,
): string {
  const ext = getExtensionFromContentType(contentType);

  // Sanitize tracking ID (keep alphanumeric and hyphens only)
  const sanitizedTrackingId = trackingId
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();

  // Add timestamp to make unique (in case of re-uploads)
  const timestamp = Date.now().toString(36);

  if (index && index > 1) {
    return `${sanitizedTrackingId}_${index}_${timestamp}${ext}`;
  }

  return `${sanitizedTrackingId}_${timestamp}${ext}`;
}
