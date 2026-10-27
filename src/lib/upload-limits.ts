// Keep room for multipart fields under Vercel's 4.5 MB request-body limit.
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const MULTIPART_MAX_BYTES = UPLOAD_MAX_BYTES + 64 * 1024;
