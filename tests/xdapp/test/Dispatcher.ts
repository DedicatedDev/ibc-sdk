import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { describe, it } from 'mocha'
import { ethers } from 'hardhat'
import { expect } from 'chai'

describe('Client contract', function () {
  async function setupFixture() {
    // Get the ContractFactory and Signers here.
    const Dispatcher = await ethers.getContractFactory('Dispatcher')
    const Verifier = await ethers.getContractFactory('Verifier')
    const Mars = await ethers.getContractFactory('Mars')

    const signers = await ethers.getSigners()
    const accounts = { owner: signers[0], user1: signers[1], user2: signers[2], otherUsers: signers.slice(3) }

    // Deploy Verifier and CoreSC contracts by owner
    const verifier = await Verifier.deploy()
    const dispatcher = await Dispatcher.deploy(verifier.address)

    // Deploy Mars contract by user1
    const mars = await Mars.connect(accounts.user1).deploy()

    // Set up Polymer light client on CoreSC
    const clientState = ethers.utils.formatBytes32String('clientState')
    const consensusState = ethers.utils.formatBytes32String('consensusState')
    await dispatcher.createClient(clientState, consensusState)

    return { accounts, verifier, dispatcher, mars, clientState, consensusState }
  }

  describe('createClient', function () {
    it('should create a new client', async function () {
      const { dispatcher } = await loadFixture(setupFixture)
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(ethers.utils.formatBytes32String('consensusState'))
    })

    it('cannot create call creatClient twice', async function () {
      const { dispatcher, clientState, consensusState } = await loadFixture(setupFixture)
      await expect(dispatcher.createClient(clientState, consensusState)).to.be.revertedWith('Client already created')
    })
  })

  describe('updateClient', function () {
    it('should update the consensus state of an existing client', async function () {
      const { dispatcher } = await loadFixture(setupFixture)

      const updatedConsensusState = ethers.utils.formatBytes32String('updatedConsensusState')
      await dispatcher.updateClient(updatedConsensusState)
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(updatedConsensusState)
    })
  })

  describe('openIbcChannel', function () {
    it('should emit OpenIbcChannel event', async function () {
      const {
        dispatcher,
        accounts: { owner }
      } = await loadFixture(setupFixture)
      const connectionId = 'connection-id'
      const counterPartyConnectionId = 'counterparty-connection-id'
      const counterPartyPortId = 'counterparty-port-id'
      const order = 0
      const version = '1.0'

      await expect(
        dispatcher.openIbcChannel(connectionId, counterPartyConnectionId, counterPartyPortId, order, version)
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(connectionId, owner.address, counterPartyConnectionId, counterPartyPortId, version)
    })
  })

  describe('onOpenIbcChannel', function () {
    it("calls the receiver's onOpenIbcChannel method", async () => {
      const { dispatcher, mars } = await loadFixture(setupFixture)
      const channelId = 'channelId'
      const version = '1.0.0'
      const proof = {
        keyPath: ethers.utils.toUtf8Bytes('key'),
        value: ethers.utils.toUtf8Bytes('value'),
        proof: ethers.utils.toUtf8Bytes('proof')
      }
      const error = ''
      await dispatcher.onOpenIbcChannel(mars.address, channelId, version, proof, error)
      expect(await mars.openChannels(0)).to.equal(channelId)
    })
  })
})
