// client helpers to generate Cloudinary URLs (use in client components)
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

function requireCloudName(): string {
  if (!CLOUD_NAME) throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is required");
  return CLOUD_NAME;
}

function encodePublicId(publicId: string): string {
  return publicId
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export function getCloudinaryThumbnail(publicId: string, size = 200) {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${size},h_${size},c_fill,q_auto:good,f_auto,dpr_auto/${id}`;
}

export function getCloudinaryMedium(publicId: string, width = 800) {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${width},c_limit,q_auto:good,f_auto,dpr_auto/${id}`;
}

export function getCloudinaryLarge(publicId: string, width = 1200) {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${width},c_limit,q_auto:best,f_auto,fl_progressive,dpr_auto/${id}`;
}

export function getCloudinaryVideo(publicId: string, quality: "low" | "medium" | "high" = "medium") {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  const settings: Record<string, string> = {
    low: "q_auto:low,vc_h264,f_mp4",
    medium: "q_auto:good,vc_h264,f_mp4",
    high: "q_auto:best,vc_h264,f_mp4",
  };
  return `https://res.cloudinary.com/${cloud}/video/upload/${settings[quality]}/${id}`;
}

export function isVideoPublicId(publicId: string) {
  return /\.(mp4|mov|webm|mkv|avi|ogv|m4v)$/i.test(publicId);
}

export function getCloudinaryUrl(publicId: string, kind: "thumbnail" | "medium" | "large" | "video" = "medium") {
  if (isVideoPublicId(publicId)) {
    return getCloudinaryVideo(publicId);
  }
  switch (kind) {
    case "thumbnail":
      return getCloudinaryThumbnail(publicId);
    case "large":
      return getCloudinaryLarge(publicId);
    case "video":
      return getCloudinaryVideo(publicId);
    default:
      return getCloudinaryMedium(publicId);
  }
}