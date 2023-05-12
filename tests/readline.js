import * as readline from 'readline'
import * as fs from 'fs'
import * as utils from '../dist/lib/utils/index.js'

async function readAFile() {
  const file = '/tmp/test-chainsets/run-20220621182004-bt4x5vuinjl/bsc/stderr'
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    terminal: false
  })

  rl.once('close', () => console.log('file close'))

  const subscribe = async () => {
    let count = 0

    const onLine = async (line) => {
      // rl.on('line', (line) => {
      count++

      rl.resume()
      console.log(line)
      rl.pause()
      await utils.sleep(1000)
      if (count === 2) {
        rl.once('line', async (line) => {
          console.log('==================== one time readline start')
          await utils.sleep(2000)
          console.log('==================== one time readline end')
          console.log(line)
        })
      }
      if (count === 5) removeOnLine()
    }

    const removeOnLine = () => rl.removeListener('line', onLine)

    rl.on('line', onLine)
  }

  rl.pause()
  await utils.sleep(1000)
  rl.resume()
  subscribe()
  // process.nextTick(subscribe)

  // await Promise.all([utils.sleep(3000), subscribe()])

  return new Promise((resolve) => {
    // rl.once('line', console.log)
    resolve('done')
  })
}

async function main() {
  console.log(await readAFile())
}

main()
