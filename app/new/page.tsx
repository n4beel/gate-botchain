"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, decodeEventLog } from "viem";
import Ticket from "@/components/gate/Ticket";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { gateAbi } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";
import { MAX_NAME, GateData } from "@/lib/gate";

const PRESET_PERIODS = [
  { label: "1 Day", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
  { label: "365 Days", days: 365 },
];

export default function NewGatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { address, isConnected, chainId } = useAccount();

  const currentChainId = (chainId ?? activeBotChain.id) as 677 | 968;
  const deployment = getDeployment(currentChainId);
  const deployed = isDeployed(currentChainId);

  const [name, setName] = useState("Alpha Pass");
  const [priceInput, setPriceInput] = useState("0.5");
  const [selectedDays, setSelectedDays] = useState(30);
  const [customDays, setCustomDays] = useState("30");
  const [isCustom, setIsCustom] = useState(false);
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const { data: hash, isPending: isWriting, error: writeError, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  const activeDays = isCustom ? Math.max(1, Math.min(365, parseInt(customDays) || 1)) : selectedDays;
  const periodSecs = activeDays * 86400;

  let parsedPrice = 0n;
  try {
    if (priceInput && parseFloat(priceInput) > 0) {
      parsedPrice = parseEther(priceInput);
    }
  } catch {}

  const nameBytes = new TextEncoder().encode(name).length;
  const isNameValid = name.trim().length > 0 && nameBytes <= MAX_NAME;
  const isPriceValid = parsedPrice > 0n;
  const isDaysValid = activeDays >= 1 && activeDays <= 365;
  const canSubmit = isConnected && deployed && isNameValid && isPriceValid && isDaysValid && !isWriting && !isConfirming;

  const previewGate: GateData = {
    id: 0n,
    owner: (address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    price: parsedPrice > 0n ? parsedPrice : parseEther("0.5"),
    periodSecs,
    closed: false,
    members: 0,
    name: name.trim() || "Untitled Pass",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      writeContract(
        {
          address: deployment.address,
          abi: gateAbi,
          functionName: "create",
          args: [name.trim(), parsedPrice, periodSecs],
        },
        {
          onError: (err) => {
            toast("error", "Failed to create gate", describeError(err));
          },
        },
      );
    } catch (err) {
      toast("error", "Submission error", describeError(err));
    }
  };

  // Inspect receipt for Created event to grab ID
  if (receipt && !createdId) {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: gateAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "Created") {
          setCreatedId((decoded.args as any).id);
          break;
        }
      } catch {}
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-default)]">
        <Link
          href="/"
          className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 mb-2 no-underline"
        >
          ← Back to Rack
        </Link>
        <h1 className="text-2xl font-extrabold display-title tracking-tight text-[var(--text-primary)]">
          Make a Gate
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Create an expiring pass turnstile. Price and period length are fixed permanently.
        </p>
      </div>

      {isSuccess && (
        <Panel
          variant="callout"
          className="p-5 flex flex-col items-center text-center gap-3 border-2 border-[var(--accent)]"
        >
          <span className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-sm">
            ✓
          </span>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Gate Created Successfully!
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Your pass is now live on-chain in the turnstile rack.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            {createdId && (
              <Link href={`/g/${createdId.toString()}`} className="no-underline">
                <Button variant="primary" size="md">
                  View Pass #{createdId.toString()}
                </Button>
              </Link>
            )}
            <Link href="/" className="no-underline">
              <Button variant="secondary" size="md">
                Return to Rack
              </Button>
            </Link>
          </div>
        </Panel>
      )}

      {/* Live Ticket Preview */}
      <div className="flex flex-col gap-2">
        <span className="mono text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Live Ticket Preview
        </span>
        <Ticket gate={previewGate} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Panel variant="docket" className="flex flex-col gap-4">
          {/* Gate Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="gate-name" className="text-xs font-bold text-[var(--text-primary)]">
                Pass Name
              </label>
              <span
                className={[
                  "mono text-[11px]",
                  nameBytes > MAX_NAME ? "text-[var(--danger)] font-bold" : "text-[var(--text-muted)]",
                ].join(" ")}
              >
                {nameBytes}/{MAX_NAME} bytes
              </span>
            </div>
            <input
              id="gate-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              placeholder="e.g. VIP Lounge, Daily Access"
              className="w-full px-3 py-2 text-sm rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              required
            />
            {nameBytes > MAX_NAME && (
              <p className="text-[11px] text-[var(--danger)] mt-1">
                Name cannot exceed {MAX_NAME} bytes.
              </p>
            )}
          </div>

          {/* Price per period */}
          <div>
            <label htmlFor="gate-price" className="text-xs font-bold text-[var(--text-primary)] block mb-1">
              Price per Period (BOT)
            </label>
            <div className="relative">
              <input
                id="gate-price"
                type="number"
                step="0.001"
                min="0.0001"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.5"
                className="w-full px-3 py-2 text-sm rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                required
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-[var(--text-muted)]">
                BOT
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Fixed fee for each renewal or initial pass period.
            </p>
          </div>

          {/* Period duration */}
          <div>
            <label className="text-xs font-bold text-[var(--text-primary)] block mb-1.5">
              Period Duration
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {PRESET_PERIODS.map((preset) => {
                const active = !isCustom && selectedDays === preset.days;
                return (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => {
                      setIsCustom(false);
                      setSelectedDays(preset.days);
                    }}
                    className={[
                      "py-2 px-1 text-xs rounded font-medium border text-center transition-all cursor-pointer",
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] font-bold shadow-xs"
                        : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-default)] hover:border-[var(--accent)]",
                    ].join(" ")}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Days Input Toggle */}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCustom(!isCustom)}
                className={[
                  "text-xs px-2.5 py-1 rounded border cursor-pointer font-medium",
                  isCustom
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-default)]",
                ].join(" ")}
              >
                Custom Days
              </button>

              {isCustom && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-20 px-2 py-1 text-xs rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <span className="text-xs text-[var(--text-muted)]">days (1–365)</span>
                </div>
              )}
            </div>
          </div>
        </Panel>

        {writeError && (
          <div className="p-3 rounded text-xs bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30">
            {describeError(writeError)}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          loading={isWriting || isConfirming}
          className="w-full"
        >
          {!isConnected
            ? "Connect Wallet to Create"
            : isWriting
              ? "Confirm in Wallet..."
              : isConfirming
                ? "Mining Gate Creation..."
                : "Open Gate on Chain"}
        </Button>
      </form>
    </div>
  );
}
