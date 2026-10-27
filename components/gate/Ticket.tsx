"use client";

import Link from "next/link";
import { formatEther } from "viem";
import {
  GateData,
  memberState,
  formatDateStamp,
  humanDuration,
  MemberState,
} from "@/lib/gate";

interface TicketProps {
  gate: GateData;
  expiry?: bigint;
  isMember?: boolean;
  isStamping?: boolean;
  compact?: boolean;
  inspectAddress?: string;
}

export default function Ticket({
  gate,
  expiry,
  isMember,
  isStamping = false,
  compact = false,
  inspectAddress,
}: TicketProps) {
  const nowSec = Math.floor(Date.now() / 1000);
  const mState: MemberState | null = expiry !== undefined ? memberState(expiry, nowSec, isMember) : null;
  const durationText = humanDuration(gate.periodSecs);
  const priceBot = formatEther(gate.price);
  const formattedId = `#${String(gate.id).padStart(3, "0")}`;

  return (
    <div
      className={[
        "relative flex flex-row w-full select-none overflow-hidden rounded-md transition-all duration-200",
        "bg-[var(--bg-surface)] text-[var(--text-primary)]",
        compact
          ? "border border-[var(--border-default)] shadow-xs hover:border-[var(--accent)] hover:shadow-md"
          : "border-2 border-[var(--border-default)] shadow-md",
      ].join(" ")}
      style={{
        minHeight: compact ? "116px" : "154px",
      }}
    >
      {/* Left section: Ticket Body */}
      <div className="flex-1 p-3.5 sm:p-5 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="mono text-[11px] font-semibold tracking-wider text-[var(--text-muted)]">
              {formattedId}
            </span>
            <span
              className={[
                "text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-xs",
                gate.closed
                  ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                  : "bg-[var(--accent)]/10 text-[var(--accent)]",
              ].join(" ")}
            >
              {gate.closed ? "Closed" : "Open"}
            </span>
          </div>

          <h2
            className={[
              "display-title font-extrabold tracking-tight truncate leading-tight text-[var(--text-primary)]",
              compact ? "text-base sm:text-lg" : "text-xl sm:text-2xl",
            ].join(" ")}
          >
            {gate.name}
          </h2>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-baseline gap-1.5">
            <span className="mono font-bold text-sm sm:text-base text-[var(--text-primary)]">
              {priceBot} BOT
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              / {durationText}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
            <span>
              {gate.members} {gate.members === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
      </div>

      {/* Perforation Line & Circular Ticket Notches */}
      <div className="relative flex flex-col items-center justify-between w-0 flex-shrink-0">
        {/* Top Notch cutout */}
        <div
          className="absolute -top-3 w-5 h-5 rounded-full z-10"
          style={{
            background: "var(--bg-base)",
            borderBottom: "1px solid var(--border-default)",
          }}
          aria-hidden="true"
        />

        {/* Perforation dashed line */}
        <div
          className="h-full border-r-2 border-dashed"
          style={{ borderColor: "var(--border-default)" }}
          aria-hidden="true"
        />

        {/* Bottom Notch cutout */}
        <div
          className="absolute -bottom-3 w-5 h-5 rounded-full z-10"
          style={{
            background: "var(--bg-base)",
            borderTop: "1px solid var(--border-default)",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Right section: Ticket Stub */}
      <div
        className="w-[125px] sm:w-[155px] p-3 sm:p-4 flex flex-col justify-between items-center text-center flex-shrink-0"
        style={{
          background: "var(--bg-elevated)",
        }}
      >
        <span className="text-[9.5px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
          {mState ? (mState.isMember ? "Pass Stub" : "Turnstile") : "Pass Stub"}
        </span>

        {/* Member Status Stamping or Admit info */}
        {mState ? (
          <div className="w-full my-auto py-1">
            {mState.status === "active" && (
              <div
                className={[
                  "border-2 border-[var(--accent)] rounded p-1.5 text-center",
                  isStamping ? "ticket-stamp" : "",
                ].join(" ")}
                style={{
                  color: "var(--accent)",
                  background: "rgba(10, 123, 131, 0.05)",
                }}
              >
                <div className="text-[9px] uppercase tracking-wider font-extrabold leading-none">
                  Valid Until
                </div>
                <div className="mono text-[11px] sm:text-xs font-bold mt-1 leading-tight">
                  {formatDateStamp(expiry!)}
                </div>
                <div className="text-[9px] font-medium text-[var(--text-muted)] mt-1">
                  {mState.chipText}
                </div>
              </div>
            )}

            {mState.status === "lapsed" && (
              <div
                className="border-2 border-dashed border-[var(--danger)]/60 rounded p-1.5 text-center"
                style={{
                  color: "var(--danger)",
                  background: "rgba(179, 38, 30, 0.04)",
                }}
              >
                <div className="text-[9px] uppercase tracking-wider font-bold leading-none">
                  Expired
                </div>
                <div className="mono text-[10.5px] font-bold mt-0.5 leading-tight">
                  {formatDateStamp(expiry!)}
                </div>
                <div className="text-[9px] font-medium text-[var(--danger)] mt-0.5">
                  {mState.chipText}
                </div>
              </div>
            )}

            {mState.status === "never" && (
              <div className="text-center py-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] block">
                  No active pass
                </span>
                <span className="text-[10px] text-[var(--accent)] font-medium">
                  Available
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full my-auto py-2 text-center">
            <span className="mono text-xs font-bold text-[var(--text-primary)] block">
              ADMIT ONE
            </span>
            <span className="mono text-[10px] text-[var(--text-muted)] mt-1 block">
              {durationText.toUpperCase()}
            </span>
          </div>
        )}

        {/* Bottom stub barcode or serial */}
        <div className="w-full pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-center">
          <span className="mono text-[9px] text-[var(--text-tertiary)] tracking-widest">
            {formattedId}-STUB
          </span>
        </div>
      </div>
    </div>
  );
}
