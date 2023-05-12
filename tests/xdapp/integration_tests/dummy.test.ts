// npx hardhat test --no-compile integration_tests/dummy.test.ts

import assert from 'assert'
import { describe, it } from 'mocha'

describe('dummy tests', function () {
  describe('test1', function () {
    it('should do basic calc', function () {
      assert.equal(2 + 40, 42)
      console.log(`this is an console msg`)
      assert.equal(2 + 40, 0, 'oops, this is an error')
    })
  })
})
