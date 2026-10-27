import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  quote,
  newExpiry,
  humanDuration,
  memberState,
  formatDateFull,
  formatDateStamp,
  formatShortAddress,
  formatEtherShort,
  MIN_PERIOD,
  MAX_PERIOD,
  MAX_PERIODS,
} from "../gate";

describe("lib/gate.ts", () => {
  describe("quote", () => {
    const price = parseEther("0.5");

    it("calculates cost for 1 period", () => {
      expect(quote(price, 1)).toBe(price);
    });

    it("calculates cost for multiple periods", () => {
      expect(quote(price, 4)).toBe(parseEther("2"));
      expect(quote(price, 36)).toBe(parseEther("18"));
    });

    it("throws for 0 or negative periods", () => {
      expect(() => quote(price, 0)).toThrow("Periods must be between 1 and 36");
      expect(() => quote(price, -1)).toThrow("Periods must be between 1 and 36");
    });

    it("throws for periods > 36", () => {
      expect(() => quote(price, 37)).toThrow("Periods must be between 1 and 36");
    });
  });

  describe("newExpiry arithmetic (mirrors contract)", () => {
    const periodSecs = 86400n; // 1 day

    it("first purchase begins from now", () => {
      const now = 1_700_000_000n;
      const current = 0n;
      const exp = newExpiry(now, current, 1, periodSecs);
      expect(exp).toBe(now + periodSecs);
    });

    it("active renewal extends from current expiry", () => {
      const now = 1_700_000_000n;
      const current = 1_700_500_000n; // in the future
      const exp = newExpiry(now, current, 2, periodSecs);
      expect(exp).toBe(current + 2n * periodSecs);
    });

    it("lapsed renewal restarts from now", () => {
      const now = 1_700_000_000n;
      const current = 1_699_000_000n; // in the past
      const exp = newExpiry(now, current, 3, periodSecs);
      expect(exp).toBe(now + 3n * periodSecs);
    });

    it("exact boundary: current == now starts from now", () => {
      const now = 1_700_000_000n;
      const current = now;
      const exp = newExpiry(now, current, 1, periodSecs);
      expect(exp).toBe(now + periodSecs);
    });

    it("throws on invalid periods", () => {
      expect(() => newExpiry(100n, 0n, 0, 86400)).toThrow();
      expect(() => newExpiry(100n, 0n, 37, 86400)).toThrow();
    });
  });

  describe("humanDuration", () => {
    it("formats standard period presets", () => {
      expect(humanDuration(86400)).toBe("1 day");
      expect(humanDuration(7 * 86400)).toBe("7 days (1 week)");
      expect(humanDuration(14 * 86400)).toBe("14 days (2 weeks)");
      expect(humanDuration(30 * 86400)).toBe("30 days (1 month)");
      expect(humanDuration(90 * 86400)).toBe("90 days (1 quarter)");
      expect(humanDuration(180 * 86400)).toBe("180 days (half year)");
      expect(humanDuration(365 * 86400)).toBe("365 days (1 year)");
    });

    it("formats custom days and hours", () => {
      expect(humanDuration(3 * 86400)).toBe("3 days");
      expect(humanDuration(45 * 86400)).toBe("45 days");
      expect(humanDuration(3600)).toBe("1 hour");
      expect(humanDuration(12 * 3600)).toBe("12 hours");
    });
  });

  describe("memberState", () => {
    const now = 1_700_000_000n;

    it("identifies never member", () => {
      const res = memberState(0n, now);
      expect(res.status).toBe("never");
      expect(res.isMember).toBe(false);
      expect(res.label).toBe("Never a member");
      expect(res.chipText).toBe("Not a member");
    });

    it("identifies active member", () => {
      const expiry = now + 9n * 86400n;
      const res = memberState(expiry, now);
      expect(res.status).toBe("active");
      expect(res.isMember).toBe(true);
      expect(res.daysRemaining).toBe(9);
      expect(res.chipText).toBe("expires in 9 days");
      expect(res.label).toContain("Valid until");
      expect(res.label).toContain("· renew");
    });

    it("identifies active member with 1 day remaining", () => {
      const expiry = now + 43200n; // 12 hours left
      const res = memberState(expiry, now);
      expect(res.status).toBe("active");
      expect(res.chipText).toBe("expires in 1 day");
    });

    it("identifies lapsed member expired in the past", () => {
      const expiry = now - 3n * 86400n;
      const res = memberState(expiry, now);
      expect(res.status).toBe("lapsed");
      expect(res.isMember).toBe(false);
      expect(res.daysLapsed).toBe(3);
      expect(res.chipText).toBe("Expired 3 days ago");
      expect(res.label).toBe("Expired 3 days ago");
    });

    it("identifies lapsed member expired today", () => {
      const expiry = now - 3600n; // 1 hour ago
      const res = memberState(expiry, now);
      expect(res.status).toBe("lapsed");
      expect(res.isMember).toBe(false);
      expect(res.chipText).toBe("Expired today");
      expect(res.label).toBe("Expired today");
    });
  });

  describe("formatting helpers", () => {
    it("formatDateFull formats valid timestamps", () => {
      // 1700000000 = 14 Nov 2023
      const text = formatDateFull(1_700_000_000);
      expect(text).toContain("2023");
      expect(text).toContain("Nov");
      expect(formatDateFull(0)).toBe("—");
    });

    it("formatDateStamp formats UTC stamp", () => {
      const stamp = formatDateStamp(1_700_000_000);
      expect(stamp).toBe("14 NOV 2023");
      expect(formatDateStamp(0)).toBe("—");
    });

    it("formatShortAddress truncates properly", () => {
      expect(formatShortAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe("0xf39F…2266");
      expect(formatShortAddress("")).toBe("");
    });

    it("formatEtherShort trims trailing zeros", () => {
      expect(formatEtherShort(parseEther("1"))).toBe("1");
      expect(formatEtherShort(parseEther("1.5"))).toBe("1.5");
      expect(formatEtherShort(parseEther("0.05"))).toBe("0.05");
    });
  });
});
