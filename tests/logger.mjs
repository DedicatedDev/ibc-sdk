import path from 'path'
import winston from 'winston'
import { fs } from 'zx-cjs'
import { createLogger, sleep } from '../dist/lib/utils/index.js'

export function testLogger(opts) {
  /**
   *
   * @param {LoggerConfig} config
   */
  function runLogger(config, wd) {
    const logger = createLogger(config, wd)
    for (const level of ['debug', 'verbose', 'info', 'warn', 'error']) {
      logger.log(level, `MSG of level ${level}`)
      // logger.log(level, { message: `MSG of level ${level}`, tag: level })
    }
    console.log()
  }

  runLogger({ Level: 'info' })
  runLogger({ Level: 'info', Transports: '-' }, '/tmp/test-log')
  runLogger(
    {
      Level: 'info',
      Transports: ['subidr/log', { FileName: '-', Level: 'verbose' }]
    },
    '/tmp/test-log'
  )
  runLogger(
    {
      Level: 'info',
      Colorize: true,
      Transports: [{ FileName: '-', Level: 'debug' }, '/tmp/test-log/log4']
    },
    '/tmp/abc-nonexistent'
  )
}

const testDir = '/tmp/test-async-logger'
if (!fs.existsSync(testDir)) {
  fs.mkdirpSync(testDir)
}

export async function testAsyncLogger() {
  if (!fs.existsSync(testDir)) {
    fs.mkdirpSync(testDir)
  }
  const rootLogger = createLogger({
    Level: 'debug',
    Transports: ['-', { FileName: path.join(testDir, 'root.log'), Level: 'info' }]
  })
  const batches = [1, 2, 3, 4, 5].map(async (batch) => {
    const loggerFile = path.join(testDir, `batch-${batch}.log`)
    console.log(loggerFile)

    const logger = createBatchLogger(rootLogger, batch)

    logger.info(`=> Start Batch-${batch} \t${logger.transports[0].filename}`)

    const promises = [1, 2, 3, 4, 5].map(async (i) => {
      const result = i * 10
      await sleep((Math.random() + 1) * 1000)
      logger.verbose(`Batch-${batch} ${i} * 10 = ${result}`)
      return result
    })

    const results = await Promise.all(promises)
    logger.info(`=> all results Batch-${batch} ${results.join(' ')}\t${logger.transports[0].filename}`)
    await Promise.all(promises)
  })

  await Promise.all(batches)
  rootLogger.info('all tasks finished')
}

const createBatchLogger = (rootLogger, batch) => {
  return createLogger({
    Level: rootLogger.level,
    Transports: [{ FileName: path.join(testDir, `batch-${batch}.log`), Level: 'info' }, '-']
  })
}

async function main() {
  // testLogger()
  testAsyncLogger()
}

main()
