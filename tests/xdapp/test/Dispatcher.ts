import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { describe, it } from 'mocha'
import { ethers } from 'hardhat'
import { expect } from 'chai'

describe('Client contract', function () {
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
    const clientState = ethers.utils.formatBytes32String('clientState')
    const consensusState = ethers.utils.formatBytes32String('consensusState')
    await dispatcher.createClient(clientState, consensusState)

    return { accounts, verifier, dispatcher, mars, clientState, consensusState }
  }

  describe('createClient', function () {
    it('only owner can create a new client', async function () {
      const { accounts, dispatcher } = await loadFixture(deployIbcCoreFixture)
      const clientState = ethers.utils.formatBytes32String('clientState')
      const consensusState = ethers.utils.formatBytes32String('consensusState')

      await expect(dispatcher.connect(accounts.user1).createClient(clientState, consensusState)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

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
      const { dispatcher, mars } = await loadFixture(setupFixture)

      const connHops = ['connection-0', 'connection-1']
      const counterpartyPortId = 'bsc.polyibc.9876543210'
      const order = 0
      const version = '1.0'
      const counterpartyChannelId = ethers.utils.formatBytes32String('')

      await expect(
        dispatcher.openIbcChannel(
          mars.address,
          version,
          order,
          connHops,
          counterpartyChannelId,
          counterpartyPortId,
          version
        )
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(mars.address, counterpartyChannelId, version, order, connHops, counterpartyPortId, version)
    })
  })
})
