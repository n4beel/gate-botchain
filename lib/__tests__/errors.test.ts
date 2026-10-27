import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { describeError } from "../errors";

describe("lib/errors.ts", () => {
  it("translates known contract error names", () => {
    expect(describeError(new Error("execution reverted: custom error ZeroPrice()"))).toBe(
      "Price per period must be greater than zero.",
    );
    expect(describeError(new Error("execution reverted: custom error BadPeriod()"))).toBe(
      "Period must be between 1 day and 365 days.",
    );
    expect(describeError(new Error("execution reverted: custom error NameTooLong()"))).toBe(
      "Gate name must be between 1 and 40 characters.",
    );
    expect(describeError(new Error("execution reverted: custom error NoSuchGate()"))).toBe(
      "This gate does not exist.",
    );
    expect(describeError(new Error("execution reverted: custom error Closed()"))).toBe(
      "This gate is closed to new purchases.",
    );
    expect(describeError(new Error("execution reverted: custom error BadPeriods()"))).toBe(
      "You can purchase between 1 and 36 periods.",
    );
    expect(describeError(new Error("execution reverted: custom error NotOwner()"))).toBe(
      "Only the creator of this gate can close it.",
    );
    expect(describeError(new Error("execution reverted: custom error NothingToWithdraw()"))).toBe(
      "There are no pending earnings to withdraw.",
    );
    expect(describeError(new Error("execution reverted: custom error TransferFailed()"))).toBe(
      "BOT transfer failed.",
    );
    expect(describeError(new Error("execution reverted: custom error ReentrancyGuard()"))).toBe(
      "Reentrancy detected.",
    );
  });

  it("extracts expected payment from WrongPayment error", () => {
    const wei = parseEther("1.5");
    const err = new Error(`execution reverted: custom error WrongPayment(expected: ${wei}n)`);
    expect(describeError(err)).toBe("Send exactly 1.5 BOT.");

    const err2 = new Error(`reverted with WrongPayment(${parseEther("2")})`);
    expect(describeError(err2)).toBe("Send exactly 2 BOT.");

    const generic = new Error("WrongPayment occurred");
    expect(describeError(generic)).toBe("Send the exact payment required for the selected periods.");
  });

  it("translates user rejection", () => {
    expect(describeError(new Error("User rejected the request."))).toBe(
      "Transaction was dismissed in your wallet.",
    );
  });

  it("handles falsy errors gracefully", () => {
    expect(describeError(null)).toBe("An unexpected error occurred.");
    expect(describeError(undefined)).toBe("An unexpected error occurred.");
  });
});
