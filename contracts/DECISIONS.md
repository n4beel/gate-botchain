# Gate Contract Design Decisions

## 1. Architectural Architecture

### 1.1 Pull Payments for Gate Creators
- Gate earnings are not pushed directly to gate creators during `purchase()` calls. Instead, payments accumulate in `pending[owner]`. Creators call `withdraw()` to pull their funds.
- **Rationale:** Push payments during `purchase()` open the contract to griefing and denial-of-service if a gate owner is a contract whose `receive()` reverts or consumes excessive gas. Pull payments isolate creators from buyers and keep `purchase()` calls gas-bounded and non-reentrant.

### 1.2 Monotonic Expiry Extension Arithmetic
- For an active member (`currentExpiry > block.timestamp`), renewal extends strictly from `currentExpiry`:
  `newExpiry = currentExpiry + (periods * periodSecs)`.
- For a new or lapsed member (`currentExpiry <= block.timestamp`), membership begins from `block.timestamp`:
  `newExpiry = block.timestamp + (periods * periodSecs)`.
- Using `base = max(now, current)` ensures that early renewal never penalizes the buyer by discarding remaining days, while renewal after a lapse begins fresh from the moment of purchase without charging for the gap period.

### 1.3 Distinct Member Counting
- `members` in `GateInfo` tracks the total count of distinct addresses that have ever held membership for that gate.
- It is incremented if and only if `_expiry[id][buyer] == 0` (first purchase).
- Renewing members and lapsed members rejoining do not increment `members`, satisfying the invariant `members <= distinct buyers`.

### 1.4 Avoiding Event/Error Identifier Collision via `IGateErrors`
- Solidity 0.8.23 disallows declaring both an `error Closed()` and an `event Closed(uint256 indexed id)` within the same contract block because they share the same identifier name in scope.
- Declaring `error Closed()` inside an external interface `IGateErrors` allows `Gate` to emit `Closed(id)` as an event while reverting with `IGateErrors.Closed()`. This maintains exact ABI error selector compatibility (`0x2e805562`) with the specification.

### 1.5 Strict Bounded Storage & Pagination
- Gate names are bounded to `MAX_NAME = 40` bytes.
- Periods per purchase are bounded to `[1, 36]`.
- Period durations are bounded to `[1 days, 365 days]`.
- Reverse-chronological pagination in `latest(offset, count)` is capped at `50` items per query to prevent unbounded gas consumption.

---

## 2. Invariant Specifications

1. **Solvency Invariant:** `address(gate).balance == sum(pending)`. All native BOT held in the contract corresponds exactly to unwithdrawn creator earnings.
2. **Expiry Monotonicity:** For any gate `id` and buyer `who`, each successful `purchase()` call strictly increases `expiryOf(id, who)` (`newExpiry > oldExpiry`).
3. **Members Upper Bound:** `gateOf(id).members` never exceeds the count of unique buyer addresses.
4. **Exact Payment:** Overpayment and underpayment are strictly rejected via custom error `WrongPayment(expected)`.

---

## 3. Mutation Testing Analysis

Ran `scripts/mutation-check.py gate` against `Gate.sol` (25 mutants tested):
- **Mutants Killed:** 22
- **Surviving Mutants:** 3

All 3 surviving mutants are mathematically and semantically equivalent transformations:
1. `Gate.sol:113` — `current > block.timestamp ? current : block.timestamp` mutated to `>=`:
   - When `current == block.timestamp`, both expressions evaluate to `block.timestamp`.
   - Thus, `>` and `>=` are identical under all possible values.
2. `Gate.sol:203` — `if (count > 50) count = 50` mutated to `>= 50`:
   - When `count == 50`, `count = 50` assigns 50 to 50, leaving the variable unchanged.
3. `Gate.sol:206` — `if (offset >= gateCount)` mutated to `offset > gateCount`:
   - When `offset == gateCount`, `available = gateCount - offset = 0`, causing `n = 0` and returning empty arrays in both cases.
