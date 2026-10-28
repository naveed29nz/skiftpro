const UPLOAD_URL = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/uploads\/([^?#]+)/i;

/**
 * Object path inside the uploads bucket.
 * Accepts a stored public URL, a signed URL, or the path written by new uploads.
 */
export function uploadObjectPath(stored) {
  if (!stored || typeof stored !== 'string') return '';
  const trimmed = stored.trim();
  if (!trimmed || trimmed.includes('..')) return '';
  const fromUrl = trimmed.match(UPLOAD_URL);
  if (fromUrl) {
    try {
      return decodeURIComponent(fromUrl[1]);
    } catch {
      return fromUrl[1];
    }
  }
  if (/^https?:\/\//i.test(trimmed)) return '';
  const withoutBucket = trimmed.replace(/^\/+/, '').replace(/^uploads\//, '');
  return withoutBucket;
}
