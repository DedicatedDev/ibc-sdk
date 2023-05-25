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
    /**
     * This func is called by a 'relayer' on behalf of a dApp. The dApp should be implements IbcReceiver.
     * The dApp should implement the onOpenIbcChannel method to handle one of the first two channel handshake methods,
     * ie. ChanOpenInit or ChanOpenTry.
     * If callback succeeds, the dApp should return the selected version, and an emitted event will be relayed to the
     * IBC/VIBC hub chain.
     */
    function openIbcChannel(
        IbcReceiver portAddress,
        bytes32 version,
        ChannelOrder ordering,
        string[] calldata connectionHops,
        bytes32 counterpartyChannelId,
        string calldata counterpartyPortId,
        bytes32 counterpartyVersion
    ) external;

    /**
     * This func is called by a 'relayer' after the IBC/VIBC hub chain has processed the onOpenIbcChannel event.
     * The dApp should implement the onConnectIbcChannel method to handle the last two channel handshake methods, ie.
     * ChanOpenAck or ChanOpenConfirm.
     */
    function connectIbcChannel(
        IbcReceiver portAddress,
        bytes32 channelId,
        string[] calldata connectionHops,
        ChannelOrder ordering,
        string calldata counterpartyPortId,
        bytes32 counterpartyChannelId,
        bytes32 counterpartyVersion,
        Proof calldata proof
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
