// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IEAS, Attestation} from "./interfaces/IEAS.sol";
import {CampaignRegistry} from "./CampaignRegistry.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title MilestoneEscrow
/// @notice Holds USDC per campaign; releases milestones only when valid EAS attestation exists.
contract MilestoneEscrow {
    CampaignRegistry public immutable registry;
    IEAS public immutable eas;

    /// Schema UID for "milestone completion" attestations (set at deploy)
    bytes32 public immutable milestoneSchemaUID;

    struct EscrowState {
        address token;
        uint256[] milestoneAmounts;
        uint256 totalDeposited;
        uint256 releasedCount;
        bool initialized;
    }
    mapping(uint256 => EscrowState) public escrows;

    event CampaignEscrowInitialized(
        uint256 indexed campaignId,
        address token,
        uint256[] milestoneAmounts
    );
    event FundsDeposited(uint256 indexed campaignId, address indexed depositor, uint256 amount);
    event MilestoneReleased(
        uint256 indexed campaignId,
        uint256 milestoneIndex,
        uint256 amount,
        bytes32 attestationUID
    );
    event CampaignCompleted(uint256 indexed campaignId);

    error InvalidAttestation();
    error CampaignNotInitialized();
    error InvalidMilestoneIndex();
    error InsufficientDeposit();
    error TransferFailed();

    constructor(address _registry, address _eas, bytes32 _milestoneSchemaUID) {
        registry = CampaignRegistry(_registry);
        eas = IEAS(_eas);
        milestoneSchemaUID = _milestoneSchemaUID;
    }

    /// @notice Initialize escrow for a campaign with milestone amounts (call after CampaignRegistry.createCampaign).
    function initializeCampaign(
        uint256 campaignId,
        address token,
        uint256[] calldata milestoneAmounts
    ) external {
        (address owner,, uint256 targetAmount, uint8 milestoneCount,, bool exists) =
            _getCampaign(campaignId);
        require(exists, "Campaign does not exist");
        require(msg.sender == owner, "Not campaign owner");
        require(!escrows[campaignId].initialized, "Already initialized");
        require(
            milestoneAmounts.length == milestoneCount,
            "Milestone count mismatch"
        );
        uint256 sum;
        for (uint256 i; i < milestoneAmounts.length; i++) sum += milestoneAmounts[i];
        require(sum == targetAmount, "Amounts must sum to target");

        escrows[campaignId] = EscrowState({
            token: token,
            milestoneAmounts: milestoneAmounts,
            totalDeposited: 0,
            releasedCount: 0,
            initialized: true
        });
        emit CampaignEscrowInitialized(campaignId, token, milestoneAmounts);
    }

    /// @notice Deposit USDC (or other ERC20) into campaign escrow.
    function deposit(uint256 campaignId, uint256 amount) external {
        EscrowState storage e = escrows[campaignId];
        if (!e.initialized) revert CampaignNotInitialized();
        e.totalDeposited += amount;
        if (!IERC20(e.token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }
        emit FundsDeposited(campaignId, msg.sender, amount);
    }

    /// @notice Release one milestone to beneficiary after valid EAS attestation.
    /// @param attestationUID UID of the attestation (must match milestoneSchemaUID and encode campaignId + milestoneIndex).
    function releaseMilestone(uint256 campaignId, uint256 milestoneIndex, bytes32 attestationUID)
        external
    {
        EscrowState storage e = escrows[campaignId];
        if (!e.initialized) revert CampaignNotInitialized();
        if (milestoneIndex != e.releasedCount) revert InvalidMilestoneIndex();
        if (milestoneIndex >= e.milestoneAmounts.length) revert InvalidMilestoneIndex();

        if (!eas.isAttestationValid(attestationUID)) revert InvalidAttestation();
        Attestation memory att = eas.getAttestation(attestationUID);
        if (att.schema != milestoneSchemaUID) revert InvalidAttestation();
        if (att.revocationTime != 0) revert InvalidAttestation();
        (bytes32 attCampaignId, uint256 attMilestoneIndex) =
            abi.decode(att.data, (bytes32, uint256));
        if (bytes32(campaignId) != attCampaignId || milestoneIndex != attMilestoneIndex) {
            revert InvalidAttestation();
        }

        uint256 amount = e.milestoneAmounts[milestoneIndex];
        uint256 balance = IERC20(e.token).balanceOf(address(this));
        if (balance < amount) revert InsufficientDeposit();

        address beneficiary = registry.getCampaign(campaignId).beneficiary;
        e.releasedCount++;

        if (!IERC20(e.token).transfer(beneficiary, amount)) revert TransferFailed();

        emit MilestoneReleased(campaignId, milestoneIndex, amount, attestationUID);
        if (e.releasedCount == e.milestoneAmounts.length) {
            emit CampaignCompleted(campaignId);
        }
    }

    function _getCampaign(uint256 campaignId)
        internal
        view
        returns (address owner, address beneficiary, uint256 targetAmount, uint8 milestoneCount, string memory metadataUri, bool exists)
    {
        CampaignRegistry.Campaign memory c = registry.getCampaign(campaignId);
        return (c.owner, c.beneficiary, c.targetAmount, c.milestoneCount, c.metadataUri, c.exists);
    }

    function getEscrowState(uint256 campaignId)
        external
        view
        returns (
            address token,
            uint256[] memory milestoneAmounts,
            uint256 totalDeposited,
            uint256 releasedCount,
            bool initialized
        )
    {
        EscrowState storage e = escrows[campaignId];
        return (
            e.token,
            e.milestoneAmounts,
            e.totalDeposited,
            e.releasedCount,
            e.initialized
        );
    }
}
