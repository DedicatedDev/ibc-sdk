//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';
import 'hardhat/console.sol';

import './IbcDispatcher.sol';
import './IbcReceiver.sol';
import './IbcVerifier.sol';

struct LightClient {
    bytes clientState;
    bytes consensusState;
}

/**
 * @title Dispatcher
 * @author Polymer Labs
 * @notice
 *     Contract callers call this contract to send IBC-like msg,
 *     which can be relayed to a rollup module on the Polymerase chain
 */
contract Dispatcher is Ownable, IbcDispatcher {
    //
    // channel events
    //

    event OpenIbcChannel(
        string connectionId,
        address indexed connectionPortId,
        string counterPartyConnectionId,
        string counterPartyPortId,
        string version
    );

    event ConnectIbcChannel(
        string channelId,
        address indexed portId,
        string counterPartyChannelId,
        string counterPartyPortId,
        string counterPartyVersion
    );

    event CloseIbcChannel(string channelId, address indexed portId);

    //
    // packet events
    //

    event SendPacket(
        address indexed portId,
        bytes32 indexed channelId,
        bytes packet,
        // timeoutTimestamp is in UNIX nano seconds; packet will be rejected if
        // delivered after this timestamp on the receiving chain.
        // Timeout semantics is compliant to IBC spec and ibc-go implementation
        uint64 timeoutTimestamp
    );

    event OnRecvPacket(
        bytes32 indexed srcChannelId,
        string srcPortId,
        bytes32 indexed destChannelId,
        string destPortId,
        bytes data,
        uint64 sequence
    );

    //
    // fields
    //

    ZKMintVerifier public verifier;
    bool isClientCreated;
    bytes public latestConsensusState;

    //
    // methods
    //

    constructor(address _verifier) {
        verifier = ZKMintVerifier(_verifier);
        isClientCreated = false;
    }

    //
    // Client methods
    //

    /**
     * @dev Creates a new client with the given `clientState`, and `consensusState`.
     * @param clientState The initial client state.
     * @param consensusState The initial consensus state.
     */
    function createClient(bytes calldata clientState, bytes calldata consensusState) external onlyOwner {
        require(!isClientCreated, 'Client already created');
        isClientCreated = true;
        latestConsensusState = consensusState;
    }

    /**
     * @dev Updates the consensus state for an existing client with the specified ID.
     *
     * Requirements:
     * - The client with the given ID must already exist.
     * - The consensus state must pass verification.
     *
     * @param consensusState The new consensus state for the client.
     */
    function updateClient(bytes calldata consensusState) external {
        require(isClientCreated, 'Client not created');
        require(verifier.verify(consensusState), 'Consensus state verification failed');
        latestConsensusState = consensusState;
    }

    /**
     * @notice Verify the given proof data
     * @dev This function currently only checks if the proof length is non-zero
     * @param proof The proof data to be verified
     * @return A boolean value indicating if the proof is valid
     */
    function verify(Proof calldata proof) internal returns (bool) {
        // TODO: replace with real merkle verification logic
        if (proof.proof.length == 0) {
            return false;
        }
        return true;
    }

    //
    // IBC Channel methods
    //

    /**
     * @notice Opens a new IBC channel on the Polymer chain.
     * @dev Emits an OpenIbcChannel event.
     * @param connectionId ID of the connection to open the channel on
     * @param counterPartyConnectionId ID of the counterparty connection
     * @param counterPartyPortId ID of the counterparty port
     * @param order the order of the channel
     * @param version version of the channel
     */
    function openIbcChannel(
        string calldata connectionId,
        string calldata counterPartyConnectionId,
        string calldata counterPartyPortId,
        IbcOrder order,
        string calldata version
    ) external {
        emit OpenIbcChannel(connectionId, msg.sender, counterPartyConnectionId, counterPartyPortId, version);
    }

    /**
     * @notice Callback function called by the relayer when the channel is opened on the Polymer chain.
     * @dev Verifies the given proof and calls the `onOpenIbcChannel` function on the given `receiver` contract
     * @param receiver The contract address that adhere to IbReceiver interface. It will be called when provided proof is verified.
     * If the address doesn't satisfy the interface, the transaction will be reverted.
     * @param channelId The ID of the opened IBC channel
     * @param version The version of the opened IBC channel
     * @param proof The proof data needed to verify the channel opening
     * @param error Any error message associated with the channel opening, or an empty string if successful
     * @dev Throws an error if the proof verification fails
     */
    function onOpenIbcChannel(
        IbcReceiver receiver,
        string calldata channelId,
        string calldata version,
        Proof calldata proof,
        string calldata error
    ) external {
        require(verify(proof), 'Proof verification failed');
        // TODO: we need to provide a way to user SC to map original request to the callback
        receiver.onOpenIbcChannel(channelId, version, error);
    }

    /**
     * @notice Connects an IBC channel with a counterparty IBC channel
     * @dev Emits a `ConnectIbcChannel` event with the given parameters
     * @param channelId The ID of the IBC channel
     * @param counterPartyChannelId The ID of the counterparty IBC channel
     * @param counterPartyPortId The ID of the counterparty IBC port
     * @param counterPartyVersion The version of the counterparty IBC channel
     */
    function connectIbcChannel(
        string calldata channelId,
        string calldata counterPartyChannelId,
        string calldata counterPartyPortId,
        string calldata counterPartyVersion
    ) external {
        emit ConnectIbcChannel(channelId, msg.sender, counterPartyChannelId, counterPartyPortId, counterPartyVersion);
    }

    /**
     * @notice Callback function to handle a successful connection to an IBC channel
     * @dev Verifies the given proof and calls the `onConnectIbcChannel` function on the given `receiver` contract
     * @param receiver The IbcReceiver contract that should handle the connection event
     * If the address doesn't satisfy the interface, the transaction will be reverted.
     * @param channelId The ID of the connected IBC channel
     * @param proof The proof data needed to verify the connection
     * @param error Any error message associated with the connection, or an empty string if successful
     * @dev Throws an error if the proof verification fails
     */
    function onConnectIbcChannel(
        IbcReceiver receiver,
        string calldata channelId,
        Proof calldata proof,
        string calldata error
    ) external {
        require(verify(proof), 'Proof verification failed');
        // TODO: we need to provide a way to user SC to map original request to the callback
        receiver.onConnectIbcChannel(channelId, error);
    }

    /**
     * @notice Close the specified IBC channel
     * @dev Emits a `CloseIbcChannel` event with the given `channelId` and the address of the message sender
     * @param channelId The ID of the IBC channel to be closed
     */
    function closeIbcChannel(string calldata channelId) external {
        emit CloseIbcChannel(channelId, msg.sender);
    }

    /**
     * @notice Callback function to handle the closing of an IBC channel
     * @dev Verifies the given proof and calls the `onCloseIbcChannel` function on the given `receiver` contract
     * @param receiver The IbcReceiver contract that should handle the channel closing event
     * If the address doesn't satisfy the interface, the transaction will be reverted.
     * @param channelId The ID of the closed IBC channel
     * @param proof The proof data needed to verify the channel closing
     * @param error Any error message associated with the channel closing, or an empty string if successful
     * @dev Throws an error if the proof verification fails
     */
    function onCloseIbcChannel(
        IbcReceiver receiver,
        string calldata channelId,
        Proof calldata proof,
        string calldata error
    ) external {
        require(verify(proof), 'Proof verification failed');
        receiver.onCloseIbcChannel(channelId, error);
    }

    //
    // IBC Packet methods
    //

    /**
     * @notice Sends an IBC packet on a existing channel with the specified packet data and timeout block timestamp.
     * @notice Data should be encoded in a format defined by the channel version, and the module on the other side should know how to parse this.
     * @dev Emits an `IbcPacketEvent` event containing the sender address, channel ID, packet data, and timeout block timestamp.
     * @param channelId The ID of the channel on which to send the packet.
     * @param packet The packet data to send.
     * @param timeoutTimestamp The timestamp in nanoseconds after which the packet times out if it has not been received.
     */
    function sendPacket(bytes32 channelId, bytes calldata packet, uint64 timeoutTimestamp) external {
        emit SendPacket(msg.sender, channelId, packet, timeoutTimestamp);
    }

    /**
     * @notice Callback function to handle the receipt of an IBC packet
     * @dev Verifies the given proof and calls the `onRecvPacket` function on the given `receiver` contract
     * @param receiver The IbcReceiver contract that should handle the packet receipt event
     * If the address doesn't satisfy the interface, the transaction will be reverted.
     * @param packet The IbcPacket data for the received packet
     * @param proof The proof data needed to verify the packet receipt
     * @dev Throws an error if the proof verification fails
     * @dev Emits an `OnRecvPacket` event with the details of the received packet
     */
    function onRecvPacket(IbcReceiver receiver, IbcPacket calldata packet, Proof calldata proof) external {
        require(verify(proof), 'Proof verification failed');
        // TODO: comment this out for now since we won't need it for the demo
        //  receiver.onRecvPacket(packet);
        emit OnRecvPacket(
            packet.src.channelId,
            packet.src.portId,
            packet.dest.channelId,
            packet.dest.portId,
            packet.data,
            packet.sequence
        );
    }

    /**
     * @notice Callback function to handle the acknowledgement of an IBC packet by the counterparty client
     * @dev Verifies the given proof and calls the `onAcknowledgementPacket` function on the given `receiver` contract
     * @param receiver The IbcReceiver contract that should handle the packet acknowledgement event
     * If the address doesn't satisfy the interface, the transaction will be reverted.
     * @param packet The IbcPacket data for the acknowledged packet
     * @param acknowledgement The acknowledgement receipt for the packet
     * @param proof The proof data needed to verify the packet acknowledgement
     * @dev Throws an error if the proof verification fails
     */
    function onAcknowledgementPacket(
        IbcReceiver receiver,
        IbcPacket calldata packet,
        bytes calldata acknowledgement,
        Proof calldata proof
    ) external {
        require(verify(proof), 'Proof verification failed');
        receiver.onAcknowledgementPacket(packet);
    }

    /**
     * @notice Callback function to handle the timeout of an IBC packet
     * @dev Verifies the given proof and calls the `onTimeoutPacket` function on the given `receiver` contract
     * @param receiver The IbcReceiver contract that should handle the packet timeout event
     * If the address doesn't satisfy the interface, the transaction will be reverted.
     * @param packet The IbcPacket data for the timed-out packet
     * @param proof The proof data needed to verify the packet timeout
     * @dev Throws an error if the proof verification fails
     */
    function onTimeoutPacket(IbcReceiver receiver, IbcPacket calldata packet, Proof calldata proof) external {
        require(verify(proof), 'Proof verification failed');
        receiver.onTimeoutPacket(packet);
    }
}
