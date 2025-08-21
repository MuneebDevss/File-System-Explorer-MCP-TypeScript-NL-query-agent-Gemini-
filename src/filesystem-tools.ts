import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

export interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: Date;
}

export interface ListFilesResult {
  entries: FileEntry[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

export interface FileInfo {
  isDir: boolean;
  size: number;
  mtime: Date;
  mode: number;
}

export interface ReadFileResult {
  content?: string;
  error?: 'file_too_large' | 'binary_file' | 'not_found' | 'permission_denied';
  size: number;
}

export interface SearchResult {
  matches: Array<{
    path: string;
    name: string;
    isDir: boolean;
    size: number;
    mtime: Date;
  }>;
  totalMatches: number;
}

export class FilesystemTools {
  private rootDir: string;
  private readonly MAX_FILE_SIZE = 200 * 1024; // 200KB

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  async list_files(
    dir: string = '.',
    page: number = 1,
    limit: number = 50
  ): Promise<ListFilesResult> {
    try {
      const targetDir = path.resolve(this.rootDir, dir);
      
      // Security check
      if (!this.isWithinRootDir(targetDir)) {
        throw new Error('Directory access denied: outside root directory');
      }

      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      
      // Convert to FileEntry objects
      const fileEntries: FileEntry[] = [];
      
      for (const entry of entries) {
        try {
          const fullPath = path.join(targetDir, entry.name);
          const stats = await fs.stat(fullPath);
          
          fileEntries.push({
            name: entry.name,
            isDir: entry.isDirectory(),
            size: stats.size,
            mtime: stats.mtime
          });
        } catch (error) {
          // Skip entries that can't be accessed
          logger.warn('Could not access file entry', { 
            name: entry.name, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Sort by type (directories first) then by name
      fileEntries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedEntries = fileEntries.slice(startIndex, endIndex);

      return {
        entries: paginatedEntries,
        totalCount: fileEntries.length,
        page,
        hasMore: endIndex < fileEntries.length
      };

    } catch (error) {
      logger.error('list_files failed', { dir, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  async read_file(
    filePath: string,
    maxBytes: number = this.MAX_FILE_SIZE
  ): Promise<ReadFileResult> {
    try {
      const targetPath = path.resolve(this.rootDir, filePath);
      
      // Security check
      if (!this.isWithinRootDir(targetPath)) {
        throw new Error('File access denied: outside root directory');
      }

      // Check if file exists and get stats
      let stats;
      try {
        stats = await fs.stat(targetPath);
      } catch (error) {
        return { error: 'not_found', size: 0 };
      }

      // Check if it's a directory
      if (stats.isDirectory()) {
        throw new Error('Cannot read directory as file');
      }

      // Check file size
      if (stats.size > maxBytes) {
        return { error: 'file_too_large', size: stats.size };
      }

      // Read file content
      const buffer = await fs.readFile(targetPath);
      
      // Check if file is binary (simple heuristic)
      if (this.isBinaryFile(buffer)) {
        return { error: 'binary_file', size: stats.size };
      }

      // Convert to string
      const content = buffer.toString('utf8');

      return {
        content,
        size: stats.size
      };

    } catch (error) {
      if (error instanceof Error && error.message.includes('permission denied')) {
        return { error: 'permission_denied', size: 0 };
      }
      
      logger.error('read_file failed', { 
        filePath, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async search_files(
    directory: string = '.',
    query: string,
    depth: number = 3,
    limit: number = 20
  ): Promise<SearchResult> {
    try {
      const searchDir = path.resolve(this.rootDir, directory);
      
      // Security check
      if (!this.isWithinRootDir(searchDir)) {
        throw new Error('Directory access denied: outside root directory');
      }

      const matches: SearchResult['matches'] = [];
      const searchPattern = query.toLowerCase();

      await this.searchRecursive(searchDir, searchPattern, matches, depth, limit);

      return {
        matches: matches.slice(0, limit),
        totalMatches: matches.length
      };

    } catch (error) {
      logger.error('search_files failed', { 
        directory, 
        query, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async get_file_info(filePath: string): Promise<FileInfo> {
    try {
      const targetPath = path.resolve(this.rootDir, filePath);
      
      // Security check
      if (!this.isWithinRootDir(targetPath)) {
        throw new Error('File access denied: outside root directory');
      }

      const stats = await fs.stat(targetPath);

      return {
        isDir: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime,
        mode: stats.mode
      };

    } catch (error) {
      logger.error('get_file_info failed', { 
        filePath, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  private async searchRecursive(
    dir: string,
    pattern: string,
    matches: SearchResult['matches'],
    remainingDepth: number,
    limit: number
  ): Promise<void> {
    if (remainingDepth <= 0 || matches.length >= limit) {
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= limit) break;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.rootDir, fullPath);

        // Check if name matches pattern
        if (entry.name.toLowerCase().includes(pattern)) {
          try {
            const stats = await fs.stat(fullPath);
            matches.push({
              path: relativePath,
              name: entry.name,
              isDir: entry.isDirectory(),
              size: stats.size,
              mtime: stats.mtime
            });
          } catch (error) {
            // Skip files that can't be accessed
            continue;
          }
        }

        // Recursively search subdirectories
        if (entry.isDirectory() && remainingDepth > 1) {
          await this.searchRecursive(
            fullPath,
            pattern,
            matches,
            remainingDepth - 1,
            limit
          );
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
      logger.warn('Could not search directory', { 
        dir, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private isBinaryFile(buffer: Buffer): boolean {
    // Simple heuristic: if more than 1% of bytes are null or non-printable, consider it binary
    let nonPrintableCount = 0;
    const sampleSize = Math.min(buffer.length, 1024); // Check first 1KB

    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];
      if (typeof byte === 'number' && (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13))) {
        nonPrintableCount++;
      }
    }

    return (nonPrintableCount / sampleSize) > 0.01;
  }

  private isWithinRootDir(targetPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedRoot = path.resolve(this.rootDir);
    
    return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
  }
}