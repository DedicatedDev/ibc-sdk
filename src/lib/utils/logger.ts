import path from 'path'
import winston from 'winston'
import { z } from 'zod'

export type Logger = winston.Logger

const logLevel = z.enum(['debug', 'verbose', 'info', 'warn', 'error'])
export type logLevel = z.infer<typeof logLevel>

const transport = z.union([
  z.string().min(1),
  z.object({
    FileName: z.string().min(1),
    Level: logLevel
  })
])

export const loggerSchema = z.object({
  Level: logLevel,
  Colorize: z.boolean().nullish().default(false),
  Transports: z
    .union([z.array(transport), z.string().min(1)])
    .nullish()
    .default('-')
})

// use z.input so caller of createLogger can omit optional properties
export type LoggerConfig = z.input<typeof loggerSchema>

const utcFormatter = winston.format((info) => {
  info.timestamp = new Date().toISOString()
  return info
})

export function createLogger(
  loggerConfigObj: LoggerConfig,
  wd: string | undefined = undefined
): Logger {
  const parsed = loggerSchema.parse(loggerConfigObj)
  if (wd !== undefined && typeof wd !== 'string') {
    throw new Error(
      `wd if provided must be a string as the working dir, but got ${wd}`
    )
  }

  const getPath =
    wd === undefined
      ? (p: string) => path.normalize(p)
      : (p: string) =>
          path.isAbsolute(p)
            ? path.normalize(p)
            : path.normalize(path.join(wd, p))

  const newLeveledTransport = (name, level) => {
    return name === '-'
      ? new winston.transports.Console({ level })
      : new winston.transports.File({ filename: getPath(name), level: level })
  }
  const newTransport = (name) => {
    return name === '-'
      ? new winston.transports.Console()
      : new winston.transports.File({ filename: getPath(name) })
  }
  const transports =
    typeof parsed.Transports !== 'string'
      ? parsed.Transports!.map((t) => {
          return typeof t === 'string'
            ? newTransport(t)
            : newLeveledTransport(t.FileName, t.Level)
        })
      : newTransport(parsed.Transports)
  const formats: winston.Logform.Format[] = parsed.Colorize
    ? [winston.format.colorize()]
    : []
  formats.push(
    utcFormatter(),
    winston.format.simple(),
    winston.format.printf(
      (info) => `[${info.timestamp}] ${info.level}\t${info.message}`
    )
  )
  return winston.createLogger({
    level: parsed.Level,
    format: winston.format.combine(...formats),
    transports: transports
  })
}
