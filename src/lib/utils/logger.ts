import winston from 'winston'
import { $ } from 'zx-cjs'

export type Logger = winston.Logger

export const levels = ['error', 'warn', 'info', 'verbose', 'debug']
let logger: Logger

function createLogger(level: string) {
  const timestampFormat = 'HH:mm:ss.SSS'
  return winston.createLogger({
    level: level,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: timestampFormat
      }),
      winston.format.splat(),
      winston.format.simple(),
      winston.format.printf(
        (info) =>
          `[${info.timestamp} ${info.level}]: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : ' ')
      )
    ),
    transports: new winston.transports.Console({
      stderrLevels: levels
    })
  })
}

export function getLogger(level: string = 'info'): Logger {
  if (logger) return logger
  logger = createLogger(level)
  return logger
}

export function getTestingLogger(): Logger {
  const level: any = process.env.TEST_LOG_LEVEL ?? 'verbose'
  $.verbose = level === 'verbose'
  return getLogger(level)
}
