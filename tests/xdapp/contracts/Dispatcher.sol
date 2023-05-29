//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/utils/Strings.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import 'hardhat/console.sol';

import './IbcDispatcher.sol';
import './IbcReceiver.sol';
import './IbcVerifier.sol';

// InitClientMsg is used to create a new Polymer client on an EVM chain
// TODO: replace bytes with explictly typed fields for gas cost saving
struct InitClientMsg {
    bytes clientState;
    bytes consensusState;
}

// UpgradeClientMsg is used to upgrade an existing Polymer client on an EVM chain.
// It should only be run by CoreSC maintainer with a social consensus.
// TODO: replace bytes with explictly typed fields for gas cost saving
struct UpgradeClientMsg {
    bytes clientState;
    bytes consensusState;
}

struct Channel {
    bytes32 version;
    ChannelOrder ordering;
    string[] connectionHops;
    string counterpartyPortId;
    bytes32 counterpartyChannelId;
}

/**
 * @title Dispatcher
 * @author Polymer Labs
 * @notice
 *     Contract callers call this contract to send IBC-like msg,
 *     which can be relayed to a rollup module on the Polymerase chain
 */
contract Dispatcher is IbcDispatcher, Ownable {
    //
    // channel events
    //

    event OpenIbcChannel(
        address indexed portAddress,
        bytes32 indexed counterpartyChannelId,
        bytes32 version,
        ChannelOrder ordering,
        string[] connectionHops,
        string counterpartyPortId,
        bytes32 counterpartyVersion
    );

    event ConnectIbcChannel(
        address indexed portAddress,
        bytes32 indexed channelId,
        string counterpartyPortId,
        bytes32 indexed counterpartyChannelId,
        string[] connectionHops
    );

    event CloseIbcChannel(address indexed portAddress, bytes32 indexed channelId);

    //
    // packet events
    //

    event SendPacket(
        address indexed sourcePortAddress,
        bytes32 indexed sourceChannelId,
        bytes packet,
        uint64 sequence,
        // timeoutTimestamp is in UNIX nano seconds; packet will be rejected if
        // delivered after this timestamp on the receiving chain.
        // Timeout semantics is compliant to IBC spec and ibc-go implementation
        uint64 timeoutTimestamp,
        uint256 fee
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

    ZKMintVerifier verifier;
    address payable escrow;
    bool isClientCreated = false;
    bytes public latestConsensusState;

    uint64 channelCounter = 0;
    mapping(address => mapping(bytes32 => Channel)) public portChannelMap;
    mapping(address => mapping(bytes32 => uint64)) portChannelSequenceMap;

    //
    // methods
    //

    constructor(ZKMintVerifier _verifier, address payable _escrow) {
        verifier = _verifier;
        escrow = _escrow;
        require(escrow != address(0), 'Escrow cannot be zero address');
    }

    //
    // Client methods
    //

    /**
     * @dev Creates a new Polymer client.
     * @param initClientMsg The initial client state and consensus state.
     */
    function createClient(InitClientMsg calldata initClientMsg) external onlyOwner {
        require(!isClientCreated, 'Client already created');
        isClientCreated = true;
        latestConsensusState = initClientMsg.consensusState;
    }

    /**
     * @dev Updates the Polymer client.
     *
     * Requirements:
     * - The consensus state must pass zkProof verification.
     *
     * @param updateClientMsg The new consensus state for the client.
     */
    function updateClient(UpdateClientMsg calldata updateClientMsg) external {
        require(isClientCreated, 'Client not created');
        require(
            verifier.verifyUpdateClientMsg(latestConsensusState, updateClientMsg),
            'UpdateClientMsg proof verification failed'
        );
        latestConsensusState = updateClientMsg.consensusState;
    }

    /**
     * @dev Upgrades the Polymer client.
     * It can only be run by CoreSC maintainer with a social consensus.
     * @param upgradeClientMsg The new client state and consensus state.
     */
    function upgradeClient(UpgradeClientMsg calldata upgradeClientMsg) external onlyOwner {
        require(isClientCreated, 'Client not created');
        latestConsensusState = upgradeClientMsg.consensusState;
    }

    /**
     * @notice Verify the given proof data
     * @dev This function currently only checks if the proof length is non-zero
     * @param proof The proof data to be verified
     * @return A boolean value indicating if the proof is valid
     */
    function verify(Proof calldata proof) internal pure returns (bool) {
        // TODO: replace with real merkle verification logic
        if (proof.proof.length == 0) {
            return false;
        }
        return true;
    }

    //
    // IBC Channel methods
    //

    function concatStrings(string memory str1, string memory str2) private pure returns (bytes memory) {
        return abi.encodePacked(str1, str2);
    }

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
    ) external {
        bytes32 selectedVersion = portAddress.onOpenIbcChannel(
            version,
            ordering,
            connectionHops,
            counterpartyChannelId,
            counterpartyPortId,
            counterpartyVersion
        );

        emit OpenIbcChannel(
            address(portAddress),
            counterpartyChannelId,
            selectedVersion,
            ordering,
            connectionHops,
            counterpartyPortId,
            counterpartyVersion
        );
    }

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
    ) external {
        require(
            verifier.verifyMembership(
                latestConsensusState,
                proof,
                'channel/path/to/be/added/here',
                bytes('expected channel bytes constructed from params. Channel.State = {Ack_Pending, Confirm_Pending}')
            ),
            'Fail to prove channel state'
        );

        portAddress.onConnectIbcChannel(channelId, counterpartyChannelId, counterpartyVersion);

        // Register port and channel mapping
        // TODO: check duplicated channel registration?
        portChannelMap[address(portAddress)][channelId] = Channel(
            counterpartyVersion,
            ordering,
            connectionHops,
            counterpartyPortId,
            counterpartyChannelId
        );
        emit ConnectIbcChannel(
            address(portAddress),
            channelId,
            counterpartyPortId,
            counterpartyChannelId,
            connectionHops
        );
    }

    /**
     * @notice Get the IBC channel with the specified port and channel ID
     * @param portAddress EVM address of the IBC port
     * @param channelId IBC channel ID from the port perspective
     * @return A channel struct is always returned. If it doesn't exists, the channel struct is populated with default
       values per EVM.
     */
    function getChannel(address portAddress, bytes32 channelId) external view returns (Channel memory) {
        return portChannelMap[portAddress][channelId];
    }

    /**
     * @dev Emits a `CloseIbcChannel` event with the given `channelId` and the address of the message sender
     * @notice Close the specified IBC channel by channel ID
     * Must be called by the channel owner, ie. portChannelMap[msg.sender][channelId] must exist
     */
    function closeIbcChannel(bytes32 channelId) external {
        Channel memory channel = portChannelMap[msg.sender][channelId];
        require(channel.counterpartyChannelId != bytes32(0), 'Channel not owned by msg.sender');
        IbcReceiver reciever = IbcReceiver(msg.sender);
        reciever.onCloseIbcChannel(channelId, channel.counterpartyPortId, channel.counterpartyChannelId);
        emit CloseIbcChannel(msg.sender, channelId);
    }

    /**
     * This func is called by a 'relayer' after the IBC/VIBC hub chain has processed ChanCloseConfirm event.
     * The dApp's onCloseIbcChannel callback is invoked.
     * dApp should throw an error if the channel should not be closed.
     */
    function onCloseIbcChannel(address portAddress, bytes32 channelId, Proof calldata proof) external {
        // verify VIBC/IBC hub chain has processed ChanCloseConfirm event
        require(
            verifier.verifyMembership(
                latestConsensusState,
                proof,
                'channel/path/to/be/added/here',
                bytes('expected channel bytes constructed from params. Channel.State = {Closed(_Pending?)}')
            ),
            'Fail to prove channel state'
        );
        // ensure port owns channel
        Channel memory channel = portChannelMap[portAddress][channelId];
        require(channel.counterpartyChannelId != bytes32(0), 'Channel not owned by portAddress');

        // confirm with dApp by calling its callback
        IbcReceiver reciever = IbcReceiver(portAddress);
        reciever.onCloseIbcChannel(channelId, channel.counterpartyPortId, channel.counterpartyChannelId);
        delete portChannelMap[portAddress][channelId];
        emit CloseIbcChannel(portAddress, channelId);
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
     * @param fee The fee serves as the packet incentive for relayers. It's escrowed on the running chain and will be
       claimed by relayer later once the packet is delivered and ack'ed.
     */
    function sendPacket(
        bytes32 channelId,
        bytes calldata packet,
        uint64 timeoutTimestamp,
        uint256 fee
    ) external payable {
        // ensure port owns channel
        Channel memory channel = portChannelMap[msg.sender][channelId];
        require(channel.counterpartyChannelId != bytes32(0), 'Channel not owned by sender');
        // escrow packet fee
        // ignore returned data from `call`
        // (bool sent, bytes memory _data) = escrow.call{value: fee}('');
        (bool sent, ) = escrow.call{value: fee}('');
        require(sent, 'Failed to escrow packet fee');
        // packet sequence
        uint64 sequence = portChannelSequenceMap[msg.sender][channelId];
        portChannelSequenceMap[msg.sender][channelId] = sequence + 1;

        emit SendPacket(msg.sender, channelId, packet, sequence, timeoutTimestamp, fee);
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
