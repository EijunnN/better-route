import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import {
  ALLOWED_CONTENT_TYPES,
  generateEvidenceKey,
  generatePresignedUploadUrl,
  generateTrackingFilename,
  generateUniqueFilename,
  getFilePublicUrl,
  isAllowedContentType,
  MAX_FILE_SIZE,
  PRESIGNED_URL_EXPIRATION,
} from "@/lib/storage/r2";

/**
 * GET /api/upload/presigned-url
 *
 * Generate a presigned URL for uploading files to Cloudflare R2.
 *
 * Query parameters:
 * - filename (required): Original name of the file to upload
 * - contentType (optional): MIME type of the file (default: image/jpeg)
 * - folder (optional): Folder/prefix for the file (default: evidence)
 * - trackingId (optional): Order tracking ID for naming the file (e.g., "TRACK123.jpg")
 * - index (optional): Photo index for multiple photos (1, 2, 3...)
 *
 * Response:
 * - uploadUrl: Presigned URL for PUT operation
 * - publicUrl: Public URL where the file will be accessible after upload
 * - key: Object key in the R2 bucket
 * - expiresIn: URL expiration time in seconds
 *
 * Security:
 * - Requires authenticated user
 * - Only allows specific image types (jpeg, png, webp, heic)
 * - Maximum file size enforced: 10MB
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Validate authentication
    const authUser = await getAuthenticatedUser(request);

    if (!authUser.companyId) {
      return NextResponse.json(
        { error: "User must belong to a company to upload files" },
        { status: 403 },
      );
    }

    // 2. Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");
    const contentType = searchParams.get("contentType") || "image/jpeg";
    const folder = searchParams.get("folder") || "evidence";
    const trackingId = searchParams.get("trackingId");
    const indexParam = searchParams.get("index");
    const index = indexParam ? parseInt(indexParam, 10) : undefined;

    // Validate: either filename or trackingId must be provided
    if (!filename && !trackingId) {
      return NextResponse.json(
        { error: "Either filename or trackingId query parameter is required" },
        { status: 400 },
      );
    }

    // Validate filename length if provided
    if (filename && filename.length > 255) {
      return NextResponse.json(
        { error: "filename must be 255 characters or less" },
        { status: 400 },
      );
    }

    // Validate trackingId length if provided
    if (trackingId && trackingId.length > 100) {
      return NextResponse.json(
        { error: "trackingId must be 100 characters or less" },
        { status: 400 },
      );
    }

    // Validate index if provided
    if (index !== undefined && (isNaN(index) || index < 1 || index > 99)) {
      return NextResponse.json(
        { error: "index must be a number between 1 and 99" },
        { status: 400 },
      );
    }

    // Validate content type
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json(
        {
          error: `Content type not allowed. Allowed types: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate folder (only allow alphanumeric, hyphens, and underscores)
    if (!/^[a-zA-Z0-9-_]+$/.test(folder)) {
      return NextResponse.json(
        {
          error:
            "Invalid folder name. Only alphanumeric characters, hyphens, and underscores are allowed.",
        },
        { status: 400 },
      );
    }

    // 3. Generate filename based on trackingId or original filename
    const generatedFilename = trackingId
      ? generateTrackingFilename(trackingId, contentType, index)
      : generateUniqueFilename(filename!, contentType);

    // Generate key based on folder type
    let key: string;
    if (folder === "evidence") {
      // Evidence files have special structure: evidence/{companyId}/{date}/{filename}
      key = generateEvidenceKey(authUser.companyId, generatedFilename);
    } else {
      // Other folders: {folder}/{companyId}/{date}/{filename}
      const date = new Date().toISOString().split("T")[0];
      key = `${folder}/${authUser.companyId}/${date}/${generatedFilename}`;
    }

    // 4. Generate presigned URL
    const uploadUrl = await generatePresignedUploadUrl(key, contentType);

    // 5. Generate public URL
    const publicUrl = getFilePublicUrl(key);

    // 6. Return response
    return NextResponse.json({
      uploadUrl,
      publicUrl,
      key,
      expiresIn: PRESIGNED_URL_EXPIRATION,
      maxFileSize: MAX_FILE_SIZE,
      contentType,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);

    // Handle authentication errors
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // Handle missing environment variables
    if (
      error instanceof Error &&
      error.message.startsWith("Missing required environment variable")
    ) {
      return NextResponse.json(
        { error: "Storage service not configured" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
