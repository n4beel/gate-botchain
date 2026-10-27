import { formatEther, type Address } from "viem";

export const MIN_PERIOD = 86400; // 1 days in seconds
export const MAX_PERIOD = 31536000; // 365 days in seconds
export const MIN_PERIODS = 1;
export const MAX_PERIODS = 36;
export const MAX_NAME = 40;
export const MAX_NAME_LENGTH = 40;

export interface GateData {
  id: bigint;
  owner: Address;
  price: bigint;
  periodSecs: number;
  closed: boolean;
  members: number;
  name: string;
}

export type MembershipStatus = "active" | "lapsed" | "never";

export interface MemberState {
  status: MembershipStatus;
  label: string;
  chipText: string;
  daysRemaining: number;
  daysLapsed: number;
  isMember: boolean;
}

/**
 * Calculates total cost for purchasing N periods.
 */
export function quote(price: bigint, periods: number): bigint {
  if (periods < MIN_PERIODS || periods > MAX_PERIODS) {
    throw new Error(`Periods must be between ${MIN_PERIODS} and ${MAX_PERIODS}`);
  }
  return price * BigInt(periods);
}

/**
 * Calculates the new membership expiry timestamp.
 * Replicates contract logic: max(now, current) + periods * periodSecs.
 */
export function newExpiry(
  now: number | bigint,
  current: number | bigint,
  periods: number,
  periodSecs: number | bigint,
): bigint {
  if (periods < MIN_PERIODS || periods > MAX_PERIODS) {
    throw new Error(`Periods must be between ${MIN_PERIODS} and ${MAX_PERIODS}`);
  }
  const nowBn = BigInt(now);
  const currentBn = BigInt(current);
  const base = currentBn > nowBn ? currentBn : nowBn;
  return base + BigInt(periods) * BigInt(periodSecs);
}

/**
 * Converts period duration in seconds into human readable text.
 */
export function humanDuration(seconds: number | bigint): string {
  const s = Number(seconds);
  if (s <= 0) return "0 days";

  const days = Math.round(s / 86400);
  if (s % 86400 === 0) {
    if (days === 1) return "1 day";
    if (days === 7) return "7 days (1 week)";
    if (days === 14) return "14 days (2 weeks)";
    if (days === 30) return "30 days (1 month)";
    if (days === 90) return "90 days (1 quarter)";
    if (days === 180) return "180 days (half year)";
    if (days === 365) return "365 days (1 year)";
    return `${days} days`;
  }

  const hours = Math.round(s / 3600);
  if (hours < 24) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return `${days} days`;
}

/**
 * Determines current membership state and display copy.
 */
export function memberState(expiry: number | bigint, nowSec: number | bigint): MemberState {
  const exp = BigInt(expiry);
  const now = BigInt(nowSec);

  if (exp === 0n) {
    return {
      status: "never",
      label: "Never a member",
      chipText: "Not a member",
      daysRemaining: 0,
      daysLapsed: 0,
      isMember: false,
    };
  }

  if (exp > now) {
    const diffSec = Number(exp - now);
    const days = Math.max(1, Math.ceil(diffSec / 86400));
    const formatted = formatDateFull(exp);
    return {
      status: "active",
      label: `Valid until ${formatted} · renew`,
      chipText: days === 1 ? "expires in 1 day" : `expires in ${days} days`,
      daysRemaining: days,
      daysLapsed: 0,
      isMember: true,
    };
  }

  const diffSec = Number(now - exp);
  const daysAgo = Math.floor(diffSec / 86400);
  const agoText = daysAgo === 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`;
  return {
    status: "lapsed",
    label: `Expired ${agoText}`,
    chipText: `Expired ${agoText}`,
    daysRemaining: 0,
    daysLapsed: daysAgo,
    isMember: false,
  };
}

/**
 * Formats a unix timestamp into full date string: "14 Mar 2027"
 */
export function formatDateFull(timestamp: number | bigint): string {
  if (!timestamp || BigInt(timestamp) === 0n) return "—";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formats a unix timestamp into ticket stamp string: "14 MAR 2027"
 */
export function formatDateStamp(timestamp: number | bigint): string {
  if (!timestamp || BigInt(timestamp) === 0n) return "—";
  const date = new Date(Number(timestamp) * 1000);
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase();
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Formats an Ethereum address into 0x1234…5678
 */
export function formatShortAddress(address: string): string {
  if (!address) return "";
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Formats wei into short BOT string
 */
export function formatEtherShort(wei: bigint): string {
  const str = formatEther(wei);
  if (!str.includes(".")) return str;
  const [whole, frac] = str.split(".");
  const trimmed = frac.slice(0, 4).replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}
