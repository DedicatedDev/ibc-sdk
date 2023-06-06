### Navigate

[Previous](./index.md) / [Go back HOME](../index.md) / [Next](./3-interact.md)

# Using IBC in CosmWasm contracts

IBC (Inter-blockchain communication) is the crown jewel of the Cosmos ecosystem and CosmWasm was designed with interoperability in mind.

> Fun fact. The central role for interoperability should come as no surprise as the "father of CosmWasm", Ethan Frey, was also one of the people instrumental to the early design of IBC.

Still, documentation on using IBC enabled smart contracts is currently rather scarce. Which is why the most important aspects will be mentioned here.

Some resources that are available:

- [Ethan Frey workshop at HackAtom Seoul](https://www.youtube.com/watch?v=Nuc4K4FRRy8) (video)
- [IBC docs in cosmwasm GitHub](https://github.com/CosmWasm/cosmwasm/blob/main/IBC.md) (docs)
- [Minimalistic IBC smart contract(s) by Zeke](https://github.com/0xekez/cw-ibc-example) (code)

## IBC & CosmWasm

To start thinking about how to use IBC to create interoperable smart contracts, it makes sense to first remember the overall picture... .

![CosmWasm overview](../../../assets/images/cosmwasm/36.jpg)

As explained in the previous section, CW contracts are being compiled to WebAssembly (wasm), which are run in the CW virtual machine that imported into **added to a Cosmos SDK chain**.

Now, this context is important as nowadays (post the Stargate update) IBC ([ibc-go](https://github.com/cosmos/ibc-go)) is included by default in every Cosmos SDK chain.

> Note: when developing with IBC features, it is important to add the stargate feature of the `cosmwasm-std` dependency in `Cargo.toml`

```toml
cosmwasm-std = { version = "1.1.3", features = ["stargate"] }
```

As a result, IBC enabled smart contracts benefit from a lot of core functionality being readily available and CW contracts wishing to interoperate with contracts or modules on other chains can be thought of as IBC applications, according to the IBC application/transport separation. Please read the [section on IBC](../../polymer/2-ibc.md) for more info.

### IBC application requirements

From the [IBC documentation on IBC apps](https://ibc.cosmos.network/main/ibc/apps/apps.html), these are the tasks to implement to make your smart contract IBC enabled:

- implement the `IBCModule` interface, i.e.:
  - channel (opening) handshake callbacks
  - channel closing handshake callbacks
  - packet callbacks
- define your own packet data and acknowledgement structs as well as how to encode/decode them

The following requirements will be taken care of by the `x/wasm` module:

- bind to a port(s)
- add keeper methods
- add a route to the IBC router

## The IBC callbacks

The [simple IBC enabled contract](https://github.com/0xekez/cw-ibc-example) by 0xekez provides a good overview to undertand what you'll need to implement.

> Note: all of the IBC callback code will be grouped in a separate file in the `/src` directory of the project, `ibc.rs`.

### Channel opening/closing callbacks

To connect two CosmWasm contracts over IBC you must establish an IBC channel between them.

An IBC channel is defined as:

```rust [https://github.com/CosmWasm/cosmwasm/blob/main/packages/std/src/ibc.rs#L120]
/// IbcChannel defines all information on a channel.
/// This is generally used in the hand-shake process, but can be queried directly.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, JsonSchema)]
#[non_exhaustive]
pub struct IbcChannel {
    pub endpoint: IbcEndpoint,
    pub counterparty_endpoint: IbcEndpoint,
    pub order: IbcOrder,
    /// Note: in ibcv3 this may be "", in the IbcOpenChannel handshake messages
    pub version: String,
    /// The connection upon which this channel was created. If this is a multi-hop
    /// channel, we only expose the first hop.
    pub connection_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, JsonSchema)]
pub struct IbcEndpoint {
    pub port_id: String,
    pub channel_id: String,
}

```

IBC channel are established using a
four way handshake. Here is a reminder of the steps:

1. `OpenInit` Hello chain B, here is information that you can use to
   verify I am chain A. Do you have information I can use?
2. `OpenTry` Hello chain A, I have verified that you are who you say
   you are. Here is my verification information.
3. `OpenAck` Hello chain B. Thank you for that information I have
   verified you are who you say you are. I am now ready to talk.
4. `OpenConfirm` Hello chain A. I am also now ready to talk.

The channel handshake (and closing handshake) are implemented through these callbacks:

1. `ibc_channel_open` - Handles the `OpenInit` and `OpenTry` handshake
   steps.

2. `ibc_channel_connect` - Handles the `OpenAck` and `OpenConfirm`
   handshake steps.
3. `ibc_channel_close` - Handles the closing of an IBC channel by the counterparty.

> Note: for regulars of ibc-go, this may seem like the channel handshake is missing two callbacks. However, it is simply CW internals picking the right choice of handshake step during both `ibc_channel_open` and `ibc_channel_connect` as depending on where the handshake was triggered each side will only go through two of the steps.

Once the channel is set up, packets can be sent over it and to handle this, the packet callbacks need to be set up.

### Packet callbacks

An IBC packet, implementing the IBC spec, look as follows in CW:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, JsonSchema)]
#[non_exhaustive]
pub struct IbcPacket {
    /// The raw data sent from the other side in the packet
    pub data: Binary,
    /// identifies the channel and port on the sending chain.
    pub src: IbcEndpoint,
    /// identifies the channel and port on the receiving chain.
    pub dest: IbcEndpoint,
    /// The sequence number of the packet on the given channel
    pub sequence: u64,
    pub timeout: IbcTimeout,
}
```

The data field is where the desired data to be sent over is encoded (agreed upon in the channel version during the handshake) and stored (to be decoded and interpreted on the receiving end).

To be more precise, the above IbcPacket is built internally, by providing he following `IbcMsg` when the user (or another smart contract) triggers a `SendPacket`.

```rust
pub enum IbcMsg {
    /// Sends an IBC packet with given data over the existing channel.
    /// Data should be encoded in a format defined by the channel version,
    /// and the module on the other side should know how to parse this.
    SendPacket {
        channel_id: String,
        data: Binary,
        /// when packet times out, measured on remote chain
        timeout: IbcTimeout,
    },
}
```

For example, for an ICS-20 token transfer:

```rust
pub enum IbcMsg {
    /// Sends bank tokens owned by the contract to the given address on another chain.
    /// The channel must already be established between the ibctransfer module on this chain
    /// and a matching module on the remote chain.
    /// We cannot select the port_id, this is whatever the local chain has bound the ibctransfer
    /// module to.
    Transfer {
        /// exisiting channel to send the tokens over
        channel_id: String,
        /// address on the remote chain to receive these tokens
        to_address: String,
        /// packet data only supports one coin
        /// https://github.com/cosmos/cosmos-sdk/blob/v0.40.0/proto/ibc/applications/transfer/v1/transfer.proto#L11-L20
        amount: Coin,
        /// when packet times out, measured on remote chain
        timeout: IbcTimeout,
    }
}
```

Once the packet is sent, the `RecvPacket` callback is triggered. Following the spec this returns an acknowledgement (success or error). This acknowledgment in turn will trigger the `AcknowledgePacket` flow, and call the acknowledgment callback.

If the packet is never received during the timeout period, a `TimeoutPacket` flow can be triggered on the source chain.

4. `ibc_packet_receive` - Handles receiving IBC packets from the
   counterparty.
5. `ibc_packet_ack` - Handles ACK messages from the countarparty. This
   is effectively identical to the ACK message type in [TCP](https://developer.mozilla.org/en-US/docs/Glossary/TCP_handshake).
6. `ibc_packet_timeout` - Handles packet timeouts.

The packet lifecylce and its callbacks are the more complicated parts of the flow, please refer to the [official CW docs](https://github.com/CosmWasm/cosmwasm/blob/main/IBC.md#packet-lifecycle) on it or look at the example provided by 0xekez to learn by doing.

### Acknowledgement

The IBC spec recommends the following format for acknowledgments:

```protobuf
message Acknowledgement {
  // response contains either a result or an error and must be non-empty
  oneof response {
    bytes  result = 21;
    string error  = 22;
  }
}
```

To add it to your CW project, add the following code to a file `src/ack.rs`. It handles the creation of acknowlegments for both success and error cases.

```rust
use cosmwasm_std::{to_binary, Binary};
use cosmwasm_schema::cw_serde;

#[cw_serde]
pub enum Ack {
  Result(Binary),
  Error(String),
}

pub fn make_ack_success() -> Binary {
  let res = Ack::Result(b"1".into());
  to_binary(&res).unwrap()
}

pub fn make_ack_fail(err: String) -> Binary {
  let res = Ack::Error(err);
  to_binary(&res).unwrap()
}
```

### Port binding

Having implemented these methods, once you instantiate an instance of the contract it will be assigned a port (automatically). Ports identify a receiver on a blockchain in much the same way as ports identify applications on a computer.

## The actor model

🚧 This section is still a work in progress... 🚧

In the meantime, check out the [Archway docs on the actor model](https://docs.archway.io/developers/cosmwasm-documentation/architecture/actor-model-intro).

We quote from them:

> CosmWasm contracts leverage the Inter-Blockchain Communication protocol (IBC), making it possible to handle authentication and data transport between blockchains. Because IBC provides a permissionless way for relaying data packets between blockchains, CosmWasm allows you to write code on one chain that can execute a transaction on another chain. </br>
> In order to achieve this, CosmWasm fully adopts the actor model, ensuring that the code is designed with IBC usage in mind. As a result, in CosmWasm, messages follow a "fire-and-forget" approach, eliminating the need to await promises and reducing concerns about race conditions and reentrancy attacks. By incorporating IBC primitives into CosmWasm's libraries, you can unlock the full potential of inter-chain messaging and execution.

### Navigate

[Previous](./1-cosmwasm.md) / [Go back HOME](../index.md) / [Next](./3-interact.md)
