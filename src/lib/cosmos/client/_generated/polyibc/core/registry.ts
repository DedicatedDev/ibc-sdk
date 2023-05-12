/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";

export const protobufPackage = "polyibc.core";

export interface Registry {
  /** the polyibc relayer operator who submitted the tx for port registration */
  creator: string;
  /** the standard ibc port ID */
  port: string;
}

export interface RegistryAddr {
  /** remove address which created the port */
  address: string;
  /** corresponding registry message */
  registry?: Registry;
}

export interface PortInfo {
  /** address which created the port */
  address: Uint8Array;
  /** the client ID associate with the port */
  clientId: string;
}

export interface PortId {
  /** a port id */
  portId: string;
}

function createBaseRegistry(): Registry {
  return { creator: "", port: "" };
}

export const Registry = {
  encode(message: Registry, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.creator !== "") {
      writer.uint32(10).string(message.creator);
    }
    if (message.port !== "") {
      writer.uint32(18).string(message.port);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Registry {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRegistry();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.creator = reader.string();
          break;
        case 2:
          message.port = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Registry {
    return {
      creator: isSet(object.creator) ? String(object.creator) : "",
      port: isSet(object.port) ? String(object.port) : "",
    };
  },

  toJSON(message: Registry): unknown {
    const obj: any = {};
    message.creator !== undefined && (obj.creator = message.creator);
    message.port !== undefined && (obj.port = message.port);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Registry>, I>>(object: I): Registry {
    const message = createBaseRegistry();
    message.creator = object.creator ?? "";
    message.port = object.port ?? "";
    return message;
  },
};

function createBaseRegistryAddr(): RegistryAddr {
  return { address: "", registry: undefined };
}

export const RegistryAddr = {
  encode(message: RegistryAddr, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.address !== "") {
      writer.uint32(10).string(message.address);
    }
    if (message.registry !== undefined) {
      Registry.encode(message.registry, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RegistryAddr {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRegistryAddr();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.address = reader.string();
          break;
        case 2:
          message.registry = Registry.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RegistryAddr {
    return {
      address: isSet(object.address) ? String(object.address) : "",
      registry: isSet(object.registry) ? Registry.fromJSON(object.registry) : undefined,
    };
  },

  toJSON(message: RegistryAddr): unknown {
    const obj: any = {};
    message.address !== undefined && (obj.address = message.address);
    message.registry !== undefined && (obj.registry = message.registry ? Registry.toJSON(message.registry) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<RegistryAddr>, I>>(object: I): RegistryAddr {
    const message = createBaseRegistryAddr();
    message.address = object.address ?? "";
    message.registry = (object.registry !== undefined && object.registry !== null)
      ? Registry.fromPartial(object.registry)
      : undefined;
    return message;
  },
};

function createBasePortInfo(): PortInfo {
  return { address: new Uint8Array(), clientId: "" };
}

export const PortInfo = {
  encode(message: PortInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.address.length !== 0) {
      writer.uint32(10).bytes(message.address);
    }
    if (message.clientId !== "") {
      writer.uint32(18).string(message.clientId);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): PortInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBasePortInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.address = reader.bytes();
          break;
        case 2:
          message.clientId = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): PortInfo {
    return {
      address: isSet(object.address) ? bytesFromBase64(object.address) : new Uint8Array(),
      clientId: isSet(object.clientId) ? String(object.clientId) : "",
    };
  },

  toJSON(message: PortInfo): unknown {
    const obj: any = {};
    message.address !== undefined &&
      (obj.address = base64FromBytes(message.address !== undefined ? message.address : new Uint8Array()));
    message.clientId !== undefined && (obj.clientId = message.clientId);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<PortInfo>, I>>(object: I): PortInfo {
    const message = createBasePortInfo();
    message.address = object.address ?? new Uint8Array();
    message.clientId = object.clientId ?? "";
    return message;
  },
};

function createBasePortId(): PortId {
  return { portId: "0" };
}

export const PortId = {
  encode(message: PortId, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.portId !== "0") {
      writer.uint32(8).uint64(message.portId);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): PortId {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBasePortId();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.portId = longToString(reader.uint64() as Long);
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): PortId {
    return { portId: isSet(object.portId) ? String(object.portId) : "0" };
  },

  toJSON(message: PortId): unknown {
    const obj: any = {};
    message.portId !== undefined && (obj.portId = message.portId);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<PortId>, I>>(object: I): PortId {
    const message = createBasePortId();
    message.portId = object.portId ?? "0";
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
