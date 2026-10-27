"use client";

import { HTMLAttributes } from "react";

export type PanelVariant = "docket" | "ticket" | "callout" | "plain";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  elevated?: boolean;
  noPadding?: boolean;
}

export default function Panel({
  variant = "docket",
  elevated = false,
  noPadding = false,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "ticket":
        return {
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 2px 8px var(--ticket-shadow)",
          borderRadius: "4px",
        };
      case "callout":
        return {
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "4px",
        };
      case "plain":
        return {
          background: "transparent",
          border: "none",
        };
      case "docket":
      default:
        return {
          background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          borderRadius: "4px",
        };
    }
  };

  return (
    <div
      className={[
        "relative transition-all",
        noPadding ? "p-0" : "p-4 sm:p-5",
        className,
      ].join(" ")}
      style={{
        ...getVariantStyles(),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
