// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title CampaignRegistry
/// @notice On-chain registry of funding campaigns. Escrow references this for beneficiary and validity.
contract CampaignRegistry {
    struct Campaign {
        address owner;
        address beneficiary;
        uint256 targetAmount;
        uint8 milestoneCount;
        string metadataUri;
        bool exists;
    }

    mapping(uint256 => Campaign) public campaigns;
    uint256 public nextCampaignId;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed owner,
        address indexed beneficiary,
        uint256 targetAmount,
        uint8 milestoneCount,
        string metadataUri
    );

    function createCampaign(
        address beneficiary,
        uint256 targetAmount,
        uint8 milestoneCount,
        string calldata metadataUri
    ) external returns (uint256 campaignId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(milestoneCount > 0 && milestoneCount <= 32, "Invalid milestone count");
        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            owner: msg.sender,
            beneficiary: beneficiary,
            targetAmount: targetAmount,
            milestoneCount: milestoneCount,
            metadataUri: metadataUri,
            exists: true
        });
        emit CampaignCreated(
            campaignId,
            msg.sender,
            beneficiary,
            targetAmount,
            milestoneCount,
            metadataUri
        );
        return campaignId;
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        require(campaigns[campaignId].exists, "Campaign does not exist");
        return campaigns[campaignId];
    }
}
