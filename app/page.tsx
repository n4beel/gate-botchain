"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import TicketRack from "@/components/gate/TicketRack";
import Button from "@/components/ui/Button";
import { gateAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { GateData } from "@/lib/gate";
import { app } from "@/lib/app-config";

export default function Home() {
  const { chainId } = useAccount();
  const currentChainId = activeBotChain.id as 677 | 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  const { data, isLoading } = useReadContract({
    address: deployment.address,
    abi: gateAbi,
    functionName: "latest",
    args: [0n, 20n],
    query: {
      enabled: deployed,
    },
  });

  const gates: GateData[] = data && data[0] && data[1]
    ? data[0].map((g, idx) => ({
        id: data[1][idx],
        owner: g.owner,
        price: g.price,
        periodSecs: Number(g.periodSecs),
        closed: g.closed,
        members: Number(g.members),
        name: g.name,
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Desk Wordmark & Tagline Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[var(--border-default)]">
        <div>
          <span className="mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
            Turnstile Gate Pass
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold display-title tracking-tight mt-1 text-[var(--text-primary)]">
            {app.name}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            {app.tagline}
          </p>
        </div>

        <Link href="/new" className="no-underline flex-shrink-0">
          <Button variant="primary" size="md">
            + Make a gate
          </Button>
        </Link>
      </div>

      {!deployed ? (
        <div
          className="p-6 rounded-md border border-[var(--warning)]/40 text-center"
          style={{ background: "rgba(138, 90, 0, 0.05)" }}
        >
          <p className="text-sm font-semibold text-[var(--warning)]">
            Contract not deployed on chain {currentChainId}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Please switch to BOT Chain testnet (968) or mainnet (677).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">
              Available Passes
            </span>
            <span className="mono">
              {isLoading ? "Reading rack..." : `${gates.length} on rack`}
            </span>
          </div>

          <TicketRack gates={gates} loading={isLoading} />
        </div>
      )}
    </div>
  );
}
