/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";
import { Any } from "../../google/protobuf/any";
import { Channel, Packet } from "../../ibc/core/channel/v1/channel";
import { Height } from "./client";
import { Proof } from "./proof";

export const protobufPackage = "polyibc.core";

/** MsgCreateClient defines a message to create an poly-IBC client */
export interface MsgCreateClient {
  /** light client state */
  clientState?: Any;
  /**
   * consensus state associated with the client that corresponds to a given
   * height.
   */
  consensusState?: Any;
  /** creator address */
  creator: string;
  /** chain memo contains extra details about the chain */
  chainMemo: string;
}

export interface MsgCreateClientResponse {
  /** the created client id */
  clientId: string;
}

/**
 * MsgUpdateClient defines an sdk.Msg to update a poly-IBC client state using
 * the given header.
 */
export interface MsgUpdateClient {
  /** client unique identifier */
  clientId: string;
  /** header to update the light client */
  header?: Any;
  /** creator address */
  creator: string;
}

/** MsgUpdateClientResponse defines the Msg/UpdateClient response type. */
export interface MsgUpdateClientResponse {
  /** light client type */
  type: string;
  /** header height */
  height?: Height;
}

export interface MsgSendIbcPacket {
  creator: string;
  /**
   * the standard ibc port is retrieved from the port registry
   * the standard ibc channelID
   */
  channelID: string;
  /** the standard ibc timeout */
  timeoutTimestamp: string;
  /** contract address on a remote vm (eg. EVM) */
  remoteSenderAddress: Uint8Array;
  /** opaque IBC packet payload */
  payload: Uint8Array;
  /** Proof of the tx where the IBC packet originates */
  proof?: Proof;
}

export interface MsgSendIbcPacketResponse {
}

export interface MsgAcknowledgement {
  /** Ack packet createor */
  creator: string;
  /** the standard ibc channel id */
  channelID: string;
  /** contract addresss on a remote vm (eg. EVM) */
  remoteSenderAddress: Uint8Array;
  /** ibc packet to ack */
  packet?: Packet;
  /** opaque Ack bytes */
  ack: Uint8Array;
  /** Proof of the tx where the Ack packet originates */
  proof?: Proof;
}

export interface MsgAcknowledgementResponse {
}

export interface MsgCreateVibcClient {
  creator: string;
  /** ID of the existing native client created by MsgCreateClient */
  nativeClientID: string;
  /**
   * vibc client params used by the native client.
   * Processing of the `params` bytes vary by native client type.
   */
  params: Uint8Array;
}

export interface MsgCreateVibcClientResponse {
}

export interface MsgCreateVibcConnection {
  creator: string;
  /** ID of VIBC client */
  vibcClientID: string;
  /** delay period for the connection */
  delayPeriod: string;
}

export interface MsgCreateVibcConnectionResponse {
}

/**
 * MsgOpenIBCChannel defines a message that corresponds to the ChanOpenInit or
 * ChanOpenTry
 */
export interface MsgOpenIBCChannel {
  /** vibc port must conform to poly-IBC port naming convention */
  portId: string;
  channel?: Channel;
  counterpartyVersion: string;
  /**
   * proof of ChanOpenInit queried from a Cosmos chain (Polymer chain or others)
   * should be nil if this is first channel handshake step
   */
  proofInit: Uint8Array;
  /**
   * proof height of ChanOpenInit at which the proof is queried
   * should be nil if this is first channel handshake step
   */
  proofInitHeight?: Height;
  /** id of the native client that represents a remote virtual chain */
  nativeClientId: string;
  /**
   * Proof from a virtual chain that proves a user contract did call
   * PolymerCoreSC with exact method name and params
   */
  virtualProof?: Proof;
  /** Relayer address */
  creator: string;
}

export interface MsgOpenIBCChannelResponse {
  channelId: string;
  version: string;
}

/**
 * MsgConnectIBCChannel defines a message that corresponds to the ChanOpenAck or
 * ChanOpenConfirm
 */
export interface MsgConnectIBCChannel {
  /** vibc port must conform to poly-IBC port naming convention */
  portId: string;
  channelId: string;
  counterpartyChannelId: string;
  counterpartyVersion: string;
  /**
   * proof of ChanOpenAck or ChanOpenConfirm queried from a Cosmos chain
   * (Polymer chain or others)
   */
  proof: Uint8Array;
  /**
   * proof height of ChanOpenAck or ChanOpenConfirm at which the proof is
   * queried
   */
  proofHeight?: Height;
  /** id of the native client that represents a remote virtual chain */
  nativeClientId: string;
  /**
   * Proof from a virtual chain that proves a user contract did call
   * PolymerCoreSC with exact method name and params
   */
  virtualProof?: Proof;
  /** Relayer address */
  creator: string;
}

export interface MsgConnectIBCChannelResponse {
}

function createBaseMsgCreateClient(): MsgCreateClient {
  return { clientState: undefined, consensusState: undefined, creator: "", chainMemo: "" };
}

