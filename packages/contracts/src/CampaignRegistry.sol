// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title CampaignRegistry
/// @notice On-chain registry of funding campaigns. Escrow references this for beneficiary and validity.
///         Upgradable using the UUPS Proxy pattern.
contract CampaignRegistry is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    struct Campaign {
        address owner;
        address beneficiary;
        uint256 targetAmount;
        uint8 milestoneCount;
        string metadataUri;
        bool exists;
    }

    /// @notice Mapping of campaign IDs to their respective data
    mapping(uint256 => Campaign) public campaigns;
    
    /// @notice The next campaign ID to be assigned
    uint256 public nextCampaignId;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed owner,
        address indexed beneficiary,
        uint256 targetAmount,
        uint8 milestoneCount,
        string metadataUri
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the CampaignRegistry contract.
    /// @param initialOwner Address of the contract owner (admin capable of upgrading).
    function initialize(address initialOwner) initializer public {
        __Ownable_init(initialOwner);
    }

    /// @notice Restricts upgrade authorization to the contract owner.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Creates a new campaign record on-chain.
    /// @param beneficiary The address that will receive the funds via the escrow.
    /// @param targetAmount Total target amount required in the selected token currency.
    /// @param milestoneCount The number of funding milestones.
    /// @param metadataUri IPFS or off-chain URI containing campaign descriptions and extended data.
    /// @return campaignId The unique ID assigned to the new campaign.
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

    /// @notice Retrieves a campaign's data by its ID.
    /// @param campaignId The ID of the campaign.
    /// @return Campaign struct containing the recorded data.
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        require(campaigns[campaignId].exists, "Campaign does not exist");
        return campaigns[campaignId];
    }
}
