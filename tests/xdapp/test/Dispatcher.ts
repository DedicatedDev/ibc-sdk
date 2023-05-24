import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { describe, it } from 'mocha'
import { ethers } from 'hardhat'
import { expect } from 'chai'

const toBytes32 = ethers.utils.formatBytes32String

describe('IBC Core Smart Contract', function () {
  // Constants for testing
  const C = {
    ClientState: toBytes32('clientState'),
    ConsensusStates: ['consState1', 'consState2', 'consState3'].map(toBytes32),
    ConnHops1: ['connection-0', 'connection-2'],
    ConnHops2: ['connection-1', 'connection-3'],
    EmptyVersion: toBytes32(''),
    V1: toBytes32('1.0'),
    V2: toBytes32('2.0'),
    Unordered: 0,
    Ordered: 1,
    InvalidProof: { proofHeight: 42, proof: ethers.utils.toUtf8Bytes('') },
    ValidProof: { proofHeight: 42, proof: ethers.utils.toUtf8Bytes('valid proof') },
    ChannelIds: ['channel-0', 'channel-1'].map(toBytes32),
    RemoteChannelIds: ['channel-100', 'channel-101'].map(toBytes32),
    EmptyChannelId: toBytes32(''),
    BscPortId: toBytes32('bsc.polyibc.9876543210')
  }

  /**
   * @description Deploy IBC Core SC and verifier contract
   */
  async function deployIbcCoreFixture() {
    // Get the ContractFactory and Signers here.
    const Dispatcher = await ethers.getContractFactory('Dispatcher')
    const Verifier = await ethers.getContractFactory('Verifier')

    const signers = await ethers.getSigners()
    const accounts = {
      owner: signers[0],
      user1: signers[1],
      user2: signers[2],
      relayer: signers[3],
      otherUsers: signers.slice(4)
    }

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
    const accounts = {
      owner: signers[0],
      user1: signers[1],
      user2: signers[2],
      relayer: signers[3],
      otherUsers: signers.slice(4)
    }
    // Deploy Verifier and CoreSC contracts by owner
    const verifier = await Verifier.deploy()
    const dispatcher = await Dispatcher.deploy(verifier.address)

    // Deploy Mars contract by user1
    const mars = await Mars.connect(accounts.user1).deploy()

    // Set up Polymer light client on CoreSC
    await dispatcher.createClient(C.ClientState, C.ConsensusStates[0])

    return { accounts, verifier, dispatcher, mars }
  }

  describe('createClient', function () {
    it('only owner can create a new client', async function () {
      const { accounts, dispatcher } = await loadFixture(deployIbcCoreFixture)

      await expect(
        dispatcher.connect(accounts.user1).createClient(C.ClientState, C.ConsensusStates[0])
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should create a new client', async function () {
      const { dispatcher } = await loadFixture(setupFixture)
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(C.ConsensusStates[0])
    })

    it('cannot create call creatClient twice', async function () {
      const { dispatcher } = await loadFixture(setupFixture)
      await expect(dispatcher.createClient(C.ClientState, C.ConsensusStates[1])).to.be.revertedWith(
        'Client already created'
      )
    })
  })

  describe('updateClient', function () {
    it('should update the consensus state of an existing client', async function () {
      const { dispatcher } = await loadFixture(setupFixture)

      await dispatcher.updateClient(C.ConsensusStates[1])
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(C.ConsensusStates[1])
    })

    it('cannot update client with invalid consensusState', async function () {
      const { dispatcher } = await loadFixture(setupFixture)
      const invalidConsState = ethers.utils.toUtf8Bytes('short')
      await expect(dispatcher.updateClient(invalidConsState)).to.be.revertedWith('Consensus state verification failed')
    })
  })

  describe('openIbcChannel', function () {
    it('ChanOpenInit', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            C.V1,
            C.Unordered,
            C.ConnHops1,
            C.EmptyChannelId,
            C.BscPortId,
            C.EmptyVersion,
            C.ValidProof
          )
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(
          mars.address,
          C.ChannelIds[0],
          C.EmptyChannelId,
          C.V1,
          C.Unordered,
          C.ConnHops1,
          C.BscPortId,
          C.EmptyVersion
        )
    })

    it('ChanOpenTry', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            C.EmptyVersion,
            C.Ordered,
            C.ConnHops2,
            C.RemoteChannelIds[0],
            C.BscPortId,
            C.V2,
            C.ValidProof
          )
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(mars.address, C.ChannelIds[0], C.RemoteChannelIds[0], C.V2, C.Ordered, C.ConnHops2, C.BscPortId, C.V2)
    })

    it('unsupported version', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      // invalid version in ChanOpenInit
      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            toBytes32('unknown-version'),
            C.Unordered,
            C.ConnHops1,
            C.EmptyChannelId,
            C.BscPortId,
            C.EmptyVersion,
            C.ValidProof
          )
      ).to.be.revertedWith('Unsupported version')

      // invalid version in ChanOpenTry
      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            C.EmptyVersion,
            C.Unordered,
            C.ConnHops2,
            C.RemoteChannelIds[0],
            C.BscPortId,
            toBytes32('unknown-version'),
            C.ValidProof
          )
      ).to.be.revertedWith('Unsupported version')
    })

    it('onOpenIbcChannel callback error', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            C.V1,
            C.Unordered,
            C.ConnHops1,
            C.RemoteChannelIds[0],
            'portX',
            C.EmptyVersion,
            C.ValidProof
          )
      ).to.be.revertedWith('Invalid counterpartyPortId')
    })

    it('proof error', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupFixture)

      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            C.V1,
            C.Unordered,
            C.ConnHops1,
            C.RemoteChannelIds[0],
            C.BscPortId,
            C.EmptyVersion,
            C.InvalidProof
          )
      ).to.be.revertedWith('Fail to prove channel state')
    })
  })
})
