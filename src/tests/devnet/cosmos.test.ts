import * as self from '../../lib'

import anyTest, { TestFn } from 'ava'
import { Coin, MsgSendEncodeObject, setupBankExtension, setupIbcExtension } from '@cosmjs/stargate'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { TextEncoder } from 'util'
import { toAny } from '../../lib/cosmos/client'

const cosmos = self.cosmos
const { utils } = self

const test = anyTest as TestFn<{
  logger: self.utils.Logger
}>

test.before((t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'debug'
  const logger = utils.createLogger({ Level: logLevel, Colorize: true })
  t.context = { logger }
})

const Relayer = { address: 'polymerase1u24pwkz78sutr8ksc62z87ct7ug5pwvqhj2g09', token: '1234567', stake: '200000000' }

const CosmosChainSetConfig = `# applicable to all cosmos chains; use polymerase
ChainSets:
  - Name: "polymerase"
    Type: "polymer"
    Moniker: "polymerase"
    Prefix: "polymerase"
    Images:
      - Repository: "ghcr.io/polymerdao/polymerase"
        Tag: "latest"
        Bin: "polymerased"
    Accounts:
      - Name: alice
        Coins: ["20000token", "200000000stake"]
      - Name: bob
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Address: "${Relayer.address}"
        Coins: ["${Relayer.token}token", "${Relayer.stake}stake"]
      - Name: randomUser
        Coins: ["0token"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"

Run:
  WorkingDir: "/tmp/test-chainsets/run-*"
  # valid modes: ['all', 'debug', 'log'], default 'all'
  CleanupMode: all
  Logger:
    # valid levels: [deubg, info, warn, error]
    Level: debug
    # Colorize: false
    # Transports can take a single str with the default log love above
    # Transports: 'log'
    Transports:
      - 'log' # will use default level
      - FileName: critial.log
        Level: warn
      # add console logger for debugging
      - FileName: '-'
        Level: verbose
`

test('start a comos chain from docker container', async (t) => {
  const logger = t.context.logger

  const rawConfig = utils.readYaml(CosmosChainSetConfig)
  t.truthy(rawConfig)
  logger.verbose(utils.dumpYaml(rawConfig))

  const { runObj, configObj } = await self.dev.runChainSets(rawConfig, logger)
  utils.ignoreUnused(runObj, configObj)

  // ensure we're get a cosmos chain
  const chain = self.dev.schemas.chainSetSchema.cosmos.parse(runObj.ChainSets[0])
  const chainRpc = chain.Nodes[0].RpcHost

  const tmClient = await cosmos.client.newTendermintClient(chainRpc)
  const queryClient = cosmos.client.QueryClient.withExtensions(
    tmClient,
    setupBankExtension,
    setupIbcExtension,
    cosmos.client.setupPolyIbcExtension
  )

  const assertChainStatus = (relayerBalance: Coin[]) => {
    const balances = new Map(relayerBalance.map((i) => [i.denom, i.amount]))
    t.deepEqual(balances.get('token'), Relayer.token)
    t.deepEqual(balances.get('stake'), Relayer.stake)
  }

  // Test with cosmjs client
  const testWithComsjs = async () => {
    const client = await cosmos.client.StargateClient.connect(chainRpc)
    t.deepEqual(await client.getChainId(), 'polymerase')
    assertChainStatus(await queryClient.bank.allBalances(Relayer.address))

    const ibcConnections = await queryClient.ibc.connection.allConnections()
    t.deepEqual(ibcConnections.connections.length, 1)
  }

  // Test with cosmjs client
  const testPolyibcQuery = async () => {
    const ports = await queryClient.polyibc.RegistryAll({})
    t.deepEqual(ports.RegistryAddr.length, 0)
  }

  // Test cli commands based client
  const testWithCli = async () => {
    // create a chain client from chain set
    const client = self.cosmos.cliClient.CosmosChainClient.fromRunningContainer(chain, logger)

    assertChainStatus(await client.balance(Relayer.address))

    const connections = await client.ibcConnections()
    t.deepEqual(connections.connections.length, 1)
    t.assert(Number(connections.height.revision_height) > 0)
  }

  // create a signer client from a given account.
  // The account `sender` must have an mnemonic.
  const createSignerClient = async (sender: typeof chain.Accounts[0]) => {
    const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(sender.Mnemonic!, { prefix: 'polymerase' })
    logger.verbose(`sender address: ${sender.Address}, mnemonic: ${sender.Mnemonic}`)
    const signerClient = await cosmos.client.SigningStargateClient.createWithSigner(
      await self.cosmos.client.newTendermintClient(chainRpc),
      offlineSigner,
      cosmos.client.signerOpts()
    )
    return signerClient
  }

  const testTransfer = async () => {
    const sender = chain.Accounts[0]
    logger.verbose(`sender address: ${sender.Address}, mnemonic: ${sender.Mnemonic}`)
    const signerClient = await createSignerClient(sender)
    const transferMsg: MsgSendEncodeObject = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: {
        fromAddress: sender.Address,
        toAddress: Relayer.address,
        amount: [{ denom: 'token', amount: '100' }]
      }
    }
    const txResp = await signerClient.signAndBroadcast(sender.Address, [transferMsg], 'auto')
    logger.info(`txResp: \n${utils.dumpYamlSafe(txResp)}`)
    const newBalance = await queryClient.bank.balance(Relayer.address, 'token')
    t.deepEqual(newBalance.amount, '1234667')
  }

  const testPolyibc = async () => {
    const sender = chain.Accounts[1]
    const signerClient = await createSignerClient(sender)
    const clientState: self.cosmos.client.polyibc.lightclients.SimClientStateEncodeObject = {
      typeUrl: '/polyibc.lightclients.sim.ClientState',
      value: {
        chainId: 'chain-1',
        chainMemo: 'simLC',
        latestHeight: { revisionHeight: '0', revisionNumber: '0' }
      }
    }

    const consensusState: self.cosmos.client.polyibc.lightclients.SimConsensusStateEncodeObject = {
      typeUrl: '/polyibc.lightclients.sim.ConsensusState',
      value: {
        header: new TextEncoder().encode(
          JSON.stringify({ raw: Buffer.from('abc').toString('base64'), type: 2, height: 0, revision: 0 })
        )
      }
    }

    const createClientMsg: self.cosmos.client.polyibc.MsgCreateClientEncodeObject = {
      typeUrl: '/polyibc.core.MsgCreateClient',
      value: {
        chainMemo: 'mychainMemo',
        creator: sender.Address,
        clientState: toAny(clientState, self.cosmos.client.polyibc.lightclients.sim.ClientState),
        consensusState: toAny(consensusState, self.cosmos.client.polyibc.lightclients.sim.ConsensusState)
      }
    }

    // No client exists yet
    let createdClients = await queryClient.polyibc.ClientStates({})
    t.deepEqual(createdClients.clientStates.length, 0)

    const txResp = await signerClient.signAndBroadcast(sender.Address, [createClientMsg], 'auto')
    logger.info(`CreateClient txResp: \n${utils.dumpYamlSafe(txResp)}`)

    // query created client
    createdClients = await queryClient.polyibc.ClientStates({})
    t.deepEqual(createdClients.clientStates.length, 1)
    logger.verbose(`clients: \n${utils.dumpYamlSafe(createdClients)}`)
  }

  await Promise.all([testWithComsjs(), testWithCli(), testPolyibcQuery()])
  await Promise.all([testTransfer(), testPolyibc()])
})