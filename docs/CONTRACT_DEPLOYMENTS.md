## Contract deployments & upgrades

This repo uses **UUPS upgradeable proxies** (`ERC1967Proxy`) for the two core contracts:

- `CampaignRegistry` (proxy + implementation)
- `MilestoneEscrow` (proxy + implementation)

For a reviewer-friendly explanation of how the contracts interact, see [`docs/CONTRACT_ARCHITECTURE.md`](./CONTRACT_ARCHITECTURE.md).

### How the on-chain “admin” works

Both proxies store an **owner** via `OwnableUpgradeable`.

- **Admin address = proxy owner**
- The owner is set during proxy deployment by calling `initialize(initialOwner, ...)`.
- Only the owner can:
  - **Upgrade** the proxy implementation (`_authorizeUpgrade` is `onlyOwner`)
  - **Release milestone funds** (as of the latest change, `MilestoneEscrow.releaseMilestone` is `onlyOwner`)

To rotate admin, call `transferOwnership(newOwner)` on the **proxy address**.

### Base Sepolia (chain id 84532)

#### Proxies (stable addresses)

- **CampaignRegistry proxy**: `0xA2E3D5FBCdAd2Afd864d315a907C01076ccA35cB`
- **MilestoneEscrow proxy**: `0xFbd60d72F412E1df2646dcd48A0c0DbF6c5e361A`

#### Latest implementations (upgraded via UUPS)

Upgraded with `packages/contracts/script/Upgrade.s.sol` on 2026-04-14.

- **CampaignRegistry implementation**: `0xb9eBEe79606AF512cABE7A3447f1dE3f912E1de3`
- **MilestoneEscrow implementation**: `0xCCC0275240438030Aaa71cFB3a406ADF2D2D8a94`

### Deploying

Create a fresh deployment (new proxies) using:

```bash
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
```

### Upgrading

Upgrade existing proxies using:

```bash
cd packages/contracts
REGISTRY_PROXY_ADDRESS=<registry-proxy> \
ESCROW_PROXY_ADDRESS=<escrow-proxy> \
forge script script/Upgrade.s.sol --rpc-url base_sepolia --broadcast
```

