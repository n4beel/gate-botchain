import { describe, expect, it, vi } from "vitest";
import { getLogsChunked, getLogsAtBlock, type LogClient } from "../logs";

describe("lib/logs.ts", () => {
  it("returns empty result if fromBlock > toBlock", async () => {
    const client: LogClient = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getLogs: vi.fn(),
    };

    const res = await getLogsChunked({
      client,
      address: "0x1111111111111111111111111111111111111111",
      event: {} as any,
      fromBlock: 150n,
      toBlock: 100n,
    });

    expect(res.logs).toEqual([]);
    expect(res.complete).toBe(true);
    expect(client.getLogs).not.toHaveBeenCalled();
  });

  it("chunks requests across block ranges", async () => {
    const getLogsMock = vi.fn().mockResolvedValue([{ blockNumber: 10n }]);
    const client: LogClient = {
      getBlockNumber: vi.fn().mockResolvedValue(25n),
      getLogs: getLogsMock,
    };

    const res = await getLogsChunked({
      client,
      address: "0x1111111111111111111111111111111111111111",
      event: {} as any,
      fromBlock: 0n,
      toBlock: 25n,
      chunk: 10n,
    });

    expect(res.logs.length).toBe(3);
    expect(res.complete).toBe(true);
    expect(getLogsMock).toHaveBeenCalledTimes(3);
  });

  it("halves chunk on range errors and retries", async () => {
    let callCount = 0;
    const client: LogClient = {
      getBlockNumber: vi.fn().mockResolvedValue(2000n),
      getLogs: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Log response size exceeded");
        }
        return Promise.resolve([{ blockNumber: 100n }]);
      }),
    };

    const res = await getLogsChunked({
      client,
      address: "0x1111111111111111111111111111111111111111",
      event: {} as any,
      fromBlock: 0n,
      toBlock: 1000n,
      chunk: 1000n,
    });

    expect(res.complete).toBe(true);
    expect(callCount).toBeGreaterThan(1);
  });

  it("getLogsAtBlock queries a single block", async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([{ blockNumber: 42n }]),
    };

    const logs = await getLogsAtBlock(
      client,
      "0x1111111111111111111111111111111111111111",
      {} as any,
      undefined,
      42n,
    );

    expect(logs).toEqual([{ blockNumber: 42n }]);
    expect(client.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 42n,
        toBlock: 42n,
      }),
    );
  });
});
