import winston from 'winston';

// Define log levels with colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(logColors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message }) => {
    // Only output the timestamp, level, and message - no metadata
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Determine log level from environment
let logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create logger instance with console-only logging
const logger = winston.createLogger({
  levels: logLevels,
  level: logLevel,
  defaultMeta: { service: 'scoutarr' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

export default logger;

// Helper utility for consistent structured logging across the app
export function startOperation(name: string, meta: Record<string, unknown> = {}) {
  const startTime = Date.now();
  logger.info(`▶️ START ${name}`, { ...meta, operation: name, phase: 'start', ts: new Date().toISOString() });
  return (resultMeta: Record<string, unknown> = {}, success = true) => {
    const duration = Date.now() - startTime;
    const level = success ? 'info' : 'error';
    logger.log(level, `◀️ END ${name}`, { ...meta, ...resultMeta, operation: name, phase: 'end', durationMs: duration, ts: new Date().toISOString() });
  };
}

