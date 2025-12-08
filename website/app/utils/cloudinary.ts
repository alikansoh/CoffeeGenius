const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';

function requireCloudName(): string {
  if (!CLOUD_NAME) {
    throw new Error('Environment variable NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is required');
  }
  return CLOUD_NAME;
}

/**
 * Encode each path segment of a Cloudinary public ID so that slashes remain separators.
 * e.g. "folder/sub folder/image name.jpg" => "folder/sub%20folder/image%20name.jpg"
 */
function encodePublicId(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Thumbnail - Small size, good quality
 * Use for: Admin lists, tiny previews
 * Size: ~30-80KB
 */
export function getCloudinaryThumbnail(publicId: string, size = 200): string {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${size},h_${size},c_fill,q_auto:good,f_auto,dpr_auto/${id}`;
}

/**
 * Medium - Good quality, reasonable size
 * Use for: Product cards, gallery
 * Size: ~100-300KB
 */
export function getCloudinaryMedium(publicId: string, width = 800): string {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${width},c_limit,q_auto:good,f_auto,dpr_auto/${id}`;
}

/**
 * Large - High quality, optimized format
 * Use for: Product detail pages, main images
 * Size: ~200-500KB
 */
export function getCloudinaryLarge(publicId: string, width = 1200): string {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/w_${width},c_limit,q_auto:best,f_auto,fl_progressive,dpr_auto/${id}`;
}

/**
 * Full/Original - Best quality
 * Use for: Zoom, lightbox, high-res downloads
 * Size: ~500KB-2MB
 */
export function getCloudinaryFull(publicId: string): string {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  return `https://res.cloudinary.com/${cloud}/image/upload/q_auto:best,f_auto,fl_progressive/${id}`;
}

/**
 * Video - Force MP4 format for browser compatibility
 * Use for: Product videos
 * Size: ~2-10MB depending on length
 */
export function getCloudinaryVideo(
  publicId: string,
  quality: 'low' | 'medium' | 'high' = 'medium'
): string {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);

  const settings: Record<'low' | 'medium' | 'high', string> = {
    low: 'q_auto:low,vc_h264,f_mp4',
    medium: 'q_auto:good,vc_h264,f_mp4',
    high: 'q_auto:best,vc_h264,f_mp4',
  };

  return `https://res.cloudinary.com/${cloud}/video/upload/${settings[quality]}/${id}`;
}

/**
 * Get video thumbnail (poster image)
 */
export function getVideoThumbnail(publicId: string, size = 200): string {
  const cloud = requireCloudName();
  const id = encodePublicId(publicId);
  // Cloudinary will serve a jpg poster image for the video publicId when requesting .jpg
  return `https://res.cloudinary.com/${cloud}/video/upload/w_${size},h_${size},c_fill,f_jpg,so_0/${id}.jpg`;
}

/**
 * Check if publicId references a video
 * Detects videos by file extension in the public ID (checks end of string).
 */
export function isVideo(publicId: string): boolean {
  if (!publicId) return false;

  // Use a regex to detect common video extensions at the end of the string (case-insensitive)
  return /\.(mp4|mov|webm|avi|m4v|mkv|flv|mts|m2ts|3gp|ogv)$/i.test(publicId);
}

/**
 * Get appropriate URL based on context
 */
export function getCloudinaryUrl(
  publicId: string,
  context: 'thumbnail' | 'medium' | 'large' | 'full' = 'medium',
  videoQuality: 'low' | 'medium' | 'high' = 'medium'
): string {
  if (isVideo(publicId)) {
    return getCloudinaryVideo(publicId, videoQuality);
  }

  switch (context) {
    case 'thumbnail':
      return getCloudinaryThumbnail(publicId);
    case 'medium':
      return getCloudinaryMedium(publicId);
    case 'large':
      return getCloudinaryLarge(publicId);
    case 'full':
      return getCloudinaryFull(publicId);
    default:
      return getCloudinaryMedium(publicId);
  }
}