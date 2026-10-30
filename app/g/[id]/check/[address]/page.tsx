"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { formatEther, isAddress } from "viem";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { gateAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import {
  memberState,
  formatDateStamp,
  formatDateFull,
  humanDuration,
} from "@/lib/gate";

export default function CheckAddressPage() {
  const params = useParams();
  const idStr = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const addressParam = Array.isArray(params?.address) ? params.address[0] : params?.address;

  const gateId = BigInt(idStr || "1");
  const checkAddress = (addressParam || "").trim();
  const validAddress = isAddress(checkAddress);

  const { chainId } = useAccount();
  const currentChainId = activeBotChain.id as 677 | 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  // Read Gate info
  const { data: gateRaw, isLoading: isGateLoading } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "gateOf",
    args: [gateId],
    query: { enabled: deployed },
  });

  // Read isMember
  const { data: isMemberRaw, isLoading: isMemberLoading } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "isMember",
    args: [gateId, (validAddress ? checkAddress : "0x0000000000000000000000000000000000000000") as `0x${string}`],
    query: { enabled: deployed && validAddress },
  });

  // Read expiryOf
  const { data: expiryRaw, isLoading: isExpiryLoading } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "expiryOf",
    args: [gateId, (validAddress ? checkAddress : "0x0000000000000000000000000000000000000000") as `0x${string}`],
    query: { enabled: deployed && validAddress },
  });

  if (!validAddress) {
    return (
      <div className="flex flex-col gap-4 py-12 text-center items-center">
        <div className="w-12 h-12 rounded-full bg-[var(--danger)]/15 text-[var(--danger)] flex items-center justify-center font-bold text-xl">
          !
        </div>
        <h1 className="text-xl font-bold display-title text-[var(--text-primary)]">
          Invalid Address
        </h1>
        <p className="text-xs text-[var(--text-secondary)] max-w-xs mono">
          &quot;{checkAddress}&quot; is not a valid 20-byte Ethereum address format.
        </p>
        <Link href={`/g/${gateId.toString()}`} className="no-underline mt-2">
          <Button variant="primary" size="md">
            Return to Gate #{gateId.toString()}
          </Button>
        </Link>
      </div>
    );
  }

  const isLoading = isGateLoading || isMemberLoading || isExpiryLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <div className="w-full h-24 skeleton rounded-md" />
        <div className="w-full h-48 skeleton rounded-md" />
      </div>
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = expiryRaw ?? 0n;
  const state = memberState(expiry, nowSec, isMemberRaw);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)]">
        <Link
          href={`/g/${gateId.toString()}`}
          className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 no-underline"
        >
          ← Back to Gate #{gateId.toString()}
        </Link>
        <span className="mono text-xs text-[var(--text-muted)]">
          Public Proof Check
        </span>
      </div>

      {/* Target Gate Summary */}
      {gateRaw && (
        <div className="p-3.5 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-between">
          <div>
            <span className="mono text-[10px] text-[var(--text-muted)] font-bold block">
              CHECKING ACCESS FOR GATE #{gateId.toString()}
            </span>
            <span className="display-title font-extrabold text-base text-[var(--text-primary)]">
              {gateRaw.name}
            </span>
          </div>

          <div className="text-right">
            <span className="mono text-xs font-bold text-[var(--text-primary)] block">
              {formatEther(gateRaw.price)} BOT
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              / {humanDuration(gateRaw.periodSecs)}
            </span>
          </div>
        </div>
      )}

      {/* Proof Docket Card */}
      <Panel
        variant="docket"
        className="flex flex-col items-center text-center p-6 sm:p-8 gap-5 border-2 shadow-md"
        style={{
          borderColor:
            state.status === "active"
              ? "var(--accent)"
              : state.status === "lapsed"
                ? "var(--danger)"
                : "var(--border-default)",
        }}
      >
        <span className="mono text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
          On-Chain Membership Query
        </span>

        {/* Address Badge */}
        <div className="mono text-xs sm:text-sm font-semibold p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] break-all max-w-full">
          {checkAddress}
        </div>

        {/* Stamp / Result Seal */}
        {state.status === "active" && (
          <div
            className="border-3 border-[var(--accent)] rounded-lg p-5 my-2 ticket-stamp max-w-xs w-full"
            style={{
              background: "rgba(10, 123, 131, 0.06)",
              color: "var(--accent)",
            }}
          >
            <div className="text-xs uppercase font-extrabold tracking-widest leading-none">
              VALID MEMBERSHIP PASS
            </div>
            <div className="mono text-xl sm:text-2xl font-black mt-2 tracking-tight">
              {formatDateStamp(expiry)}
            </div>
            <div className="text-xs font-semibold text-[var(--text-muted)] mt-1.5">
              {state.chipText}
            </div>
          </div>
        )}

        {state.status === "lapsed" && (
          <div
            className="border-3 border-dashed border-[var(--danger)] rounded-lg p-5 my-2 max-w-xs w-full"
            style={{
              background: "rgba(179, 38, 30, 0.05)",
              color: "var(--danger)",
            }}
          >
            <div className="text-xs uppercase font-extrabold tracking-widest leading-none">
              EXPIRED PASS
            </div>
            <div className="mono text-xl sm:text-2xl font-black mt-2 tracking-tight">
              {formatDateStamp(expiry)}
            </div>
            <div className="text-xs font-semibold text-[var(--danger)] mt-1.5">
              {state.chipText}
            </div>
          </div>
        )}

        {state.status === "never" && (
          <div className="p-4 my-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] max-w-xs w-full">
            <span className="mono text-sm font-bold text-[var(--text-muted)] block uppercase">
              NO MEMBERSHIP FOUND
            </span>
            <span className="text-xs text-[var(--text-secondary)] mt-1 block">
              This address has never held a pass for this gate.
            </span>
          </div>
        )}

        <div className="w-full pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <span>Read directly from contract `isMember`</span>
          <Link href={`/g/${gateId.toString()}`} className="no-underline">
            <Button variant="primary" size="sm">
              View Turnstile Gate →
            </Button>
          </Link>
        </div>
      </Panel>
    </div>
  );
}
