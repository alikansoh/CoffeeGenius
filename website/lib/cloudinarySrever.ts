import { v2 as cloudinary } from "cloudinary";

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

export function initCloudinary() {
  const { cloudName, apiKey, apiSecret } = requireServerEnv();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

/**
 * Upload a Buffer to Cloudinary via upload_stream. Returns the upload result.
 */
export function uploadBufferToCloudinary(
  buffer: Buffer,
  options?: { folder?: string; resource_type?: "image" | "video" | "auto" }
) {
  return new Promise<unknown>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options?.folder,
        resource_type: options?.resource_type ?? "auto",
      },
      (error: Error | undefined, result: unknown) => {
        if (error) return reject(error);
        interface CloudinaryUploadResult {
          public_id: string;
          secure_url: string;
          [key: string]: unknown; // Optional: To allow additional properties
        }

        const r = result as Partial<CloudinaryUploadResult> | null;
        if (!r || !r.public_id || !r.secure_url) {
          return reject(new Error("Invalid upload result from Cloudinary"));
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Destroy (delete) a publicId from Cloudinary. Provide resource_type if needed (video/image).
 */
export async function destroyPublicId(publicId: string, resource_type: "image" | "video" | "auto" = "auto") {
  initCloudinary();
  // cloudinary.uploader.destroy expects the public_id without extension suffix; if you stored full publicId with folder, pass it unchanged.
  return cloudinary.uploader.destroy(publicId, { resource_type });
}