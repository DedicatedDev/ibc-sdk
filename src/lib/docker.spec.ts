import test from 'ava'

import { newContainer } from './docker'
import { $ } from 'zx-cjs'
import { getTestingLogger } from './utils/logger'

const log = getTestingLogger()

test('running container in background and exec cmds later', async (t) => {
  const container = await newContainer({
    args: ['sh'],
    imageRepoTag: 'busybox',
    detach: true,
    tty: true
  })
  t.truthy(container.containerId)
  log.verbose(`container id: ${container.containerId}`)
  const ip = await container.getIPAddress()
  t.truthy(ip)
  log.verbose(`container ip: ${ip}`)

  const out = await container.exec(['wc', '-l'])
  t.deepEqual(out.stdout.trim(), '0')

  // stop running container
  await $`docker container stop ${container.containerId}`
})
