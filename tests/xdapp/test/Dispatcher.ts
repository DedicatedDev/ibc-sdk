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
    InvalidVersion: toBytes32('invalid-version'),
    Unordered: 0,
    Ordered: 1,
    InvalidProof: { proofHeight: 42, proof: ethers.utils.toUtf8Bytes('') },
    ValidProof: { proofHeight: 42, proof: ethers.utils.toUtf8Bytes('valid proof') },
    ChannelIds: ['channel-0', 'channel-1'].map(toBytes32),
    RemoteChannelIds: ['channel-100', 'channel-101'].map(toBytes32),
    EmptyChannelId: toBytes32(''),
    BscPortId: toBytes32('bsc.polyibc.9876543210')
  }

  // Get all contract factories for testing
  const getContractFactories = async () => {
    const Dispatcher = await ethers.getContractFactory('Dispatcher')
    const Verifier = await ethers.getContractFactory('Verifier')
    const Mars = await ethers.getContractFactory('Mars')
    return { Dispatcher, Verifier, Mars }
  }

  const getSignerAccounts = async () => {
    const signers = await ethers.getSigners()
    const accounts = {
      owner: signers[0],
      user1: signers[1],
      user2: signers[2],
      relayer: signers[3],
      escrow: signers[4],
      otherUsers: signers.slice(5)
    }
    return accounts
  }

  /**
   * @description Deploy IBC Core SC and verifier contract
   */
  async function deployIbcCoreFixture() {
    const factories = await getContractFactories()
    const accounts = await getSignerAccounts()
    // Deploy Verifier and CoreSC contracts by owner
    const verifier = await factories.Verifier.deploy()
    const dispatcher = await factories.Dispatcher.deploy(verifier.address, accounts.escrow.address)

    return { accounts, verifier, dispatcher, factories }
  }

  /**
   * @description Deploy IBC Core SC and verifier contract, create Polymer client and deploy a dApp Mars contract as an IBC-enabled contract
   */
  async function setupCoreClientFixture() {
    const { accounts, verifier, dispatcher, factories } = await loadFixture(deployIbcCoreFixture)

    // Deploy Mars contract by user1
    const mars = await factories.Mars.connect(accounts.user1).deploy()

    // Set up Polymer light client on CoreSC
    await dispatcher.createClient(C.ClientState, C.ConsensusStates[0]).then((tx) => tx.wait())

    return { accounts, verifier, dispatcher, mars }
  }

  /**
   * @description
   * Set up clients and establish a channel
   */
  async function setupChannelFixture() {
    const { accounts, dispatcher, mars } = await loadFixture(setupCoreClientFixture)
    const channel = {
      portAddress: mars.address,
      channelId: C.ChannelIds[0],
      version: C.V1,
      ordering: C.Unordered,
      connectionHops: C.ConnHops1,
      counterpartyPortId: C.BscPortId,
      counterpartyChannelId: C.RemoteChannelIds[0]
    }
    await dispatcher
      .connect(accounts.relayer)
      .connectIbcChannel(
        channel.portAddress,
        channel.channelId,
        channel.connectionHops,
        channel.ordering,
        channel.counterpartyPortId,
        channel.counterpartyChannelId,
        channel.version,
        C.ValidProof
      )
      .then((tx) => tx.wait())
    return { accounts, dispatcher, mars, channel }
  }

  describe('createClient', function () {
    it('only owner can create a new client', async function () {
      const { accounts, dispatcher } = await loadFixture(deployIbcCoreFixture)

      await expect(
        dispatcher.connect(accounts.user1).createClient(C.ClientState, C.ConsensusStates[0])
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should create a new client', async function () {
      const { dispatcher } = await loadFixture(setupCoreClientFixture)
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(C.ConsensusStates[0])
    })

    it('cannot create call creatClient twice', async function () {
      const { dispatcher } = await loadFixture(setupCoreClientFixture)
      await expect(dispatcher.createClient(C.ClientState, C.ConsensusStates[1])).to.be.revertedWith(
        'Client already created'
      )
    })
  })

  describe('updateClient', function () {
    it('should update the consensus state of an existing client', async function () {
      const { dispatcher } = await loadFixture(setupCoreClientFixture)

      await dispatcher.updateClient(C.ConsensusStates[1])
      const latestConsensusState = await dispatcher.latestConsensusState()

      expect(latestConsensusState).to.equal(C.ConsensusStates[1])
    })

    it('cannot update client with invalid consensusState', async function () {
      const { dispatcher } = await loadFixture(setupCoreClientFixture)
      const invalidConsState = ethers.utils.toUtf8Bytes('short')
      await expect(dispatcher.updateClient(invalidConsState)).to.be.revertedWith('Consensus state verification failed')
    })
  })

  describe('openIbcChannel', function () {
    it('ChanOpenInit', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)

      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(mars.address, C.V1, C.Unordered, C.ConnHops1, C.EmptyChannelId, C.BscPortId, C.EmptyVersion)
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(mars.address, C.EmptyChannelId, C.V1, C.Unordered, C.ConnHops1, C.BscPortId, C.EmptyVersion)
    })

    it('ChanOpenTry', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)

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
            C.V2
          )
      )
        .to.emit(dispatcher, 'OpenIbcChannel')
        .withArgs(mars.address, C.RemoteChannelIds[0], C.V2, C.Ordered, C.ConnHops2, C.BscPortId, C.V2)
    })

    it('unsupported version', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)

      // invalid version in ChanOpenInit
      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(
            mars.address,
            C.InvalidVersion,
            C.Unordered,
            C.ConnHops1,
            C.EmptyChannelId,
            C.BscPortId,
            C.EmptyVersion
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
            C.InvalidVersion
          )
      ).to.be.revertedWith('Unsupported version')
    })

    it('onOpenIbcChannel callback error', async function () {
      const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)

      await expect(
        dispatcher
          .connect(accounts.relayer)
          .openIbcChannel(mars.address, C.V1, C.Unordered, C.ConnHops1, C.RemoteChannelIds[0], 'portX', C.EmptyVersion)
      ).to.be.revertedWith('Invalid counterpartyPortId')
    })

    describe('connectIbcChannel', function () {
      it('ChanOpenAck/Confirm', async function () {
        const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)

        await expect(
          dispatcher
            .connect(accounts.relayer)
            .connectIbcChannel(
              mars.address,
              C.ChannelIds[0],
              C.ConnHops1,
              C.Ordered,
              C.BscPortId,
              C.RemoteChannelIds[0],
              C.V1,
              C.ValidProof
            )
        )
          .to.emit(dispatcher, 'ConnectIbcChannel')
          .withArgs(mars.address, C.ChannelIds[0], C.BscPortId, C.RemoteChannelIds[0], C.ConnHops1)

        // confirm channel is owned by the port address
        const channel = await dispatcher.getChannel(mars.address, C.ChannelIds[0])
        expect(channel).deep.equal([C.V1, C.Ordered, C.ConnHops1, C.BscPortId, C.RemoteChannelIds[0]])
      })

      it('invalid proof', async function () {
        const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)
        await expect(
          dispatcher
            .connect(accounts.relayer)
            .connectIbcChannel(
              mars.address,
              C.ChannelIds[0],
              C.ConnHops1,
              C.Ordered,
              C.BscPortId,
              C.RemoteChannelIds[0],
              C.V1,
              C.InvalidProof
            )
        ).to.be.revertedWith('Fail to prove channel state')
      })

      it('unsupported version', async function () {
        const { dispatcher, mars, accounts } = await loadFixture(setupCoreClientFixture)
        await expect(
          dispatcher
            .connect(accounts.relayer)
            .connectIbcChannel(
              mars.address,
              C.ChannelIds[0],
              C.ConnHops1,
              C.Ordered,
              C.BscPortId,
              C.RemoteChannelIds[0],
              C.InvalidVersion,
              C.ValidProof
            )
        ).to.be.revertedWith('Unsupported version')
      })
    })
  })

  describe('closeIbcChannel', function () {
    it('ChanCloseInit', async function () {
      const { dispatcher, mars, accounts, channel } = await loadFixture(setupChannelFixture)
      await expect(mars.connect(accounts.user1).triggerChannelClose(channel.channelId, dispatcher.address))
        .to.emit(dispatcher, 'CloseIbcChannel')
        .withArgs(channel.portAddress, channel.channelId)
    })

    it('ChanCloseInit: cannot succeed if caller contract does not own the channel', async function () {
      const { dispatcher, channel } = await loadFixture(setupChannelFixture)
      const earth = await (await ethers.getContractFactory('Mars')).deploy()
      await expect(earth.triggerChannelClose(channel.channelId, dispatcher.address)).to.be.revertedWith(
        'Channel not owned by msg.sender'
      )
    })

    it('ChanCloseConfirm', async function () {
      const { dispatcher, accounts, channel } = await loadFixture(setupChannelFixture)
      await expect(
        dispatcher.connect(accounts.relayer).onCloseIbcChannel(channel.portAddress, channel.channelId, C.ValidProof)
      )
        .to.emit(dispatcher, 'CloseIbcChannel')
        .withArgs(channel.portAddress, channel.channelId)
    })

    it('ChanCloseConfirm fails if port does not own the channel', async function () {
      const { dispatcher, accounts, channel } = await loadFixture(setupChannelFixture)
      await expect(
        dispatcher.connect(accounts.relayer).onCloseIbcChannel(channel.portAddress, C.ChannelIds[1], C.ValidProof)
      ).to.be.revertedWith('Channel not owned by portAddress')
    })

    it('ChanCloseConfirm fails if channel proof invalid', async function () {
      const { dispatcher, accounts, channel } = await loadFixture(setupChannelFixture)
      await expect(
        dispatcher.connect(accounts.relayer).onCloseIbcChannel(channel.portAddress, C.ChannelIds[0], C.InvalidProof)
      ).to.be.revertedWith('Fail to prove channel state')
    })
  })
})
