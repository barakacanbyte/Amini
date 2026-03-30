// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {CampaignRegistry} from "../src/CampaignRegistry.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";

contract UpgradeScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // 🚨 IMPORTANT: Replace these with your actual deployed PROXY addresses
        address registryProxyAddress = vm.envAddress("REGISTRY_PROXY_ADDRESS");
        address escrowProxyAddress = vm.envAddress("ESCROW_PROXY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Upgrade CampaignRegistry
        // Deploy the new logic implementation
        CampaignRegistry newRegistryImpl = new CampaignRegistry();
        
        // Call upgradeToAndCall on the proxy (UUPS pattern)
        // Since CampaignRegistry inherits UUPSUpgradeable, we call it directly on the interface
        CampaignRegistry(registryProxyAddress).upgradeToAndCall(
            address(newRegistryImpl),
            "" // No initialization payload needed for standard upgrades
        );
        console.log("CampaignRegistry upgraded to new implementation at:", address(newRegistryImpl));

        // 2. Upgrade MilestoneEscrow
        // Deploy the new logic implementation
        MilestoneEscrow newEscrowImpl = new MilestoneEscrow();
        
        // Call upgradeToAndCall on the proxy
        MilestoneEscrow(escrowProxyAddress).upgradeToAndCall(
            address(newEscrowImpl),
            "" // No initialization payload needed for standard upgrades
        );
        console.log("MilestoneEscrow upgraded to new implementation at:", address(newEscrowImpl));

        vm.stopBroadcast();
    }
}
