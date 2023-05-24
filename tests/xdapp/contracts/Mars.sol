//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';
import './IbcReceiver.sol';
import './IbcDispatcher.sol';

contract Mars is IbcReceiver, Ownable {
    IbcPacket[] public recvedPackets;
    IbcPacket[] public ackPackets;
    IbcPacket[] public timeoutPackets;
    bytes32[] public openChannels;
    string[] public connectedChannels;

    bytes32[] supportedVersions = [bytes32('1.0'), bytes32('2.0')];

    function onRecvPacket(IbcPacket calldata packet) external {
        recvedPackets.push(packet);
    }

    function onAcknowledgementPacket(IbcPacket calldata packet) external {
        ackPackets.push(packet);
    }

    function onTimeoutPacket(IbcPacket calldata packet) external {
        timeoutPackets.push(packet);
    }

    function onOpenIbcChannel(
        bytes32 channelId,
        bytes32 version,
        ChannelOrder ordering,
        string[] calldata connectionHops,
        bytes32 counterpartyChannelId,
        string calldata counterpartyPortId,
        bytes32 counterpartyVersion
    ) external returns (bytes32 selectedVersion) {
        require(bytes(counterpartyPortId).length > 8, 'Invalid counterpartyPortId');
        bool foundVersion = false;
        for (uint i = 0; i < supportedVersions.length; i++) {
            if (supportedVersions[i] == version) {
                foundVersion = true;
                break;
            }
        }
        require(foundVersion, 'Unsupported version');
        openChannels.push(channelId);

        return bytes32('1.0');
    }

    function onConnectIbcChannel(string calldata channelId, string calldata error) external {
        connectedChannels.push(channelId);
    }

    function onCloseIbcChannel(string calldata channelId, string calldata error) external {
        for (uint i = 0; i < openChannels.length; i++) {
            if (keccak256(abi.encodePacked(openChannels[i])) == keccak256(bytes(channelId))) {
                delete openChannels[i];
                break;
            }
        }

        for (uint i = 0; i < connectedChannels.length; i++) {
            if (keccak256(bytes(connectedChannels[i])) == keccak256(bytes(channelId))) {
                delete connectedChannels[i];
                break;
            }
        }
    }

    function greet(address dispatcher, string calldata message, bytes32 channelId) external {
        IbcDispatcher(dispatcher).sendPacket(channelId, bytes(message), 0);
    }
}
