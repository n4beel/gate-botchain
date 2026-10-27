"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { formatEther, isAddress } from "viem";
import Ticket from "@/components/gate/Ticket";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { gateAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";
import {
  GateData,
  memberState,
  newExpiry,
  quote,
  formatDateStamp,
  formatDateFull,
  formatShortAddress,
  MIN_PERIODS,
  MAX_PERIODS,
} from "@/lib/gate";

export default function GateDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const idStr = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const gateId = BigInt(idStr || "1");

  const { toast } = useToast();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result

  const currentChainId = (chainId ?? activeBotChain.id) as 677 | 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  const [periods, setPeriods] = useState(1);
  const [justStamped, setJustStamped] = useState(false);

  // Address check box state
  const [checkAddrInput, setCheckAddrInput] = useState("");
  const [checkResult, setCheckResult] = useState<{
    address: string;
    isMember: boolean;
    expiry: bigint;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // 1. Read Gate details
  const { data: gateRaw, isLoading: isGateLoading, refetch: refetchGate } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "gateOf",
    args: [gateId],
    query: { enabled: deployed },
  });

  // 2. Read current user's expiry
  const { data: userExpiry, refetch: refetchExpiry } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "expiryOf",
    args: [gateId, (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
    query: { enabled: deployed && isConnected && !!address },
  });

  // Transactions: purchase pass
  const {
    data: buyHash,
    isPending: isBuying,
    error: buyError,
    writeContract: writePurchase,
  } = useWriteContract();

  const { isLoading: isBuyConfirming, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  });

  useEffect(() => {
    if (isBuySuccess) {
      setJustStamped(true);
      refetchGate();
      refetchExpiry();
      toast("success", "Access Purchased!", "Your pass has been stamped and validated on-chain.");
    }
  }, [isBuySuccess]);

  // Transactions: close gate (owner only)
  const {
    data: closeHash,
    isPending: isClosing,
    error: closeError,
    writeContract: writeClose,
  } = useWriteContract();

  const { isLoading: isCloseConfirming, isSuccess: isCloseSuccess } = useWaitForTransactionReceipt({
    hash: closeHash,
  });

  useEffect(() => {
    if (isCloseSuccess) {
      refetchGate();
      toast("success", "Gate Closed", "No new purchases will be accepted. Existing passes stay valid.");
    }
  }, [isCloseSuccess]);

  if (isGateLoading) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <div className="w-full h-40 skeleton rounded-md" />
        <div className="w-full h-64 skeleton rounded-md" />
      </div>
    );
  }

  if (!gateRaw || !gateRaw.name) {
    return (
      <div className="flex flex-col gap-4 py-12 text-center items-center">
        <h2 className="text-xl font-bold display-title text-[var(--text-primary)]">
          Gate Not Found
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          No gate with ID #{gateId.toString()} exists in this turnstile.
        </p>
        <Link href="/" className="no-underline mt-2">
          <Button variant="primary" size="md">
            Return to Rack
          </Button>
        </Link>
      </div>
    );
  }

  const gate: GateData = {
    id: gateId,
    owner: gateRaw.owner,
    price: gateRaw.price,
    periodSecs: Number(gateRaw.periodSecs),
    closed: gateRaw.closed,
    members: Number(gateRaw.members),
    name: gateRaw.name,
  };

  const isOwner = isConnected && address && gate.owner.toLowerCase() === address.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const currentExpiry = userExpiry ?? 0n;
  const userMemberState = isConnected && address ? memberState(currentExpiry, nowSec) : null;

  // Pricing & New Expiry preview
  const totalPrice = quote(gate.price, periods);
  const projectedExpiry = newExpiry(nowSec, currentExpiry, periods, gate.periodSecs);

  const handlePurchase = () => {
    if (!isConnected || gate.closed || isBuying || isBuyConfirming) return;
    try {
      writePurchase(
        {
          address: deployment.address,
          abi: gateAbi,
          functionName: "purchase",
          args: [gate.id, periods],
          value: totalPrice,
        },
        {
          onError: (err) => {
            toast("error", "Purchase failed", describeError(err));
          },
        },
      );
    } catch (err) {
      toast("error", "Purchase error", describeError(err));
    }
  };

  const handleClose = () => {
    if (!isOwner || gate.closed || isClosing || isCloseConfirming) return;
    try {
      writeClose(
        {
          address: deployment.address,
          abi: gateAbi,
          functionName: "close",
          args: [gate.id],
        },
        {
          onError: (err) => {
            toast("error", "Failed to close gate", describeError(err));
          },
        },
      );
    } catch (err) {
      toast("error", "Close error", describeError(err));
    }
  };

  const handleCheckAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = checkAddrInput.trim();
    if (!isAddress(target) || !publicClient) return;

    setIsChecking(true);
    try {
      const [isM, exp] = await Promise.all([
        publicClient.readContract({
          address: deployment.address,
          abi: gateAbi,
          functionName: "isMember",
          args: [gate.id, target as `0x${string}`],
        }),
        publicClient.readContract({
          address: deployment.address,
          abi: gateAbi,
          functionName: "expiryOf",
          args: [gate.id, target as `0x${string}`],
        }),
      ]);

      setCheckResult({
        address: target,
        isMember: Boolean(isM),
        expiry: exp,
      });
    } catch (err) {
      toast("error", "Check failed", describeError(err));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top back link */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)]">
        <Link
          href="/"
          className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 no-underline"
        >
          ← Back to Rack
        </Link>
        <span className="mono text-xs font-bold text-[var(--text-muted)]">
          GATE #{gate.id.toString()}
        </span>
      </div>

      {/* The Ticket Component in Full */}
      <Ticket
        gate={gate}
        expiry={isConnected ? currentExpiry : undefined}
        isStamping={justStamped}
      />

      {/* Owner Notice Bar */}
      {isOwner && (
        <div
          className="p-3.5 rounded-md flex items-center justify-between gap-3 border text-xs"
          style={{
            background: "rgba(10, 123, 131, 0.06)",
            borderColor: "var(--accent)",
          }}
        >
          <div>
            <span className="font-bold text-[var(--accent)] block">
              You own this gate
            </span>
            <span className="text-[var(--text-secondary)] text-[11px]">
              {gate.closed ? "This gate has been closed." : "Active in the rack."}
            </span>
          </div>

          {!gate.closed && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleClose}
              loading={isClosing || isCloseConfirming}
              disabled={isClosing || isCloseConfirming}
            >
              Close Gate
            </Button>
          )}
        </div>
      )}

      {/* Buy Access / Renewal Panel */}
      <Panel variant="docket" className="flex flex-col gap-4">
        <div>
          <h3 className="display-title text-base font-bold text-[var(--text-primary)]">
            {userMemberState?.isMember ? "Renew Access" : "Buy Access Pass"}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {gate.closed
              ? "This gate is closed to new purchases. Existing passes remain valid until expiry."
              : userMemberState?.isMember
                ? "Your current pass is active. Renewing extends your expiry from the current end date."
                : userMemberState?.status === "lapsed"
                  ? "Your previous pass has expired. Buying access starts a fresh period from right now."
                  : "Pass is bound to your connected address. There are no refunds."}
          </p>
        </div>

        {!gate.closed ? (
          <div className="flex flex-col gap-4 pt-3 border-t border-[var(--border-subtle)]">
            {/* Periods Stepper */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  Periods
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Between {MIN_PERIODS} and {MAX_PERIODS} periods
                </span>
              </div>

              <div className="flex items-center gap-1.5 border border-[var(--border-default)] rounded p-1 bg-[var(--bg-surface)]">
                <button
                  type="button"
                  onClick={() => setPeriods((p) => Math.max(MIN_PERIODS, p - 1))}
                  disabled={periods <= MIN_PERIODS}
                  className="w-7 h-7 flex items-center justify-center font-bold text-sm rounded bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-primary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  -
                </button>
                <span className="mono font-bold text-sm w-8 text-center text-[var(--text-primary)]">
                  {periods}
                </span>
                <button
                  type="button"
                  onClick={() => setPeriods((p) => Math.min(MAX_PERIODS, p + 1))}
                  disabled={periods >= MAX_PERIODS}
                  className="w-7 h-7 flex items-center justify-center font-bold text-sm rounded bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-primary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>

            {/* Total and Projected Expiry preview */}
            <div
              className="p-3 rounded flex flex-col gap-2 text-xs"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Total cost:</span>
                <span className="mono font-extrabold text-sm text-[var(--text-primary)]">
                  {formatEther(totalPrice)} BOT
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-1.5">
                <span className="text-[var(--text-muted)]">New expiry preview:</span>
                <span className="mono font-bold text-[var(--accent)]">
                  {formatDateFull(projectedExpiry)}
                </span>
              </div>
            </div>

            {buyError && (
              <div className="p-2.5 rounded text-xs bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30">
                {describeError(buyError)}
              </div>
            )}

            <Button
              variant="stamp"
              size="lg"
              onClick={handlePurchase}
              disabled={!isConnected || isBuying || isBuyConfirming}
              loading={isBuying || isBuyConfirming}
              className="w-full mt-1"
            >
              {!isConnected
                ? "Connect Wallet to Buy"
                : isBuying
                  ? "Confirm in Wallet..."
                  : isBuyConfirming
                    ? "Validating & Stamping..."
                    : userMemberState?.isMember
                      ? `Renew Pass (${formatEther(totalPrice)} BOT)`
                      : `Stamp Pass (${formatEther(totalPrice)} BOT)`}
            </Button>
          </div>
        ) : (
          <div className="p-3 rounded text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center">
            This gate is closed. No new tickets can be purchased.
          </div>
        )}
      </Panel>

      {/* Member Check Box ("Is this address a member?") */}
      <Panel variant="docket" className="flex flex-col gap-3">
        <div>
          <h3 className="display-title text-sm font-bold text-[var(--text-primary)]">
            Is this address a member?
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Query on-chain membership state for any external address.
          </p>
        </div>

        <form onSubmit={handleCheckAddress} className="flex gap-2">
          <input
            type="text"
            value={checkAddrInput}
            onChange={(e) => setCheckAddrInput(e.target.value)}
            placeholder="0x... address"
            className="flex-1 px-3 py-2 text-xs rounded bg-[var(--bg-surface)] border border-[var(--border-default)] mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!isAddress(checkAddrInput.trim()) || isChecking}
            loading={isChecking}
          >
            Check
          </Button>
        </form>

        {checkResult && (
          <div
            className="p-3.5 rounded border flex flex-col gap-2 mt-1"
            style={{
              background: checkResult.isMember
                ? "rgba(10, 123, 131, 0.05)"
                : "var(--bg-elevated)",
              borderColor: checkResult.isMember
                ? "var(--accent)"
                : "var(--border-default)",
            }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="mono font-semibold text-[var(--text-primary)] truncate max-w-[220px]">
                {checkResult.address}
              </span>
              <span
                className={[
                  "text-[10px] uppercase font-bold px-2 py-0.5 rounded",
                  checkResult.isMember
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--danger)]/15 text-[var(--danger)]",
                ].join(" ")}
              >
                {checkResult.isMember ? "Active Member" : "Not a Member"}
              </span>
            </div>

            <div className="text-xs flex items-center justify-between text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
              <span>Expiry date:</span>
              <span className="mono font-semibold text-[var(--text-primary)]">
                {checkResult.expiry > 0n ? formatDateFull(checkResult.expiry) : "Never purchased"}
              </span>
            </div>

            <Link
              href={`/g/${gate.id.toString()}/check/${checkResult.address}`}
              className="text-[11px] font-semibold text-[var(--accent)] hover:underline mt-1 self-end no-underline"
            >
              Open shareable proof →
            </Link>
          </div>
        )}
      </Panel>
    </div>
  );
}
