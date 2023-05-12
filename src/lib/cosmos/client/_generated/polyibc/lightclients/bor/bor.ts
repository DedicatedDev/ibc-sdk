/* eslint-disable */
import _m0 from "protobufjs/minimal";
import { Height } from "../../core/client";

export const protobufPackage = "polyibc.lightclients.bor";

/** ClientState from Bor */
export interface ClientState {
  chainId: string;
  latestHeight?: Height;
  chainMemo: string;
}

/** ConsensusState defines the consensus state from Bor. */
export interface ConsensusState {
  /** opaque data used for light client verification */
  state: Uint8Array;
}

/**
 * Header defines the Bor client consensus Header. It encapsulates all the
 * information necessary to update from a trusted Bor ConsensusState.
 */
export interface Header {
  /** opaque json bytes which must be unmarshalled into a valid signed EVM header */
  rawHeader: Uint8Array;
  /** trusted height that will be used to verify the `raw_header` */
  trustedHeight?: Height;
}

function createBaseClientState(): ClientState {
  return { chainId: "", latestHeight: undefined, chainMemo: "" };
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
    };
  },

  toJSON(message: ClientState): unknown {
    const obj: any = {};
    message.chainId !== undefined && (obj.chainId = message.chainId);
    message.latestHeight !== undefined &&
      (obj.latestHeight = message.latestHeight ? Height.toJSON(message.latestHeight) : undefined);
    message.chainMemo !== undefined && (obj.chainMemo = message.chainMemo);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ClientState>, I>>(object: I): ClientState {
    const message = createBaseClientState();
    message.chainId = object.chainId ?? "";
    message.latestHeight = (object.latestHeight !== undefined && object.latestHeight !== null)
      ? Height.fromPartial(object.latestHeight)
      : undefined;
    message.chainMemo = object.chainMemo ?? "";
    return message;
  },
};

function createBaseConsensusState(): ConsensusState {
  return { state: new Uint8Array() };
}

export const ConsensusState = {
  encode(message: ConsensusState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.state.length !== 0) {
      writer.uint32(10).bytes(message.state);
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
          message.state = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ConsensusState {
    return { state: isSet(object.state) ? bytesFromBase64(object.state) : new Uint8Array() };
  },

  toJSON(message: ConsensusState): unknown {
    const obj: any = {};
    message.state !== undefined &&
      (obj.state = base64FromBytes(message.state !== undefined ? message.state : new Uint8Array()));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ConsensusState>, I>>(object: I): ConsensusState {
    const message = createBaseConsensusState();
    message.state = object.state ?? new Uint8Array();
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
