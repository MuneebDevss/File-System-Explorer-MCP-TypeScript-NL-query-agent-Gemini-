import { sanitizeForLog } from './security.js';
import dotenv from 'dotenv';
dotenv.config();
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  service: string;
}

class Logger {
  private logLevel: LogLevel;
  private service: string;

  constructor(service: string = 'mcp-server', logLevel: LogLevel = 'info') {
    this.service = service;
    this.logLevel = logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    return levels[level] >= levels[this.logLevel];
  }

  private formatLog(level: LogLevel, message: string, data?: any): string {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      ...(data && { data: sanitizeForLog(data) })
    };

    return JSON.stringify(logEntry);
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatLog('debug', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.log(this.formatLog('info', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog('warn', message, data));
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatLog('error', message, data));
    }
  }
}

export const logger = new Logger('mcp-filesystem-server', 
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);