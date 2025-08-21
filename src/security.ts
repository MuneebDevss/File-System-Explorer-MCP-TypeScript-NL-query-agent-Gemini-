import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * Validates API token using secure comparison
 */
export function validateApiToken(providedToken: string, expectedToken: string): boolean {
  if (!providedToken || !expectedToken) {
    return false;
  }

  try {
    // Use crypto.timingSafeEqual to prevent timing attacks
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');
    
    // Ensure buffers are the same length
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    logger.warn('Token validation error', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return false;
  }
}

/**
 * Sanitizes a file path to prevent directory traversal attacks
 */
export function sanitizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path input');
  }

  // Remove any null bytes
  const cleanPath = inputPath.replace(/\0/g, '');
  
  // Normalize the path to resolve .. and . components
  const normalized = path.normalize(cleanPath);
  
  // Remove leading slash to make it relative
  const relative = normalized.startsWith('/') ? normalized.substring(1) : normalized;
  
  // Additional security checks
  if (relative.includes('\0')) {
    throw new Error('Path contains null bytes');
  }
  
  if (relative.startsWith('..')) {
    throw new Error('Path attempts to access parent directories');
  }

  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,          // Directory traversal
    /\/\//,          // Double slashes
    /\\/,            // Backslashes (Windows-style)
    /\0/,            // Null bytes
    /[<>:"|*?]/,     // Invalid filename characters
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(cleanPath)) {
      logger.warn('Suspicious path detected', { 
        originalPath: inputPath,
        cleanedPath: cleanPath,
        pattern: pattern.toString()
      });
    }
  }

  return relative;
}

/**
 * Checks if a resolved path is within the allowed root directory
 */
export function isWithinRootDir(rootDir: string, targetPath: string): boolean {
  try {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedTarget = path.resolve(rootDir, targetPath);
    
    // The target must be within or equal to the root directory
    const isWithin = resolvedTarget.startsWith(resolvedRoot + path.sep) || 
                     resolvedTarget === resolvedRoot;

    if (!isWithin) {
      logger.warn('Path outside root directory detected', {
        rootDir: resolvedRoot,
        targetPath: resolvedTarget,
        inputPath: targetPath
      });
    }

    return isWithin;
  } catch (error) {
    logger.error('Path validation error', { 
      rootDir,
      targetPath,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Rate limiting utility (simple in-memory implementation)
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Clean up old entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing requests for this identifier
    let requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if under limit
    if (requests.length >= this.maxRequests) {
      logger.warn('Rate limit exceeded', { identifier, requestCount: requests.length });
      return false;
    }
    
    // Add current request
    requests.push(now);
    this.requests.set(identifier, requests);
    
    return true;
  }

  private cleanup() {
    const cutoff = Date.now() - this.windowMs * 2; // Keep extra buffer
    
    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > cutoff);
      
      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Input validation utilities
 */
export class InputValidator {
  static isValidFileName(filename: string): boolean {
    if (!filename || typeof filename !== 'string') {
      return false;
    }
    
    // Check length
    if (filename.length > 255) {
      return false;
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"|*?\0]/;
    if (invalidChars.test(filename)) {
      return false;
    }
    
    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(filename)) {
      return false;
    }
    
    return true;
  }

  static isValidDirectoryPath(dirPath: string): boolean {
    if (!dirPath || typeof dirPath !== 'string') {
      return false;
    }
    
    // Check length
    if (dirPath.length > 4096) {
      return false;
    }
    
    // Must be relative path
    if (path.isAbsolute(dirPath)) {
      return false;
    }
    
    // No directory traversal
    if (dirPath.includes('..')) {
      return false;
    }
    
    return true;
  }

  static isValidSearchQuery(query: string): boolean {
    if (!query || typeof query !== 'string') {
      return false;
    }
    
    // Check length
    if (query.length > 100) {
      return false;
    }
    
    // Basic sanitization - no special regex chars that could cause issues
    const dangerousChars = /[{}()*+?.\\^$|]/;
    if (dangerousChars.test(query)) {
      return false;
    }
    
    return true;
  }
}

/**
 * Sanitize data for logging to prevent log injection
 */
export function sanitizeForLog(data: any): any {
  if (typeof data === 'string') {
    return data.replace(/[\r\n\t]/g, ' ').substring(0, 1000);
  }
  
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeForLog(value);
    }
    return sanitized;
  }
  
  return data;
}