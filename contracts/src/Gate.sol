// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IGateErrors {
    error Closed();
}

/**
 * @title Gate
 * @notice Expiring-membership primitive on BOT Chain.
 * Anyone creates a gate with a fixed price per period and period length. Buyers pay for 1–36 periods;
 * each purchase extends their expiry from now (or from their current expiry if still active).
 * Membership can be queried on-chain in a single call via `isMember(gateId, address)`.
 */
contract Gate {
    // --- Constants ---
    uint32 public constant MIN_PERIOD = 1 days;
    uint32 public constant MAX_PERIOD = 365 days;
    uint8 public constant MAX_PERIODS = 36;
    uint256 public constant MAX_NAME = 40;

    // --- Structs ---
    struct GateInfo {
        address owner;
        uint128 price;
        uint32 periodSecs;
        bool closed;
        uint32 members;
        string name;
    }

    // --- Storage ---
    mapping(uint256 => GateInfo) private _gates;
    mapping(uint256 => mapping(address => uint64)) private _expiry; // unix timestamp; 0 = never a member
    mapping(address => uint256) public pending;
    uint256 public gateCount;

    // Reentrancy guard state
    uint256 private _status = 1;

    // --- Errors ---
    error ZeroPrice();
    error BadPeriod();
    error NameTooLong();
    error NoSuchGate();
    error BadPeriods();
    error WrongPayment(uint256 expected);
    error NotOwner();
    error NothingToWithdraw();
    error TransferFailed();
    error ReentrancyGuard();

    // --- Events ---
    event Created(uint256 indexed id, address indexed owner, uint128 price, uint32 periodSecs, string name);
    event Purchased(uint256 indexed id, address indexed buyer, uint8 periods, uint64 expiry);
    event Closed(uint256 indexed id);
    event Withdrawn(address indexed to, uint256 amount);

    // --- Modifiers ---
    modifier nonReentrant() {
        if (_status != 1) revert ReentrancyGuard();
        _status = 2;
        _;
        _status = 1;
    }

    // --- External Functions ---

    /**
     * @notice Create a new gate with name, price per period, and period duration in seconds.
     * @param name Name of the gate (1 to 40 bytes)
     * @param price Cost per period in wei (must be > 0)
     * @param periodSecs Duration of one period (1 day to 365 days)
     * @return id The newly created gate ID (starts at 1)
     */
    function create(string calldata name, uint128 price, uint32 periodSecs) external returns (uint256 id) {
        if (price == 0) revert ZeroPrice();
        if (periodSecs < MIN_PERIOD || periodSecs > MAX_PERIOD) revert BadPeriod();
        if (bytes(name).length == 0 || bytes(name).length > MAX_NAME) revert NameTooLong();

        id = ++gateCount;
        _gates[id] = GateInfo({
            owner: msg.sender,
            price: price,
            periodSecs: periodSecs,
            closed: false,
            members: 0,
            name: name
        });

        emit Created(id, msg.sender, price, periodSecs, name);
    }

    /**
     * @notice Purchase or renew membership for 1 to 36 periods.
     * @param id The gate ID to purchase access for
     * @param periods Number of periods (1 to 36)
     */
    function purchase(uint256 id, uint8 periods) external payable {
        if (id == 0 || id > gateCount) revert NoSuchGate();
        GateInfo storage gate = _gates[id];
        if (gate.closed) revert IGateErrors.Closed();
        if (periods < 1 || periods > MAX_PERIODS) revert BadPeriods();

        uint256 expected = uint256(gate.price) * uint256(periods);
        if (msg.value != expected) revert WrongPayment(expected);

        uint64 current = _expiry[id][msg.sender];
        if (current == 0) {
            gate.members++;
        }

        uint64 base = current > uint64(block.timestamp) ? current : uint64(block.timestamp);
        uint64 newExpiry = base + uint64(periods) * uint64(gate.periodSecs);
        _expiry[id][msg.sender] = newExpiry;

        pending[gate.owner] += msg.value;

        emit Purchased(id, msg.sender, periods, newExpiry);
    }

    /**
     * @notice Close a gate to prevent future purchases. Existing passes remain valid.
     * @param id The gate ID to close
     */
    function close(uint256 id) external {
        if (id == 0 || id > gateCount) revert NoSuchGate();
        GateInfo storage gate = _gates[id];
        if (msg.sender != gate.owner) revert NotOwner();
        if (gate.closed) revert IGateErrors.Closed();

        gate.closed = true;
        emit Closed(id);
    }

    /**
     * @notice Withdraw accumulated earnings from gate purchases via pull payment.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // --- View Functions ---

    /**
     * @notice Check whether an address currently holds an active membership.
     * @param id The gate ID
     * @param who The address to check
     * @return True if expiry > current block timestamp
     */
    function isMember(uint256 id, address who) external view returns (bool) {
        if (id == 0 || id > gateCount) revert NoSuchGate();
        return _expiry[id][who] > uint64(block.timestamp);
    }

    /**
     * @notice Query the membership expiry timestamp for an address.
     * @param id The gate ID
     * @param who The address to inspect
     * @return Unix timestamp of expiry, or 0 if never a member
     */
    function expiryOf(uint256 id, address who) external view returns (uint64) {
        if (id == 0 || id > gateCount) revert NoSuchGate();
        return _expiry[id][who];
    }

    /**
     * @notice Get metadata and statistics for a gate.
     * @param id The gate ID
     */
    function gateOf(uint256 id) external view returns (GateInfo memory) {
        if (id == 0 || id > gateCount) revert NoSuchGate();
        return _gates[id];
    }

    /**
     * @notice Calculate the required payment for a given number of periods.
     * @param id The gate ID
     * @param periods The number of periods to quote (1 to 36)
     */
    function quote(uint256 id, uint8 periods) external view returns (uint256) {
        if (id == 0 || id > gateCount) revert NoSuchGate();
        if (periods < 1 || periods > MAX_PERIODS) revert BadPeriods();
        return uint256(_gates[id].price) * uint256(periods);
    }

    /**
     * @notice Fetch recent gates with reverse chronological pagination.
     * @param offset Number of most recent gates to skip
     * @param count Maximum number of gates to return (capped at 50)
     */
    function latest(
        uint256 offset,
        uint256 count
    ) external view returns (GateInfo[] memory gates, uint256[] memory ids) {
        if (count > 50) {
            count = 50;
        }
        if (offset >= gateCount) {
            return (new GateInfo[](0), new uint256[](0));
        }

        uint256 available = gateCount - offset;
        uint256 n = count < available ? count : available;

        gates = new GateInfo[](n);
        ids = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            uint256 id = gateCount - offset - i;
            ids[i] = id;
            gates[i] = _gates[id];
        }
    }
}
