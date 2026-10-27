// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Gate, IGateErrors} from "../src/Gate.sol";

contract MaliciousWithdrawReceiver {
    Gate public immutable gate;
    bool public hasReentered;
    bytes4 public reentrancyError;

    constructor(Gate _gate) {
        gate = _gate;
    }

    receive() external payable {
        if (!hasReentered) {
            hasReentered = true;
            try gate.withdraw() {
                // Should not reach
            } catch (bytes memory err) {
                if (err.length >= 4) {
                    reentrancyError = bytes4(err);
                }
            }
        }
    }
}

contract GateTest is Test {
    Gate public gate;

    address public alice = address(0x1111); // Creator
    address public bob = address(0x2222);   // Buyer 1
    address public charlie = address(0x3333); // Buyer 2
    address public dave = address(0x4444);  // Lapsed buyer

    uint128 public constant PRICE = 1 ether;
    uint32 public constant PERIOD_SECS = 30 days; // 30 days

    event Created(uint256 indexed id, address indexed owner, uint128 price, uint32 periodSecs, string name);
    event Purchased(uint256 indexed id, address indexed buyer, uint8 periods, uint64 expiry);
    event Closed(uint256 indexed id);
    event Withdrawn(address indexed to, uint256 amount);

    function setUp() public {
        vm.warp(1_700_000_000);
        gate = new Gate();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(dave, 100 ether);
    }

    // --- Creation Validation ---

    function test_CreateValidGate() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Created(1, alice, PRICE, PERIOD_SECS, "Alpha Community");
        uint256 id = gate.create("Alpha Community", PRICE, PERIOD_SECS);

        assertEq(id, 1);
        assertEq(gate.gateCount(), 1);

        Gate.GateInfo memory info = gate.gateOf(1);
        assertEq(info.owner, alice);
        assertEq(info.price, PRICE);
        assertEq(info.periodSecs, PERIOD_SECS);
        assertEq(info.closed, false);
        assertEq(info.members, 0);
        assertEq(info.name, "Alpha Community");
    }

    function test_CreateReverts_ZeroPrice() public {
        vm.prank(alice);
        vm.expectRevert(Gate.ZeroPrice.selector);
        gate.create("Zero Price", 0, PERIOD_SECS);
    }

    function test_CreateReverts_PeriodTooShort() public {
        vm.prank(alice);
        vm.expectRevert(Gate.BadPeriod.selector);
        gate.create("Short", PRICE, 1 days - 1);
    }

    function test_CreateReverts_PeriodTooLong() public {
        vm.prank(alice);
        vm.expectRevert(Gate.BadPeriod.selector);
        gate.create("Long", PRICE, 365 days + 1);
    }

    function test_CreateReverts_EmptyName() public {
        vm.prank(alice);
        vm.expectRevert(Gate.NameTooLong.selector);
        gate.create("", PRICE, PERIOD_SECS);
    }

    function test_CreateReverts_NameTooLong() public {
        string memory longName = "12345678901234567890123456789012345678901"; // 41 chars
        vm.prank(alice);
        vm.expectRevert(Gate.NameTooLong.selector);
        gate.create(longName, PRICE, PERIOD_SECS);
    }

    function test_CreateExactBoundaryName40BytesSucceeds() public {
        string memory exact40 = "1234567890123456789012345678901234567890"; // exactly 40 chars
        vm.prank(alice);
        uint256 id = gate.create(exact40, PRICE, PERIOD_SECS);
        assertEq(gate.gateOf(id).name, exact40);
    }

    function test_CreateBoundaryDurations() public {
        vm.startPrank(alice);
        uint256 minId = gate.create("Min Day", PRICE, 1 days);
        uint256 maxId = gate.create("Max Year", PRICE, 365 days);
        vm.stopPrank();

        assertEq(gate.gateOf(minId).periodSecs, 1 days);
        assertEq(gate.gateOf(maxId).periodSecs, 365 days);
    }

    // --- Purchase: First Purchase, Renewal, Lapse ---

    function test_FirstPurchaseSetsExpiry() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        uint64 beforePurchase = uint64(block.timestamp);
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        uint64 expectedExpiry = beforePurchase + PERIOD_SECS;
        emit Purchased(id, bob, 1, expectedExpiry);
        gate.purchase{value: PRICE}(id, 1);

        assertEq(gate.expiryOf(id, bob), expectedExpiry);
        assertTrue(gate.isMember(id, bob));
        assertEq(gate.pending(alice), PRICE);
        assertEq(gate.gateOf(id).members, 1);
    }

    function test_RenewalExtendsFromCurrentExpiry() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        // Bob buys 1 period
        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);
        uint64 firstExpiry = gate.expiryOf(id, bob);

        // Advance 10 days (still active)
        vm.warp(block.timestamp + 10 days);
        assertTrue(gate.isMember(id, bob));

        // Bob renews for 2 periods
        vm.prank(bob);
        gate.purchase{value: 2 * PRICE}(id, 2);

        uint64 secondExpiry = gate.expiryOf(id, bob);
        assertEq(secondExpiry, firstExpiry + 2 * PERIOD_SECS);
        // Members count unchanged
        assertEq(gate.gateOf(id).members, 1);
        assertEq(gate.pending(alice), 3 * PRICE);
    }

    function test_LapsedMemberRestartsFromNow() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        // Bob buys 1 period
        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);
        uint64 firstExpiry = gate.expiryOf(id, bob);

        // Advance 5 days past expiry
        vm.warp(firstExpiry + 5 days);
        assertFalse(gate.isMember(id, bob));

        uint64 nowSec = uint64(block.timestamp);
        // Bob purchases again for 1 period
        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);

        uint64 renewedExpiry = gate.expiryOf(id, bob);
        assertEq(renewedExpiry, nowSec + PERIOD_SECS);
        assertTrue(gate.isMember(id, bob));

        // Members count stays 1 (Bob already counted once)
        assertEq(gate.gateOf(id).members, 1);
    }

    function test_WrongPaymentReverts() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        vm.startPrank(bob);
        // Pay under
        vm.expectRevert(abi.encodeWithSelector(Gate.WrongPayment.selector, PRICE));
        gate.purchase{value: PRICE - 1}(id, 1);

        // Pay over
        vm.expectRevert(abi.encodeWithSelector(Gate.WrongPayment.selector, PRICE));
        gate.purchase{value: PRICE + 1}(id, 1);

        // 2 periods under
        vm.expectRevert(abi.encodeWithSelector(Gate.WrongPayment.selector, 2 * PRICE));
        gate.purchase{value: PRICE}(id, 2);
        vm.stopPrank();
    }

    function test_PeriodsBoundsRevert() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        vm.startPrank(bob);
        // 0 periods
        vm.expectRevert(Gate.BadPeriods.selector);
        gate.purchase{value: 0}(id, 0);

        // 37 periods
        vm.expectRevert(Gate.BadPeriods.selector);
        gate.purchase{value: 37 * PRICE}(id, 37);
        vm.stopPrank();
    }

    function test_PurchaseNoSuchGateReverts() public {
        vm.prank(bob);
        vm.expectRevert(Gate.NoSuchGate.selector);
        gate.purchase{value: PRICE}(999, 1);

        vm.prank(bob);
        vm.expectRevert(Gate.NoSuchGate.selector);
        gate.purchase{value: PRICE}(0, 1);
    }

    // --- Close and Validity ---

    function test_ClosedGateRejectsPurchase_ExistingPassStillValid() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        // Bob buys
        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);
        uint64 bobExpiry = gate.expiryOf(id, bob);

        // Alice closes the gate
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit Closed(id);
        gate.close(id);

        assertTrue(gate.gateOf(id).closed);

        // Existing pass is still valid!
        assertTrue(gate.isMember(id, bob));
        assertEq(gate.expiryOf(id, bob), bobExpiry);

        // Charlie cannot purchase
        vm.prank(charlie);
        vm.expectRevert(IGateErrors.Closed.selector);
        gate.purchase{value: PRICE}(id, 1);

        // Bob cannot renew
        vm.prank(bob);
        vm.expectRevert(IGateErrors.Closed.selector);
        gate.purchase{value: PRICE}(id, 1);
    }

    function test_CloseReverts_NonOwner() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        vm.prank(bob);
        vm.expectRevert(Gate.NotOwner.selector);
        gate.close(id);
    }

    function test_CloseReverts_AlreadyClosed() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        vm.startPrank(alice);
        gate.close(id);
        vm.expectRevert(IGateErrors.Closed.selector);
        gate.close(id);
        vm.stopPrank();
    }

    function test_CloseNoSuchGateReverts() public {
        vm.prank(alice);
        vm.expectRevert(Gate.NoSuchGate.selector);
        gate.close(42);
    }

    // --- Withdrawal and Solvency ---

    function test_OwnerWithdrawsOnly() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);

        assertEq(gate.pending(alice), PRICE);
        assertEq(address(gate).balance, PRICE);

        // Bob has nothing to withdraw
        vm.prank(bob);
        vm.expectRevert(Gate.NothingToWithdraw.selector);
        gate.withdraw();

        // Alice withdraws
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(alice, PRICE);
        gate.withdraw();

        assertEq(alice.balance, balBefore + PRICE);
        assertEq(gate.pending(alice), 0);
        assertEq(address(gate).balance, 0);

        // Alice cannot withdraw again
        vm.prank(alice);
        vm.expectRevert(Gate.NothingToWithdraw.selector);
        gate.withdraw();
    }

    function test_ReentrantWithdrawBlocked() public {
        MaliciousWithdrawReceiver attacker = new MaliciousWithdrawReceiver(gate);

        // Attacker creates a gate and Bob purchases to fund pending[attacker]
        vm.prank(address(attacker));
        uint256 id = gate.create("Trap", PRICE, PERIOD_SECS);

        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);

        assertEq(gate.pending(address(attacker)), PRICE);

        // Attacker calls withdraw, which triggers receive(), which tries reentering withdraw()
        vm.prank(address(attacker));
        gate.withdraw();

        assertTrue(attacker.hasReentered());
        assertEq(attacker.reentrancyError(), Gate.ReentrancyGuard.selector);
        assertEq(gate.pending(address(attacker)), 0);
        assertEq(address(attacker).balance, PRICE);
    }

    // --- Membership Boundary Flips ---

    function test_IsMemberFlipsAtExpiry() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        uint64 start = uint64(block.timestamp);
        vm.prank(bob);
        gate.purchase{value: PRICE}(id, 1);
        uint64 exp = start + PERIOD_SECS;

        // 1 sec before expiry: active member
        vm.warp(exp - 1);
        assertTrue(gate.isMember(id, bob));

        // Exactly at expiry: expired (spec: expiry > now)
        vm.warp(exp);
        assertFalse(gate.isMember(id, bob));

        // 1 sec after expiry: expired
        vm.warp(exp + 1);
        assertFalse(gate.isMember(id, bob));
    }

    function test_MembersCountsDistinct() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        // Bob buys twice
        vm.startPrank(bob);
        gate.purchase{value: PRICE}(id, 1);
        gate.purchase{value: PRICE}(id, 1);
        vm.stopPrank();

        assertEq(gate.gateOf(id).members, 1);

        // Charlie buys
        vm.prank(charlie);
        gate.purchase{value: PRICE}(id, 1);
        assertEq(gate.gateOf(id).members, 2);

        // Dave buys, lapses, buys again
        vm.prank(dave);
        gate.purchase{value: PRICE}(id, 1);
        assertEq(gate.gateOf(id).members, 3);

        vm.warp(block.timestamp + 100 days);
        vm.prank(dave);
        gate.purchase{value: PRICE}(id, 1);
        assertEq(gate.gateOf(id).members, 3);
    }

    // --- Quotes and Views ---

    function test_Quote() public {
        vm.prank(alice);
        uint256 id = gate.create("Alpha", PRICE, PERIOD_SECS);

        assertEq(gate.quote(id, 1), PRICE);
        assertEq(gate.quote(id, 12), 12 * PRICE);
        assertEq(gate.quote(id, 36), 36 * PRICE);

        vm.expectRevert(Gate.BadPeriods.selector);
        gate.quote(id, 0);

        vm.expectRevert(Gate.BadPeriods.selector);
        gate.quote(id, 37);

        vm.expectRevert(Gate.NoSuchGate.selector);
        gate.quote(999, 1);
    }

    function test_LatestPagination() public {
        vm.startPrank(alice);
        for (uint256 i = 1; i <= 5; i++) {
            gate.create("Gate", PRICE, PERIOD_SECS);
        }
        vm.stopPrank();

        (Gate.GateInfo[] memory gates, uint256[] memory ids) = gate.latest(0, 3);
        assertEq(gates.length, 3);
        assertEq(ids.length, 3);
        assertEq(ids[0], 5);
        assertEq(ids[1], 4);
        assertEq(ids[2], 3);

        (gates, ids) = gate.latest(3, 10);
        assertEq(gates.length, 2);
        assertEq(ids[0], 2);
        assertEq(ids[1], 1);

        (gates, ids) = gate.latest(5, 10);
        assertEq(gates.length, 0);

        (gates, ids) = gate.latest(10, 10);
        assertEq(gates.length, 0);
    }

    function test_NoDirectEthTransfer() public {
        (bool ok, ) = address(gate).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // --- Fuzz Tests (>= 256 runs) ---

    function testFuzz_ExpiryMonotonic(uint8 p1, uint8 p2, uint32 warp1) public {
        vm.assume(p1 >= 1 && p1 <= 36);
        vm.assume(p2 >= 1 && p2 <= 36);
        vm.assume(warp1 <= 1000 days);

        vm.prank(alice);
        uint256 id = gate.create("FuzzGate", PRICE, PERIOD_SECS);

        vm.deal(bob, 1000 ether);
        vm.prank(bob);
        gate.purchase{value: uint256(PRICE) * p1}(id, p1);
        uint64 exp1 = gate.expiryOf(id, bob);

        vm.warp(block.timestamp + warp1);

        vm.prank(bob);
        gate.purchase{value: uint256(PRICE) * p2}(id, p2);
        uint64 exp2 = gate.expiryOf(id, bob);

        assertTrue(exp2 >= exp1, "Expiry must never decrease");
    }

    function testFuzz_PendingEqualsPaid(uint8 periods) public {
        vm.assume(periods >= 1 && periods <= 36);

        vm.prank(alice);
        uint256 id = gate.create("PaidGate", PRICE, PERIOD_SECS);

        uint256 cost = uint256(PRICE) * periods;
        vm.deal(bob, cost);

        vm.prank(bob);
        gate.purchase{value: cost}(id, periods);

        assertEq(gate.pending(alice), cost);
        assertEq(address(gate).balance, cost);
    }
}
