import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gateAbi } from "@/lib/botchain/abi";
import { quote, newExpiry, memberState } from "@/lib/gate";
import { getLogsChunked } from "@/lib/logs";

const PORT = 8619;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const KEY_ALICE = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY_BOB = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_CHARLIE = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const accountAlice = privateKeyToAccount(KEY_ALICE);
const accountBob = privateKeyToAccount(KEY_BOB);
const accountCharlie = privateKeyToAccount(KEY_CHARLIE);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let walletAlice: any;
let walletBob: any;
let walletCharlie: any;
let address: Address;
let deployBlock: bigint;

function expectContractRevert(err: unknown, errorName: string) {
  const msg = err instanceof Error ? err.message : String(err);
  expect(msg).toContain(errorName);
}

beforeAll(async () => {
  try {
    execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
  } catch {}

  node = spawn("anvil", [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--silent",
  ]);

  publicClient = createPublicClient({ chain: local, transport: http(), pollingInterval: 50 });

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 80) throw new Error("Anvil failed to start on integration port");
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  walletAlice = createWalletClient({ account: accountAlice, chain: local, transport: http() });
  walletBob = createWalletClient({ account: accountBob, chain: local, transport: http() });
  walletCharlie = createWalletClient({ account: accountCharlie, chain: local, transport: http() });

  const artifact = JSON.parse(
    readFileSync(new URL("../../contracts/out/Gate.sol/Gate.json", import.meta.url), "utf8"),
  );

  const hash = await walletAlice.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  address = receipt.contractAddress!;
  deployBlock = receipt.blockNumber;
}, 30_000);

afterAll(() => {
  try {
    node?.kill();
    execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
  } catch {}
});

