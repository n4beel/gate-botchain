"use client";

import Link from "next/link";
import Ticket from "./Ticket";
import { GateData } from "@/lib/gate";
import Button from "@/components/ui/Button";

interface TicketRackProps {
  gates: GateData[];
  loading?: boolean;
}

export default function TicketRack({ gates, loading = false }: TicketRackProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 py-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full h-32 skeleton rounded-md"
          />
        ))}
      </div>
    );
  }

  if (gates.length === 0) {
    return (
      <div
        className="w-full py-12 px-6 rounded-md border-2 border-dashed border-[var(--border-default)] text-center flex flex-col items-center justify-center gap-4"
        style={{ background: "var(--bg-surface)" }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <line x1="8" y1="6" x2="8" y2="18" strokeDasharray="2 2" />
          </svg>
        </div>

        <div>
          <h3 className="display-title text-base font-bold text-[var(--text-primary)]">
            The rack is empty
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs mx-auto leading-relaxed">
            No gates have been placed in the turnstile yet. Be the first to create one.
          </p>
        </div>

        <Link href="/new" className="no-underline mt-1">
          <Button variant="primary" size="md">
            Make a gate
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col py-2"
      role="region"
      aria-label="Ticket Rack"
    >
      {gates.map((gate, index) => {
        return (
          <div
            key={gate.id.toString()}
            className={[
              "relative transition-all duration-200 transform-gpu group",
              index > 0 ? "-mt-2 sm:-mt-2.5" : "", // 8px-10px overlap like a ticket book
              "hover:-translate-y-2.5 hover:z-30 hover:shadow-xl focus-within:-translate-y-2.5 focus-within:z-30",
            ].join(" ")}
            style={{ zIndex: 10 + index }}
          >
            <Link
              href={`/g/${gate.id.toString()}`}
              className="block no-underline outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-md"
              title={`View ${gate.name}`}
            >
              <Ticket gate={gate} compact />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
