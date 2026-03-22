/** Hex address (0x-prefixed, 40 hex chars) */
export type Address = `0x${string}`;

/** Campaign identifier (on-chain id or uuid) */
export type CampaignId = string;

/** Milestone index (0-based) */
export type MilestoneIndex = number;

export interface Milestone {
  index: MilestoneIndex;
  title: string;
  description?: string;
  amount: string; // wei or human amount
  evidenceHash?: string; // e.g. IPFS CID or hash of proof
}

export interface CampaignMeta {
  title: string;
  description: string;
  imageUrl?: string;
  metadataUri?: string; // IPFS (e.g. ipfs://...) or HTTPS
  milestones: Milestone[];
}

export interface CampaignOnChain {
  id: CampaignId;
  owner: Address;
  beneficiary: Address;
  token: Address;
  targetAmount: string;
  milestoneCount: number;
  metadataUri?: string;
  createdAt?: number;
}

export interface EASMilestonePayload {
  campaignId: CampaignId;
  milestoneIndex: MilestoneIndex;
  evidenceHash?: string;
  timestamp: number;
}

/** EAS attestation UID (bytes32) */
export type AttestationUID = `0x${string}`;

export interface FundFlowEntry {
  from: Address;
  to: Address;
  amount: string;
  txHash: string;
  blockNumber: number;
  type: "deposit" | "release" | "stream";
}
