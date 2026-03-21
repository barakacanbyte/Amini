import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  toHex,
} from "viem";

/**
 * Encode attestation data for "milestone completion" schema.
 * Must match Solidity: abi.decode(att.data, (bytes32, uint256));
 */
export function encodeMilestoneAttestationData(
  campaignId: bigint,
  milestoneIndex: number
): `0x${string}` {
  const campaignIdBytes32 = toHex(campaignId, { size: 32 });
  return encodeAbiParameters(
    parseAbiParameters("bytes32 campaignId, uint256 milestoneIndex"),
    [campaignIdBytes32, BigInt(milestoneIndex)]
  );
}

export function decodeMilestoneAttestationData(data: `0x${string}`): {
  campaignId: bigint;
  milestoneIndex: number;
} {
  const [campaignIdHex, milestoneIndex] = decodeAbiParameters(
    parseAbiParameters("bytes32 campaignId, uint256 milestoneIndex"),
    data
  ) as [`0x${string}`, bigint];
  return { campaignId: BigInt(campaignIdHex), milestoneIndex: Number(milestoneIndex) };
}
