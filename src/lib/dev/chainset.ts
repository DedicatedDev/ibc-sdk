import { RunningBSCChain } from './bsc_chain'
import { $, Logger, utils, winston } from './deps.js'
import { RunningGethChain } from './geth_chain.js'
import {
  ChainConfig,
  ChainSetsRunConfig,
  chainSetsRunConfigSchema,
  ChainSetsRunObj,
  imageByLabel,
  imageLabelFromString,
  ImageLabelTypes,
  runningChainSetsSchema
} from './schemas.js'
import { RunningCosmosChain } from './cosmos_chain.js'
import { NodeAccounts, RunningChain, RunningChainCreator } from './running_chain.js'
import { fs } from '../utils'
import { RunningPrysmChain } from './prysm_chain'

/**
 * Start ChainSets defined in the config.
Each Chain consists of at least one ChainNode. Each ChainNode runs in a docker container.

After this function returns, all chain nodes are running and ready to interact with via their RPC endpoints.

Returned `runObj` contains info of containers, pre-loaded accounts, and host working directories.
* @param config a config string or obj that conforms to the chainsetsRunSchema
 * @returns `{runObj, configObj}` where `runObj` is typed ChainSetsRunObj and
`configObj` typed ChainSetsRunConfig
 */
export async function runChainSets(
  config: string | object,
  logger: winston.Logger
): Promise<{ runObj: ChainSetsRunObj; configObj: ChainSetsRunConfig }> {
  const configObj = typeof config === 'object' ? config : utils.readYaml(config)
  // TODO: improve zod's error handling to return more meaningful messages when the
  // configuration file is invalid
  const parsedConfig = chainSetsRunConfigSchema.parse(configObj)
  const runTemplate = new ChainSetsRunTemplate(parsedConfig, logger)

  const runObj = await runTemplate.run()
  return { runObj, configObj: parsedConfig }
}

/**
 * Clean up resources the running chainsets are using, including:
 * - Stop and remove docker containers where chain nodes are running.
 * - Remove working directories recursively.
 * @param runtime The chain set runtime
 */
export async function cleanupChainSets(runtime: ChainSetsRunObj) {
  const logger = utils.createLogger({ Level: 'debug', Colorize: true })
  for (const chain of runtime.ChainSets) {
    for (const node of chain.Nodes) {
      logger.verbose(`cleaning up '${node.Label}' container for chain '${chain.Name}'...`)
      // TODO: this should be chain-specific logic but we don't have a hold of running chain objects here
      const image = imageByLabel(chain.Images, imageLabelFromString(node.Label))
      if (image.Bin && image.Label !== ImageLabelTypes.Genesis) {
        await $`docker container exec ${node.ContainerId} killall ${image.Bin}`
      }
      if (image.DataDir) {
        await $`docker container exec ${node.ContainerId} rm -rf ${image.DataDir}`
      }
      if (runtime.Run.CleanupMode !== 'debug' && runtime.Run.CleanupMode !== 'reuse') {
        logger.info(`removing '${chain.Name}:${node.Label}' container...`)
        await $`docker container stop ${node.ContainerId}`
        await $`docker container rm -f ${node.ContainerId}`
      }
    }
  }
}

export function saveChainSetsRuntime(runtime: ChainSetsRunObj): ChainSetsRunObj {
  const runFilepath = utils.path.join(runtime.Run.WorkingDir, 'run.json')
  utils.fs.writeFileSync(runFilepath, JSON.stringify(runtime, null, 2))
  return runningChainSetsSchema.parse(runtime)
}

export function getChainSetsRuntimeFile(wd: string): string {
  return utils.path.join(wd, 'run.json')
}

/**
 * Class representing a chain sets run.
 * Creation of such instances will not trigger anything.
 * Only after the `run` method is called, does it start to run configured chains in separate Docker containers.
 */
class ChainSetsRunTemplate {
  readonly config: ChainSetsRunConfig
  wd = ''
  logger: winston.Logger

  constructor(config: ChainSetsRunConfig, logger: winston.Logger) {
    this.config = config

    this.wd = utils.expandUserHomeDir(this.generateWD(new Date(), this.config.Run.WorkingDir))

    this.logger = logger
  }

  // Start all chains in a ready state.
  // Return RunningChainSet.
  async run(): Promise<ChainSetsRunObj> {
    this.wd = utils.ensureDir(this.wd, true)
    const runFilepath = getChainSetsRuntimeFile(this.wd)
    if (fs.existsSync(runFilepath)) {
      throw new Error(`Workdir '${this.wd}' already in use`)
    }

    const running = new RunningChainSets(this.config, this.wd, this.logger)
    await running.run()
    return saveChainSetsRuntime(await running.getChainSetsRunObj())
  }

  private generateWD(date: Date, template: string): string {
    if (!template.includes('*')) {
      return template
    }
    if (template.indexOf('*') !== template.lastIndexOf('*')) {
      throw new Error(`Only one * is allowed in WorkingDir, but got ${template}`)
    }
    const random = [
      date.getUTCFullYear(),
      date.getUTCMonth().toString().padStart(2, '0'),
      date.getUTCDate().toString().padStart(2, '0'),
      date.getUTCHours().toString().padStart(2, '0'),
      date.getUTCMinutes().toString().padStart(2, '0'),
      date.getUTCSeconds().toString().padStart(2, '0'),
      '-',
      // not reliablly random, but sufficient for dir suffix
      (Math.random() + 1).toString(36).substring(2)
    ].join('')
    return template.replace('*', random)
  }
}

export class RunningChainSets {
  readonly chainSet: Map<string, RunningChain> = new Map()
  readonly config: ChainSetsRunConfig
  wd: string
  logger: Logger

