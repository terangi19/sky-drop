import * as Sentry from '@sentry/nextjs';

export class ApiError extends Error {
  status: number;
  code: string;
  
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  LISTING_UNAVAILABLE: 'LISTING_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export function unauthorized(message: string = 'Unauthorized') {
  return new ApiError(401, ERROR_CODES.UNAUTHORIZED, message);
}

export function forbidden(message: string = 'Access denied') {
  return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
}

export function notFound(message: string = 'Resource not found') {
  return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
}

export function badRequest(message: string = 'Invalid request') {
  return new ApiError(400, ERROR_CODES.INVALID_INPUT, message);
}

export function rateLimited(message: string = 'Too many requests') {
  return new ApiError(429, ERROR_CODES.RATE_LIMITED, message);
}

export function serverError(message: string = 'Internal server error') {
  return new ApiError(500, ERROR_CODES.SERVER_ERROR, message);
}

export function handleApiError(error: unknown): { error: string; code?: string; status: number } {
  if (error instanceof ApiError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  
  if (error instanceof Error) {
    // Log the actual error server-side for debugging
    console.error('[API Error]', error);
    
    // Send to Sentry if configured
    Sentry.captureException(error);
    
    return { error: 'An error occurred', code: ERROR_CODES.SERVER_ERROR, status: 500 };
  }
  
  return { error: 'An unexpected error occurred', code: ERROR_CODES.SERVER_ERROR, status: 500 };
}

/**
 * Helper function to capture API errors with context
 */
export function captureApiError(error: unknown, context: Record<string, unknown>): void {
  Sentry.captureException(error, {
    extra: context,
    tags: {
      error_source: 'api',
    },
  });
}
