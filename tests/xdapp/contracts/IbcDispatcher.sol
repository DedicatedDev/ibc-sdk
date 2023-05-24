//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import './IbcReceiver.sol';

enum ChannelOrder {
    UNORDERED,
    ORDERED
}

struct Proof {
    // block height at which the proof is valid for a membership or non-membership at the given keyPath
    uint64 proofHeight;
    // ics23 merkle proof
    bytes proof;
}

/**
 * @title IbcDispatcher
 * @author Polymer Labs
 * @notice IBC dispatcher interface is the Polymer Core Smart Contract that implements the core IBC protocol.
 */
interface IbcDispatcher {
    function openIbcChannel(
        address portAddress,
        bytes32 version,
        ChannelOrder ordering,
        string[] calldata connectionHops,
        bytes32 counterpartyChannelId,
        string calldata counterpartyPortId,
        bytes32 counterpartyVersion,
        Proof calldata proof
    ) external;

    function connectIbcChannel(
        string calldata channelId,
        string calldata counterpartyChannelId,
        string calldata counterPartyPort,
        string calldata counterpartyVersion
    ) external;

    function closeIbcChannel(string calldata channelId) external;

    function sendPacket(bytes32 channelId, bytes calldata payload, uint64 timeoutTimestamp) external;

    function onRecvPacket(IbcReceiver receiver, IbcPacket calldata packet, Proof calldata proof) external;

    function onAcknowledgementPacket(
        IbcReceiver receiver,
        IbcPacket calldata packet,
        bytes calldata acknowledgement,
        Proof calldata proof
    ) external;

    function onTimeoutPacket(IbcReceiver receiver, IbcPacket calldata packet, Proof calldata proof) external;
}
