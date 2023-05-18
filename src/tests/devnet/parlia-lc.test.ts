import * as utils from '../../lib/utils/index.js'
import * as self from '../../lib/index.js'
import anyTest, { ExecutionContext, TestFn } from 'ava'
import { getConfigs, genEvmHeaders, createSignerClient, readParliaHeaders } from './test-utils'
import { TextEncoder } from 'util'
import { toAny } from '../../lib/cosmos/client'
import { setupBankExtension, setupIbcExtension, BankExtension, IbcExtension } from '@cosmjs/stargate'
import path from 'path'

const test = anyTest as TestFn<{
  logger: utils.Logger
  fullConfig: self.dev.schemas.ChainSetsRunConfig
  bscRunConfig: self.dev.schemas.EvmChainSet
  polymerRunConfig: self.dev.schemas.CosmosChainSet
  signerClient: self.cosmos.client.SigningStargateClient
  queryClient: self.cosmos.client.QueryClient & self.cosmos.client.PolyIbcExtension & BankExtension & IbcExtension
  signerAccount: self.dev.schemas.CosmosAccounts[0]
}>

const createAndUpdateClientWithExistingHeaders = test.macro(
  async (
    t,
    input: {
      chain_id: string
      start: number
      take: number
      update_start: number
      update_take: number
      real_data: boolean
    },
    expected: { newClient: boolean; updateSuccess: boolean }
  ) => {
    const createdClients = await t.context.queryClient.polyibc.ClientStates({})
    const preCreateClients = createdClients.clientStates.length
    let startingHeaders = readParliaHeaders(input.start, input.take)
    if (input.real_data) {
      const bscRpc = t.context.bscRunConfig.Nodes[0].RpcHost
      const evmHeaders = await genEvmHeaders(bscRpc, input.start)
      startingHeaders = evmHeaders.blocks
    }
    const clientId = await createAndConfirmClient(t, input.chain_id, startingHeaders, input.start, !expected.newClient)
    const newClients = await t.context.queryClient.polyibc.ClientStates({})
    if (!expected.newClient) {
      t.assert(newClients.clientStates.length === preCreateClients)
      return
    }
    t.assert(newClients.clientStates.length === preCreateClients + 1)
    let nextHeader = readParliaHeaders(input.update_start)
    if (input.real_data) {
      const nextEvmHeaders = await genEvmHeaders(t.context.bscRunConfig.Nodes[0].RpcHost, input.update_start)
      nextHeader = nextEvmHeaders.blocks
    }
    const txResp = await updateAndConfirmClient(t, clientId, nextHeader[0], input.update_start, !expected.updateSuccess)
    if (!txResp) {
      return
    }
    t.assert(txResp.events.filter((e) => e.type === 'update_client').length === 1, "Must have 'update_client' event")
    const postUpdate = await t.context.queryClient.polyibc.ClientStates({})
    t.notDeepEqual(newClients, postUpdate)
  }
)

test.before(async (t) => {
  const logLevel: any = process.env.TEST_LOG_LEVEL ?? 'debug'
  t.context.logger = utils.createLogger({ Level: logLevel, Colorize: true })
  const chainSetConfig = getConfigs(['bsc', 'polymer'])
  const configs = await self.dev.runChainSets(chainSetConfig, t.context.logger)
  t.context.bscRunConfig = configs.runObj.ChainSets.filter((cs) => cs.Name === 'bsc')[0] as self.dev.schemas.EvmChainSet
  t.context.polymerRunConfig = self.dev.schemas.chainSetSchema.cosmos.parse(
    configs.runObj.ChainSets.filter((cs) => cs.Name === 'polymer')[0]
  )
  const contractsDir = path.resolve(__dirname, '..', '..', '..', 'tests', 'xdapp', 'artifacts', 'contracts')
  const contractsConfig = self.dev.createContractsConfig(contractsDir)
  const dispatcherContract = await self.dev.deployVIBCCoreContractsOnChainSets(
    configs.runObj,
    contractsConfig,
    t.context.logger
  )

  t.truthy(dispatcherContract.bsc, 'Dispatcher contract was never deployed')
  const polymerRpc = t.context.polymerRunConfig.Nodes[0].RpcHost
  t.context.signerAccount = t.context.polymerRunConfig.Accounts[0]
  t.context.signerClient = await createSignerClient(t.context.signerAccount, polymerRpc, t.context.logger)
  const tmClient = await self.cosmos.client.newTendermintClient(polymerRpc)
  t.context.queryClient = self.cosmos.client.QueryClient.withExtensions(
    tmClient,
    setupBankExtension,
    setupIbcExtension,
    self.cosmos.client.setupPolyIbcExtension
  )
})

test('Get Real BSC Block headers', async (t) => {
  const bscRpc = t.context.bscRunConfig.Nodes[0].RpcHost
  const bscHeaders = await genEvmHeaders(bscRpc)
  t.assert(bscHeaders.height === 0)
  t.assert(bscHeaders.blocks.length === 1)
})

test('Read Existing BSC Block Data', async (t) => {
  const blockHeaders = readParliaHeaders(0)
  t.assert(blockHeaders.length === 1)
  t.assert(parseInt(blockHeaders[0].number) === 0)

  const newBlockHeaders = readParliaHeaders(10, 5)
  t.assert(newBlockHeaders.length === 5)
  t.assert(parseInt(newBlockHeaders[4].number) === 14)
})

test.serial(
  'Create Polymer Chain w/Parlia LC and use existing BSC Headers',
  createAndUpdateClientWithExistingHeaders,
  { chain_id: 'existing-1', start: 0, take: 1, update_start: 1, update_take: 1, real_data: false },
  { newClient: true, updateSuccess: true }
)

