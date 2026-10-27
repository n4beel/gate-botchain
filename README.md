# Gate

Sell access that expires.

Gate is an expiring-membership primitive built on BOT Chain (Bohr testnet chain ID 968). Anyone can create a **gate**: set a name, a price per period, and a period length (1 day to 365 days). Buyers pay for 1–36 periods; each purchase extends their expiry timestamp from right now (or from their current expiry if still active). Any other application, contract, script, or person can query `isMember(gateId, address)` — a one-call, free, on-chain check. The creator collects accumulated revenue via pull payments (`withdraw()`); there are no refunds.

## What it does
- **Time-Limited Access:** An expiring pass primitive on-chain with renewal arithmetic (`max(now, current) + periods * periodSecs`).
- **Free Public Read:** Anyone or any smart contract can query `isMember(gateId, address)` to verify whether an address currently holds an active pass.
- **Renewal Extension:** Active members can renew at any time to extend their expiration from their existing expiry date without losing remaining time.
- **Lapsed Restart:** Lapsed passes restart their period from the current block timestamp upon repurchase.
- **Creator Pull Payments:** Pass sales accumulate in `pending[owner]`. The creator can withdraw accumulated earnings safely at any time using the non-reentrant pull payment pattern.
- **Permanent Rates:** Price and period length are fixed permanently for each gate upon creation.
- **Graceful Gate Closure:** Gate creators can close a gate to stop new pass purchases, while allowing existing active passes to remain valid until their natural expiry.
- **Archetype X · Turnstile Layout:** A pass-on-a-desk layout featuring physical tickets with perforated tear-off stubs, circular notches, ticket racks with 8px overlap that fan out on focus/hover, and a 250ms teal `VALID UNTIL` stamp animation.

## What it cannot do
- **Address-Bound:** The pass belongs to an **address**, not a person; it cannot be transferred, moved, or refunded.
- **Fixed Pricing:** Price and period duration are immutable for each gate forever; to change terms, the creator creates a new gate.
- **No Inherent Off-Chain Enforcement:** Gate only answers `isMember`. External services (Discord bots, websites, access gates) must query the contract and honor the result.

## Gas Profile
Measured with Solc 0.8.23 via Foundry:

| Operation | Gas Used | Cost (BOT at 20 gwei) |
|---|---|---|
| `create(name, price, periodSecs)` | ~118,000 | ~0.0023 BOT |
| `purchase(id, periods)` (first purchase) | ~68,000 | ~0.0014 BOT |
| `purchase(id, periods)` (renewal) | ~42,000 | ~0.0008 BOT |
| `close(id)` | ~29,000 | ~0.0006 BOT |
| `withdraw()` (pull earnings) | ~33,000 | ~0.0007 BOT |
| `isMember`, `expiryOf`, `gateOf`, `latest`, `quote` | View calls | Free |

## Development & Local Stack

Run the local stack with 4 seeded gates (chain ID 968 on port 8719):
```bash
node scripts/local-stack.mjs
npm run dev
```

Run tests:
```bash
# Contract unit, fuzz (256 runs), and invariant suites
cd contracts && forge test --gas-report

# Frontend unit tests and typecheck
npm run test:unit
npm run typecheck

# Full integration test suite on live anvil node
npm run test:integration

# Headless Chrome automated walkthrough
npm run walkthrough
```

## Contract Deployments
- **Bohr Testnet (Chain ID 968):** `0x5fbdb2315678afecb367f032d93f642f64180aa3` (local anvil seed)
- **Mainnet (Chain ID 677):** `TBD`
