// @sealhour/seal: public API (frozen in docs/smu/50 - Architecture.md section 3).
export {
  createLocalBeacon,
  httpBeaconClient,
  quicknetClient,
  roundAt,
  roundTime,
  verifyBeaconSignature,
  offlineClient,
  infoMatchesPin,
  QUICKNET_PIN,
  SCHEME_ID,
  DST,
} from "./beacon.js";
export type { BeaconInfo, BeaconPin, LocalBeacon, Beacon, ChainClient, ChainInfo } from "./beacon.js";
export { generateCentreKey, recipientToBytes32, bytes32ToRecipient } from "./keys.js";
export { parseExamSet, validateExamSet, serializeExamSet } from "./exam.js";
export type { Question, ExamSet } from "./exam.js";
export { sealForCentre, openForCentre, sealPackage, newRc, commitRc, tlockRc, openRc, tlockText, openText, tlockHeader } from "./seal.js";
export { drawSet, recordCopyIndexes } from "./draw.js";
export { renderForCentre, renderPlain } from "./fingerprint.js";
export type { Rendering } from "./fingerprint.js";
export { merkleRoot, merkleProof, verifyProof, listRoot, packageLeaf } from "./merkle.js";
export { encodeSignature, decodeSignature } from "./base32.js";
export { attributeLeak, normalizeText, VERIFIER_THRESHOLDS } from "./verifier.js";
export type { LeakVerdict } from "./verifier.js";
export { TooEarlyError, WrongKeyError, BadSignatureError } from "./errors.js";