test.serial(
  'Fail New Client Creation when there is an existing client',
  createAndUpdateClientWithExistingHeaders,
  { chain_id: 'existing-1', start: 0, take: 1, update_start: 1, update_take: 1, real_data: false },
  { newClient: false, updateSuccess: true }
)

test.serial(
  'Parlia LC Starting with Header 200, take 1',
  createAndUpdateClientWithExistingHeaders,
  { chain_id: 'existing-3', start: 200, take: 1, update_start: 201, update_take: 1, real_data: false },
  { newClient: true, updateSuccess: true }
)

test.serial(
  'Fail Parlia LC Starting with Header 190',
  createAndUpdateClientWithExistingHeaders,
  { chain_id: 'existing-2', start: 190, take: 10, update_start: 200, update_take: 1, real_data: false },
  { newClient: false, updateSuccess: true }
)

test.serial(
  'Parlia LC Starting with Header 200, Update 202 Fail',
  createAndUpdateClientWithExistingHeaders,
  { chain_id: 'existing-2', start: 200, take: 1, update_start: 202, update_take: 1, real_data: false },
  { newClient: true, updateSuccess: false }
)

test.serial(
  'Create Fresh BSC Chain and Polymer Chain with Parlia LC',
  createAndUpdateClientWithExistingHeaders,
  { chain_id: 'new-bsc', start: 0, take: 1, update_start: 1, update_take: 1, real_data: true },
  { newClient: true, updateSuccess: true }
)

async function createAndConfirmClient(
  t: ExecutionContext<{
    logger: utils.Logger
    fullConfig: self.dev.schemas.ChainSetsRunConfig
    bscRunConfig: self.dev.schemas.EvmChainSet
    polymerRunConfig: self.dev.schemas.CosmosChainSet
    signerClient: self.cosmos.client.SigningStargateClient
    queryClient: self.cosmos.client.QueryClient & self.cosmos.client.PolyIbcExtension & BankExtension & IbcExtension
    signerAccount: self.dev.schemas.CosmosAccounts[0]
  }>,
  chainId: string,
  headers: any[],
  height: number,
  fails: boolean = false
): Promise<string> {
  const clientState: self.cosmos.client.polyibc.lightclients.ParliaClientStateEncodeObject = {
    typeUrl: '/polyibc.lightclients.parlia.ClientState',
    value: {
      chainId: chainId,
      chainMemo: 'parliaLC',
      latestHeight: { revisionHeight: height.toString(), revisionNumber: '0' }
    }
  }
  const consensusState: self.cosmos.client.polyibc.lightclients.ParliaConsensusStateEncodeObject = {
    typeUrl: '/polyibc.lightclients.parlia.ConsensusState',
    value: {
      headers: new TextEncoder().encode(JSON.stringify(headers))
    }
  }
  const createClientMsg: self.cosmos.client.polyibc.MsgCreateClientEncodeObject = {
    typeUrl: '/polyibc.core.MsgCreateClient',
    value: {
      chainMemo: 'mychainMemo',
      creator: t.context.signerAccount.Address,
      clientState: toAny(clientState, self.cosmos.client.polyibc.lightclients.parlia.ClientState),
      consensusState: toAny(consensusState, self.cosmos.client.polyibc.lightclients.parlia.ConsensusState)
    }
  }
  if (fails) {
    await t.throwsAsync(
      t.context.signerClient.signAndBroadcast(t.context.signerAccount.Address, [createClientMsg], 'auto')
    )
    return ''
  }
  const txResp = await t.context.signerClient.signAndBroadcast(
    t.context.signerAccount.Address,
    [createClientMsg],
    'auto'
  )
  const createdClientEvent = txResp.events.filter((e) => e.type === 'create_client')
  t.assert(createdClientEvent.length === 1, "Must have 'create_event' event")
  const clientId = createdClientEvent[0].attributes.filter((a) => a.key === 'client_id')[0].value
  return clientId
}

async function updateAndConfirmClient(
  t: ExecutionContext<{
    logger: utils.Logger
    fullConfig: self.dev.schemas.ChainSetsRunConfig
    bscRunConfig: self.dev.schemas.EvmChainSet
    polymerRunConfig: self.dev.schemas.CosmosChainSet
    signerClient: self.cosmos.client.SigningStargateClient
    queryClient: self.cosmos.client.QueryClient & self.cosmos.client.PolyIbcExtension & BankExtension & IbcExtension
    signerAccount: self.dev.schemas.CosmosAccounts[0]
  }>,
  clientId: string,
  header: any,
  height: number,
  fails: boolean = false
) {
  const headerObj: self.cosmos.client.polyibc.lightclients.ParliaHeaderEncodeObject = {
    typeUrl: '/polyibc.lightclients.parlia.Header',
    value: {
      evmHeader: new TextEncoder().encode(JSON.stringify(header)),
      trustedHeight: { revisionHeight: height.toString(), revisionNumber: '0' }
    }
  }
  const updateClientMessage: self.cosmos.client.polyibc.MsgUpdateClientEncodeObject = {
    typeUrl: '/polyibc.core.MsgUpdateClient',
    value: {
      clientId: clientId,
      creator: t.context.signerAccount.Address,
      header: toAny(headerObj, self.cosmos.client.polyibc.lightclients.parlia.Header)
    }
  }
  if (fails) {
    await t.throwsAsync(
      t.context.signerClient.signAndBroadcast(t.context.signerAccount.Address, [updateClientMessage], 'auto')
    )
    return
  }
  const txResp = await t.context.signerClient.signAndBroadcast(
    t.context.signerAccount.Address,
    [updateClientMessage],
    'auto'
  )
  return txResp
}