describe("Gate Integration Tests", () => {
  async function increaseTime(seconds: number) {
    await publicClient.request({ method: "evm_increaseTime" as any, params: [seconds] as any });
    await publicClient.request({ method: "evm_mine" as any, params: [] as any });
  }

  it("creates a gate and verifies on-chain metadata", async () => {
    const price = parseEther("0.5");
    const periodSecs = 86400; // 1 day

    const hash = await walletAlice.writeContract({
      address,
      abi: gateAbi,
      functionName: "create",
      args: ["Alpha Pass", price, periodSecs],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const gate = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "gateOf",
      args: [1n],
    });

    expect(gate.owner.toLowerCase()).toBe(accountAlice.address.toLowerCase());
    expect(gate.price).toBe(price);
    expect(gate.periodSecs).toBe(periodSecs);
    expect(gate.closed).toBe(false);
    expect(gate.members).toBe(0);
    expect(gate.name).toBe("Alpha Pass");
  });

  it("first purchase sets expiry from now and increments members", async () => {
    const price = parseEther("0.5");
    const periods = 1;

    const hash = await walletBob.writeContract({
      address,
      abi: gateAbi,
      functionName: "purchase",
      args: [1n, periods],
      value: price,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const block = await publicClient.getBlock();
    const expiry = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "expiryOf",
      args: [1n, accountBob.address],
    });

    const isMember = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "isMember",
      args: [1n, accountBob.address],
    });

    const expectedExpiry = block.timestamp + 86400n;
    expect(expiry).toBe(expectedExpiry);
    expect(isMember).toBe(true);

    const gate = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "gateOf",
      args: [1n],
    });
    expect(gate.members).toBe(1);
    expect(await publicClient.readContract({ address, abi: gateAbi, functionName: "pending", args: [accountAlice.address] })).toBe(price);
  });

  it("renewal while active extends from current expiry without incrementing members", async () => {
    const price = parseEther("0.5");

    const expiryBefore = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "expiryOf",
      args: [1n, accountBob.address],
    });

    // Advance 12 hours (still active)
    await increaseTime(43200);

    const hash = await walletBob.writeContract({
      address,
      abi: gateAbi,
      functionName: "purchase",
      args: [1n, 2],
      value: price * 2n,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const expiryAfter = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "expiryOf",
      args: [1n, accountBob.address],
    });

    // Exactly current expiry + 2 days
    expect(expiryAfter).toBe(expiryBefore + 2n * 86400n);

    // Members count remains 1
    const gate = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "gateOf",
      args: [1n],
    });
    expect(gate.members).toBe(1);
  });

  it("lapsed member restarts expiry from now", async () => {
    const price = parseEther("0.5");

    const currentExpiry = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "expiryOf",
      args: [1n, accountBob.address],
    });

    const block = await publicClient.getBlock();
    const jumpSeconds = Number(currentExpiry - block.timestamp) + 86400; // 1 day past expiry
    await increaseTime(jumpSeconds);

    const isMemberBefore = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "isMember",
      args: [1n, accountBob.address],
    });
    expect(isMemberBefore).toBe(false);

    // Repurchase 1 period
    const hash = await walletBob.writeContract({
      address,
      abi: gateAbi,
      functionName: "purchase",
      args: [1n, 1],
      value: price,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const newBlock = await publicClient.getBlock();
    const expiryAfter = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "expiryOf",
      args: [1n, accountBob.address],
    });

    expect(expiryAfter).toBe(newBlock.timestamp + 86400n);
    expect(await publicClient.readContract({ address, abi: gateAbi, functionName: "isMember", args: [1n, accountBob.address] })).toBe(true);
  });

  it("enforces exact payment only", async () => {
    const price = parseEther("0.5");

    await expect(
      walletCharlie.writeContract({
        address,
        abi: gateAbi,
        functionName: "purchase",
        args: [1n, 1],
        value: price - 1n,
      }),
    ).rejects.toThrow();

    await expect(
      walletCharlie.writeContract({
        address,
        abi: gateAbi,
        functionName: "purchase",
        args: [1n, 1],
        value: price + 1n,
      }),
    ).rejects.toThrow();
  });

  it("enforces period boundaries (1 to 36)", async () => {
    await expect(
      walletCharlie.writeContract({
        address,
        abi: gateAbi,
        functionName: "purchase",
        args: [1n, 0],
        value: 0n,
      }),
    ).rejects.toThrow();

    await expect(
      walletCharlie.writeContract({
        address,
        abi: gateAbi,
        functionName: "purchase",
        args: [1n, 37],
        value: parseEther("0.5") * 37n,
      }),
    ).rejects.toThrow();
  });

  it("closes a gate: existing pass valid, new purchases blocked", async () => {
    // Charlie buys 2 periods
    const price = parseEther("0.5");
    const hashBuy = await walletCharlie.writeContract({
      address,
      abi: gateAbi,
      functionName: "purchase",
      args: [1n, 2],
      value: price * 2n,
    });
    await publicClient.waitForTransactionReceipt({ hash: hashBuy });

    expect(await publicClient.readContract({ address, abi: gateAbi, functionName: "isMember", args: [1n, accountCharlie.address] })).toBe(true);

    // Alice closes the gate
    const hashClose = await walletAlice.writeContract({
      address,
      abi: gateAbi,
      functionName: "close",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashClose });

    const gate = await publicClient.readContract({ address, abi: gateAbi, functionName: "gateOf", args: [1n] });
    expect(gate.closed).toBe(true);

    // Charlie's existing pass is still active
    expect(await publicClient.readContract({ address, abi: gateAbi, functionName: "isMember", args: [1n, accountCharlie.address] })).toBe(true);

    // New purchase is blocked
    await expect(
      walletBob.writeContract({
        address,
        abi: gateAbi,
        functionName: "purchase",
        args: [1n, 1],
        value: price,
      }),
    ).rejects.toThrow();
  });

  it("owner withdraws accumulated earnings", async () => {
    const pendingBefore = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "pending",
      args: [accountAlice.address],
    });
    expect(pendingBefore).toBeGreaterThan(0n);

    const balBefore = await publicClient.getBalance({ address: accountAlice.address });

    const hash = await walletAlice.writeContract({
      address,
      abi: gateAbi,
      functionName: "withdraw",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const balAfter = await publicClient.getBalance({ address: accountAlice.address });
    expect(balAfter).toBe(balBefore + pendingBefore - gasUsed);

    const pendingAfter = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "pending",
      args: [accountAlice.address],
    });
    expect(pendingAfter).toBe(0n);
  });

  it("checks quote and latest pagination", async () => {
    // Create gate 2
    const hash2 = await walletAlice.writeContract({
      address,
      abi: gateAbi,
      functionName: "create",
      args: ["Second Gate", parseEther("1"), 86400 * 30],
    });
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const q = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "quote",
      args: [2n, 3],
    });
    expect(q).toBe(parseEther("3"));

    const [gates, ids] = await publicClient.readContract({
      address,
      abi: gateAbi,
      functionName: "latest",
      args: [0n, 10n],
    });

    expect(gates.length).toBe(2);
    expect(ids[0]).toBe(2n);
    expect(ids[1]).toBe(1n);
    expect(gates[0].name).toBe("Second Gate");
    expect(gates[1].name).toBe("Alpha Pass");
  });

  it("chunked log fetcher reads Purchased events", async () => {
    const purchasedEvent = gateAbi.find((x) => x.type === "event" && x.name === "Purchased")!;
    const toBlock = await publicClient.getBlockNumber({ cacheTime: 0 } as any);

    const result = await getLogsChunked({
      client: publicClient,
      address,
      event: purchasedEvent as any,
      fromBlock: deployBlock,
      toBlock,
      chunk: 10n,
    });

    expect(result.complete).toBe(true);
    expect(result.logs.length).toBeGreaterThanOrEqual(4);
  });
});
