/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";
import { Height } from "../../core/client";

export const protobufPackage = "polyibc.lightclients.voting";

export enum VotingLcType {
  SIM = 0,
  EVM = 1,
  UNRECOGNIZED = -1,
}

export function votingLcTypeFromJSON(object: any): VotingLcType {
  switch (object) {
    case 0:
    case "SIM":
      return VotingLcType.SIM;
    case 1:
    case "EVM":
      return VotingLcType.EVM;
    case -1:
    case "UNRECOGNIZED":
    default:
      return VotingLcType.UNRECOGNIZED;
  }
}

export function votingLcTypeToJSON(object: VotingLcType): string {
  switch (object) {
    case VotingLcType.SIM:
      return "SIM";
    case VotingLcType.EVM:
      return "EVM";
    case VotingLcType.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export interface Fraction {
  numerator: string;
  denominator: string;
}

export interface ClientState {
  chainId: string;
  latestHeight?: Height;
  type: VotingLcType;
  quorum?: Fraction;
  allowedVoters: string[];
  chainMemo: string;
}

export interface ConsensusState {
  header: Uint8Array;
  type: VotingLcType;
}

export interface Header {
  header: Uint8Array;
  trustedHeight?: Height;
  type: VotingLcType;
}

function createBaseFraction(): Fraction {
  return { numerator: "0", denominator: "0" };
}

export const Fraction = {
  encode(message: Fraction, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.numerator !== "0") {
      writer.uint32(9).fixed64(message.numerator);
    }
    if (message.denominator !== "0") {
      writer.uint32(17).fixed64(message.denominator);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Fraction {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseFraction();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.numerator = longToString(reader.fixed64() as Long);
          break;
        case 2:
          message.denominator = longToString(reader.fixed64() as Long);
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Fraction {
    return {
      numerator: isSet(object.numerator) ? String(object.numerator) : "0",
      denominator: isSet(object.denominator) ? String(object.denominator) : "0",
    };
  },

  toJSON(message: Fraction): unknown {
    const obj: any = {};
    message.numerator !== undefined && (obj.numerator = message.numerator);
    message.denominator !== undefined && (obj.denominator = message.denominator);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Fraction>, I>>(object: I): Fraction {
    const message = createBaseFraction();
    message.numerator = object.numerator ?? "0";
    message.denominator = object.denominator ?? "0";
    return message;
  },
};

function createBaseClientState(): ClientState {
  return { chainId: "", latestHeight: undefined, type: 0, quorum: undefined, allowedVoters: [], chainMemo: "" };
}

export const ClientState = {
  encode(message: ClientState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.chainId !== "") {
      writer.uint32(10).string(message.chainId);
    }
    if (message.latestHeight !== undefined) {
      Height.encode(message.latestHeight, writer.uint32(18).fork()).ldelim();
    }
    if (message.type !== 0) {
      writer.uint32(24).int32(message.type);
    }
    if (message.quorum !== undefined) {
      Fraction.encode(message.quorum, writer.uint32(34).fork()).ldelim();
    }
    for (const v of message.allowedVoters) {
      writer.uint32(42).string(v!);
    }
    if (message.chainMemo !== "") {
      writer.uint32(50).string(message.chainMemo);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ClientState {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseClientState();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.chainId = reader.string();
          break;
        case 2:
          message.latestHeight = Height.decode(reader, reader.uint32());
          break;
        case 3:
          message.type = reader.int32() as any;
          break;
        case 4:
          message.quorum = Fraction.decode(reader, reader.uint32());
          break;
        case 5:
          message.allowedVoters.push(reader.string());
          break;
        case 6:
          message.chainMemo = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ClientState {
    return {
      chainId: isSet(object.chainId) ? String(object.chainId) : "",
      latestHeight: isSet(object.latestHeight) ? Height.fromJSON(object.latestHeight) : undefined,
      type: isSet(object.type) ? votingLcTypeFromJSON(object.type) : 0,
      quorum: isSet(object.quorum) ? Fraction.fromJSON(object.quorum) : undefined,
      allowedVoters: Array.isArray(object?.allowedVoters) ? object.allowedVoters.map((e: any) => String(e)) : [],
      chainMemo: isSet(object.chainMemo) ? String(object.chainMemo) : "",
    };
  },

  toJSON(message: ClientState): unknown {
    const obj: any = {};
    message.chainId !== undefined && (obj.chainId = message.chainId);
    message.latestHeight !== undefined &&
      (obj.latestHeight = message.latestHeight ? Height.toJSON(message.latestHeight) : undefined);
    message.type !== undefined && (obj.type = votingLcTypeToJSON(message.type));
    message.quorum !== undefined && (obj.quorum = message.quorum ? Fraction.toJSON(message.quorum) : undefined);
    if (message.allowedVoters) {
      obj.allowedVoters = message.allowedVoters.map((e) => e);
    } else {
      obj.allowedVoters = [];
    }
    message.chainMemo !== undefined && (obj.chainMemo = message.chainMemo);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ClientState>, I>>(object: I): ClientState {
    const message = createBaseClientState();
    message.chainId = object.chainId ?? "";
    message.latestHeight = (object.latestHeight !== undefined && object.latestHeight !== null)
      ? Height.fromPartial(object.latestHeight)
      : undefined;
    message.type = object.type ?? 0;
    message.quorum = (object.quorum !== undefined && object.quorum !== null)
      ? Fraction.fromPartial(object.quorum)
      : undefined;
    message.allowedVoters = object.allowedVoters?.map((e) => e) || [];
    message.chainMemo = object.chainMemo ?? "";
    return message;
  },
};

function createBaseConsensusState(): ConsensusState {
  return { header: new Uint8Array(), type: 0 };
}

export const ConsensusState = {
  encode(message: ConsensusState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.header.length !== 0) {
      writer.uint32(10).bytes(message.header);
    }
    if (message.type !== 0) {
      writer.uint32(16).int32(message.type);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ConsensusState {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseConsensusState();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.header = reader.bytes();
          break;
        case 2:
          message.type = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ConsensusState {
    return {
      header: isSet(object.header) ? bytesFromBase64(object.header) : new Uint8Array(),
      type: isSet(object.type) ? votingLcTypeFromJSON(object.type) : 0,
    };
  },

  toJSON(message: ConsensusState): unknown {
    const obj: any = {};
    message.header !== undefined &&
      (obj.header = base64FromBytes(message.header !== undefined ? message.header : new Uint8Array()));
    message.type !== undefined && (obj.type = votingLcTypeToJSON(message.type));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ConsensusState>, I>>(object: I): ConsensusState {
    const message = createBaseConsensusState();
    message.header = object.header ?? new Uint8Array();
    message.type = object.type ?? 0;
    return message;
  },
};

function createBaseHeader(): Header {
  return { header: new Uint8Array(), trustedHeight: undefined, type: 0 };
}

export const Header = {
  encode(message: Header, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.header.length !== 0) {
      writer.uint32(10).bytes(message.header);
    }
    if (message.trustedHeight !== undefined) {
      Height.encode(message.trustedHeight, writer.uint32(18).fork()).ldelim();
    }
    if (message.type !== 0) {
      writer.uint32(24).int32(message.type);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Header {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseHeader();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.header = reader.bytes();
          break;
        case 2:
          message.trustedHeight = Height.decode(reader, reader.uint32());
          break;
        case 3:
          message.type = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Header {
    return {
      header: isSet(object.header) ? bytesFromBase64(object.header) : new Uint8Array(),
      trustedHeight: isSet(object.trustedHeight) ? Height.fromJSON(object.trustedHeight) : undefined,
      type: isSet(object.type) ? votingLcTypeFromJSON(object.type) : 0,
    };
  },

  toJSON(message: Header): unknown {
    const obj: any = {};
    message.header !== undefined &&
      (obj.header = base64FromBytes(message.header !== undefined ? message.header : new Uint8Array()));
    message.trustedHeight !== undefined &&
      (obj.trustedHeight = message.trustedHeight ? Height.toJSON(message.trustedHeight) : undefined);
    message.type !== undefined && (obj.type = votingLcTypeToJSON(message.type));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Header>, I>>(object: I): Header {
    const message = createBaseHeader();
    message.header = object.header ?? new Uint8Array();
    message.trustedHeight = (object.trustedHeight !== undefined && object.trustedHeight !== null)
      ? Height.fromPartial(object.trustedHeight)
      : undefined;
    message.type = object.type ?? 0;
    return message;
  },
};

declare var self: any | undefined;
declare var window: any | undefined;
declare var global: any | undefined;
var globalThis: any = (() => {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof global !== "undefined") {
    return global;
  }
  throw "Unable to locate global object";
})();

function bytesFromBase64(b64: string): Uint8Array {
  if (globalThis.Buffer) {
    return Uint8Array.from(globalThis.Buffer.from(b64, "base64"));
  } else {
    const bin = globalThis.atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; ++i) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }
}

function base64FromBytes(arr: Uint8Array): string {
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(arr).toString("base64");
  } else {
    const bin: string[] = [];
    arr.forEach((byte) => {
      bin.push(String.fromCharCode(byte));
    });
    return globalThis.btoa(bin.join(""));
  }
}

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends Array<infer U> ? Array<DeepPartial<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function longToString(long: Long) {
  return long.toString();
}

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
