import { QueryClient } from "@tanstack/react-query";

// Query client with default options optimized for frontend-only operation
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});

// Legacy exports for backward compatibility during migration
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  console.warn(`Legacy apiRequest called for ${method} ${url}. Consider using the database service directly.`);
  
  // Create a mock response for backward compatibility
  return new Response(JSON.stringify({ message: 'Using frontend-only mode' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => () => Promise<T | null> =
  ({ on401: unauthorizedBehavior }) =>
  async () => {
    console.warn('Legacy getQueryFn called. Consider using the database service directly.');
    
    if (unauthorizedBehavior === "returnNull") {
      return null;
    }
    
    throw new Error('Not authenticated');
  };
