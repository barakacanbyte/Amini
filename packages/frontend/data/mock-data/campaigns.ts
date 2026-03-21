import type { CampaignExplorerRow } from "@/app/campaigns/CampaignExplorerClient";

/**
 * Demo campaigns when Supabase is unset, unreachable, or has no indexed rows.
 * IDs are in the 9xxxxx range to avoid clashing with typical low on-chain campaign ids.
 */
export const MOCK_CAMPAIGN_EXPLORER_ROWS: CampaignExplorerRow[] = [
  {
    id: 900001,
    owner: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    beneficiary: "0x14dC79964da2C8b236BE81D19a9aE9aF2B8EeA10",
    target_amount: "50000000000",
    milestone_count: 4,
    metadata_uri: "ipfs://QmSahelCommunityReforestationPhase2",
    created_at: "2025-11-02T14:22:00.000Z",
    total_raised: "45500000000",
    attested_releases: 2,
  },
  {
    id: 900002,
    owner: "0x23618e81E3f5cdF7f554C5442dF5a16814B4A8F0",
    beneficiary: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
    target_amount: "12000000000",
    milestone_count: 3,
    metadata_uri: "ipfs://QmJavaCoastCleanWaterWells",
    created_at: "2025-10-18T09:10:00.000Z",
    total_raised: "3200000000",
    attested_releases: 0,
  },
  {
    id: 900003,
    owner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    beneficiary: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    target_amount: "80000000000",
    milestone_count: 5,
    metadata_uri: "ipfs://QmAndeanHighlandsAgroforestryLidar",
    created_at: "2025-09-05T16:45:00.000Z",
    total_raised: "72000000000",
    attested_releases: 4,
  },
  {
    id: 900004,
    owner: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    beneficiary: "0x15d34AAf54267DB7D7c367839AAf71A30a3518B1",
    target_amount: "15000000000",
    milestone_count: 2,
    metadata_uri: "ipfs://QmNairobiDigitalLiteracyHub2026",
    created_at: "2025-12-01T11:00:00.000Z",
    total_raised: "8200000000",
    attested_releases: 1,
  },
  {
    id: 900005,
    owner: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    beneficiary: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    target_amount: "30000000000",
    milestone_count: 3,
    metadata_uri: "ipfs://QmPeruAmazonConservationCarbonBuffer",
    created_at: "2025-08-22T08:30:00.000Z",
    total_raised: "1500000000",
    attested_releases: 0,
  },
  {
    id: 900006,
    owner: "0x14dC79964da2C8b236BE81D19a9aE9aF2B8EeA10",
    beneficiary: "0x23618e81E3f5cdF7f554C5442dF5a16814B4A8F0",
    target_amount: "22000000000",
    milestone_count: 4,
    metadata_uri: "ipfs://QmThailandMangroveRestorationMilestone",
    created_at: "2025-07-14T19:20:00.000Z",
    total_raised: "19800000000",
    attested_releases: 3,
  },
];

/** True when the explorer should show {@link MOCK_CAMPAIGN_EXPLORER_ROWS} instead of DB rows. */
export function shouldUseMockCampaigns(loaded: unknown[] | null): boolean {
  return loaded === null || loaded.length === 0;
}

export function getMockCampaignExplorerRows(): CampaignExplorerRow[] {
  return MOCK_CAMPAIGN_EXPLORER_ROWS;
}
