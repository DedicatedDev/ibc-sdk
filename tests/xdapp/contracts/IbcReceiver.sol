//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

struct IbcEndpoint {
    string portId;
    bytes32 channelId;
}

/// In IBC each package must set at least one type of timeout:
/// the timestamp or the block height.
struct IbcTimeout {
    uint64 block;
    uint64 timestamp;
}

struct IbcPacket {
    /// identifies the channel and port on the sending chain.
    IbcEndpoint src;
    /// identifies the channel and port on the receiving chain.
    IbcEndpoint dest;
    /// The sequence number of the packet on the given channel
    uint64 sequence;
    bytes data;
    /// when packet times out, measured on remote chain
    IbcTimeout timeout;
}

interface IbcReceiver {
    function onRecvPacket(IbcPacket calldata packet) external;

    function onAcknowledgementPacket(IbcPacket calldata packet) external;

    function onTimeoutPacket(IbcPacket calldata packet) external;

    function onOpenIbcChannel(string calldata channelId, string calldata version, string calldata error) external;

    function onConnectIbcChannel(string calldata channelId, string calldata error) external;

    function onCloseIbcChannel(string calldata channelId, string calldata error) external;
}