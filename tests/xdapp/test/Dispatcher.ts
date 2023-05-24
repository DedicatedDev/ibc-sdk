import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { describe, it } from 'mocha'
import { ethers } from 'hardhat'
import { expect } from 'chai'

const toBytes32 = ethers.utils.formatBytes32String

describe('IBC Core Smart Contract', function () {
  /**
   * @description Deploy IBC Core SC and verifier contract
   */
  async function deployIbcCoreFixture() {
    // Get the ContractFactory and Signers here.
    const Dispatcher = await ethers.getContractFactory('Dispatcher')
    const Verifier = await ethers.getContractFactory('Verifier')

    const signers = await ethers.getSigners()
    const accounts = { owner: signers[0], user1: signers[1], user2: signers[2], otherUsers: signers.slice(3) }

    // Deploy Verifier and CoreSC contracts by owner
    const verifier = await Verifier.deploy()
    const dispatcher = await Dispatcher.deploy(verifier.address)

    return { accounts, verifier, dispatcher }
  }

  /**
   * @description Deploy IBC Core SC and verifier contract, create Polymer client and deploy a dApp Mars contract as an IBC-enabled contract
   */
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
    const clientState = toBytes32('clientState')
    const consensusState = toBytes32('consensusState')
    await dispatcher.createClient(clientState, consensusState)

    return { accounts, verifier, dispatcher, mars, clientState, consensusState }
  }

  describe('createClient', function () {
    it('only owner can create a new client', async function () {
      const { accounts, dispatcher } = await loadFixture(deployIbcCoreFixture)

      await expect(
        dispatcher.connect(accounts.user1).createClient(toBytes32('clientState'), toBytes32('consensusState'))
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should create a new client', async function () {
      const { dispatcher } = await loadFixture(setupFixture)
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(toBytes32('consensusState'))
    })

    it('cannot create call creatClient twice', async function () {
      const { dispatcher, clientState, consensusState } = await loadFixture(setupFixture)
      await expect(dispatcher.createClient(clientState, consensusState)).to.be.revertedWith('Client already created')
    })
  })

  describe('updateClient', function () {
    it('should update the consensus state of an existing client', async function () {
      const { dispatcher } = await loadFixture(setupFixture)

      const updatedConsensusState = toBytes32('updatedConsensusState')
      await dispatcher.updateClient(updatedConsensusState)
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(updatedConsensusState)
    })
  })

  describe('openIbcChannel', function () {
    it('ChanOpenInit', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      const connHops = ['connection-0', 'connection-2']
      const counterpartyPortId = 'bsc.polyibc.9876543210'
      const order = 0
      const version = toBytes32('1.0')
      const newChannelId = toBytes32('channel-0')
      const counterpartyChannelId = toBytes32('')

      await expect(
        dispatcher
          .connect(accounts.otherUsers[0])
          .openIbcChannel(mars.address, version, order, connHops, counterpartyChannelId, counterpartyPortId, version)
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(
          mars.address,
          newChannelId,
          counterpartyChannelId,
          version,
          order,
          connHops,
          counterpartyPortId,
          version
        )
    })

    it('ChanOpenTry', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      const connHops = ['connection-1', 'connection-3']
      const counterpartyPortId = 'bsc.polyibc.9876543210'
      const order = 0
      const version = toBytes32('1.0')
      const newChannelId = toBytes32('channel-0')
      const counterpartyChannelId = toBytes32('channel-123')

      await expect(
        dispatcher
          .connect(accounts.otherUsers[0])
          .openIbcChannel(mars.address, version, order, connHops, counterpartyChannelId, counterpartyPortId, version)
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(
          mars.address,
          newChannelId,
          counterpartyChannelId,
          version,
          order,
          connHops,
          counterpartyPortId,
          version
        )
    })

    it('unsupported version', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)
      const connHops = ['connection-1', 'connection-3']

      await expect(
        dispatcher
          .connect(accounts.otherUsers[0])
          .openIbcChannel(
            mars.address,
            toBytes32('unknown-version'),
            0,
            connHops,
            toBytes32('channel-123'),
            'bsc.polyibc.9876543210',
            toBytes32('1.0')
          )
      ).to.be.revertedWith('Unsupported version')
    })

    it('onOpenIbcChannel callback error', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)
      const connHops = ['connection-1', 'connection-3']

      await expect(
        dispatcher
          .connect(accounts.otherUsers[0])
          .openIbcChannel(
            mars.address,
            toBytes32('1.0'),
            0,
            connHops,
            toBytes32('channel-123'),
            'portX',
            toBytes32('1.0')
          )
      ).to.be.revertedWith('Invalid counterpartyPortId')
    })
  })
})
