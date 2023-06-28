import test from 'ava'
import { addressify } from '../ethers'
import * as utils from './index'

test('url resolution with port only', (t) => {
  const verifyAddress = (addr: string) => {
    const url = utils.UrlResolver.fromAddress(addr)
    t.is(url.full('http', 'localhost'), 'http://localhost:1234')
    t.is(url.full('tcp', '0.0.0.0'), 'tcp://0.0.0.0:1234')
    t.is(url.hostPort(), '127.0.0.1:1234')
    t.is(url.hostPort('localhost'), 'localhost:1234')
  }
  verifyAddress('1234')
  verifyAddress(':1234')
})

test('url resolution with host/port', (t) => {
  const verifyAddress = (addr: string) => {
    const url = utils.UrlResolver.fromAddress(addr)
    t.is(url.full('http', 'mydomain.com'), 'http://8.8.8.8:1234')
    t.is(url.hostPort(), '8.8.8.8:1234')
    t.is(url.hostPort('localhost'), '8.8.8.8:1234')
  }
  verifyAddress('8.8.8.8:1234')
})

test('addressify', (t) => {
  const addr = '0x37FA111284FBF97318CBe05C37fEC69071Dd4965'
  t.is(addr, addressify(addr))
  t.is(addr, addressify(addr.toLowerCase()))
  // the .toUpperCase() converts the address to '0X...' which isn't a valid address any more
  t.is(addr.toUpperCase(), addressify(addr.toUpperCase()))
  t.is(addr, addressify(addr.toUpperCase().replace('X', 'x')))
  t.is('fooaddr', addressify('fooaddr'))
})
