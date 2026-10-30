import { activeBotChain } from "@/lib/botchain/chain";
import { formatEther } from "viem";

/**
 * Human-readable error translation for Gate.
 * Maps contract custom errors and viem/wagmi exceptions into matter-of-fact doorman feedback.
 */
export const REVERT_MESSAGES: Record<string, string> = {
  ZeroPrice: "Price per period must be greater than zero.",
  BadPeriod: "Period must be between 1 day and 365 days.",
  NameTooLong: "Gate name must be between 1 and 40 characters.",
  NoSuchGate: "This gate does not exist.",
  Closed: "This gate is closed to new purchases.",
  BadPeriods: "You can purchase between 1 and 36 periods.",
  NotOwner: "Only the creator of this gate can close it.",
  NothingToWithdraw: "There are no pending earnings to withdraw.",
  TransferFailed: "BOT transfer failed.",
  ReentrancyGuard: "Reentrancy detected.",
};

export function describeError(err: unknown): string {
  // A wallet on the other BOT Chain network: writes are pinned to this build's chain (lib/useChainWrite.ts), so wagmi
  // refuses before the wallet opens. Say what to do, not the library's name for it.
  if (/ConnectorChainMismatch|chain mismatch|does not match the target chain/i.test(err instanceof Error ? `${err.name} ${err.message}` : String(err))) {
    return `Your wallet is on a different network. Switch it to ${activeBotChain.name}, then try again.`;
  }
  if (!err) return "An unexpected error occurred.";

  const message = err instanceof Error ? err.message : String(err);

  // Check for WrongPayment(expected) with parameter
  const wrongPaymentMatch = message.match(/WrongPayment\(\s*(?:expected\s*:\s*)?([0-9]+n?)\s*\)/i);
  if (wrongPaymentMatch && wrongPaymentMatch[1]) {
    try {
      const cleanWei = wrongPaymentMatch[1].replace("n", "");
      const formatted = formatEther(BigInt(cleanWei));
      return `Send exactly ${formatted} BOT.`;
    } catch {
      return "Send the exact payment required for the selected periods.";
    }
  }

  if (message.includes("WrongPayment")) {
    return "Send the exact payment required for the selected periods.";
  }

  // Check longer keys first (e.g. BadPeriods before BadPeriod)
  const sortedEntries = Object.entries(REVERT_MESSAGES).sort((a, b) => b[0].length - a[0].length);
  for (const [errorName, translation] of sortedEntries) {
    if (new RegExp(`\\b${errorName}\\b`).test(message) || message.includes(errorName)) {
      return translation;
    }
  }

  if (/user rejected|rejected transaction|denied transaction/i.test(message)) {
    return "Transaction was dismissed in your wallet.";
  }

  if (/insufficient funds/i.test(message)) {
    return "Insufficient BOT balance for transaction and gas.";
  }

  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}

export const describeContractError = describeError;
