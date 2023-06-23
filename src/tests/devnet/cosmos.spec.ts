import * as self from '../../lib'

import {
  BankExtension,
  Coin,
  IbcExtension,
  MsgSendEncodeObject,
  QueryClient,
  setupBankExtension,
  setupIbcExtension,
  SigningStargateClient
} from '@cosmjs/stargate'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { TextEncoder } from 'util'
import { PolyIbcExtension, toAny } from '../../lib/cosmos/client'
import { images } from '../../lib/docker'
import { getTestingLogger } from '../../lib/utils'
import { cleanupRuntime, getWorkspace, RuntimeContext } from './test_utils'
import anyTest, { TestFn } from 'ava'
import { CosmosChainSet } from '../../lib/schemas'

const log = getTestingLogger()

const cosmos = self.cosmos
const { utils } = self

type Context = RuntimeContext & {
  chain: CosmosChainSet
  queryClient: QueryClient & IbcExtension & BankExtension & PolyIbcExtension
  signer: SigningStargateClient
}

const test = anyTest as TestFn<Context>

test.after.always(async (t) => {
  await cleanupRuntime(t)
})

const Relayer = {
  address: 'polymer158z04naus5r3vcanureh7u0ngs5q4l0g5yw8xv',
  token: '1234567',
  stake: '200000000',
  mnemonic:
    'wait team asthma refuse situate crush kidney nature ' +
    'frown kid alpha boat engage test across cattle practice ' +
    'text olive level tag profit they veteran'
}

const CosmosChainSetConfig = `# applicable to all cosmos chains; use polymer
ChainSets:
  - Name: "polymer"
    Type: "polymer"
    Moniker: "polymer"
    Prefix: "polymer"
    Images:
      - Repository: "${images.polymer.repo}"
        Tag: "${images.polymer.tag}"
        Bin: "polymerd"
    Accounts:
      - Name: alice
        Coins: ["20000token", "200000000stake"]
      - Name: bob
        Coins: ["10000token", "100000000stake"]
      - Name: relayer
        Mnemonic: "${Relayer.mnemonic}"
        Coins: ["${Relayer.token}token", "${Relayer.stake}stake"]
      - Name: randomUser
        Coins: ["0token"]
      - Name: validatorRunner
        Coins: ["150000000stake"]
    Validator:
      Name: validatorRunner
      Staked: "100000000stake"
`

test.before(async (t) => {
  const rawConfig = utils.readYaml(CosmosChainSetConfig)
  t.truthy(rawConfig)
  log.verbose(utils.dumpYaml(rawConfig))

  const { runObj, configObj: _ } = await self.runChainSets(rawConfig, getWorkspace('cosmos-test'))
  t.context.runtime = runObj

  // ensure we're get a cosmos chain
  const chain = self.schemas.chainSetSchema.cosmos.parse(runObj.ChainSets[0])
  const tmClient = await cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost)
  const queryClient = cosmos.client.QueryClient.withExtensions(
    tmClient,
    setupBankExtension,
    setupIbcExtension,
    cosmos.client.setupPolyIbcExtension
  )

  const sender = chain.Accounts[0]
  const offlineSigner = await DirectSecp256k1HdWallet.fromMnemonic(sender.Mnemonic!, { prefix: 'polymer' })
  log.verbose(`sender address: ${sender.Address}, mnemonic: ${sender.Mnemonic}`)
  const signer = await cosmos.client.SigningStargateClient.createWithSigner(
    await self.cosmos.client.newTendermintClient(chain.Nodes[0].RpcHost),
    offlineSigner,
    cosmos.client.signerOpts()
  )

  t.context.chain = chain
  t.context.queryClient = queryClient
  t.context.signer = signer
})

function assertChainStatus(t: any, relayerBalance: Coin[]) {
  const balances = new Map(relayerBalance.map((i) => [i.denom, i.amount]))
  t.deepEqual(balances.get('token'), Relayer.token)
  t.deepEqual(balances.get('stake'), Relayer.stake)
}

test.serial('with cosmjs client', async (t) => {
  const client = await cosmos.client.StargateClient.connect(t.context.chain.Nodes[0].RpcHost)
  t.deepEqual(await client.getChainId(), 'polymer')
  assertChainStatus(t, await t.context.queryClient.bank.allBalances(Relayer.address))

  const ibcConnections = await t.context.queryClient.ibc.connection.allConnections()
  t.deepEqual(ibcConnections.connections.length, 1)
})

test.serial('with cli', async (t) => {
  // create a chain client from chain set
  const client = self.cosmos.cliClient.CosmosChainClient.fromRunningContainer(t.context.chain)

  assertChainStatus(t, await client.balance(Relayer.address))

  const connections = await client.ibcConnections()
  t.deepEqual(connections.connections.length, 1)
  t.assert(Number(connections.height.revision_height) > 0)
})

test.serial('transfer', async (t) => {
  const sender = t.context.chain.Accounts[0]
  const transferMsg: MsgSendEncodeObject = {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: {
      fromAddress: sender.Address,
      toAddress: Relayer.address,
      amount: [{ denom: 'token', amount: '100' }]
    }
  }
  const txResp = await t.context.signer.signAndBroadcast(sender.Address, [transferMsg], 'auto')
  log.info(`txResp: \n${utils.dumpYamlSafe(txResp)}`)
  const newBalance = await t.context.queryClient.bank.balance(Relayer.address, 'token')
  t.deepEqual(newBalance.amount, '1234667')
})

test.serial('polyibc', async (t) => {
  const sender = t.context.chain.Accounts[0]
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
  let createdClients = await t.context.queryClient.polyibc.ClientStates({})
  t.deepEqual(createdClients.clientStates.length, 0)

  const txResp = await t.context.signer.signAndBroadcast(sender.Address, [createClientMsg], 'auto')
  log.info(`CreateClient txResp: \n${utils.dumpYamlSafe(txResp)}`)

  // query created client
  createdClients = await t.context.queryClient.polyibc.ClientStates({})
  t.deepEqual(createdClients.clientStates.length, 1)
  log.verbose(`clients: \n${utils.dumpYamlSafe(createdClients)}`)
})
