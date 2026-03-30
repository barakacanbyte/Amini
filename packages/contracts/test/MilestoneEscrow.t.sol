// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {CampaignRegistry} from "../src/CampaignRegistry.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";
import {MockEAS} from "./mocks/MockEAS.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MilestoneEscrowTest is Test {
    CampaignRegistry registry;
    MockEAS eas;
    MockERC20 token;
    MilestoneEscrow escrow;

    bytes32 constant SCHEMA_UID = keccak256("milestone.completion.v1");
    uint256 campaignId;
    address owner = address(1);
    address beneficiary = address(2);
    address depositor = address(3);

    function setUp() public {
        CampaignRegistry registryImpl = new CampaignRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeWithSelector(CampaignRegistry.initialize.selector, owner)
        );
        registry = CampaignRegistry(address(registryProxy));

        eas = new MockEAS();
        token = new MockERC20();
        token.mint(depositor, 1000e6);

        MilestoneEscrow escrowImpl = new MilestoneEscrow();
        ERC1967Proxy escrowProxy = new ERC1967Proxy(
            address(escrowImpl),
            abi.encodeWithSelector(
                MilestoneEscrow.initialize.selector,
                owner,
                address(registry),
                address(eas),
                SCHEMA_UID
            )
        );
        escrow = MilestoneEscrow(address(escrowProxy));

        vm.prank(owner);
        campaignId = registry.createCampaign(
            beneficiary,
            100e6, // target
            2,     // 2 milestones
            "ipfs://meta"
        );

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 40e6;
        amounts[1] = 60e6;
        vm.prank(owner);
        escrow.initializeCampaign(campaignId, address(token), amounts);
    }

    function test_ReleaseMilestone_WithValidAttestation() public {
        vm.startPrank(depositor);
        token.approve(address(escrow), 100e6);
        escrow.deposit(campaignId, 100e6);
        vm.stopPrank();

        bytes memory data = abi.encode(bytes32(campaignId), uint256(0));
        bytes32 attUid = eas.issueAttestation(SCHEMA_UID, address(beneficiary), data);

        escrow.releaseMilestone(campaignId, 0, attUid);

        assertEq(token.balanceOf(beneficiary), 40e6);
        (, , , uint256 releasedCount, ) = escrow.getEscrowState(campaignId);
        assertEq(releasedCount, 1);

        data = abi.encode(bytes32(campaignId), uint256(1));
        attUid = eas.issueAttestation(SCHEMA_UID, address(beneficiary), data);
        escrow.releaseMilestone(campaignId, 1, attUid);

        assertEq(token.balanceOf(beneficiary), 100e6);
        (, , , uint256 releasedCount2, ) = escrow.getEscrowState(campaignId);
        assertEq(releasedCount2, 2);
    }

    function test_Revert_ReleaseWithoutAttestation() public {
        vm.prank(depositor);
        token.approve(address(escrow), 100e6);
        vm.prank(depositor);
        escrow.deposit(campaignId, 100e6);

        vm.expectRevert(MilestoneEscrow.InvalidAttestation.selector);
        escrow.releaseMilestone(campaignId, 0, bytes32(0));
    }
}
