// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Gate} from "../src/Gate.sol";

contract GateHandler is Test {
    Gate public immutable gate;

    address[] public creators;
    address[] public buyers;

    uint256 public totalPending;
    mapping(uint256 => mapping(address => uint64)) public lastExpiry;
    mapping(uint256 => mapping(address => bool)) public hasEverBought;
    mapping(uint256 => uint32) public distinctBuyers;

    constructor(Gate _gate) {
        gate = _gate;

        for (uint160 i = 1; i <= 3; i++) {
            address c = address(uint160(0x1000 + i));
            creators.push(c);
            vm.deal(c, 1000 ether);
        }

        for (uint160 i = 1; i <= 4; i++) {
            address b = address(uint160(0x2000 + i));
            buyers.push(b);
            vm.deal(b, 1000 ether);
        }
    }

    function createGate(uint8 creatorSeed, uint128 priceRaw, uint32 periodRaw) external {
        address creator = creators[creatorSeed % creators.length];
        uint128 price = uint128(bound(priceRaw, 0.001 ether, 5 ether));
        uint32 period = uint32(bound(periodRaw, 1 days, 365 days));

        vm.prank(creator);
        gate.create("Handler Gate", price, period);
    }

    function purchasePass(uint8 buyerSeed, uint256 gateIdRaw, uint8 periodsRaw) external {
        uint256 count = gate.gateCount();
        if (count == 0) return;

        uint256 id = bound(gateIdRaw, 1, count);
        Gate.GateInfo memory info = gate.gateOf(id);
        if (info.closed) return;

        uint8 periods = uint8(bound(periodsRaw, 1, 36));
        uint256 cost = uint256(info.price) * uint256(periods);

        address buyer = buyers[buyerSeed % buyers.length];
        if (buyer.balance < cost) {
            vm.deal(buyer, cost + 10 ether);
        }

        uint64 oldExp = gate.expiryOf(id, buyer);

        vm.prank(buyer);
        gate.purchase{value: cost}(id, periods);

        uint64 newExp = gate.expiryOf(id, buyer);
        require(newExp >= oldExp, "Expiry decreased!");

        lastExpiry[id][buyer] = newExp;
        if (!hasEverBought[id][buyer]) {
            hasEverBought[id][buyer] = true;
            distinctBuyers[id]++;
        }

        totalPending += cost;
    }

    function withdrawEarnings(uint8 creatorSeed) external {
        address creator = creators[creatorSeed % creators.length];
        uint256 p = gate.pending(creator);
        if (p == 0) return;

        totalPending -= p;
        vm.prank(creator);
        gate.withdraw();
    }

    function warp(uint32 secondsWarp) external {
        uint32 s = uint32(bound(secondsWarp, 1, 30 days));
        vm.warp(block.timestamp + s);
    }
}

contract GateInvariantTest is Test {
    Gate public gate;
    GateHandler public handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        gate = new Gate();
        handler = new GateHandler(gate);

        targetContract(address(handler));
    }

    function invariant_SolvencyBalanceMatchesPending() public view {
        assertEq(address(gate).balance, handler.totalPending(), "Contract balance must equal total unwithdrawn pending");
    }

    function invariant_MembersBoundedByDistinctBuyers() public view {
        uint256 count = gate.gateCount();
        for (uint256 id = 1; id <= count; id++) {
            Gate.GateInfo memory info = gate.gateOf(id);
            assertLe(info.members, handler.distinctBuyers(id), "Members count must not exceed distinct buyers");
        }
    }
}
