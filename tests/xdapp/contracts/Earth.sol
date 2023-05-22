//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/access/Ownable.sol';
import './IbcReceiver.sol';
import './IbcDispatcher.sol';

contract Earth is IbcReceiver, Ownable {
    IbcPacket[] public recvedPackets;
    IbcPacket[] public ackPackets;
    IbcPacket[] public timeoutPackets;
    string[] public openChannels;
    string[] public connectedChannels;

    function onRecvPacket(IbcPacket calldata packet) external {
        recvedPackets.push(packet);
    }

    function onAcknowledgementPacket(IbcPacket calldata packet) external {
        ackPackets.push(packet);
    }

    function onTimeoutPacket(IbcPacket calldata packet) external {
        timeoutPackets.push(packet);
    }

    function onOpenIbcChannel(string calldata channelId, string calldata version, string calldata error) external {
        openChannels.push(channelId);
    }

    function onConnectIbcChannel(string calldata channelId, string calldata error) external {
        connectedChannels.push(channelId);
    }

    function onCloseIbcChannel(string calldata channelId, string calldata error) external {
        for (uint i = 0; i < openChannels.length; i++) {
            if (keccak256(bytes(openChannels[i])) == keccak256(bytes(channelId))) {
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

    function greet(
        address dispatcher,
        string calldata message,
        bytes32 channelId
    ) external {
        IbcDispatcher(dispatcher).sendPacket(channelId, bytes(message), 0);
    }
}
