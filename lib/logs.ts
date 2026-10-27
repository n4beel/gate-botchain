import type { AbiEvent, Address, Log } from "viem";

export interface LogClient {
  getBlockNumber: (params?: any) => Promise<bigint>;
  getLogs: (params: any) => Promise<any[]>;
}

export interface ChunkedLogOptions<TAbiEvent extends AbiEvent = AbiEvent> {
  client: LogClient;
  address: Address;
  event: TAbiEvent;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock?: bigint;
  chunk?: bigint;
  maxChunks?: number;
}

export interface ChunkedLogResult<TLog = Log> {
  logs: TLog[];
  complete: boolean;
  scannedFrom: bigint;
  scannedTo: bigint;
}

/**
 * Walks forward in chunk-sized ranges to fetch logs from an RPC.
 * If an RPC returns a range error, halves the chunk and retries down to 500 blocks.
 * Halts at maxChunks to prevent hanging on long chains, reporting whether the scan completed.
 */
export async function getLogsChunked<TAbiEvent extends AbiEvent>(
  options: ChunkedLogOptions<TAbiEvent>,
): Promise<ChunkedLogResult> {
  const {
    client,
    address,
    event,
    args,
    fromBlock,
    chunk: initialChunk = 20_000n,
    maxChunks = 200,
  } = options;

  const targetToBlock =
    options.toBlock !== undefined
      ? options.toBlock
      : await client.getBlockNumber({ maxAge: 0, cacheTime: 0 } as any);

  if (fromBlock > targetToBlock) {
    return {
      logs: [],
      complete: true,
      scannedFrom: fromBlock,
      scannedTo: targetToBlock,
    };
  }

  let chunk = initialChunk > 0n ? initialChunk : 20_000n;
  let cursor = fromBlock;
  let chunkCount = 0;
  const allLogs: Log[] = [];

  while (cursor <= targetToBlock && chunkCount < maxChunks) {
    const nextTo = cursor + chunk - 1n > targetToBlock ? targetToBlock : cursor + chunk - 1n;
    try {
      const logs = (await client.getLogs({
        address,
        event,
        args,
        fromBlock: cursor,
        toBlock: nextTo,
      })) as Log[];

      allLogs.push(...logs);
      cursor = nextTo + 1n;
      chunkCount++;
    } catch (err: unknown) {
      if (chunk > 500n) {
        chunk = chunk / 2n;
        if (chunk < 500n) chunk = 500n;
        // Retry the smaller chunk without advancing cursor or chunkCount
        continue;
      }
      // Cannot halve further; rethrow error
      throw err;
    }
  }

  const complete = cursor > targetToBlock;
  const scannedTo = cursor > fromBlock ? cursor - 1n : fromBlock;

  return {
    logs: allLogs,
    complete,
    scannedFrom: fromBlock,
    scannedTo,
  };
}

/**
 * Fetches logs from exactly one block. Single-block getLogs is cheap and fast on any RPC.
 */
export async function getLogsAtBlock<TAbiEvent extends AbiEvent>(
  client: Pick<LogClient, "getLogs">,
  address: Address,
  event: TAbiEvent,
  args?: Record<string, unknown>,
  block?: bigint,
): Promise<Log[]> {
  const targetBlock = block ?? 0n;
  return (await client.getLogs({
    address,
    event,
    args,
    fromBlock: targetBlock,
    toBlock: targetBlock,
  })) as Log[];
}
