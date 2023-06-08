/* eslint-disable */
import _m0 from "protobufjs/minimal";
import { Height } from "../../core/client";

export const protobufPackage = "polyibc.lightclients.altair";

/** ClientState from Altair */
export interface ClientState {
  chainId: string;
  latestHeight?: Height;
  chainMemo: string;
  consensusBootstrapBytes: Uint8Array;
  lightClientStoreBytes: Uint8Array;
}

/** ConsensusState defines the consensus state from Altair. */
export interface ConsensusState {
  bytes: Uint8Array;
  fromPlugin: boolean;
}

/**
 * Header is the `ConsensusUpdate` message from ETH2 full nodes relayed by relayers.
 *    - The name `Header` is used in order to be compatible general interface
 *    - It encapsulates the `raw_header` which is light client update message from full nodes
 *    - It also encapsulates the `trusted_height` which is the ETH1.block_number of attested_header
 */
export interface Header {
  /** light client update message from full nodes, assembled by relayers */
  rawHeader: Uint8Array;
  /** trusted height which is the ETH1.block_number of attested_header */
  trustedHeight?: Height;
}

function createBaseClientState(): ClientState {
  return {
    chainId: "",
    latestHeight: undefined,
    chainMemo: "",
    consensusBootstrapBytes: new Uint8Array(),
    lightClientStoreBytes: new Uint8Array(),
  };
}

export const ClientState = {
  encode(message: ClientState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.chainId !== "") {
      writer.uint32(10).string(message.chainId);
    }
    if (message.latestHeight !== undefined) {
      Height.encode(message.latestHeight, writer.uint32(18).fork()).ldelim();
    }
    if (message.chainMemo !== "") {
      writer.uint32(26).string(message.chainMemo);
    }
    if (message.consensusBootstrapBytes.length !== 0) {
      writer.uint32(34).bytes(message.consensusBootstrapBytes);
    }
    if (message.lightClientStoreBytes.length !== 0) {
      writer.uint32(42).bytes(message.lightClientStoreBytes);
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
          message.chainMemo = reader.string();
          break;
        case 4:
          message.consensusBootstrapBytes = reader.bytes();
          break;
        case 5:
          message.lightClientStoreBytes = reader.bytes();
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
      chainMemo: isSet(object.chainMemo) ? String(object.chainMemo) : "",
      consensusBootstrapBytes: isSet(object.consensusBootstrapBytes)
        ? bytesFromBase64(object.consensusBootstrapBytes)
        : new Uint8Array(),
      lightClientStoreBytes: isSet(object.lightClientStoreBytes)
        ? bytesFromBase64(object.lightClientStoreBytes)
        : new Uint8Array(),
    };
  },

  toJSON(message: ClientState): unknown {
    const obj: any = {};
    message.chainId !== undefined && (obj.chainId = message.chainId);
    message.latestHeight !== undefined &&
      (obj.latestHeight = message.latestHeight ? Height.toJSON(message.latestHeight) : undefined);
    message.chainMemo !== undefined && (obj.chainMemo = message.chainMemo);
    message.consensusBootstrapBytes !== undefined &&
      (obj.consensusBootstrapBytes = base64FromBytes(
        message.consensusBootstrapBytes !== undefined ? message.consensusBootstrapBytes : new Uint8Array(),
      ));
    message.lightClientStoreBytes !== undefined &&
      (obj.lightClientStoreBytes = base64FromBytes(
        message.lightClientStoreBytes !== undefined ? message.lightClientStoreBytes : new Uint8Array(),
      ));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ClientState>, I>>(object: I): ClientState {
    const message = createBaseClientState();
    message.chainId = object.chainId ?? "";
    message.latestHeight = (object.latestHeight !== undefined && object.latestHeight !== null)
      ? Height.fromPartial(object.latestHeight)
      : undefined;
    message.chainMemo = object.chainMemo ?? "";
    message.consensusBootstrapBytes = object.consensusBootstrapBytes ?? new Uint8Array();
    message.lightClientStoreBytes = object.lightClientStoreBytes ?? new Uint8Array();
    return message;
  },
};

function createBaseConsensusState(): ConsensusState {
  return { bytes: new Uint8Array(), fromPlugin: false };
}

export const ConsensusState = {
  encode(message: ConsensusState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.bytes.length !== 0) {
      writer.uint32(10).bytes(message.bytes);
    }
    if (message.fromPlugin === true) {
      writer.uint32(16).bool(message.fromPlugin);
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
          message.bytes = reader.bytes();
          break;
        case 2:
          message.fromPlugin = reader.bool();
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
      bytes: isSet(object.bytes) ? bytesFromBase64(object.bytes) : new Uint8Array(),
      fromPlugin: isSet(object.fromPlugin) ? Boolean(object.fromPlugin) : false,
    };
  },

  toJSON(message: ConsensusState): unknown {
    const obj: any = {};
    message.bytes !== undefined &&
      (obj.bytes = base64FromBytes(message.bytes !== undefined ? message.bytes : new Uint8Array()));
    message.fromPlugin !== undefined && (obj.fromPlugin = message.fromPlugin);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ConsensusState>, I>>(object: I): ConsensusState {
    const message = createBaseConsensusState();
    message.bytes = object.bytes ?? new Uint8Array();
    message.fromPlugin = object.fromPlugin ?? false;
    return message;
  },
};

function createBaseHeader(): Header {
  return { rawHeader: new Uint8Array(), trustedHeight: undefined };
}

export const Header = {
  encode(message: Header, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.rawHeader.length !== 0) {
      writer.uint32(10).bytes(message.rawHeader);
    }
    if (message.trustedHeight !== undefined) {
      Height.encode(message.trustedHeight, writer.uint32(18).fork()).ldelim();
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
          message.rawHeader = reader.bytes();
          break;
        case 2:
          message.trustedHeight = Height.decode(reader, reader.uint32());
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
      rawHeader: isSet(object.rawHeader) ? bytesFromBase64(object.rawHeader) : new Uint8Array(),
      trustedHeight: isSet(object.trustedHeight) ? Height.fromJSON(object.trustedHeight) : undefined,
    };
  },

  toJSON(message: Header): unknown {
    const obj: any = {};
    message.rawHeader !== undefined &&
      (obj.rawHeader = base64FromBytes(message.rawHeader !== undefined ? message.rawHeader : new Uint8Array()));
    message.trustedHeight !== undefined &&
      (obj.trustedHeight = message.trustedHeight ? Height.toJSON(message.trustedHeight) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Header>, I>>(object: I): Header {
    const message = createBaseHeader();
    message.rawHeader = object.rawHeader ?? new Uint8Array();
    message.trustedHeight = (object.trustedHeight !== undefined && object.trustedHeight !== null)
      ? Height.fromPartial(object.trustedHeight)
      : undefined;
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

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
