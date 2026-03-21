// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice EAS Attestation struct (from Common.sol)
struct Attestation {
    bytes32 uid;
    bytes32 schema;
    uint64 time;
    uint64 expirationTime;
    uint64 revocationTime;
    bytes32 refUID;
    address recipient;
    address attester;
    bool revocable;
    bytes data;
}

/// @title IEAS
/// @notice Minimal interface for EAS attestation verification on Base
interface IEAS {
    function getAttestation(bytes32 uid) external view returns (Attestation memory);
    function isAttestationValid(bytes32 uid) external view returns (bool);
}
