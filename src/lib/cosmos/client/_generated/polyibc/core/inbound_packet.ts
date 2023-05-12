/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";

export const protobufPackage = "polyibc.core";

export interface InboundPacket {
  id: string;
  /** sender maybe a contract address from a remote VM or just a regular cosmos-chain account */
  sender: string;
  /** srcChannelId is the source/sender IBC channel ID */
  srcChannelId: string;
  /** destChannelId is the destination IBC channel ID */
  destChannelId: string;
  /** opaque payload bytes */
  payload: Uint8Array;
}

function createBaseInboundPacket(): InboundPacket {
  return { id: "0", sender: "", srcChannelId: "", destChannelId: "", payload: new Uint8Array() };
}

export const InboundPacket = {
  encode(message: InboundPacket, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.id !== "0") {
      writer.uint32(8).uint64(message.id);
    }
    if (message.sender !== "") {
      writer.uint32(18).string(message.sender);
    }
    if (message.srcChannelId !== "") {
      writer.uint32(26).string(message.srcChannelId);
    }
    if (message.destChannelId !== "") {
      writer.uint32(34).string(message.destChannelId);
    }
    if (message.payload.length !== 0) {
      writer.uint32(42).bytes(message.payload);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): InboundPacket {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseInboundPacket();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.id = longToString(reader.uint64() as Long);
          break;
        case 2:
          message.sender = reader.string();
          break;
        case 3:
          message.srcChannelId = reader.string();
          break;
        case 4:
          message.destChannelId = reader.string();
          break;
        case 5:
          message.payload = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): InboundPacket {
    return {
      id: isSet(object.id) ? String(object.id) : "0",
      sender: isSet(object.sender) ? String(object.sender) : "",
      srcChannelId: isSet(object.srcChannelId) ? String(object.srcChannelId) : "",
      destChannelId: isSet(object.destChannelId) ? String(object.destChannelId) : "",
      payload: isSet(object.payload) ? bytesFromBase64(object.payload) : new Uint8Array(),
    };
  },

  toJSON(message: InboundPacket): unknown {
    const obj: any = {};
    message.id !== undefined && (obj.id = message.id);
    message.sender !== undefined && (obj.sender = message.sender);
    message.srcChannelId !== undefined && (obj.srcChannelId = message.srcChannelId);
    message.destChannelId !== undefined && (obj.destChannelId = message.destChannelId);
    message.payload !== undefined &&
      (obj.payload = base64FromBytes(message.payload !== undefined ? message.payload : new Uint8Array()));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<InboundPacket>, I>>(object: I): InboundPacket {
    const message = createBaseInboundPacket();
    message.id = object.id ?? "0";
    message.sender = object.sender ?? "";
    message.srcChannelId = object.srcChannelId ?? "";
    message.destChannelId = object.destChannelId ?? "";
    message.payload = object.payload ?? new Uint8Array();
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
