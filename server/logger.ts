import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  [key: string]: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = process.env.LOG_LEVEL as LogLevel || 'info';
const isDev = process.env.NODE_ENV === 'development';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level: LogLevel, context: LogContext, message: string): string {
  const timestamp = new Date().toISOString();
  const requestId = context.requestId || '-';
  
  if (isDev) {
    const levelColors: Record<LogLevel, string> = {
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    const color = levelColors[level];
    
    const contextStr = Object.entries(context)
      .filter(([k]) => !['requestId'].includes(k))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    
    return `${color}${level.toUpperCase().padEnd(5)}${reset} [${requestId.slice(0, 8)}] ${message} ${contextStr}`;
  }
  
  return JSON.stringify({
    timestamp,
    level,
    requestId,
    message,
    ...context,
  });
}

export const logger = {
  debug(context: LogContext, message: string) {
    if (shouldLog('debug')) {
      console.debug(formatLog('debug', context, message));
    }
  },
  
  info(context: LogContext, message: string) {
    if (shouldLog('info')) {
      console.info(formatLog('info', context, message));
    }
  },
  
  warn(context: LogContext, message: string) {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', context, message));
    }
  },
  
  error(context: LogContext, message: string) {
    if (shouldLog('error')) {
      console.error(formatLog('error', context, message));
    }
  },
};

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  const start = Date.now();
  
  req.requestId = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[level](
      {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userId: req.userId,
      },
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });
  
  next();
}

export function devLog(category: string, message: string, data?: any) {
  if (isDev) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${timestamp} [\x1b[35m${category}\x1b[0m] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}
