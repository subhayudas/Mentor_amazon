/**
 * API configuration and base URL
 * In development, the frontend is served by the same server, so we use relative URLs
 * In production, you may need to set VITE_API_URL environment variable
 */

// Get API base URL from environment variable or use relative path
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Constructs a full API URL from a path
 * @param path - API path (e.g., '/api/auth/login')
 * @returns Full URL to the API endpoint
 */
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // If API_BASE_URL is set, use it; otherwise use relative URL
  if (API_BASE_URL) {
    // Remove trailing slash from base URL if present
    const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    return `${base}${normalizedPath}`;
  }
  
  // Use relative URL (same origin)
  return normalizedPath;
}