export const MsgCreateClient = {
  encode(message: MsgCreateClient, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.clientState !== undefined) {
      Any.encode(message.clientState, writer.uint32(10).fork()).ldelim();
    }
    if (message.consensusState !== undefined) {
      Any.encode(message.consensusState, writer.uint32(18).fork()).ldelim();
    }
    if (message.creator !== "") {
      writer.uint32(26).string(message.creator);
    }
    if (message.chainMemo !== "") {
      writer.uint32(34).string(message.chainMemo);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgCreateClient {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgCreateClient();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.clientState = Any.decode(reader, reader.uint32());
          break;
        case 2:
          message.consensusState = Any.decode(reader, reader.uint32());
          break;
        case 3:
          message.creator = reader.string();
          break;
        case 4:
          message.chainMemo = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgCreateClient {
    return {
      clientState: isSet(object.clientState) ? Any.fromJSON(object.clientState) : undefined,
      consensusState: isSet(object.consensusState) ? Any.fromJSON(object.consensusState) : undefined,
      creator: isSet(object.creator) ? String(object.creator) : "",
      chainMemo: isSet(object.chainMemo) ? String(object.chainMemo) : "",
    };
  },

  toJSON(message: MsgCreateClient): unknown {
    const obj: any = {};
    message.clientState !== undefined &&
      (obj.clientState = message.clientState ? Any.toJSON(message.clientState) : undefined);
    message.consensusState !== undefined &&
      (obj.consensusState = message.consensusState ? Any.toJSON(message.consensusState) : undefined);
    message.creator !== undefined && (obj.creator = message.creator);
    message.chainMemo !== undefined && (obj.chainMemo = message.chainMemo);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgCreateClient>, I>>(object: I): MsgCreateClient {
    const message = createBaseMsgCreateClient();
    message.clientState = (object.clientState !== undefined && object.clientState !== null)
      ? Any.fromPartial(object.clientState)
      : undefined;
    message.consensusState = (object.consensusState !== undefined && object.consensusState !== null)
      ? Any.fromPartial(object.consensusState)
      : undefined;
    message.creator = object.creator ?? "";
    message.chainMemo = object.chainMemo ?? "";
    return message;
  },
};

function createBaseMsgCreateClientResponse(): MsgCreateClientResponse {
  return { clientId: "" };
}

export const MsgCreateClientResponse = {
  encode(message: MsgCreateClientResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.clientId !== "") {
      writer.uint32(10).string(message.clientId);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgCreateClientResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgCreateClientResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.clientId = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgCreateClientResponse {
    return { clientId: isSet(object.clientId) ? String(object.clientId) : "" };
  },

  toJSON(message: MsgCreateClientResponse): unknown {
    const obj: any = {};
    message.clientId !== undefined && (obj.clientId = message.clientId);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgCreateClientResponse>, I>>(object: I): MsgCreateClientResponse {
    const message = createBaseMsgCreateClientResponse();
    message.clientId = object.clientId ?? "";
    return message;
  },
};

function createBaseMsgUpdateClient(): MsgUpdateClient {
  return { clientId: "", header: undefined, creator: "" };
}

export const MsgUpdateClient = {
  encode(message: MsgUpdateClient, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.clientId !== "") {
      writer.uint32(10).string(message.clientId);
    }
    if (message.header !== undefined) {
      Any.encode(message.header, writer.uint32(18).fork()).ldelim();
    }
    if (message.creator !== "") {
      writer.uint32(26).string(message.creator);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgUpdateClient {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgUpdateClient();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.clientId = reader.string();
          break;
        case 2:
          message.header = Any.decode(reader, reader.uint32());
          break;
        case 3:
          message.creator = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgUpdateClient {
    return {
      clientId: isSet(object.clientId) ? String(object.clientId) : "",
      header: isSet(object.header) ? Any.fromJSON(object.header) : undefined,
      creator: isSet(object.creator) ? String(object.creator) : "",
    };
  },

  toJSON(message: MsgUpdateClient): unknown {
    const obj: any = {};
    message.clientId !== undefined && (obj.clientId = message.clientId);
    message.header !== undefined && (obj.header = message.header ? Any.toJSON(message.header) : undefined);
    message.creator !== undefined && (obj.creator = message.creator);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgUpdateClient>, I>>(object: I): MsgUpdateClient {
    const message = createBaseMsgUpdateClient();
    message.clientId = object.clientId ?? "";
    message.header = (object.header !== undefined && object.header !== null)
      ? Any.fromPartial(object.header)
      : undefined;
    message.creator = object.creator ?? "";
    return message;
  },
};

function createBaseMsgUpdateClientResponse(): MsgUpdateClientResponse {
  return { type: "", height: undefined };
}

export const MsgUpdateClientResponse = {
  encode(message: MsgUpdateClientResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.type !== "") {
      writer.uint32(10).string(message.type);
    }
    if (message.height !== undefined) {
      Height.encode(message.height, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgUpdateClientResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgUpdateClientResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.type = reader.string();
          break;
        case 2:
          message.height = Height.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgUpdateClientResponse {
    return {
      type: isSet(object.type) ? String(object.type) : "",
      height: isSet(object.height) ? Height.fromJSON(object.height) : undefined,
    };
  },

  toJSON(message: MsgUpdateClientResponse): unknown {
    const obj: any = {};
    message.type !== undefined && (obj.type = message.type);
    message.height !== undefined && (obj.height = message.height ? Height.toJSON(message.height) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgUpdateClientResponse>, I>>(object: I): MsgUpdateClientResponse {
    const message = createBaseMsgUpdateClientResponse();
    message.type = object.type ?? "";
    message.height = (object.height !== undefined && object.height !== null)
      ? Height.fromPartial(object.height)
      : undefined;
    return message;
  },
};

function createBaseMsgSendIbcPacket(): MsgSendIbcPacket {
  return {
    creator: "",
    channelID: "",
    timeoutTimestamp: "0",
    remoteSenderAddress: new Uint8Array(),
    payload: new Uint8Array(),
    proof: undefined,
  };
}

export const MsgSendIbcPacket = {
  encode(message: MsgSendIbcPacket, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.creator !== "") {
      writer.uint32(10).string(message.creator);
    }
    if (message.channelID !== "") {
      writer.uint32(18).string(message.channelID);
    }
    if (message.timeoutTimestamp !== "0") {
      writer.uint32(24).uint64(message.timeoutTimestamp);
    }
    if (message.remoteSenderAddress.length !== 0) {
      writer.uint32(34).bytes(message.remoteSenderAddress);
    }
    if (message.payload.length !== 0) {
      writer.uint32(42).bytes(message.payload);
    }
    if (message.proof !== undefined) {
      Proof.encode(message.proof, writer.uint32(50).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgSendIbcPacket {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgSendIbcPacket();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.creator = reader.string();
          break;
        case 2:
          message.channelID = reader.string();
          break;
        case 3:
          message.timeoutTimestamp = longToString(reader.uint64() as Long);
          break;
        case 4:
          message.remoteSenderAddress = reader.bytes();
          break;
        case 5:
          message.payload = reader.bytes();
          break;
        case 6:
          message.proof = Proof.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgSendIbcPacket {
    return {
      creator: isSet(object.creator) ? String(object.creator) : "",
      channelID: isSet(object.channelID) ? String(object.channelID) : "",
      timeoutTimestamp: isSet(object.timeoutTimestamp) ? String(object.timeoutTimestamp) : "0",
      remoteSenderAddress: isSet(object.remoteSenderAddress)
        ? bytesFromBase64(object.remoteSenderAddress)
        : new Uint8Array(),
      payload: isSet(object.payload) ? bytesFromBase64(object.payload) : new Uint8Array(),
      proof: isSet(object.proof) ? Proof.fromJSON(object.proof) : undefined,
    };
  },

  toJSON(message: MsgSendIbcPacket): unknown {
    const obj: any = {};
    message.creator !== undefined && (obj.creator = message.creator);
    message.channelID !== undefined && (obj.channelID = message.channelID);
    message.timeoutTimestamp !== undefined && (obj.timeoutTimestamp = message.timeoutTimestamp);
    message.remoteSenderAddress !== undefined &&
      (obj.remoteSenderAddress = base64FromBytes(
        message.remoteSenderAddress !== undefined ? message.remoteSenderAddress : new Uint8Array(),
      ));
    message.payload !== undefined &&
      (obj.payload = base64FromBytes(message.payload !== undefined ? message.payload : new Uint8Array()));
    message.proof !== undefined && (obj.proof = message.proof ? Proof.toJSON(message.proof) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgSendIbcPacket>, I>>(object: I): MsgSendIbcPacket {
    const message = createBaseMsgSendIbcPacket();
    message.creator = object.creator ?? "";
    message.channelID = object.channelID ?? "";
    message.timeoutTimestamp = object.timeoutTimestamp ?? "0";
    message.remoteSenderAddress = object.remoteSenderAddress ?? new Uint8Array();
    message.payload = object.payload ?? new Uint8Array();
    message.proof = (object.proof !== undefined && object.proof !== null) ? Proof.fromPartial(object.proof) : undefined;
    return message;
  },
};

function createBaseMsgSendIbcPacketResponse(): MsgSendIbcPacketResponse {
  return {};
}

export const MsgSendIbcPacketResponse = {
  encode(_: MsgSendIbcPacketResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgSendIbcPacketResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgSendIbcPacketResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(_: any): MsgSendIbcPacketResponse {
    return {};
  },

  toJSON(_: MsgSendIbcPacketResponse): unknown {
    const obj: any = {};
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgSendIbcPacketResponse>, I>>(_: I): MsgSendIbcPacketResponse {
    const message = createBaseMsgSendIbcPacketResponse();
    return message;
  },
};

function createBaseMsgAcknowledgement(): MsgAcknowledgement {
  return {
    creator: "",
    channelID: "",
    remoteSenderAddress: new Uint8Array(),
    packet: undefined,
    ack: new Uint8Array(),
    proof: undefined,
  };
}

export const MsgAcknowledgement = {
  encode(message: MsgAcknowledgement, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.creator !== "") {
      writer.uint32(10).string(message.creator);
    }
    if (message.channelID !== "") {
      writer.uint32(18).string(message.channelID);
    }
    if (message.remoteSenderAddress.length !== 0) {
      writer.uint32(26).bytes(message.remoteSenderAddress);
    }
    if (message.packet !== undefined) {
      Packet.encode(message.packet, writer.uint32(34).fork()).ldelim();
    }
    if (message.ack.length !== 0) {
      writer.uint32(42).bytes(message.ack);
    }
    if (message.proof !== undefined) {
      Proof.encode(message.proof, writer.uint32(50).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgAcknowledgement {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgAcknowledgement();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.creator = reader.string();
          break;
        case 2:
          message.channelID = reader.string();
          break;
        case 3:
          message.remoteSenderAddress = reader.bytes();
          break;
        case 4:
          message.packet = Packet.decode(reader, reader.uint32());
          break;
        case 5:
          message.ack = reader.bytes();
          break;
        case 6:
          message.proof = Proof.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgAcknowledgement {
    return {
      creator: isSet(object.creator) ? String(object.creator) : "",
      channelID: isSet(object.channelID) ? String(object.channelID) : "",
      remoteSenderAddress: isSet(object.remoteSenderAddress)
        ? bytesFromBase64(object.remoteSenderAddress)
        : new Uint8Array(),
      packet: isSet(object.packet) ? Packet.fromJSON(object.packet) : undefined,
      ack: isSet(object.ack) ? bytesFromBase64(object.ack) : new Uint8Array(),
      proof: isSet(object.proof) ? Proof.fromJSON(object.proof) : undefined,
    };
  },

  toJSON(message: MsgAcknowledgement): unknown {
    const obj: any = {};
    message.creator !== undefined && (obj.creator = message.creator);
    message.channelID !== undefined && (obj.channelID = message.channelID);
    message.remoteSenderAddress !== undefined &&
      (obj.remoteSenderAddress = base64FromBytes(
        message.remoteSenderAddress !== undefined ? message.remoteSenderAddress : new Uint8Array(),
      ));
    message.packet !== undefined && (obj.packet = message.packet ? Packet.toJSON(message.packet) : undefined);
    message.ack !== undefined &&
      (obj.ack = base64FromBytes(message.ack !== undefined ? message.ack : new Uint8Array()));
    message.proof !== undefined && (obj.proof = message.proof ? Proof.toJSON(message.proof) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgAcknowledgement>, I>>(object: I): MsgAcknowledgement {
    const message = createBaseMsgAcknowledgement();
    message.creator = object.creator ?? "";
    message.channelID = object.channelID ?? "";
    message.remoteSenderAddress = object.remoteSenderAddress ?? new Uint8Array();
    message.packet = (object.packet !== undefined && object.packet !== null)
      ? Packet.fromPartial(object.packet)
      : undefined;
    message.ack = object.ack ?? new Uint8Array();
    message.proof = (object.proof !== undefined && object.proof !== null) ? Proof.fromPartial(object.proof) : undefined;
    return message;
  },
};

function createBaseMsgAcknowledgementResponse(): MsgAcknowledgementResponse {
  return {};
}

export const MsgAcknowledgementResponse = {
  encode(_: MsgAcknowledgementResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgAcknowledgementResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgAcknowledgementResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(_: any): MsgAcknowledgementResponse {
    return {};
  },

  toJSON(_: MsgAcknowledgementResponse): unknown {
    const obj: any = {};
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgAcknowledgementResponse>, I>>(_: I): MsgAcknowledgementResponse {
    const message = createBaseMsgAcknowledgementResponse();
    return message;
  },
};

function createBaseMsgCreateVibcClient(): MsgCreateVibcClient {
  return { creator: "", nativeClientID: "", params: new Uint8Array() };
}

export const MsgCreateVibcClient = {
  encode(message: MsgCreateVibcClient, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.creator !== "") {
      writer.uint32(10).string(message.creator);
    }
    if (message.nativeClientID !== "") {
      writer.uint32(18).string(message.nativeClientID);
    }
    if (message.params.length !== 0) {
      writer.uint32(26).bytes(message.params);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgCreateVibcClient {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgCreateVibcClient();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.creator = reader.string();
          break;
        case 2:
          message.nativeClientID = reader.string();
          break;
        case 3:
          message.params = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgCreateVibcClient {
    return {
      creator: isSet(object.creator) ? String(object.creator) : "",
      nativeClientID: isSet(object.nativeClientID) ? String(object.nativeClientID) : "",
      params: isSet(object.params) ? bytesFromBase64(object.params) : new Uint8Array(),
    };
  },

  toJSON(message: MsgCreateVibcClient): unknown {
    const obj: any = {};
    message.creator !== undefined && (obj.creator = message.creator);
    message.nativeClientID !== undefined && (obj.nativeClientID = message.nativeClientID);
    message.params !== undefined &&
      (obj.params = base64FromBytes(message.params !== undefined ? message.params : new Uint8Array()));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgCreateVibcClient>, I>>(object: I): MsgCreateVibcClient {
    const message = createBaseMsgCreateVibcClient();
    message.creator = object.creator ?? "";
    message.nativeClientID = object.nativeClientID ?? "";
    message.params = object.params ?? new Uint8Array();
    return message;
  },
};

function createBaseMsgCreateVibcClientResponse(): MsgCreateVibcClientResponse {
  return {};
}

export const MsgCreateVibcClientResponse = {
  encode(_: MsgCreateVibcClientResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgCreateVibcClientResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgCreateVibcClientResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(_: any): MsgCreateVibcClientResponse {
    return {};
  },

  toJSON(_: MsgCreateVibcClientResponse): unknown {
    const obj: any = {};
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgCreateVibcClientResponse>, I>>(_: I): MsgCreateVibcClientResponse {
    const message = createBaseMsgCreateVibcClientResponse();
    return message;
  },
};

function createBaseMsgCreateVibcConnection(): MsgCreateVibcConnection {
  return { creator: "", vibcClientID: "", delayPeriod: "0" };
}

export const MsgCreateVibcConnection = {
  encode(message: MsgCreateVibcConnection, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.creator !== "") {
      writer.uint32(10).string(message.creator);
    }
    if (message.vibcClientID !== "") {
      writer.uint32(18).string(message.vibcClientID);
    }
    if (message.delayPeriod !== "0") {
      writer.uint32(24).uint64(message.delayPeriod);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgCreateVibcConnection {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgCreateVibcConnection();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.creator = reader.string();
          break;
        case 2:
          message.vibcClientID = reader.string();
          break;
        case 3:
          message.delayPeriod = longToString(reader.uint64() as Long);
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgCreateVibcConnection {
    return {
      creator: isSet(object.creator) ? String(object.creator) : "",
      vibcClientID: isSet(object.vibcClientID) ? String(object.vibcClientID) : "",
      delayPeriod: isSet(object.delayPeriod) ? String(object.delayPeriod) : "0",
    };
  },

  toJSON(message: MsgCreateVibcConnection): unknown {
    const obj: any = {};
    message.creator !== undefined && (obj.creator = message.creator);
    message.vibcClientID !== undefined && (obj.vibcClientID = message.vibcClientID);
    message.delayPeriod !== undefined && (obj.delayPeriod = message.delayPeriod);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgCreateVibcConnection>, I>>(object: I): MsgCreateVibcConnection {
    const message = createBaseMsgCreateVibcConnection();
    message.creator = object.creator ?? "";
    message.vibcClientID = object.vibcClientID ?? "";
    message.delayPeriod = object.delayPeriod ?? "0";
    return message;
  },
};

function createBaseMsgCreateVibcConnectionResponse(): MsgCreateVibcConnectionResponse {
  return {};
}

export const MsgCreateVibcConnectionResponse = {
  encode(_: MsgCreateVibcConnectionResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgCreateVibcConnectionResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgCreateVibcConnectionResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(_: any): MsgCreateVibcConnectionResponse {
    return {};
  },

  toJSON(_: MsgCreateVibcConnectionResponse): unknown {
    const obj: any = {};
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgCreateVibcConnectionResponse>, I>>(_: I): MsgCreateVibcConnectionResponse {
    const message = createBaseMsgCreateVibcConnectionResponse();
    return message;
  },
};

function createBaseMsgOpenIBCChannel(): MsgOpenIBCChannel {
  return {
    portId: "",
    channel: undefined,
    counterpartyVersion: "",
    proofInit: new Uint8Array(),
    proofInitHeight: undefined,
    nativeClientId: "",
    virtualProof: undefined,
    creator: "",
  };
}

export const MsgOpenIBCChannel = {
  encode(message: MsgOpenIBCChannel, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.portId !== "") {
      writer.uint32(10).string(message.portId);
    }
    if (message.channel !== undefined) {
      Channel.encode(message.channel, writer.uint32(18).fork()).ldelim();
    }
    if (message.counterpartyVersion !== "") {
      writer.uint32(26).string(message.counterpartyVersion);
    }
    if (message.proofInit.length !== 0) {
      writer.uint32(34).bytes(message.proofInit);
    }
    if (message.proofInitHeight !== undefined) {
      Height.encode(message.proofInitHeight, writer.uint32(42).fork()).ldelim();
    }
    if (message.nativeClientId !== "") {
      writer.uint32(50).string(message.nativeClientId);
    }
    if (message.virtualProof !== undefined) {
      Proof.encode(message.virtualProof, writer.uint32(58).fork()).ldelim();
    }
    if (message.creator !== "") {
      writer.uint32(66).string(message.creator);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgOpenIBCChannel {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgOpenIBCChannel();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.portId = reader.string();
          break;
        case 2:
          message.channel = Channel.decode(reader, reader.uint32());
          break;
        case 3:
          message.counterpartyVersion = reader.string();
          break;
        case 4:
          message.proofInit = reader.bytes();
          break;
        case 5:
          message.proofInitHeight = Height.decode(reader, reader.uint32());
          break;
        case 6:
          message.nativeClientId = reader.string();
          break;
        case 7:
          message.virtualProof = Proof.decode(reader, reader.uint32());
          break;
        case 8:
          message.creator = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgOpenIBCChannel {
    return {
      portId: isSet(object.portId) ? String(object.portId) : "",
      channel: isSet(object.channel) ? Channel.fromJSON(object.channel) : undefined,
      counterpartyVersion: isSet(object.counterpartyVersion) ? String(object.counterpartyVersion) : "",
      proofInit: isSet(object.proofInit) ? bytesFromBase64(object.proofInit) : new Uint8Array(),
      proofInitHeight: isSet(object.proofInitHeight) ? Height.fromJSON(object.proofInitHeight) : undefined,
      nativeClientId: isSet(object.nativeClientId) ? String(object.nativeClientId) : "",
      virtualProof: isSet(object.virtualProof) ? Proof.fromJSON(object.virtualProof) : undefined,
      creator: isSet(object.creator) ? String(object.creator) : "",
    };
  },

  toJSON(message: MsgOpenIBCChannel): unknown {
    const obj: any = {};
    message.portId !== undefined && (obj.portId = message.portId);
    message.channel !== undefined && (obj.channel = message.channel ? Channel.toJSON(message.channel) : undefined);
    message.counterpartyVersion !== undefined && (obj.counterpartyVersion = message.counterpartyVersion);
    message.proofInit !== undefined &&
      (obj.proofInit = base64FromBytes(message.proofInit !== undefined ? message.proofInit : new Uint8Array()));
    message.proofInitHeight !== undefined &&
      (obj.proofInitHeight = message.proofInitHeight ? Height.toJSON(message.proofInitHeight) : undefined);
    message.nativeClientId !== undefined && (obj.nativeClientId = message.nativeClientId);
    message.virtualProof !== undefined &&
      (obj.virtualProof = message.virtualProof ? Proof.toJSON(message.virtualProof) : undefined);
    message.creator !== undefined && (obj.creator = message.creator);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgOpenIBCChannel>, I>>(object: I): MsgOpenIBCChannel {
    const message = createBaseMsgOpenIBCChannel();
    message.portId = object.portId ?? "";
    message.channel = (object.channel !== undefined && object.channel !== null)
      ? Channel.fromPartial(object.channel)
      : undefined;
    message.counterpartyVersion = object.counterpartyVersion ?? "";
    message.proofInit = object.proofInit ?? new Uint8Array();
    message.proofInitHeight = (object.proofInitHeight !== undefined && object.proofInitHeight !== null)
      ? Height.fromPartial(object.proofInitHeight)
      : undefined;
    message.nativeClientId = object.nativeClientId ?? "";
    message.virtualProof = (object.virtualProof !== undefined && object.virtualProof !== null)
      ? Proof.fromPartial(object.virtualProof)
      : undefined;
    message.creator = object.creator ?? "";
    return message;
  },
};

function createBaseMsgOpenIBCChannelResponse(): MsgOpenIBCChannelResponse {
  return { channelId: "", version: "" };
}

export const MsgOpenIBCChannelResponse = {
  encode(message: MsgOpenIBCChannelResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.channelId !== "") {
      writer.uint32(10).string(message.channelId);
    }
    if (message.version !== "") {
      writer.uint32(18).string(message.version);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgOpenIBCChannelResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgOpenIBCChannelResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.channelId = reader.string();
          break;
        case 2:
          message.version = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgOpenIBCChannelResponse {
    return {
      channelId: isSet(object.channelId) ? String(object.channelId) : "",
      version: isSet(object.version) ? String(object.version) : "",
    };
  },

  toJSON(message: MsgOpenIBCChannelResponse): unknown {
    const obj: any = {};
    message.channelId !== undefined && (obj.channelId = message.channelId);
    message.version !== undefined && (obj.version = message.version);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgOpenIBCChannelResponse>, I>>(object: I): MsgOpenIBCChannelResponse {
    const message = createBaseMsgOpenIBCChannelResponse();
    message.channelId = object.channelId ?? "";
    message.version = object.version ?? "";
    return message;
  },
};

function createBaseMsgConnectIBCChannel(): MsgConnectIBCChannel {
  return {
    portId: "",
    channelId: "",
    counterpartyChannelId: "",
    counterpartyVersion: "",
    proof: new Uint8Array(),
    proofHeight: undefined,
    nativeClientId: "",
    virtualProof: undefined,
    creator: "",
  };
}

export const MsgConnectIBCChannel = {
  encode(message: MsgConnectIBCChannel, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.portId !== "") {
      writer.uint32(10).string(message.portId);
    }
    if (message.channelId !== "") {
      writer.uint32(18).string(message.channelId);
    }
    if (message.counterpartyChannelId !== "") {
      writer.uint32(26).string(message.counterpartyChannelId);
    }
    if (message.counterpartyVersion !== "") {
      writer.uint32(34).string(message.counterpartyVersion);
    }
    if (message.proof.length !== 0) {
      writer.uint32(42).bytes(message.proof);
    }
    if (message.proofHeight !== undefined) {
      Height.encode(message.proofHeight, writer.uint32(50).fork()).ldelim();
    }
    if (message.nativeClientId !== "") {
      writer.uint32(58).string(message.nativeClientId);
    }
    if (message.virtualProof !== undefined) {
      Proof.encode(message.virtualProof, writer.uint32(66).fork()).ldelim();
    }
    if (message.creator !== "") {
      writer.uint32(74).string(message.creator);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgConnectIBCChannel {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgConnectIBCChannel();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.portId = reader.string();
          break;
        case 2:
          message.channelId = reader.string();
          break;
        case 3:
          message.counterpartyChannelId = reader.string();
          break;
        case 4:
          message.counterpartyVersion = reader.string();
          break;
        case 5:
          message.proof = reader.bytes();
          break;
        case 6:
          message.proofHeight = Height.decode(reader, reader.uint32());
          break;
        case 7:
          message.nativeClientId = reader.string();
          break;
        case 8:
          message.virtualProof = Proof.decode(reader, reader.uint32());
          break;
        case 9:
          message.creator = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgConnectIBCChannel {
    return {
      portId: isSet(object.portId) ? String(object.portId) : "",
      channelId: isSet(object.channelId) ? String(object.channelId) : "",
      counterpartyChannelId: isSet(object.counterpartyChannelId) ? String(object.counterpartyChannelId) : "",
      counterpartyVersion: isSet(object.counterpartyVersion) ? String(object.counterpartyVersion) : "",
      proof: isSet(object.proof) ? bytesFromBase64(object.proof) : new Uint8Array(),
      proofHeight: isSet(object.proofHeight) ? Height.fromJSON(object.proofHeight) : undefined,
      nativeClientId: isSet(object.nativeClientId) ? String(object.nativeClientId) : "",
      virtualProof: isSet(object.virtualProof) ? Proof.fromJSON(object.virtualProof) : undefined,
      creator: isSet(object.creator) ? String(object.creator) : "",
    };
  },

  toJSON(message: MsgConnectIBCChannel): unknown {
    const obj: any = {};
    message.portId !== undefined && (obj.portId = message.portId);
    message.channelId !== undefined && (obj.channelId = message.channelId);
    message.counterpartyChannelId !== undefined && (obj.counterpartyChannelId = message.counterpartyChannelId);
    message.counterpartyVersion !== undefined && (obj.counterpartyVersion = message.counterpartyVersion);
    message.proof !== undefined &&
      (obj.proof = base64FromBytes(message.proof !== undefined ? message.proof : new Uint8Array()));
    message.proofHeight !== undefined &&
      (obj.proofHeight = message.proofHeight ? Height.toJSON(message.proofHeight) : undefined);
    message.nativeClientId !== undefined && (obj.nativeClientId = message.nativeClientId);
    message.virtualProof !== undefined &&
      (obj.virtualProof = message.virtualProof ? Proof.toJSON(message.virtualProof) : undefined);
    message.creator !== undefined && (obj.creator = message.creator);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgConnectIBCChannel>, I>>(object: I): MsgConnectIBCChannel {
    const message = createBaseMsgConnectIBCChannel();
    message.portId = object.portId ?? "";
    message.channelId = object.channelId ?? "";
    message.counterpartyChannelId = object.counterpartyChannelId ?? "";
    message.counterpartyVersion = object.counterpartyVersion ?? "";
    message.proof = object.proof ?? new Uint8Array();
    message.proofHeight = (object.proofHeight !== undefined && object.proofHeight !== null)
      ? Height.fromPartial(object.proofHeight)
      : undefined;
    message.nativeClientId = object.nativeClientId ?? "";
    message.virtualProof = (object.virtualProof !== undefined && object.virtualProof !== null)
      ? Proof.fromPartial(object.virtualProof)
      : undefined;
    message.creator = object.creator ?? "";
    return message;
  },
};

function createBaseMsgConnectIBCChannelResponse(): MsgConnectIBCChannelResponse {
  return {};
}

export const MsgConnectIBCChannelResponse = {
  encode(_: MsgConnectIBCChannelResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MsgConnectIBCChannelResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMsgConnectIBCChannelResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(_: any): MsgConnectIBCChannelResponse {
    return {};
  },

  toJSON(_: MsgConnectIBCChannelResponse): unknown {
    const obj: any = {};
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MsgConnectIBCChannelResponse>, I>>(_: I): MsgConnectIBCChannelResponse {
    const message = createBaseMsgConnectIBCChannelResponse();
    return message;
  },
};

/** Msg defines the Msg service. */
export interface Msg {
  /**
   * CreateClient creates a new native light client. All client types share the
   * endpoint and msg type. Msg payload determines the client type.
   */
  CreateClient(request: MsgCreateClient): Promise<MsgCreateClientResponse>;
  /** UpdateClient updates an existing native light client with a new header. */
  UpdateClient(request: MsgUpdateClient): Promise<MsgUpdateClientResponse>;
  /** SendPolyIbcPkt defines an RPC handler method for MsgSendIbcPacket */
  SendIbcPacket(request: MsgSendIbcPacket): Promise<MsgSendIbcPacketResponse>;
  /** AcknowledgePacket defines an RPC handler method for MscIbcPacket */
  Acknowledgement(request: MsgAcknowledgement): Promise<MsgAcknowledgementResponse>;
  /**
   * CreateVibcClient creates a virtual IBC client that wraps an existing native
   * client
   */
  CreateVibcClient(request: MsgCreateVibcClient): Promise<MsgCreateVibcClientResponse>;
  /**
   * CreateVibcConnection creates a virtual IBC connection between the specified
   * vibc client and Polymer client
   */
  CreateVibcConnection(request: MsgCreateVibcConnection): Promise<MsgCreateVibcConnectionResponse>;
  /**
   * OpenIBCChannel relays contract call on virtual chains. It's equivalent to
   * ChanOpenInit or ChanOpenTry depending on the counterparty channel state.
   */
  OpenIBCChannel(request: MsgOpenIBCChannel): Promise<MsgOpenIBCChannelResponse>;
  /**
   * ConnectIBCChannel relays contract call on virtual chains. It's equivalent
   * to ChanOpenAck or ChanOpenConfirm depending on the counterparty channel
   * state.
   */
  ConnectIBCChannel(request: MsgConnectIBCChannel): Promise<MsgConnectIBCChannelResponse>;
}

export class MsgClientImpl implements Msg {
  private readonly rpc: Rpc;
  private readonly service: string;
  constructor(rpc: Rpc, opts?: { service?: string }) {
    this.service = opts?.service || "polyibc.core.Msg";
    this.rpc = rpc;
    this.CreateClient = this.CreateClient.bind(this);
    this.UpdateClient = this.UpdateClient.bind(this);
    this.SendIbcPacket = this.SendIbcPacket.bind(this);
    this.Acknowledgement = this.Acknowledgement.bind(this);
    this.CreateVibcClient = this.CreateVibcClient.bind(this);
    this.CreateVibcConnection = this.CreateVibcConnection.bind(this);
    this.OpenIBCChannel = this.OpenIBCChannel.bind(this);
    this.ConnectIBCChannel = this.ConnectIBCChannel.bind(this);
  }
  CreateClient(request: MsgCreateClient): Promise<MsgCreateClientResponse> {
    const data = MsgCreateClient.encode(request).finish();
    const promise = this.rpc.request(this.service, "CreateClient", data);
    return promise.then((data) => MsgCreateClientResponse.decode(new _m0.Reader(data)));
  }

  UpdateClient(request: MsgUpdateClient): Promise<MsgUpdateClientResponse> {
    const data = MsgUpdateClient.encode(request).finish();
    const promise = this.rpc.request(this.service, "UpdateClient", data);
    return promise.then((data) => MsgUpdateClientResponse.decode(new _m0.Reader(data)));
  }

  SendIbcPacket(request: MsgSendIbcPacket): Promise<MsgSendIbcPacketResponse> {
    const data = MsgSendIbcPacket.encode(request).finish();
    const promise = this.rpc.request(this.service, "SendIbcPacket", data);
    return promise.then((data) => MsgSendIbcPacketResponse.decode(new _m0.Reader(data)));
  }

  Acknowledgement(request: MsgAcknowledgement): Promise<MsgAcknowledgementResponse> {
    const data = MsgAcknowledgement.encode(request).finish();
    const promise = this.rpc.request(this.service, "Acknowledgement", data);
    return promise.then((data) => MsgAcknowledgementResponse.decode(new _m0.Reader(data)));
  }

  CreateVibcClient(request: MsgCreateVibcClient): Promise<MsgCreateVibcClientResponse> {
    const data = MsgCreateVibcClient.encode(request).finish();
    const promise = this.rpc.request(this.service, "CreateVibcClient", data);
    return promise.then((data) => MsgCreateVibcClientResponse.decode(new _m0.Reader(data)));
  }

  CreateVibcConnection(request: MsgCreateVibcConnection): Promise<MsgCreateVibcConnectionResponse> {
    const data = MsgCreateVibcConnection.encode(request).finish();
    const promise = this.rpc.request(this.service, "CreateVibcConnection", data);
    return promise.then((data) => MsgCreateVibcConnectionResponse.decode(new _m0.Reader(data)));
  }

  OpenIBCChannel(request: MsgOpenIBCChannel): Promise<MsgOpenIBCChannelResponse> {
    const data = MsgOpenIBCChannel.encode(request).finish();
    const promise = this.rpc.request(this.service, "OpenIBCChannel", data);
    return promise.then((data) => MsgOpenIBCChannelResponse.decode(new _m0.Reader(data)));
  }

  ConnectIBCChannel(request: MsgConnectIBCChannel): Promise<MsgConnectIBCChannelResponse> {
    const data = MsgConnectIBCChannel.encode(request).finish();
    const promise = this.rpc.request(this.service, "ConnectIBCChannel", data);
    return promise.then((data) => MsgConnectIBCChannelResponse.decode(new _m0.Reader(data)));
  }
}

interface Rpc {
  request(service: string, method: string, data: Uint8Array): Promise<Uint8Array>;
}

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
