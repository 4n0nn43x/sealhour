const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const PERIOD = 3;
const id = (s) => ethers.id(s); // keccak256 of a label, used as bytes32
const listRoot = (ids) => ethers.solidityPackedKeccak256(["bytes32[]"], [ids]);

const EXAM = id("exam:maths-2026");
const CENTRES = ["Northgate", "Riverside", "Eastport", "Hillcrest"];
const CENTRE_IDS = CENTRES.map((n) => id(`centre:${n}`));
const KEYS = CENTRES.map((n) => id(`x25519:${n}`));
// Beacon pin stored by the constructor (any non zero hash, any non empty key).
const CHAIN_HASH = id("beacon:chain-hash");
const BEACON_PK = "0x" + "ab".repeat(96);

describe("SealRegistry", function () {
  // Time helpers: round r starts at genesis + (r - 1) * period.
  let genesis;
  const roundStart = (r) => genesis + (r - 1) * PERIOD;
  // The next mined block (the next tx) lands exactly at the start of round r.
  const nextTxAtRound = (r) => time.setNextBlockTimestamp(roundStart(r));
  // The next tx lands in the last second of round r - 1.
  const nextTxJustBefore = (r) => time.setNextBlockTimestamp(roundStart(r) - 1);

  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [office, stranger, c0, c1, c2, c3, reserve, op0, op1, op2, op3, reporter] = signers;
    const now = await time.latest();
    const g = now - 60;
    const Registry = await ethers.getContractFactory("SealRegistry");
    const registry = await Registry.deploy(g, PERIOD, CHAIN_HASH, BEACON_PK);
    await registry.waitForDeployment();
    return {
      registry,
      genesisTime: g,
      office,
      stranger,
      committees: [c0, c1, c2, c3],
      reserve,
      operators: [op0, op1, op2, op3],
      reporter,
    };
  }

  async function registeredFixture() {
    const f = await deployFixture();
    for (let i = 0; i < 4; i++) {
      await f.registry.registerCentre(CENTRE_IDS[i], KEYS[i], f.operators[i].address, CENTRES[i]);
    }
    return f;
  }

  async function frozenFixture() {
    const f = await registeredFixture();
    await f.registry.freezeCentres(EXAM, CENTRE_IDS, listRoot(CENTRE_IDS), CENTRE_IDS.length);
    return f;
  }

  // Exam rounds relative to the current round at fixture time.
  async function createdFixture() {
    const f = await frozenFixture();
    const cur = Number(await f.registry.currentRound());
    const rounds = { open: cur + 100, reveal: cur + 200, rOpen: cur + 300, rReveal: cur + 400 };
    await f.registry.createExam(
      EXAM,
      rounds.open,
      rounds.reveal,
      rounds.rOpen,
      rounds.rReveal,
      f.committees.map((c) => c.address),
      f.reserve.address
    );
    return { ...f, rounds };
  }

  async function load(fixture) {
    const f = await loadFixture(fixture);
    genesis = f.genesisTime;
    return f;
  }

  // ---------------------------------------------------------------- constructor and rounds

  describe("constructor and currentRound", function () {
    it("stores office, genesis and period", async function () {
      const { registry, office, genesisTime } = await load(deployFixture);
      expect(await registry.office()).to.equal(office.address);
      expect(await registry.genesisTime()).to.equal(genesisTime);
      expect(await registry.period()).to.equal(PERIOD);
    });

    it("stores the beacon pin (chain hash and public key) on chain", async function () {
      const { registry } = await load(deployFixture);
      expect(await registry.beaconChainHash()).to.equal(CHAIN_HASH);
      expect(await registry.beaconPublicKey()).to.equal(BEACON_PK);
    });

    it("rejects a zero chain hash or an empty beacon public key", async function () {
      const Registry = await ethers.getContractFactory("SealRegistry");
      await expect(Registry.deploy(0, PERIOD, ethers.ZeroHash, BEACON_PK)).to.be.revertedWithCustomError(Registry, "BadList");
      await expect(Registry.deploy(0, PERIOD, CHAIN_HASH, "0x")).to.be.revertedWithCustomError(Registry, "BadList");
    });

    it("rejects a zero period", async function () {
      const Registry = await ethers.getContractFactory("SealRegistry");
      await expect(Registry.deploy(0, 0, CHAIN_HASH, BEACON_PK)).to.be.revertedWithCustomError(Registry, "BadRounds");
    });

    it("returns 0 before genesis, 1 at genesis, then follows drand", async function () {
      const now = await time.latest();
      const g = now + 1000;
      const Registry = await ethers.getContractFactory("SealRegistry");
      const r = await Registry.deploy(g, PERIOD, CHAIN_HASH, BEACON_PK);
      expect(await r.currentRound()).to.equal(0);
      await time.increaseTo(g - 1);
      expect(await r.currentRound()).to.equal(0);
      await time.increaseTo(g);
      expect(await r.currentRound()).to.equal(1);
      await time.increaseTo(g + PERIOD - 1);
      expect(await r.currentRound()).to.equal(1);
      await time.increaseTo(g + PERIOD);
      expect(await r.currentRound()).to.equal(2);
      await time.increaseTo(g + 10 * PERIOD + 2);
      expect(await r.currentRound()).to.equal(11);
    });
  });

  // ---------------------------------------------------------------- registerCentre

  describe("registerCentre", function () {
    it("registers a centre and emits CentreRegistered", async function () {
      const { registry, operators } = await load(deployFixture);
      await expect(registry.registerCentre(CENTRE_IDS[0], KEYS[0], operators[0].address, "Northgate"))
        .to.emit(registry, "CentreRegistered")
        .withArgs(CENTRE_IDS[0], KEYS[0], operators[0].address, "Northgate");
      const c = await registry.getCentre(CENTRE_IDS[0]);
      expect(c.pubKey).to.equal(KEYS[0]);
      expect(c.operator).to.equal(operators[0].address);
      expect(c.name).to.equal("Northgate");
      expect(c.frozen).to.equal(false);
    });

    it("allows updating a key while not frozen", async function () {
      const { registry, operators } = await load(registeredFixture);
      const newKey = id("x25519:Northgate:v2");
      await registry.registerCentre(CENTRE_IDS[0], newKey, operators[1].address, "Northgate 2");
      const c = await registry.getCentre(CENTRE_IDS[0]);
      expect(c.pubKey).to.equal(newKey);
      expect(c.operator).to.equal(operators[1].address);
    });

    it("reverts NotOffice for any other caller", async function () {
      const { registry, stranger } = await load(deployFixture);
      await expect(
        registry.connect(stranger).registerCentre(CENTRE_IDS[0], KEYS[0], stranger.address, "x")
      ).to.be.revertedWithCustomError(registry, "NotOffice");
    });

    it("reverts BadList on a zero key or a zero operator", async function () {
      const { registry, operators } = await load(deployFixture);
      await expect(
        registry.registerCentre(CENTRE_IDS[0], ethers.ZeroHash, operators[0].address, "Northgate")
      ).to.be.revertedWithCustomError(registry, "BadList");
      await expect(
        registry.registerCentre(CENTRE_IDS[0], KEYS[0], ethers.ZeroAddress, "Northgate")
      ).to.be.revertedWithCustomError(registry, "BadList");
      expect((await registry.getCentre(CENTRE_IDS[0])).pubKey).to.equal(ethers.ZeroHash);
    });

    it("reverts KeyFrozen once the centre is in a frozen list", async function () {
      const { registry, operators } = await load(frozenFixture);
      const c = await registry.getCentre(CENTRE_IDS[2]);
      expect(c.frozen).to.equal(true);
      await expect(
        registry.registerCentre(CENTRE_IDS[2], id("other key"), operators[2].address, "Eastport")
      ).to.be.revertedWithCustomError(registry, "KeyFrozen");
    });

    it("still allows registering a centre that is not in any frozen list", async function () {
      const { registry, stranger } = await load(frozenFixture);
      await expect(registry.registerCentre(id("centre:new"), id("k"), stranger.address, "New")).to.emit(
        registry,
        "CentreRegistered"
      );
    });
  });

  // ---------------------------------------------------------------- freezeCentres

  describe("freezeCentres", function () {
    it("freezes the list, stores it and emits CentresFrozen", async function () {
      const { registry } = await load(registeredFixture);
      const root = listRoot(CENTRE_IDS);
      await expect(registry.freezeCentres(EXAM, CENTRE_IDS, root, 4))
        .to.emit(registry, "CentresFrozen")
        .withArgs(EXAM, root, 4);
      expect(await registry.examCentres(EXAM)).to.deep.equal(CENTRE_IDS);
      const e = await registry.getExam(EXAM);
      expect(e.listRoot).to.equal(root);
      expect(e.centreCount).to.equal(4);
      expect(e.frozen).to.equal(true);
      expect(e.created).to.equal(false);
      for (const cid of CENTRE_IDS) expect((await registry.getCentre(cid)).frozen).to.equal(true);
    });

    it("root matches keccak256(abi.encodePacked(bytes32[])) computed off chain", async function () {
      const packed = ethers.concat(CENTRE_IDS);
      expect(listRoot(CENTRE_IDS)).to.equal(ethers.keccak256(packed));
    });

    it("only freezes keys of listed centres", async function () {
      const { registry } = await load(registeredFixture);
      const ids = CENTRE_IDS.slice(0, 2);
      await registry.freezeCentres(EXAM, ids, listRoot(ids), 2);
      expect((await registry.getCentre(CENTRE_IDS[0])).frozen).to.equal(true);
      expect((await registry.getCentre(CENTRE_IDS[3])).frozen).to.equal(false);
    });

    it("reverts NotOffice for any other caller", async function () {
      const { registry, stranger } = await load(registeredFixture);
      await expect(
        registry.connect(stranger).freezeCentres(EXAM, CENTRE_IDS, listRoot(CENTRE_IDS), 4)
      ).to.be.revertedWithCustomError(registry, "NotOffice");
    });

    it("reverts BadList on a wrong root", async function () {
      const { registry } = await load(registeredFixture);
      const wrong = listRoot([...CENTRE_IDS].reverse());
      await expect(registry.freezeCentres(EXAM, CENTRE_IDS, wrong, 4)).to.be.revertedWithCustomError(
        registry,
        "BadList"
      );
    });

    it("reverts BadList on a wrong count", async function () {
      const { registry } = await load(registeredFixture);
      await expect(
        registry.freezeCentres(EXAM, CENTRE_IDS, listRoot(CENTRE_IDS), 5)
      ).to.be.revertedWithCustomError(registry, "BadList");
      await expect(
        registry.freezeCentres(EXAM, CENTRE_IDS, listRoot(CENTRE_IDS), 3)
      ).to.be.revertedWithCustomError(registry, "BadList");
    });

    it("reverts BadList on an empty list", async function () {
      const { registry } = await load(registeredFixture);
      await expect(registry.freezeCentres(EXAM, [], listRoot([]), 0)).to.be.revertedWithCustomError(
        registry,
        "BadList"
      );
    });

    it("reverts BadList on a duplicate centre", async function () {
      const { registry } = await load(registeredFixture);
      const ids = [CENTRE_IDS[0], CENTRE_IDS[1], CENTRE_IDS[0]];
      await expect(registry.freezeCentres(EXAM, ids, listRoot(ids), 3)).to.be.revertedWithCustomError(
        registry,
        "BadList"
      );
    });

    it("reverts BadList on an unregistered (ghost) centre", async function () {
      const { registry } = await load(registeredFixture);
      const ids = [...CENTRE_IDS, id("centre:ghost")];
      await expect(registry.freezeCentres(EXAM, ids, listRoot(ids), 5)).to.be.revertedWithCustomError(
        registry,
        "BadList"
      );
    });

    it("leaves no partial state after a reverted freeze", async function () {
      const { registry } = await load(registeredFixture);
      const ids = [CENTRE_IDS[0], id("centre:ghost")];
      await expect(registry.freezeCentres(EXAM, ids, listRoot(ids), 2)).to.be.reverted;
      expect((await registry.getCentre(CENTRE_IDS[0])).frozen).to.equal(false);
      expect((await registry.getExam(EXAM)).frozen).to.equal(false);
    });

    it("reverts AlreadyDone on a second freeze of the same exam", async function () {
      const { registry } = await load(frozenFixture);
      const ids = CENTRE_IDS.slice(0, 1);
      await expect(registry.freezeCentres(EXAM, ids, listRoot(ids), 1)).to.be.revertedWithCustomError(
        registry,
        "AlreadyDone"
      );
    });

    it("lets the same centre appear in the lists of two different exams", async function () {
      const { registry } = await load(frozenFixture);
      const other = id("exam:physics");
      await expect(registry.freezeCentres(other, CENTRE_IDS, listRoot(CENTRE_IDS), 4)).to.emit(
        registry,
        "CentresFrozen"
      );
    });
  });

  // ---------------------------------------------------------------- createExam

  describe("createExam", function () {
    async function args(f, overrides = {}) {
      const cur = Number(await f.registry.currentRound());
      return {
        examId: EXAM,
        open: cur + 10,
        reveal: cur + 20,
        rOpen: cur + 30,
        rReveal: cur + 40,
        committees: f.committees.map((c) => c.address),
        reserve: f.reserve.address,
        ...overrides,
      };
    }
    const call = (f, a, signer) =>
      (signer ? f.registry.connect(signer) : f.registry).createExam(
        a.examId,
        a.open,
        a.reveal,
        a.rOpen,
        a.rReveal,
        a.committees,
        a.reserve
      );

    it("creates the exam and emits ExamCreated", async function () {
      const f = await load(frozenFixture);
      const a = await args(f);
      await expect(call(f, a))
        .to.emit(f.registry, "ExamCreated")
        .withArgs(EXAM, a.open, a.reveal, a.rOpen, a.rReveal, 4, f.reserve.address);
      const e = await f.registry.getExam(EXAM);
      expect(e.openRound).to.equal(a.open);
      expect(e.revealRound).to.equal(a.reveal);
      expect(e.reserveOpenRound).to.equal(a.rOpen);
      expect(e.reserveRevealRound).to.equal(a.rReveal);
      expect(e.setCount).to.equal(4);
      expect(e.reserveCommittee).to.equal(f.reserve.address);
      expect(e.created).to.equal(true);
      expect(e.frozen).to.equal(true);
      for (let i = 0; i < 4; i++) {
        expect((await f.registry.packageOf(EXAM, i)).committee).to.equal(f.committees[i].address);
      }
      expect((await f.registry.packageOf(EXAM, 4)).committee).to.equal(f.reserve.address);
      expect((await f.registry.packageOf(EXAM, 5)).committee).to.equal(ethers.ZeroAddress);
    });

    it("accepts 2 and 8 committees", async function () {
      const f = await load(frozenFixture);
      const signers = await ethers.getSigners();
      const a2 = await args(f, { committees: f.committees.slice(0, 2).map((c) => c.address) });
      await expect(call(f, a2)).to.emit(f.registry, "ExamCreated");

      const other = id("exam:eight");
      await f.registry.freezeCentres(other, CENTRE_IDS, listRoot(CENTRE_IDS), 4);
      const eight = signers.slice(12, 20).map((s) => s.address);
      const a8 = await args(f, { examId: other, committees: eight });
      await expect(call(f, a8)).to.emit(f.registry, "ExamCreated");
      expect((await f.registry.getExam(other)).setCount).to.equal(8);
    });

    it("reverts NotOffice for any other caller", async function () {
      const f = await load(frozenFixture);
      await expect(call(f, await args(f), f.stranger)).to.be.revertedWithCustomError(f.registry, "NotOffice");
    });

    it("reverts NotFrozen when the list is not frozen", async function () {
      const f = await load(registeredFixture);
      await expect(call(f, await args(f))).to.be.revertedWithCustomError(f.registry, "NotFrozen");
    });

    it("reverts AlreadyDone on a second creation", async function () {
      const f = await load(createdFixture);
      await expect(call(f, await args(f))).to.be.revertedWithCustomError(f.registry, "AlreadyDone");
    });

    it("reverts BadRounds when openRound is not in the future", async function () {
      const f = await load(frozenFixture);
      // The tx lands in round cur (no increase), so openRound == cur must fail.
      const now = await time.latest();
      await time.setNextBlockTimestamp(now + 1);
      const roundAtTx = Math.floor((now + 1 - genesis) / PERIOD) + 1;
      const a = await args(f, { open: roundAtTx });
      await expect(call(f, a)).to.be.revertedWithCustomError(f.registry, "BadRounds");
      const past = await args(f, { open: 1 });
      await expect(call(f, past)).to.be.revertedWithCustomError(f.registry, "BadRounds");
    });

    it("accepts openRound == currentRound + 1", async function () {
      const f = await load(frozenFixture);
      const now = await time.latest();
      await time.setNextBlockTimestamp(now + 1);
      const roundAtTx = Math.floor((now + 1 - genesis) / PERIOD) + 1;
      const a = await args(f, { open: roundAtTx + 1 });
      await expect(call(f, a)).to.emit(f.registry, "ExamCreated");
    });

    it("reverts BadRounds when openRound >= revealRound", async function () {
      const f = await load(frozenFixture);
      const a = await args(f);
      await expect(call(f, { ...a, reveal: a.open })).to.be.revertedWithCustomError(f.registry, "BadRounds");
      await expect(call(f, { ...a, reveal: a.open - 1 })).to.be.revertedWithCustomError(f.registry, "BadRounds");
    });

    it("reverts BadRounds when reserveOpenRound >= reserveRevealRound", async function () {
      const f = await load(frozenFixture);
      const a = await args(f);
      await expect(call(f, { ...a, rReveal: a.rOpen })).to.be.revertedWithCustomError(f.registry, "BadRounds");
      await expect(call(f, { ...a, rReveal: a.rOpen - 1 })).to.be.revertedWithCustomError(
        f.registry,
        "BadRounds"
      );
    });

    it("reverts BadRounds when reserveOpenRound <= openRound", async function () {
      const f = await load(frozenFixture);
      const a = await args(f);
      await expect(call(f, { ...a, rOpen: a.open })).to.be.revertedWithCustomError(f.registry, "BadRounds");
      await expect(call(f, { ...a, rOpen: a.open - 1 })).to.be.revertedWithCustomError(f.registry, "BadRounds");
    });

    it("reverts BadList on fewer than 2 or more than 8 committees", async function () {
      const f = await load(frozenFixture);
      const signers = await ethers.getSigners();
      await expect(call(f, await args(f, { committees: [f.committees[0].address] }))).to.be.revertedWithCustomError(
        f.registry,
        "BadList"
      );
      await expect(call(f, await args(f, { committees: [] }))).to.be.revertedWithCustomError(f.registry, "BadList");
      const nine = signers.slice(11, 20).map((s) => s.address);
      expect(nine.length).to.equal(9);
      await expect(call(f, await args(f, { committees: nine }))).to.be.revertedWithCustomError(
        f.registry,
        "BadList"
      );
    });

    it("reverts BadList on duplicate, zero or reserve-equal committees", async function () {
      const f = await load(frozenFixture);
      const [c0, c1] = f.committees.map((c) => c.address);
      await expect(call(f, await args(f, { committees: [c0, c1, c0] }))).to.be.revertedWithCustomError(
        f.registry,
        "BadList"
      );
      await expect(
        call(f, await args(f, { committees: [c0, ethers.ZeroAddress] }))
      ).to.be.revertedWithCustomError(f.registry, "BadList");
      await expect(
        call(f, await args(f, { committees: [c0, f.reserve.address] }))
      ).to.be.revertedWithCustomError(f.registry, "BadList");
      await expect(call(f, await args(f, { reserve: ethers.ZeroAddress }))).to.be.revertedWithCustomError(
        f.registry,
        "BadList"
      );
    });
  });

  // ---------------------------------------------------------------- submitPackage

  describe("submitPackage", function () {
    const ROOT = id("package-root");

    it("stores a package for each set and the reserve, emits PackageSubmitted", async function () {
      const f = await load(createdFixture);
      for (let i = 0; i < 4; i++) {
        await expect(f.registry.connect(f.committees[i]).submitPackage(EXAM, i, id(`root${i}`), `pkg/${i}`))
          .to.emit(f.registry, "PackageSubmitted")
          .withArgs(EXAM, i, id(`root${i}`), `pkg/${i}`, f.committees[i].address);
        const p = await f.registry.packageOf(EXAM, i);
        expect(p.root).to.equal(id(`root${i}`));
        expect(p.uri).to.equal(`pkg/${i}`);
      }
      await expect(f.registry.connect(f.reserve).submitPackage(EXAM, 4, ROOT, "pkg/R"))
        .to.emit(f.registry, "PackageSubmitted")
        .withArgs(EXAM, 4, ROOT, "pkg/R", f.reserve.address);
    });

    it("reverts NotCommittee for a wrong committee, the office or a stranger", async function () {
      const f = await load(createdFixture);
      await expect(
        f.registry.connect(f.committees[1]).submitPackage(EXAM, 0, ROOT, "x")
      ).to.be.revertedWithCustomError(f.registry, "NotCommittee");
      await expect(f.registry.connect(f.office).submitPackage(EXAM, 0, ROOT, "x")).to.be.revertedWithCustomError(
        f.registry,
        "NotCommittee"
      );
      await expect(
        f.registry.connect(f.stranger).submitPackage(EXAM, 0, ROOT, "x")
      ).to.be.revertedWithCustomError(f.registry, "NotCommittee");
    });

    it("reverts NotCommittee when a set committee submits the reserve, or reserve submits a set", async function () {
      const f = await load(createdFixture);
      await expect(
        f.registry.connect(f.committees[0]).submitPackage(EXAM, 4, ROOT, "x")
      ).to.be.revertedWithCustomError(f.registry, "NotCommittee");
      await expect(f.registry.connect(f.reserve).submitPackage(EXAM, 0, ROOT, "x")).to.be.revertedWithCustomError(
        f.registry,
        "NotCommittee"
      );
    });

    it("reverts NotCommittee for an index above setCount", async function () {
      const f = await load(createdFixture);
      await expect(f.registry.connect(f.reserve).submitPackage(EXAM, 5, ROOT, "x")).to.be.revertedWithCustomError(
        f.registry,
        "NotCommittee"
      );
    });

    it("reverts NotCommittee on an exam that does not exist", async function () {
      const f = await load(createdFixture);
      const ghost = id("exam:ghost");
      await expect(f.registry.connect(f.reserve).submitPackage(ghost, 0, ROOT, "x")).to.be.revertedWithCustomError(
        f.registry,
        "NotCommittee"
      );
    });

    it("reverts BadList on a zero package root", async function () {
      const f = await load(createdFixture);
      await expect(
        f.registry.connect(f.committees[0]).submitPackage(EXAM, 0, ethers.ZeroHash, "x")
      ).to.be.revertedWithCustomError(f.registry, "BadList");
      await expect(f.registry.connect(f.reserve).submitPackage(EXAM, 4, ethers.ZeroHash, "r")).to.be.revertedWithCustomError(
        f.registry,
        "BadList"
      );
      await expect(f.registry.connect(f.committees[0]).submitPackage(EXAM, 0, ROOT, "x")).to.emit(
        f.registry,
        "PackageSubmitted"
      );
    });

    it("reverts AlreadyDone on a second submission", async function () {
      const f = await load(createdFixture);
      await f.registry.connect(f.committees[0]).submitPackage(EXAM, 0, ROOT, "x");
      await expect(
        f.registry.connect(f.committees[0]).submitPackage(EXAM, 0, id("other"), "y")
      ).to.be.revertedWithCustomError(f.registry, "AlreadyDone");
      await f.registry.connect(f.reserve).submitPackage(EXAM, 4, ROOT, "r");
      await expect(f.registry.connect(f.reserve).submitPackage(EXAM, 4, ROOT, "r")).to.be.revertedWithCustomError(
        f.registry,
        "AlreadyDone"
      );
    });

    it("accepts a set package in the last second before openRound, reverts TooLate at openRound", async function () {
      const f = await load(createdFixture);
      await nextTxJustBefore(f.rounds.open);
      await expect(f.registry.connect(f.committees[0]).submitPackage(EXAM, 0, ROOT, "x")).to.emit(
        f.registry,
        "PackageSubmitted"
      );
      await nextTxAtRound(f.rounds.open);
      await expect(
        f.registry.connect(f.committees[1]).submitPackage(EXAM, 1, ROOT, "x")
      ).to.be.revertedWithCustomError(f.registry, "TooLate");
    });

    it("lets the reserve submit after openRound but reverts TooLate at reserveOpenRound", async function () {
      const f = await load(createdFixture);
      await time.increaseTo(roundStart(f.rounds.reveal));
      await nextTxJustBefore(f.rounds.rOpen);
      await expect(f.registry.connect(f.reserve).submitPackage(EXAM, 4, ROOT, "r")).to.emit(
        f.registry,
        "PackageSubmitted"
      );

      const f2 = await load(createdFixture);
      await nextTxAtRound(f2.rounds.rOpen);
      await expect(f2.registry.connect(f2.reserve).submitPackage(EXAM, 4, ROOT, "r")).to.be.revertedWithCustomError(
        f2.registry,
        "TooLate"
      );
    });
  });

  // ---------------------------------------------------------------- joinExam

  describe("joinExam", function () {
    const RC = id("rc-commit");
    const TL = ethers.toUtf8Bytes("-----BEGIN AGE ENCRYPTED FILE-----tlocked rc");

    it("records the commitment and emits CentreJoined", async function () {
      const f = await load(createdFixture);
      await expect(f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], RC, TL))
        .to.emit(f.registry, "CentreJoined")
        .withArgs(EXAM, CENTRE_IDS[0], RC, ethers.hexlify(TL));
      const p = await f.registry.participation(EXAM, CENTRE_IDS[0]);
      expect(p.rcCommit).to.equal(RC);
      expect(p.tlockedRc).to.equal(ethers.hexlify(TL));
      expect(p.joined).to.equal(true);
      expect((await f.registry.participation(EXAM, CENTRE_IDS[1])).joined).to.equal(false);
    });

    it("reverts NotCentre for a centre not in the list", async function () {
      const f = await load(createdFixture);
      const ghost = id("centre:ghost");
      await f.registry.registerCentre(ghost, id("k"), f.stranger.address, "Ghost");
      await expect(
        f.registry.connect(f.stranger).joinExam(EXAM, ghost, RC, TL)
      ).to.be.revertedWithCustomError(f.registry, "NotCentre");
    });

    it("reverts NotCentre for a wrong operator (another centre, the office, a stranger)", async function () {
      const f = await load(createdFixture);
      for (const s of [f.operators[1], f.office, f.stranger]) {
        await expect(
          f.registry.connect(s).joinExam(EXAM, CENTRE_IDS[0], RC, TL)
        ).to.be.revertedWithCustomError(f.registry, "NotCentre");
      }
    });

    it("reverts TooEarly when the exam is frozen but not created", async function () {
      const f = await load(frozenFixture);
      await expect(
        f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], RC, TL)
      ).to.be.revertedWithCustomError(f.registry, "TooEarly");
    });

    it("accepts a join in the last second before openRound, reverts TooLate at openRound", async function () {
      const f = await load(createdFixture);
      await nextTxJustBefore(f.rounds.open);
      await expect(f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], RC, TL)).to.emit(
        f.registry,
        "CentreJoined"
      );
      await nextTxAtRound(f.rounds.open);
      await expect(
        f.registry.connect(f.operators[1]).joinExam(EXAM, CENTRE_IDS[1], RC, TL)
      ).to.be.revertedWithCustomError(f.registry, "TooLate");
    });

    it("reverts AlreadyDone when a centre reuses another centre's rcCommit in the same exam", async function () {
      const f = await load(createdFixture);
      await f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], RC, TL);
      await expect(
        f.registry.connect(f.operators[1]).joinExam(EXAM, CENTRE_IDS[1], RC, TL)
      ).to.be.revertedWithCustomError(f.registry, "AlreadyDone");
      expect((await f.registry.participation(EXAM, CENTRE_IDS[1])).joined).to.equal(false);
      await expect(f.registry.connect(f.operators[1]).joinExam(EXAM, CENTRE_IDS[1], id("rc-commit-2"), TL)).to.emit(
        f.registry,
        "CentreJoined"
      );
    });

    it("accepts the same rcCommit in two different exams", async function () {
      const f = await load(createdFixture);
      const other = id("exam:other");
      await f.registry.freezeCentres(other, CENTRE_IDS, listRoot(CENTRE_IDS), 4);
      const cur = Number(await f.registry.currentRound());
      await f.registry.createExam(other, cur + 100, cur + 200, cur + 300, cur + 400, f.committees.map((c) => c.address), f.reserve.address);
      await f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], RC, TL);
      await expect(f.registry.connect(f.operators[0]).joinExam(other, CENTRE_IDS[0], RC, TL)).to.emit(f.registry, "CentreJoined");
    });

    it("reverts AlreadyDone on a second join", async function () {
      const f = await load(createdFixture);
      await f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], RC, TL);
      await expect(
        f.registry.connect(f.operators[0]).joinExam(EXAM, CENTRE_IDS[0], id("other"), TL)
      ).to.be.revertedWithCustomError(f.registry, "AlreadyDone");
    });
  });

  // ---------------------------------------------------------------- burnSet

  describe("burnSet", function () {
    it("burns a set and emits SetBurned", async function () {
      const f = await load(createdFixture);
      expect(await f.registry.isBurned(EXAM, 2)).to.equal(false);
      await expect(f.registry.connect(f.committees[2]).burnSet(EXAM, 2))
        .to.emit(f.registry, "SetBurned")
        .withArgs(EXAM, 2, f.committees[2].address);
      expect(await f.registry.isBurned(EXAM, 2)).to.equal(true);
    });

    it("reverts NotCommittee for another committee, the office, the reserve or a stranger", async function () {
      const f = await load(createdFixture);
      for (const s of [f.committees[0], f.office, f.reserve, f.stranger]) {
        await expect(f.registry.connect(s).burnSet(EXAM, 2)).to.be.revertedWithCustomError(
          f.registry,
          "NotCommittee"
        );
      }
    });

    it("reverts NotCommittee on the reserve index or beyond", async function () {
      const f = await load(createdFixture);
      await expect(f.registry.connect(f.reserve).burnSet(EXAM, 4)).to.be.revertedWithCustomError(
        f.registry,
        "NotCommittee"
      );
      await expect(f.registry.connect(f.reserve).burnSet(EXAM, 200)).to.be.revertedWithCustomError(
        f.registry,
        "NotCommittee"
      );
    });

    it("accepts a burn in the last second of openRound - 2, reverts TooLate from openRound - 1 (BURN_MARGIN)", async function () {
      const f = await load(createdFixture);
      await nextTxJustBefore(f.rounds.open - 1);
      await expect(f.registry.connect(f.committees[0]).burnSet(EXAM, 0)).to.emit(f.registry, "SetBurned");
      await nextTxAtRound(f.rounds.open - 1);
      await expect(f.registry.connect(f.committees[1]).burnSet(EXAM, 1)).to.be.revertedWithCustomError(
        f.registry,
        "TooLate"
      );
      await nextTxAtRound(f.rounds.open);
      await expect(f.registry.connect(f.committees[1]).burnSet(EXAM, 1)).to.be.revertedWithCustomError(
        f.registry,
        "TooLate"
      );
    });

    it("reverts AlreadyDone on a second burn", async function () {
      const f = await load(createdFixture);
      await f.registry.connect(f.committees[1]).burnSet(EXAM, 1);
      await expect(f.registry.connect(f.committees[1]).burnSet(EXAM, 1)).to.be.revertedWithCustomError(
        f.registry,
        "AlreadyDone"
      );
    });

    it("reverts LastSet on the last unburned set", async function () {
      const f = await load(createdFixture);
      await f.registry.connect(f.committees[0]).burnSet(EXAM, 0);
      await f.registry.connect(f.committees[1]).burnSet(EXAM, 1);
      await f.registry.connect(f.committees[3]).burnSet(EXAM, 3);
      await expect(f.registry.connect(f.committees[2]).burnSet(EXAM, 2)).to.be.revertedWithCustomError(
        f.registry,
        "LastSet"
      );
      expect(await f.registry.isBurned(EXAM, 2)).to.equal(false);
    });

    it("reverts LastSet with two committees after one burn", async function () {
      const f = await load(frozenFixture);
      const cur = Number(await f.registry.currentRound());
      const two = f.committees.slice(0, 2);
      await f.registry.createExam(EXAM, cur + 10, cur + 20, cur + 30, cur + 40, two.map((c) => c.address), f.reserve.address);
      await f.registry.connect(two[0]).burnSet(EXAM, 0);
      await expect(f.registry.connect(two[1]).burnSet(EXAM, 1)).to.be.revertedWithCustomError(f.registry, "LastSet");
    });
  });

  // ---------------------------------------------------------------- flagCentre

  describe("flagCentre", function () {
    const EVIDENCE = id("photo-hash");

    it("reverts TooEarly before revealRound and accepts from revealRound", async function () {
      const f = await load(createdFixture);
      await expect(
        f.registry.connect(f.reporter).flagCentre(EXAM, CENTRE_IDS[1], EVIDENCE)
      ).to.be.revertedWithCustomError(f.registry, "TooEarly");
      await time.increaseTo(roundStart(f.rounds.open));
      await nextTxJustBefore(f.rounds.reveal);
      await expect(
        f.registry.connect(f.reporter).flagCentre(EXAM, CENTRE_IDS[1], EVIDENCE)
      ).to.be.revertedWithCustomError(f.registry, "TooEarly");
      await nextTxAtRound(f.rounds.reveal);
      await expect(f.registry.connect(f.reporter).flagCentre(EXAM, CENTRE_IDS[1], EVIDENCE))
        .to.emit(f.registry, "CentreFlagged")
        .withArgs(EXAM, CENTRE_IDS[1], EVIDENCE, f.reporter.address);
    });

    it("reverts TooEarly on a frozen exam that was never created", async function () {
      const f = await load(frozenFixture);
      await expect(
        f.registry.connect(f.reporter).flagCentre(EXAM, CENTRE_IDS[0], EVIDENCE)
      ).to.be.revertedWithCustomError(f.registry, "TooEarly");
    });

    it("reverts NotCentre for a centre not in the list", async function () {
      const f = await load(createdFixture);
      await time.increaseTo(roundStart(f.rounds.reveal));
      await expect(
        f.registry.connect(f.reporter).flagCentre(EXAM, id("centre:ghost"), EVIDENCE)
      ).to.be.revertedWithCustomError(f.registry, "NotCentre");
    });
  });

  // ---------------------------------------------------------------- happy path

  describe("end to end", function () {
    it("runs the full exam lifecycle", async function () {
      const f = await load(deployFixture);
      const { registry, office, committees, reserve, operators, reporter } = f;

      // 1. Enrolment
      for (let i = 0; i < 4; i++) {
        await registry.connect(office).registerCentre(CENTRE_IDS[i], KEYS[i], operators[i].address, CENTRES[i]);
      }
      // 2. Frozen list
      const root = listRoot(CENTRE_IDS);
      await registry.freezeCentres(EXAM, CENTRE_IDS, root, 4);

      // 3. Exam
      const cur = Number(await registry.currentRound());
      const open = cur + 50;
      const reveal = cur + 100;
      const rOpen = cur + 150;
      const rReveal = cur + 200;
      await registry.createExam(EXAM, open, reveal, rOpen, rReveal, committees.map((c) => c.address), reserve.address);

      // 4. Centres join
      for (let i = 0; i < 4; i++) {
        await expect(
          registry.connect(operators[i]).joinExam(EXAM, CENTRE_IDS[i], id(`rc${i}`), ethers.toUtf8Bytes(`tl${i}`))
        ).to.emit(registry, "CentreJoined");
      }

      // 5. Committees publish packages, reserve too
      for (let i = 0; i < 4; i++) {
        await registry.connect(committees[i]).submitPackage(EXAM, i, id(`pkg${i}`), `packages/${i}.json`);
      }
      await registry.connect(reserve).submitPackage(EXAM, 4, id("pkgR"), "packages/R.json");

      // 6. Committee C (index 2) sees its set leak and burns it
      await expect(registry.connect(committees[2]).burnSet(EXAM, 2)).to.emit(registry, "SetBurned");

      // 7. Opening round: nothing else can change
      await time.increaseTo(roundStart(open));
      expect(await registry.currentRound()).to.equal(open);
      await expect(registry.connect(committees[0]).burnSet(EXAM, 0)).to.be.revertedWithCustomError(registry, "TooLate");
      await expect(
        registry.connect(operators[0]).joinExam(EXAM, CENTRE_IDS[0], id("x"), "0x")
      ).to.be.revertedWithCustomError(registry, "TooLate");
      await expect(
        registry.connect(reporter).flagCentre(EXAM, CENTRE_IDS[1], id("e"))
      ).to.be.revertedWithCustomError(registry, "TooEarly");

      // 8. Reveal: anyone flags a centre with evidence
      await time.increaseTo(roundStart(reveal));
      await expect(registry.connect(reporter).flagCentre(EXAM, CENTRE_IDS[1], id("photo")))
        .to.emit(registry, "CentreFlagged")
        .withArgs(EXAM, CENTRE_IDS[1], id("photo"), reporter.address);

      // Final state readable through the views
      const e = await registry.getExam(EXAM);
      expect(e.listRoot).to.equal(root);
      expect(e.centreCount).to.equal(4);
      expect(e.setCount).to.equal(4);
      expect(e.created && e.frozen).to.equal(true);
      expect(await registry.examCentres(EXAM)).to.deep.equal(CENTRE_IDS);
      const burned = [];
      for (let i = 0; i < 4; i++) if (await registry.isBurned(EXAM, i)) burned.push(i);
      expect(burned).to.deep.equal([2]);
      const pr = await registry.packageOf(EXAM, 4);
      expect(pr.root).to.equal(id("pkgR"));
      expect(pr.uri).to.equal("packages/R.json");
      expect(pr.committee).to.equal(reserve.address);
      for (let i = 0; i < 4; i++) {
        const p = await registry.participation(EXAM, CENTRE_IDS[i]);
        expect(p.joined).to.equal(true);
        expect(p.rcCommit).to.equal(id(`rc${i}`));
      }
      // Keys stay frozen after the exam
      await expect(
        registry.registerCentre(CENTRE_IDS[0], id("new"), operators[0].address, "x")
      ).to.be.revertedWithCustomError(registry, "KeyFrozen");
    });
  });

  // ---------------------------------------------------------------- safety

  describe("safety", function () {
    it("never accepts ether", async function () {
      const f = await load(deployFixture);
      await expect(f.office.sendTransaction({ to: await f.registry.getAddress(), value: 1 })).to.be.reverted;
    });
  });
});
