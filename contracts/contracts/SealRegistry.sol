// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title SealRegistry
/// @notice Public registry for SealHour: centre keys, frozen centre lists, exam rounds,
///         sealed package roots (and optionally their bytes, as events), centre commitments and burned sets.
/// @dev No external calls, no token, no proxy. Rounds follow the drand beacon:
///      round 1 starts at genesisTime, one round per period seconds.
contract SealRegistry {
    // ------------------------------------------------------------------ errors

    error NotOffice();
    error KeyFrozen();
    error NotFrozen();
    error BadList();
    error BadRounds();
    error TooLate();
    error TooEarly();
    error NotCommittee();
    error NotCentre();
    error AlreadyDone();
    error LastSet();
    error NoKey();

    // ------------------------------------------------------------------ events

    event CentreRegistered(bytes32 indexed centreId, bytes32 x25519PubKey, address indexed operator, string name);
    event CentreKeySet(bytes32 indexed centreId, bytes32 x25519PubKey, address indexed operator);
    event CentresFrozen(bytes32 indexed examId, bytes32 listRoot, uint32 count);
    event ExamCreated(
        bytes32 indexed examId,
        uint64 openRound,
        uint64 revealRound,
        uint64 reserveOpenRound,
        uint64 reserveRevealRound,
        uint8 setCount,
        address reserveCommittee
    );
    event PackageSubmitted(bytes32 indexed examId, uint8 indexed setIndex, bytes32 packageRoot, string uri, address committee);
    /// @notice Part `part` (0, 1, ...) of the package bytes of a set, see postPackageData.
    event PackageData(bytes32 indexed examId, uint8 indexed setIndex, uint256 part, bytes data);
    event CentreJoined(bytes32 indexed examId, bytes32 indexed centreId, bytes32 rcCommit, bytes tlockedRc);
    event SetBurned(bytes32 indexed examId, uint8 indexed setIndex, address committee);
    event CentreFlagged(bytes32 indexed examId, bytes32 indexed centreId, bytes32 evidenceHash, address reporter);

    // ------------------------------------------------------------------ types

    struct ExamView {
        bytes32 listRoot;
        uint32 centreCount;
        uint64 openRound;
        uint64 revealRound;
        uint64 reserveOpenRound;
        uint64 reserveRevealRound;
        uint8 setCount;
        address reserveCommittee;
        bool created;
        bool frozen;
    }

    struct CentreView {
        bytes32 centreId;
        bytes32 pubKey;
        address operator;
        bool frozen;
        string name;
    }

    struct PackageView {
        bytes32 root;
        string uri;
        address committee;
        bool burned;
        uint64[] dataBlocks;
    }

    struct ParticipationView {
        bytes32 rcCommit;
        bytes tlockedRc;
        bool joined;
    }

    struct Centre {
        bytes32 pubKey;
        address operator;
        bool registered;
        bool frozen;
        string name;
    }

    struct Exam {
        bytes32 listRoot;
        uint32 centreCount;
        uint64 openRound;
        uint64 revealRound;
        uint64 reserveOpenRound;
        uint64 reserveRevealRound;
        address reserveCommittee;
        uint8 burnedCount;
        bool created;
        bool frozen;
        address[] committees;
        bytes32[] centres;
    }

    struct Package {
        bytes32 root;
        string uri;
        bool submitted;
    }

    struct Participation {
        bytes32 rcCommit;
        bytes tlockedRc;
        bool joined;
    }

    // ------------------------------------------------------------------ storage

    uint8 private constant MIN_SETS = 2;
    uint8 private constant MAX_SETS = 8;
    /// @dev A burn must land at least this many rounds before openRound (no race with the opening).
    uint64 private constant BURN_MARGIN = 1;
    /// @dev postPackageData: at most MAX_DATA bytes per call (tx pools cap a tx at 128 KiB), MAX_PARTS calls per set.
    uint256 private constant MAX_DATA = 64 * 1024;
    uint256 private constant MAX_PARTS = 64;

    /// @notice Exam office: the only account allowed to register centres, freeze lists, create exams.
    address public immutable office;
    /// @notice Beacon genesis time (unix seconds).
    uint64 public immutable genesisTime;
    /// @notice Beacon period (seconds).
    uint64 public immutable period;
    /// @notice Pinned drand chain hash: clients refuse a relay whose /info hash differs.
    bytes32 public immutable beaconChainHash;
    /// @notice Pinned drand public key (set once in the constructor): clients refuse a relay serving another key.
    bytes public beaconPublicKey;

    mapping(bytes32 => Centre) private _centres;
    mapping(bytes32 => Exam) private _exams;
    mapping(bytes32 => mapping(bytes32 => bool)) private _listed;
    mapping(bytes32 => mapping(uint8 => Package)) private _packages;
    mapping(bytes32 => mapping(uint8 => bool)) private _burned;
    mapping(bytes32 => mapping(bytes32 => Participation)) private _participation;
    mapping(bytes32 => mapping(bytes32 => bool)) private _rcUsed;
    mapping(bytes32 => mapping(uint8 => uint64[])) private _dataBlocks;
    bytes32[] private _examIds;
    bytes32[] private _centreIds;
    /// @notice Centre run by an operator address, zero if none. If one address operates several centres,
    ///         the most recent registration wins.
    mapping(address => bytes32) public centreOfOperator;

    modifier onlyOffice() {
        if (msg.sender != office) revert NotOffice();
        _;
    }

    /// @param genesisTime_ Beacon genesis time (unix seconds).
    /// @param period_ Beacon period in seconds, must be non zero.
    /// @param beaconChainHash_ drand chain hash of the beacon, non zero.
    /// @param beaconPublicKey_ drand public key of the beacon, non empty.
    constructor(uint64 genesisTime_, uint64 period_, bytes32 beaconChainHash_, bytes memory beaconPublicKey_) {
        if (period_ == 0) revert BadRounds();
        if (beaconChainHash_ == bytes32(0) || beaconPublicKey_.length == 0) revert BadList();
        office = msg.sender;
        genesisTime = genesisTime_;
        period = period_;
        beaconChainHash = beaconChainHash_;
        beaconPublicKey = beaconPublicKey_;
    }

    /// @notice Current beacon round: 0 before genesis, then (now - genesis) / period + 1.
    function currentRound() public view returns (uint64) {
        if (block.timestamp < genesisTime) return 0;
        return uint64((block.timestamp - genesisTime) / period + 1);
    }

    // ------------------------------------------------------------------ office

    /// @notice Register or update a centre. Reverts once the centre appears in a frozen list.
    /// @dev Reverts BadList on a zero key or a zero operator.
    function registerCentre(bytes32 centreId, bytes32 x25519PubKey, address operator, string calldata name)
        external
        onlyOffice
    {
        if (x25519PubKey == bytes32(0)) revert BadList();
        _register(centreId, x25519PubKey, operator, name);
    }

    /// @notice Register or update a centre without its key: the operator then calls setCentreKey.
    ///         Any previous key is cleared. Reverts once the centre appears in a frozen list.
    /// @dev Reverts BadList on a zero operator. Emits CentreRegistered with a zero key.
    function registerCentreOperator(bytes32 centreId, address operator, string calldata name) external onlyOffice {
        _register(centreId, bytes32(0), operator, name);
    }

    function _register(bytes32 centreId, bytes32 x25519PubKey, address operator, string calldata name) private {
        if (operator == address(0)) revert BadList();
        Centre storage c = _centres[centreId];
        if (c.frozen) revert KeyFrozen();
        if (!c.registered) _centreIds.push(centreId);
        // ponytail: one centre per operator in the reverse map; a centres-of-operator list if one address runs several.
        if (centreOfOperator[c.operator] == centreId) delete centreOfOperator[c.operator];
        centreOfOperator[operator] = centreId;
        c.pubKey = x25519PubKey;
        c.operator = operator;
        c.name = name;
        c.registered = true;
        emit CentreRegistered(centreId, x25519PubKey, operator, name);
    }

    // ------------------------------------------------------------------ centre operators

    /// @notice The centre's operator sets or rotates its X25519 key, until an exam freezes a list containing it.
    /// @dev Reverts NotCentre for any other caller, KeyFrozen once frozen, BadList on a zero key.
    function setCentreKey(bytes32 centreId, bytes32 x25519PubKey) external {
        Centre storage c = _centres[centreId];
        if (!c.registered || msg.sender != c.operator) revert NotCentre();
        if (c.frozen) revert KeyFrozen();
        if (x25519PubKey == bytes32(0)) revert BadList();
        c.pubKey = x25519PubKey;
        emit CentreKeySet(centreId, x25519PubKey, msg.sender);
    }

    /// @notice Freeze the list of centres of an exam, once. Freezes the key of every listed centre.
    /// @dev listRoot must equal keccak256(abi.encodePacked(centreIds)) and count its length.
    ///      Reverts NoKey when a listed centre has no key yet (registered by registerCentreOperator).
    function freezeCentres(bytes32 examId, bytes32[] calldata centreIds, bytes32 listRoot, uint32 count)
        external
        onlyOffice
    {
        Exam storage e = _exams[examId];
        if (e.frozen) revert AlreadyDone();
        uint256 n = centreIds.length;
        if (n == 0 || n != count) revert BadList();
        if (keccak256(abi.encodePacked(centreIds)) != listRoot) revert BadList();

        mapping(bytes32 => bool) storage listed = _listed[examId];
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = centreIds[i];
            Centre storage c = _centres[id];
            if (!c.registered) revert BadList();
            if (c.pubKey == bytes32(0)) revert NoKey();
            if (listed[id]) revert BadList(); // duplicate
            listed[id] = true;
            c.frozen = true;
            e.centres.push(id);
        }
        e.listRoot = listRoot;
        e.centreCount = count;
        e.frozen = true;
        _examIds.push(examId);
        emit CentresFrozen(examId, listRoot, count);
    }

    /// @notice Create an exam on a frozen list, with one committee per set and a reserve committee.
    function createExam(
        bytes32 examId,
        uint64 openRound,
        uint64 revealRound,
        uint64 reserveOpenRound,
        uint64 reserveRevealRound,
        address[] calldata committees,
        address reserveCommittee
    ) external onlyOffice {
        Exam storage e = _exams[examId];
        if (!e.frozen) revert NotFrozen();
        if (e.created) revert AlreadyDone();
        if (
            openRound <= currentRound() || openRound >= revealRound || reserveOpenRound >= reserveRevealRound
                || reserveOpenRound <= openRound
        ) revert BadRounds();

        uint256 n = committees.length;
        if (n < MIN_SETS || n > MAX_SETS) revert BadList();
        if (reserveCommittee == address(0)) revert BadList();
        for (uint256 i = 0; i < n; i++) {
            address a = committees[i];
            if (a == address(0) || a == reserveCommittee) revert BadList();
            for (uint256 j = 0; j < i; j++) {
                if (committees[j] == a) revert BadList();
            }
            e.committees.push(a);
        }

        e.openRound = openRound;
        e.revealRound = revealRound;
        e.reserveOpenRound = reserveOpenRound;
        e.reserveRevealRound = reserveRevealRound;
        e.reserveCommittee = reserveCommittee;
        e.created = true;
        emit ExamCreated(
            examId, openRound, revealRound, reserveOpenRound, reserveRevealRound, uint8(n), reserveCommittee
        );
    }

    // ------------------------------------------------------------------ committees

    /// @notice Publish the Merkle root and URI of a sealed package, once per set.
    /// @dev setIndex < setCount: that set's committee, before openRound.
    ///      setIndex == setCount: the reserve committee, before reserveOpenRound.
    ///      A zero packageRoot reverts BadList (zero means "not submitted" in packageOf).
    function submitPackage(bytes32 examId, uint8 setIndex, bytes32 packageRoot, string calldata uri) external {
        if (packageRoot == bytes32(0)) revert BadList();
        _onlyCommitteeInTime(examId, setIndex);
        Package storage p = _packages[examId][setIndex];
        if (p.submitted) revert AlreadyDone();
        p.root = packageRoot;
        p.uri = uri;
        p.submitted = true;
        emit PackageSubmitted(examId, setIndex, packageRoot, uri, msg.sender);
    }

    /// @notice Publish the package bytes of a set on chain, in one or more parts, before its root.
    /// @dev Same caller and deadline rules as submitPackage, and only while the set's package is not submitted,
    ///      so the parts are final once the root is. Each call emits PackageData(examId, setIndex, part, data)
    ///      with part = 0, 1, ... and records block.number: readers query eth_getLogs on exactly those blocks
    ///      (packageDataBlocks). Reverts BadList on empty data, more than MAX_DATA bytes or MAX_PARTS parts.
    function postPackageData(bytes32 examId, uint8 setIndex, bytes calldata data) external {
        if (data.length == 0 || data.length > MAX_DATA) revert BadList();
        _onlyCommitteeInTime(examId, setIndex);
        if (_packages[examId][setIndex].submitted) revert AlreadyDone();
        uint64[] storage blocks = _dataBlocks[examId][setIndex];
        if (blocks.length >= MAX_PARTS) revert BadList();
        emit PackageData(examId, setIndex, blocks.length, data);
        blocks.push(uint64(block.number));
    }

    /// @dev setIndex < setCount: that set's committee, before openRound.
    ///      setIndex == setCount: the reserve committee, before reserveOpenRound.
    function _onlyCommitteeInTime(bytes32 examId, uint8 setIndex) private view {
        Exam storage e = _exams[examId];
        uint256 setCount = e.committees.length;
        uint64 deadline;
        if (setIndex < setCount) {
            if (msg.sender != e.committees[setIndex]) revert NotCommittee();
            deadline = e.openRound;
        } else if (setIndex == setCount && e.created) {
            if (msg.sender != e.reserveCommittee) revert NotCommittee();
            deadline = e.reserveOpenRound;
        } else {
            revert NotCommittee();
        }
        if (currentRound() >= deadline) revert TooLate();
    }

    /// @notice Burn a set seen before its opening, so the draw skips it.
    /// @dev Only the set's committee, at least BURN_MARGIN rounds before openRound (reverts TooLate when
    ///      currentRound() + BURN_MARGIN >= openRound); the last unburned set cannot be burned.
    function burnSet(bytes32 examId, uint8 setIndex) external {
        Exam storage e = _exams[examId];
        uint256 setCount = e.committees.length;
        if (setIndex >= setCount || msg.sender != e.committees[setIndex]) revert NotCommittee();
        if (currentRound() + BURN_MARGIN >= e.openRound) revert TooLate();
        if (_burned[examId][setIndex]) revert AlreadyDone();
        if (uint256(e.burnedCount) + 1 >= setCount) revert LastSet();
        _burned[examId][setIndex] = true;
        e.burnedCount += 1;
        emit SetBurned(examId, setIndex, msg.sender);
    }

    // ------------------------------------------------------------------ centres

    /// @notice A listed centre publishes H(r_c) and tlock(revealRound, r_c), once, before openRound.
    /// @dev An rcCommit already used by another centre of the same exam reverts AlreadyDone.
    function joinExam(bytes32 examId, bytes32 centreId, bytes32 rcCommit, bytes calldata tlockedRc) external {
        Exam storage e = _exams[examId];
        if (!e.created) revert TooEarly();
        if (!_listed[examId][centreId]) revert NotCentre();
        if (msg.sender != _centres[centreId].operator) revert NotCentre();
        if (currentRound() >= e.openRound) revert TooLate();
        Participation storage p = _participation[examId][centreId];
        if (p.joined) revert AlreadyDone();
        if (_rcUsed[examId][rcCommit]) revert AlreadyDone();
        _rcUsed[examId][rcCommit] = true;
        p.rcCommit = rcCommit;
        p.tlockedRc = tlockedRc;
        p.joined = true;
        emit CentreJoined(examId, centreId, rcCommit, tlockedRc);
    }

    // ------------------------------------------------------------------ public

    /// @notice Anyone may flag a listed centre with evidence, once revealRound is reached.
    function flagCentre(bytes32 examId, bytes32 centreId, bytes32 evidenceHash) external {
        Exam storage e = _exams[examId];
        if (!_listed[examId][centreId]) revert NotCentre();
        if (!e.created || currentRound() < e.revealRound) revert TooEarly();
        emit CentreFlagged(examId, centreId, evidenceHash, msg.sender);
    }

    // ------------------------------------------------------------------ views

    function getExam(bytes32 examId) external view returns (ExamView memory) {
        return _examView(examId);
    }

    function _examView(bytes32 examId) private view returns (ExamView memory v) {
        Exam storage e = _exams[examId];
        v = ExamView({
            listRoot: e.listRoot,
            centreCount: e.centreCount,
            openRound: e.openRound,
            revealRound: e.revealRound,
            reserveOpenRound: e.reserveOpenRound,
            reserveRevealRound: e.reserveRevealRound,
            setCount: uint8(e.committees.length),
            reserveCommittee: e.reserveCommittee,
            created: e.created,
            frozen: e.frozen
        });
    }

    function getCentre(bytes32 centreId)
        external
        view
        returns (bytes32 pubKey, address operator, string memory name, bool frozen)
    {
        Centre storage c = _centres[centreId];
        return (c.pubKey, c.operator, c.name, c.frozen);
    }

    function examCentres(bytes32 examId) external view returns (bytes32[] memory) {
        return _exams[examId].centres;
    }

    function isBurned(bytes32 examId, uint8 setIndex) external view returns (bool) {
        return _burned[examId][setIndex];
    }

    /// @return root Package Merkle root (zero if not submitted).
    /// @return uri Package URI.
    /// @return committee Committee in charge of this set index (reserve committee at index setCount).
    function packageOf(bytes32 examId, uint8 setIndex)
        external
        view
        returns (bytes32 root, string memory uri, address committee)
    {
        Exam storage e = _exams[examId];
        uint256 setCount = e.committees.length;
        if (setIndex < setCount) committee = e.committees[setIndex];
        else if (setIndex == setCount) committee = e.reserveCommittee;
        Package storage p = _packages[examId][setIndex];
        return (p.root, p.uri, committee);
    }

    function participation(bytes32 examId, bytes32 centreId)
        external
        view
        returns (bytes32 rcCommit, bytes memory tlockedRc, bool joined)
    {
        Participation storage p = _participation[examId][centreId];
        return (p.rcCommit, p.tlockedRc, p.joined);
    }

    /// @notice Every exam whose centre list was frozen (createExam requires it), in freeze order.
    function examIds() external view returns (bytes32[] memory) {
        return _examIds;
    }

    /// @notice Every centre id ever registered, in first registration order.
    function allCentres() external view returns (bytes32[] memory) {
        return _centreIds;
    }

    /// @notice Committees of an exam: committees[i] seals set i, reserve seals set index committees.length.
    function committeesOf(bytes32 examId) external view returns (address[] memory committees, address reserve) {
        Exam storage e = _exams[examId];
        return (e.committees, e.reserveCommittee);
    }

    /// @notice Block numbers of the PackageData parts of a set, index = part.
    function packageDataBlocks(bytes32 examId, uint8 setIndex) external view returns (uint64[] memory) {
        return _dataBlocks[examId][setIndex];
    }

    /// @notice Everything a reader needs about an exam in one call.
    /// @return exam As getExam.
    /// @return centres The frozen list, in list order (empty until frozen).
    /// @return packages One per set index 0..setCount, the reserve last (empty until created).
    /// @return participations Same order as centres.
    /// @dev ponytail: O(listed centres) storage reads, about 50k gas per centre; page it if lists grow past ~500.
    function examSnapshot(bytes32 examId)
        external
        view
        returns (
            ExamView memory exam,
            CentreView[] memory centres,
            PackageView[] memory packages,
            ParticipationView[] memory participations
        )
    {
        exam = _examView(examId);
        Exam storage e = _exams[examId];
        uint256 n = e.centres.length;
        centres = new CentreView[](n);
        participations = new ParticipationView[](n);
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = e.centres[i];
            Centre storage c = _centres[id];
            centres[i] = CentreView(id, c.pubKey, c.operator, c.frozen, c.name);
            Participation storage p = _participation[examId][id];
            participations[i] = ParticipationView(p.rcCommit, p.tlockedRc, p.joined);
        }
        uint256 sets = e.created ? e.committees.length + 1 : 0;
        packages = new PackageView[](sets);
        for (uint256 i = 0; i < sets; i++) {
            Package storage k = _packages[examId][uint8(i)];
            address committee = i < sets - 1 ? e.committees[i] : e.reserveCommittee;
            packages[i] = PackageView(k.root, k.uri, committee, _burned[examId][uint8(i)], _dataBlocks[examId][uint8(i)]);
        }
    }
}
