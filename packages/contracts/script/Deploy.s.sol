// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {CampaignRegistry} from "../src/CampaignRegistry.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployScript is Script {
    function run() external returns (address registry, address escrow, bytes32 schemaUID) {
        // EAS on Base: 0x4200000000000000000000000000000000000021
        address eas = 0x4200000000000000000000000000000000000021;
        // Placeholder schema UID — register schema on EAS first, then set this
        schemaUID = keccak256("milestone.completion.v1");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy CampaignRegistry Proxy
        CampaignRegistry registryImpl = new CampaignRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeWithSelector(CampaignRegistry.initialize.selector, deployer)
        );
        registry = address(registryProxy);

        // Deploy MilestoneEscrow Proxy
        MilestoneEscrow escrowImpl = new MilestoneEscrow();
        ERC1967Proxy escrowProxy = new ERC1967Proxy(
            address(escrowImpl),
            abi.encodeWithSelector(
                MilestoneEscrow.initialize.selector,
                deployer,
                registry,
                eas,
                schemaUID
            )
        );
        escrow = address(escrowProxy);

        vm.stopBroadcast();
        return (registry, escrow, schemaUID);
    }
}
