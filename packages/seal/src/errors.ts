// Typed errors raised by openForCentre and the beacon clients.

/** The round the ciphertext is locked to has not been reached: no key exists yet. */
export class TooEarlyError extends Error {
  readonly round?: number;
  constructor(message: string, round?: number) {
    super(message);
    this.name = "TooEarlyError";
    this.round = round;
  }
}

/** The age identity given is not the one the package was sealed to (or is not a valid identity). */
export class WrongKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WrongKeyError";
  }
}

/** A beacon signature does not verify against the chain public key (or belongs to another chain). */
export class BadSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadSignatureError";
  }
}
