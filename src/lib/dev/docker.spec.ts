import test from 'ava'

import { newContainer } from './docker'
import * as utils from '../utils'
import { $ } from 'zx-cjs'

test('running container in background and exec cmds later', async (t) => {
  const logger = utils.createLogger({ Level: 'debug' })
  const container = await newContainer(
    {
      args: ['sh'],
      imageRepoTag: 'busybox',
      detach: true,
      tty: true
    },
    logger
  )
  t.truthy(container.containerId)
  logger.verbose(`container id: ${container.containerId}`)
  const ip = await container.getIPAddress()
  t.truthy(ip)
  logger.verbose(`container ip: ${ip}`)

  const out = await container.exec(['wc', '-l'])
  t.deepEqual(out.stdout.trim(), '0')

  // stop running container
  await $`docker container stop ${container.containerId}`
})
