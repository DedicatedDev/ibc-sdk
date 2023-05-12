const { ethers } = require('hardhat')
const { expect } = require('chai')

describe('Client contract', function () {
  let verifier
  let dispatcher
  let receiver
  let owner
  let clientState
  let consensusState
  let clientId

  beforeEach(async () => {
    // Get the ContractFactory and Signers here.
    const Dispatcher = await ethers.getContractFactory('Dispatcher')
    const Verifier = await ethers.getContractFactory('Verifier')
    const Receiver = await ethers.getContractFactory('Mars')

    ;[owner] = await ethers.getSigners()

    // Deploy the contract and set the owner.
    verifier = await Verifier.deploy()
    await verifier.deployed()

    dispatcher = await Dispatcher.deploy(verifier.address)
    await dispatcher.deployed()

    receiver = await Receiver.deploy()
    await receiver.deployed()

    // Set up test data.
    clientState = ethers.utils.formatBytes32String('clientState')
    consensusState = ethers.utils.formatBytes32String('consensusState')
    clientId = 'testClient'
  })

  describe('createClient', function () {
    it('should create a new client', async function () {
      await dispatcher.createClient(clientId, clientState, consensusState)
      const client = await dispatcher.clients(clientId)
      expect(client.clientState).to.equal(clientState)
      expect(client.consensusState).to.equal(consensusState)
    })

    it('should not create a client with the same id', async function () {
      await dispatcher.createClient(clientId, clientState, consensusState)
      await expect(dispatcher.createClient(clientId, clientState, consensusState)).to.be.revertedWith(
        'Client with this ID already exists'
      )
    })
  })

  describe('updateClient', function () {
    it('should update the consensus state of an existing client', async function () {
      const updatedConsensusState = ethers.utils.formatBytes32String('updatedConsensusState')

      await dispatcher.createClient(clientId, clientState, consensusState)
      await dispatcher.updateClient(clientId, updatedConsensusState)

      const client = await dispatcher.clients(clientId)

      expect(client.consensusState).to.equal(updatedConsensusState)
    })

    it('should revert if client with the given ID does not exist', async function () {
      const invalidClientId = ethers.utils.formatBytes32String('invalidConsensusState')

      await expect(dispatcher.updateClient(invalidClientId, consensusState)).to.be.revertedWith(
        "Client with this ID doesn't exist"
      )
    })
  })

  describe('openIbcChannel', function () {
    it('should emit OpenIbcChannel event', async function () {
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
      const channelId = 'channelId'
      const version = '1.0.0'
      const proof = {
        keyPath: ethers.utils.toUtf8Bytes('key'),
        value: ethers.utils.toUtf8Bytes('value'),
        proof: ethers.utils.toUtf8Bytes('proof')
      }
      const error = ''
      await dispatcher.onOpenIbcChannel(receiver.address, channelId, version, proof, error)
      expect(await receiver.openChannels(0)).to.equal(channelId)
    })
  })
})
