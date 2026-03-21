import {
  decodeEventLog,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { EAS_PORTAL_BASE } from "@amini/shared";
import { encodeMilestoneAttestationData } from "./encode.js";

const EAS_ABI = parseAbi([
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
  "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
  "function isAttestationValid(bytes32 uid) view returns (bool)",
]);

export interface MilestoneAttestationInput {
  campaignId: bigint;
  milestoneIndex: number;
  schemaUID: Hex;
  recipient: Address;
  expirationTime?: bigint;
  revocable?: boolean;
  easAddress?: Address;
}

export interface EasAttestation {
  uid: Hex;
  schema: Hex;
  time: bigint;
  expirationTime: bigint;
  revocationTime: bigint;
  refUID: Hex;
  recipient: Address;
  attester: Address;
  revocable: boolean;
  data: Hex;
}

/**
 * Create a milestone attestation on EAS and return the attestation UID.
 */
export async function createMilestoneAttestation(
  walletClient: WalletClient,
  publicClient: PublicClient,
  input: MilestoneAttestationInput
): Promise<{ txHash: Hex; uid: Hex }> {
  if (!walletClient.account) {
    throw new Error("Wallet client has no connected account.");
  }
  const easAddress = input.easAddress ?? (EAS_PORTAL_BASE as Address);
  const data = encodeMilestoneAttestationData(input.campaignId, input.milestoneIndex);

  const txHash = await walletClient.writeContract({
    account: walletClient.account,
    chain: walletClient.chain ?? undefined,
    address: easAddress,
    abi: EAS_ABI,
    functionName: "attest",
    args: [
      {
        schema: input.schemaUID,
        data: {
          recipient: input.recipient,
          expirationTime: input.expirationTime ?? 0n,
          revocable: input.revocable ?? false,
          refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
          data,
          value: 0n,
        },
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: EAS_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.eventName === "Attested" &&
        (decoded.args as { schemaUID: Hex }).schemaUID.toLowerCase() ===
          input.schemaUID.toLowerCase()
      ) {
        return { txHash, uid: (decoded.args as { uid: Hex }).uid };
      }
    } catch {
      // Ignore non-EAS logs
    }
  }
  throw new Error("Attestation transaction confirmed but no Attested event found.");
}

export async function getAttestation(
  publicClient: PublicClient,
  uid: Hex,
  easAddress: Address = EAS_PORTAL_BASE as Address
): Promise<EasAttestation> {
  const attestation = await publicClient.readContract({
    address: easAddress,
    abi: EAS_ABI,
    functionName: "getAttestation",
    args: [uid],
  });
  return attestation as EasAttestation;
}

export async function isAttestationValid(
  publicClient: PublicClient,
  uid: Hex,
  easAddress: Address = EAS_PORTAL_BASE as Address
): Promise<boolean> {
  return publicClient.readContract({
    address: easAddress,
    abi: EAS_ABI,
    functionName: "isAttestationValid",
    args: [uid],
  }) as Promise<boolean>;
}

