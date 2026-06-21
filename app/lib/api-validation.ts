/**
 * Centralized input validation utilities for API routes
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== "string") {
    return { valid: false, error: "Email must be a string" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }
  if (email.length > 255) {
    return { valid: false, error: "Email too long" };
  }
  return { valid: true };
}

export function validateString(value: unknown, fieldName: string, minLength = 1, maxLength = 1000): ValidationResult {
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.length < minLength) {
    return { valid: false, error: `${fieldName} must be at least ${minLength} characters` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} must be at most ${maxLength} characters` };
  }
  return { valid: true };
}

export function validateNumber(value: unknown, fieldName: string, min = 0, max?: number): ValidationResult {
  if (typeof value !== "number") {
    return { valid: false, error: `${fieldName} must be a number` };
  }
  if (isNaN(value)) {
    return { valid: false, error: `${fieldName} must be a valid number` };
  }
  if (value < min) {
    return { valid: false, error: `${fieldName} must be at least ${min}` };
  }
  if (max !== undefined && value > max) {
    return { valid: false, error: `${fieldName} must be at most ${max}` };
  }
  return { valid: true };
}

export function validateId(value: unknown, fieldName: string): ValidationResult {
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }
  if (value.length > 100) {
    return { valid: false, error: `${fieldName} too long` };
  }
  return { valid: true };
}

export function validateUrl(value: unknown, fieldName: string): ValidationResult {
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.length === 0) {
    return { valid: true }; // Optional URL
  }
  try {
    new URL(value);
    if (value.length > 2048) {
      return { valid: false, error: `${fieldName} too long` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `${fieldName} must be a valid URL` };
  }
}

export function validateArray(value: unknown, fieldName: string, maxLength = 100): ValidationResult {
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} cannot exceed ${maxLength} items` };
  }
  return { valid: true };
}

export function validateEnum<T extends string>(value: unknown, allowedValues: readonly T[], fieldName: string): ValidationResult {
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (!allowedValues.includes(value as T)) {
    return { valid: false, error: `${fieldName} must be one of: ${allowedValues.join(", ")}` };
  }
  return { valid: true };
}

export function sanitizeString(value: string): string {
  return value.trim().slice(0, 1000);
}

export function sanitizeHtml(value: string): string {
  // Basic HTML sanitization - remove script tags and dangerous attributes
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .slice(0, 10000);
}
