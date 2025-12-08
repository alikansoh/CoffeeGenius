import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

const CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function requireServerEnv() {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error(
      "Missing Cloudinary environment variables. Ensure CLOUDINARY_CLOUD_NAME (or NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME), CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are set."
    );
  }
  return { cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET };
}

const initCloudinary = () => {
  const { cloudName, apiKey, apiSecret } = requireServerEnv();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
};

interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  format: string;
  resource_type: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
}

async function uploadBufferToCloudinary(
  buffer: Buffer,
  options: { folder?: string; resource_type?: "image" | "video" | "auto" }
): Promise<CloudinaryUploadResult> {
  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resource_type ?? "auto",
      },
      (error: Error | undefined, result: unknown) => {
        if (error) return reject(error);
        const r = result as Partial<CloudinaryUploadResult> | null;
        if (!r || !r.public_id || !r.secure_url) {
          return reject(new Error("Invalid upload result from Cloudinary"));
        }
        resolve({
          public_id: r.public_id,
          secure_url: r.secure_url,
          format: r.format ?? "",
          resource_type: (r.resource_type as string) ?? "image",
          width: r.width,
          height: r.height,
          duration: r.duration,
          bytes: r.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}

export async function POST(request: NextRequest) {
  try {
    initCloudinary();

    const formData = await request.formData();
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((f) => typeof (f as File)?.arrayBuffer === "function") as File[];
    const folder = (formData.get("folder") as string) || "coffee-shop";

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No files provided under field name "files"' },
        { status: 400 }
      );
    }

    const uploadPromises: Promise<CloudinaryUploadResult>[] = files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const resourceType: "image" | "video" | "auto" =
        (file.type && file.type.startsWith("video/")) ||
        /\.(mp4|mov|webm|avi|m4v|mkv|flv|mts|m2ts|3gp|ogv)$/i.test(file.name)
          ? "video"
          : "image";

      return uploadBufferToCloudinary(buffer, {
        folder,
        resource_type: resourceType,
      });
    });

    const uploadedResults = await Promise.all(uploadPromises);

    const responseFiles = uploadedResults.map((r) => ({
      publicId: r.public_id,
      url: r.secure_url,
      format: r.format,
      resourceType: r.resource_type,
      width: r.width ?? null,
      height: r.height ?? null,
      duration: r.duration ?? null,
      bytes: r.bytes ?? null,
    }));

    return NextResponse.json({
      success: true,
      files: responseFiles,
      message: `${responseFiles.length} file(s) uploaded successfully`,
    });
  } catch (error) {
    console.error("❌ Upload route error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to upload files",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}