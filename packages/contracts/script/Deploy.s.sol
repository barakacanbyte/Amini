// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {CampaignRegistry} from "../src/CampaignRegistry.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";

contract DeployScript is Script {
    function run() external view returns (address registry, address escrow, bytes32 schemaUID) {
        // EAS on Base: 0x4200000000000000000000000000000000000021
        address eas = 0x4200000000000000000000000000000000000021;
        // Placeholder schema UID — register schema on EAS first, then set this
        schemaUID = keccak256("milestone.completion.v1");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        CampaignRegistry r = new CampaignRegistry();
        MilestoneEscrow e = new MilestoneEscrow(address(r), eas, schemaUID);

        vm.stopBroadcast();
        return (address(r), address(e), schemaUID);
    }
}
