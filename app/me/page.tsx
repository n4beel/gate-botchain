"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { formatEther, type AbiEvent } from "viem";
import Ticket from "@/components/gate/Ticket";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { gateAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";
import { getLogsChunked } from "@/lib/logs";
import { GateData, humanDuration } from "@/lib/gate";

interface UserPass {
  gate: GateData;
  expiry: bigint;
}

const purchasedEvent = gateAbi.find(
  (x) => x.type === "event" && x.name === "Purchased",
) as AbiEvent;

const createdEvent = gateAbi.find(
  (x) => x.type === "event" && x.name === "Created",
) as AbiEvent;

export default function MePage() {
  const { toast } = useToast();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result

  const currentChainId = (chainId ?? activeBotChain.id) as 677 | 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  const [passes, setPasses] = useState<UserPass[]>([]);
  const [createdGates, setCreatedGates] = useState<GateData[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // 1. Read accumulated earnings (pending) for current user
  const {
    data: pendingEarnings,
    refetch: refetchPending,
  } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "pending",
    args: [(address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    query: { enabled: deployed && isConnected && !!address },
  });

  // 2. Withdraw transaction
  const {
    data: withdrawHash,
    isPending: isWithdrawing,
    error: withdrawError,
    writeContract: writeWithdraw,
  } = useWriteContract();

  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  useEffect(() => {
    if (isWithdrawSuccess) {
      refetchPending();
      toast("success", "Earnings Withdrawn", "Accumulated funds transferred to your wallet.");
    }
  }, [isWithdrawSuccess]);

  // Load user passes and created gates from logs
  useEffect(() => {
    if (!deployed || !isConnected || !address || !publicClient) return;
    const pc = publicClient;

    let cancelled = false;
    async function loadUserData() {
      setLoadingLogs(true);
      try {
        const [purchaseRes, createdRes] = await Promise.all([
          getLogsChunked({
            client: pc,
            address: deployment.address,
            event: purchasedEvent,
            args: { buyer: address },
            fromBlock: deployment.deployBlock,
          }),
          getLogsChunked({
            client: pc,
            address: deployment.address,
            event: createdEvent,
            args: { owner: address },
            fromBlock: deployment.deployBlock,
          }),
        ]);

        if (cancelled) return;

        // Collect unique purchased gate IDs
        const gateIds = Array.from(
          new Set(purchaseRes.logs.map((l: any) => (l.args.id as bigint).toString())),
        ).map((id) => BigInt(id));

        // Read gateOf and expiryOf for each purchased gate
        const userPasses: UserPass[] = [];
        for (const gid of gateIds) {
          const [gRaw, exp] = await Promise.all([
            pc.readContract({
              address: deployment.address,
              abi: gateAbi,
              functionName: "gateOf",
              args: [gid],
            }),
            pc.readContract({
              address: deployment.address,
              abi: gateAbi,
              functionName: "expiryOf",
              args: [gid, address!],
            }),
          ]);

          userPasses.push({
            gate: {
              id: gid,
              owner: gRaw.owner,
              price: gRaw.price,
              periodSecs: Number(gRaw.periodSecs),
              closed: gRaw.closed,
              members: Number(gRaw.members),
              name: gRaw.name,
            },
            expiry: exp,
          });
        }

        // Collect created gates
        const createdList: GateData[] = [];
        for (const l of createdRes.logs) {
          const gid = (l as any).args.id as bigint;
          const gRaw = await pc.readContract({
            address: deployment.address,
            abi: gateAbi,
            functionName: "gateOf",
            args: [gid],
          });
          createdList.push({
            id: gid,
            owner: gRaw.owner,
            price: gRaw.price,
            periodSecs: Number(gRaw.periodSecs),
            closed: gRaw.closed,
            members: Number(gRaw.members),
            name: gRaw.name,
          });
        }

        if (!cancelled) {
          setPasses(userPasses);
          setCreatedGates(createdList);
        }
      } catch (err) {
        console.error("Failed to load user logs:", err);
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    }

    loadUserData();
    return () => {
      cancelled = true;
    };
  }, [deployed, isConnected, address, publicClient, deployment.address, deployment.deployBlock]);

  const handleWithdraw = () => {
    if (!isConnected || isWithdrawing || isWithdrawConfirming) return;
    try {
      writeWithdraw(
        {
          address: deployment.address,
          abi: gateAbi,
          functionName: "withdraw",
        },
        {
          onError: (err) => {
            toast("error", "Withdrawal failed", describeError(err));
          },
        },
      );
    } catch (err) {
      toast("error", "Withdrawal error", describeError(err));
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-4 py-12 text-center items-center">
        <h1 className="text-xl font-bold display-title text-[var(--text-primary)]">
          Connect Your Wallet
        </h1>
        <p className="text-xs text-[var(--text-secondary)] max-w-xs">
          Connect to view your purchased access passes, gates you have created, and withdraw creator earnings.
        </p>
      </div>
    );
  }

  const hasEarnings = pendingEarnings !== undefined && pendingEarnings > 0n;

  return (
    <div className="flex flex-col gap-8">
      {/* Page Title */}
      <div className="pb-4 border-b border-[var(--border-default)]">
        <h1 className="text-2xl font-extrabold display-title tracking-tight text-[var(--text-primary)]">
          My Passes & Gates
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1 mono">
          {address}
        </p>
      </div>

      {/* Section 1: Your Passes */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold display-title text-[var(--text-primary)]">
            Your Access Passes
          </h2>
          <span className="mono text-xs text-[var(--text-muted)]">
            {loadingLogs ? "Checking passes..." : `${passes.length} pass${passes.length === 1 ? "" : "es"}`}
          </span>
        </div>

        {loadingLogs ? (
          <div className="flex flex-col gap-3 py-2">
            <div className="w-full h-28 skeleton rounded-md" />
            <div className="w-full h-28 skeleton rounded-md" />
          </div>
        ) : passes.length === 0 ? (
          <Panel variant="callout" className="text-center py-8">
            <p className="text-xs text-[var(--text-secondary)]">
              You haven&apos;t bought any access passes yet.
            </p>
            <Link href="/" className="no-underline inline-block mt-3">
              <Button variant="primary" size="sm">
                Browse Ticket Rack
              </Button>
            </Link>
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {passes.map((pass) => (
              <Link
                key={pass.gate.id.toString()}
                href={`/g/${pass.gate.id.toString()}`}
                className="block no-underline"
              >
                <Ticket gate={pass.gate} expiry={pass.expiry} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Creator Earnings & Withdraw */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold display-title text-[var(--text-primary)]">
          Creator Earnings
        </h2>

        <Panel variant="docket" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
          <div>
            <span className="text-xs text-[var(--text-muted)] font-medium block">
              Pending accumulated balance
            </span>
            <div className="mono text-2xl font-extrabold text-[var(--text-primary)] mt-1">
              {pendingEarnings !== undefined ? `${formatEther(pendingEarnings)} BOT` : "—"}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)] mt-0.5 block">
              Payments collected from your gates. Pull payments are nonreentrant.
            </span>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={handleWithdraw}
            disabled={!hasEarnings || isWithdrawing || isWithdrawConfirming}
            loading={isWithdrawing || isWithdrawConfirming}
            className="flex-shrink-0"
          >
            {isWithdrawing
              ? "Confirming..."
              : isWithdrawConfirming
                ? "Mining..."
                : hasEarnings
                  ? "Withdraw Earnings"
                  : "Nothing to Withdraw"}
          </Button>
        </Panel>

        {withdrawError && (
          <div className="p-3 rounded text-xs bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30">
            {describeError(withdrawError)}
          </div>
        )}
      </div>

      {/* Section 3: Gates You Created */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold display-title text-[var(--text-primary)]">
            Gates You Created
          </h2>
          <Link href="/new" className="text-xs font-semibold text-[var(--accent)] hover:underline no-underline">
            + Create another
          </Link>
        </div>

        {createdGates.length === 0 ? (
          <Panel variant="callout" className="text-center py-6 text-xs text-[var(--text-secondary)]">
            You haven&apos;t created any gates yet.
          </Panel>
        ) : (
          <div className="flex flex-col gap-2">
            {createdGates.map((gate) => (
              <Panel
                key={gate.id.toString()}
                variant="docket"
                className="flex items-center justify-between gap-3 p-3.5 hover:border-[var(--accent)] transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] text-[var(--text-muted)] font-bold">
                      #{gate.id.toString()}
                    </span>
                    <span className="font-bold text-sm text-[var(--text-primary)]">
                      {gate.name}
                    </span>
                    {gate.closed && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[var(--danger)]/10 text-[var(--danger)]">
                        Closed
                      </span>
                    )}
                  </div>
                  <span className="mono text-xs text-[var(--text-muted)] mt-1 block">
                    {formatEther(gate.price)} BOT / {humanDuration(gate.periodSecs)} · {gate.members} members
                  </span>
                </div>

                <Link href={`/g/${gate.id.toString()}`} className="no-underline">
                  <Button variant="secondary" size="sm">
                    Manage
                  </Button>
                </Link>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
