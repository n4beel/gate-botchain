/**
 * Local stack runner and seeder for Gate.
 *
 * Spawns anvil on port 8719 with chain id 968, deploys Gate, and seeds:
 * - Gate 1 (daily): accounts 1, 2 members, account 3 lapsed
 * - Gate 2 (monthly): account 1 member for 3 periods
 * - Gate 3: closed gate (created, purchased, closed by owner)
 * - Gate 4: newly opened gate (never bought)
 *
 * Usage:
 *   node scripts/local-stack.mjs
 *   npm run dev
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8719;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // (0) Creator / Owner (Alice)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // (1) Buyer / Member (Bob)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // (2) Member (Charlie)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // (3) Lapsed Member (Dave)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--block-time",
    "1",
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http(), pollingInterval: 50 });

// Wait for anvil to answer
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Gate.sol/Gate.json", import.meta.url), "utf8"),
);

const deployerWallet = createWalletClient({
  account: accounts[0],
  chain: local,
  transport: http(),
});

const deployHash = await deployerWallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});

const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
const contractAddress = receipt.contractAddress;
const startBlock = receipt.blockNumber;

console.log(`Gate deployed to ${contractAddress} at block ${startBlock}`);

async function createGate(account, name, price, periodSecs) {
  const w = createWalletClient({ account, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "create",
    args: [name, price, periodSecs],
  });
  return await pub.waitForTransactionReceipt({ hash });
}

async function purchasePass(account, id, periods, value) {
  const w = createWalletClient({ account, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "purchase",
    args: [BigInt(id), periods],
    value,
  });
  return await pub.waitForTransactionReceipt({ hash });
}

async function closeGate(account, id) {
  const w = createWalletClient({ account, chain: local, transport: http() });
  const hash = await w.writeContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "close",
    args: [BigInt(id)],
  });
  return await pub.waitForTransactionReceipt({ hash });
}

async function increaseTime(seconds) {
  await pub.request({ method: "evm_increaseTime", params: [seconds] });
  await pub.request({ method: "evm_mine" });
}

// 1. Gate 1: Daily pass (0.5 BOT, 1 day)
console.log("Seeding Gate 1: Daily pass...");
await createGate(accounts[0], "Day Pass Room", parseEther("0.5"), 86400);

// Dave buys 1 day pass
await purchasePass(accounts[3], 1, 1, parseEther("0.5"));

// Time warp 2 days so Dave lapses
await increaseTime(86400 * 2);

// Now Bob and Charlie buy Gate 1 so they are active members
await purchasePass(accounts[1], 1, 2, parseEther("1.0")); // 2 days active
await purchasePass(accounts[2], 1, 1, parseEther("0.5")); // 1 day active

// 2. Gate 2: Monthly pass (2.0 BOT, 30 days)
console.log("Seeding Gate 2: Monthly pass...");
await createGate(accounts[0], "Monthly Discord VIP", parseEther("2.0"), 86400 * 30);
// Bob buys 3 periods (90 days)
await purchasePass(accounts[1], 2, 3, parseEther("6.0"));

// 3. Gate 3: Closed gate (1.0 BOT, 7 days)
console.log("Seeding Gate 3: Closed gate...");
await createGate(accounts[0], "Archived Lounge", parseEther("1.0"), 86400 * 7);
await purchasePass(accounts[1], 3, 1, parseEther("1.0"));
await closeGate(accounts[0], 3);

// 4. Gate 4: Newly opened, never bought (5.0 BOT, 14 days)
console.log("Seeding Gate 4: Newly opened (never bought)...");
await createGate(accounts[0], "Genesis Circle", parseEther("5.0"), 86400 * 14);

console.log("\n--- Gate Local Stack Ready ---");
console.log(`Contract: ${contractAddress}`);
console.log(`RPC: ${RPC} (chain ${CHAIN_ID})\n`);

console.log("Account Role Table for Manual Verification:");
console.log("----------------------------------------------------------------------------------------");
console.log("| Role             | Acc # | Address                                    | Private Key          |");
console.log("----------------------------------------------------------------------------------------");
console.log(`| Creator (Alice)  | 0     | ${accounts[0].address} | ${KEYS[0].slice(0, 10)}... |`);
console.log(`| Member (Bob)     | 1     | ${accounts[1].address} | ${KEYS[1].slice(0, 10)}... |`);
console.log(`| Member (Charlie) | 2     | ${accounts[2].address} | ${KEYS[2].slice(0, 10)}... |`);
console.log(`| Lapsed (Dave)    | 3     | ${accounts[3].address} | ${KEYS[3].slice(0, 10)}... |`);
console.log("----------------------------------------------------------------------------------------\n");

console.log("Seeded Gates Table:");
console.log("----------------------------------------------------------------------------------------");
console.log("| ID | Name                 | Price   | Period  | Closed | Members | Status                     |");
console.log("----------------------------------------------------------------------------------------");
console.log("| 1  | Day Pass Room        | 0.5 BOT | 1 day   | No     | 3       | Bob, Charlie active; Dave lapsed |");
console.log("| 2  | Monthly Discord VIP  | 2.0 BOT | 30 days | No     | 1       | Bob active (3 periods)     |");
console.log("| 3  | Archived Lounge      | 1.0 BOT | 7 days  | Yes    | 1       | Closed; Bob pass still valid |");
console.log("| 4  | Genesis Circle       | 5.0 BOT | 14 days | No     | 0       | Newly opened (never bought)|");
console.log("----------------------------------------------------------------------------------------\n");

// Write .env.local
const envContent = [
  `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
  `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
  `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
  `NEXT_PUBLIC_DEPLOY_BLOCK_968=${startBlock}`,
  "",
].join("\n");

writeFileSync(".env.local", envContent);
console.log("Wrote .env.local");
