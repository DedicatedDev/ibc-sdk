//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import './IbcReceiver.sol';

enum IbcOrder {
    UNORDERED,
    ORDERED
}

struct Proof {
    bytes keyPath;  // packet key path
    bytes value;  // packet commitment
    bytes proof;
}

interface IbcDispatcher {
    function sendIbcPacket(
        bytes32 channelId,
        bytes calldata payload,
        uint64 timeoutBlockTimestamp
    ) external;

    function onRecvPacket(
        IbcReceiver receiver,
        IbcPacket calldata packet,
        Proof calldata proof
    ) external;

    function openIbcChannel(
        string calldata connectionId,
        string calldata counterPartyConnectionId,
        string calldata counterPartyPort,
        IbcOrder order,
        string calldata version
    ) external;

    function onOpenIbcChannel(
        IbcReceiver receiver,
        string calldata channelId,
        string calldata version,
        Proof calldata proof,
        string calldata error
    ) external;

    function connectIbcChannel(
        string calldata channelId,
        string calldata counterPartyChannelId,
        string calldata counterPartyPort,
        string calldata counterpartyVersion
    ) external;

    function onConnectIbcChannel(
        IbcReceiver receiver,
        string calldata channelId,
        Proof calldata proof,
        string calldata error
    ) external;

    function closeIbcChannel(
        string calldata channelId
    ) external;

    function onCloseIbcChannel(
        IbcReceiver receiver,
        string calldata channelId,
        Proof calldata proof,
        string calldata error
    ) external;

    function onAcknowledgementPacket(
        IbcReceiver receiver,
        IbcPacket calldata packet,
        bytes calldata acknowledgement,
        Proof calldata proof
    ) external;

    function onTimeoutPacket(
        IbcReceiver receiver,
        IbcPacket calldata packet,
        Proof calldata proof
    ) external;
}