  constructor(config: ChainSetsRunConfig, wd: string, logger: Logger) {
    this.config = config
    this.wd = utils.ensureDir(wd)
    this.logger = logger
  }

  // This constructs a "pseudo reverse dependency tree" in the form of a list of list
  // of chain names. It's "reverse" because we care more about the chains don't depend
  // on anything so those are at the top of the tree. The chains at the top of the tree
  // are the ones started first.
  //
  // Considering this real tree where D depends on B which depends on A and so on...
  //   A -> B -> D
  //    `-> C -> E
  //
  // The result we'd get is:  [ [ A ], [ B , C ], [ D , E ] ]
  public resolveDependencies(): ChainConfig[][] {
    this.config.ChainSets.forEach((c: ChainConfig) => {
      if (c.DependsOn && !this.config.ChainSets.find((d: ChainConfig) => d.Name === c.DependsOn))
        throw new Error(`Unknown chain id ${c.DependsOn}`)
    })

    const links = this.config.ChainSets.map((c: ChainConfig) => {
      // if the chain depends on nothing, let it depend on "nil". This is gonna be
      // used to determined circular dependencies. It's like our implicit root
      return { from: c.DependsOn, to: c.Name }
    })
    const tree: any[] = []

    for (const link of links) {
      // append and prepend are the branches that we have constructed so far in the tree

      // append is not undefined if the current link can be appended to it,
      // meaning that the link's origin matches the last element of the branch
      const append: any[] = tree.find((a) => link.from && link.from === a.at(-1))

      // prepend is not undefined if the current link can be prepended to it,
      // meaning that the link's destination matches the first element of the branch.
      let prependidx = 0
      const prepend: any[] = tree.find((p) => {
        // this is to keep track if the prepend branch within the tree in case of merge
        prependidx++
        return link.to && link.to === p[0]
      })

      // new branch detected, add it to the tree
      if (!prepend && !append) {
        tree.push([link.from, link.to])
        continue
      }

      // need to merge branches
      if (prepend && append) {
        append.push(...prepend)
        tree.splice(prependidx - 1, 1)
        // if the first element is not the implicit root (undefined)
        // we've detected a circular dependency
        if (append[0]) throw new Error('Circular dependency')
        continue
      }

      // simply append/prepend to the branch
      if (prepend) prepend.unshift(link.from)
      if (append) append.push(link.to)
    }

    // Clean up the implicit root
    tree.forEach((x) => x[0] ?? x.shift())

    // the tree is actually a matrix. This here transposes it so all chains that
    // can be started first (the first element of each branch) end up together.
    tree.sort((a: any, b: any) => b.length - a.length)
    const result: ChainConfig[][] = []
    for (let i = 0; i < tree[0].length; i++) {
      const s = new Set<ChainConfig>()
      for (let j = 0; j < tree.length; j++) {
        if (tree[j][i]) s.add(this.config.ChainSets.find((c: ChainConfig) => c.Name === tree[j][i])!)
      }
      result.push(Array.from(s))
    }
    return result
  }

  /**
   * Start all chains processes in containers.
   * Return after all chain rpc endpoints are ready, and accounts funded.
   */
  async run() {
    const chainSetsConfig = this.resolveDependencies()

    this.logger.info(`initializing containers for ${this.config.ChainSets.length} chains`)
    let dependencyRuntime: NodeAccounts[] = []
    for (const chainConfigGroup of chainSetsConfig) {
      const promises = chainConfigGroup.map(async (chainConfig) => {
        this.logger.info(`initializing ${chainConfig.Name}`)
        const runningChain = await this.createRunningChain(chainConfig)
        await runningChain.start(dependencyRuntime)
        this.chainSet.set(chainConfig.Name, runningChain)
        this.logger.info(`chain: ${chainConfig.Name} started`)
        return await runningChain.getRunObj()
      })
      dependencyRuntime = await Promise.all(promises)
    }
  }

  /**
   * Return a ChainSetRunObj that includes chain running state for further interaction
   */
  async getChainSetsRunObj(): Promise<ChainSetsRunObj> {
    const ChainSets = await Promise.all(
      this.config.ChainSets.map(async (chainConf) => {
        const runningChain = this.chainSet.get(chainConf.Name)
        if (!runningChain) throw new Error(`cannot find chain ${chainConf.Name}`)
        return await runningChain.getRunObj()
      })
    )
    const Run = {
      WorkingDir: this.wd,
      CleanupMode: this.config.Run.CleanupMode
    }
    const obj = { ChainSets, Run }
    return obj as any
  }

  private async createRunningChain(chainConfig: ChainConfig): Promise<RunningChain> {
    const containerDir = utils.ensureDir(utils.path.join(this.wd, chainConfig.Name))
    fs.chmodSync(containerDir, 0o777)

    utils.ignoreUnused(RunningCosmosChain)
    const chainFactories = new Map<string, RunningChainCreator>([
      ['ethereum', RunningGethChain.newNode],
      ['ethereum2', RunningPrysmChain.newNode],
      ['bsc', RunningBSCChain.newNode],
      ['polymer', RunningCosmosChain.newNode],
      ['cosmos', RunningCosmosChain.newNode]
    ])

    const ChainConstructor = chainFactories.get(chainConfig.Type)
    if (!ChainConstructor) {
      throw new Error(
        `unsupported chain type '${chainConfig.Type}' found! Supported chain types are: [${new Array(
          chainFactories.keys()
        ).join(', ')}]`
      )
    }
    this.logger.verbose(`creating chain of type ${chainConfig.Type}`)
    return await ChainConstructor(chainConfig, containerDir, this.config.Run.CleanupMode === 'reuse', this.logger)
  }
}
