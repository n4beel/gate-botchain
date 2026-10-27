"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";
import { app } from "@/lib/app-config";

export interface PageShellProps {
  children: React.ReactNode;
}

export default function PageShell({ children }: PageShellProps) {
  const pathname = usePathname();
  const links = footerLinks();

  const navLinks = [
    { href: "/", label: "Rack" },
    { href: "/new", label: "Make a gate" },
    { href: "/me", label: "My passes" },
  ];

  return (
    <div
      className="flex flex-col min-h-[100dvh] w-full overflow-x-hidden selection:bg-[#0A7B83]/20"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* Turnstile Top Bar: Wordmark left, nav center-left, wallet connect right */}
      <header
        className="sticky top-0 z-40 w-full backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--bg-base) 90%, transparent)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div className="max-w-[520px] mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 group select-none no-underline"
              title="Gate Turnstile"
            >
              {/* Turnstile brass barrier bar icon */}
              <div
                className="w-6 h-6 rounded flex items-center justify-center transition-transform group-hover:scale-105"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                }}
                aria-hidden="true"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                </svg>
              </div>

              <span className="text-[17px] font-extrabold tracking-tight display-title">
                {app.name}
              </span>
            </Link>

            <nav className="flex items-center gap-1 ml-2">
              {navLinks.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "text-xs px-2 py-1 rounded transition-colors no-underline font-medium",
                      active
                        ? "bg-[#EAE4D5] text-[var(--text-primary)] font-semibold shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Desk surface: Single Centred Column, max 520 px */}
      <main className="flex-1 w-full max-w-[520px] mx-auto px-4 py-6 md:py-8">
        {children}
      </main>

      {/* Shared UI Contract: Footer on every route */}
      <footer
        className="w-full max-w-[520px] mx-auto px-4 py-8 mt-auto flex-shrink-0"
        style={{ borderTop: "1px solid var(--border-default)" }}
      >
        <div className="flex flex-col gap-5">
          {/* Limits section from spec §1 & §3.4 */}
          <div
            className="p-3.5 rounded text-xs leading-relaxed"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <div className="font-semibold text-[var(--text-primary)] mb-1">
              What a pass can&apos;t do
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[11.5px]">
              <li>It belongs to an address and cannot be moved or refunded.</li>
              <li>Price and length are fixed. A different price is a different gate.</li>
              <li>Gate only answers the question. Whoever needs the answer has to ask it.</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              <BuiltOnBotChain
                className="text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--text-secondary)" }}
              />
            </div>

            <div className="flex items-center gap-4 text-[11.5px]">
              <a
                href={links.site}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] underline underline-offset-2"
              >
                botchain.ai
              </a>
              <a
                href={links.explorer}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] underline underline-offset-2"
              >
                scan.botchain.ai
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
