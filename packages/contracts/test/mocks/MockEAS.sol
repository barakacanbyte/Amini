// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IEAS, Attestation} from "../../src/interfaces/IEAS.sol";

contract MockEAS is IEAS {
    mapping(bytes32 => Attestation) public attestations;
    uint256 public nextUid;

    function issueAttestation(bytes32 schema, address recipient, bytes memory data)
        external
        returns (bytes32 uid)
    {
        uid = bytes32(++nextUid);
        attestations[uid] = Attestation({
            uid: uid,
            schema: schema,
            time: uint64(block.timestamp),
            expirationTime: 0,
            revocationTime: 0,
            refUID: bytes32(0),
            recipient: recipient,
            attester: msg.sender,
            revocable: false,
            data: data
        });
        return uid;
    }

    function getAttestation(bytes32 uid) external view returns (Attestation memory) {
        require(attestations[uid].uid != bytes32(0), "NotFound");
        return attestations[uid];
    }

    function isAttestationValid(bytes32 uid) external view returns (bool) {
        return attestations[uid].uid != bytes32(0) && attestations[uid].revocationTime == 0;
    }
}
