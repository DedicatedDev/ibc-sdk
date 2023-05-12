/* eslint-disable camelcase */

import * as sim from './_generated/polyibc/lightclients/sim/sim'
import { EncodeObject } from '@cosmjs/proto-signing'
import * as parlia from './_generated/polyibc/lightclients/parlia/parlia'
export * as ethclique from './_generated/polyibc/lightclients/ethclique/ethclique'
export * as sim from './_generated/polyibc/lightclients/sim/sim'
export * as voting from './_generated/polyibc/lightclients/voting/voting'
export * as parlia from './_generated/polyibc/lightclients/parlia/parlia'

const otherMsgTypesRegistry = {
  '/polyibc.lightclients.sim.ClientState': sim.ClientState,
  '/polyibc.lightclients.sim.ConsensusState': sim.ConsensusState,
  '/polyibc.lightclients.parlia.ClientState': parlia.ClientState,
  '/polyibc.lightclients.parlia.ConsensusState': parlia.ConsensusState,
  '/polyibc.lightclients.parlia.Header': parlia.Header
}

interface msgEncodeObject<T extends keyof typeof otherMsgTypesRegistry & string> extends EncodeObject {
  readonly typeUrl: T
  // the value obj's decode method returns a vanila js object with all msg fields
  readonly value: ReturnType<typeof otherMsgTypesRegistry[T]['decode']>
}

export interface SimClientStateEncodeObject extends msgEncodeObject<'/polyibc.lightclients.sim.ClientState'> {}
export interface SimConsensusStateEncodeObject extends msgEncodeObject<'/polyibc.lightclients.sim.ConsensusState'> {}
export interface ParliaConsensusStateEncodeObject
  extends msgEncodeObject<'/polyibc.lightclients.parlia.ConsensusState'> {}
export interface ParliaClientStateEncodeObject extends msgEncodeObject<'/polyibc.lightclients.parlia.ClientState'> {}
export interface ParliaHeaderEncodeObject extends msgEncodeObject<'/polyibc.lightclients.parlia.Header'> {}
