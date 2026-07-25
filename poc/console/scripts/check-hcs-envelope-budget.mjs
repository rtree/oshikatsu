const MAX_EVENT_BYTES = 900;
const MAX_SHOUT_CODE_POINTS = 200;
const MAX_SHOUT_BYTES = 600;
const encoder = new TextEncoder();

function utf8Length(value) {
  return encoder.encode(value).length;
}

function assertWithinBudget(name, envelope) {
  const bytes = utf8Length(JSON.stringify(envelope));
  if (bytes > MAX_EVENT_BYTES) {
    throw new Error(`${name} is ${bytes} bytes; maximum is ${MAX_EVENT_BYTES}.`);
  }

  return bytes;
}

function isWithinEventBudget(bytes) {
  return bytes.length <= MAX_EVENT_BYTES;
}

const worstCaseShout = "推".repeat(MAX_SHOUT_CODE_POINTS);
if ([...worstCaseShout].length !== MAX_SHOUT_CODE_POINTS) {
  throw new Error("Shout code-point fixture is invalid.");
}
if (utf8Length(worstCaseShout) !== MAX_SHOUT_BYTES) {
  throw new Error("Shout byte fixture is invalid.");
}

const evidenceUri = `ipfs://b${"a".repeat(58)}`;
const fixtures = {
  reaction: {
    v: 1,
    t: "r",
    r: "r".repeat(32),
    e: "e".repeat(32),
    s: "emotional-eruption",
  },
  shout: {
    v: 1,
    t: "s",
    r: "r".repeat(32),
    e: "e".repeat(32),
    s: "emotional-eruption",
    c: worstCaseShout,
  },
  initialBallot: {
    v: 1,
    t: "b",
    r: "r".repeat(32),
    e: "e".repeat(32),
    n: ["n".repeat(16), "m".repeat(16), "o".repeat(16)],
    d: "d".repeat(64),
    u: evidenceUri,
    b: "123456789",
    h: "h".repeat(64),
  },
};

const measurements = Object.fromEntries(
  Object.entries(fixtures).map(([name, envelope]) => [name, assertWithinBudget(name, envelope)]),
);

const exactLimit = "x".repeat(MAX_EVENT_BYTES);
const overLimit = `${exactLimit}x`;
if (utf8Length(exactLimit) !== MAX_EVENT_BYTES || utf8Length(overLimit) !== 901) {
  throw new Error("Boundary fixtures are invalid.");
}
if (!isWithinEventBudget(encoder.encode(exactLimit))) {
  throw new Error("A 900-byte event must pass preflight.");
}
if (isWithinEventBudget(encoder.encode(overLimit))) {
  throw new Error("A 901-byte event must fail preflight.");
}

console.log(
  JSON.stringify({
    max_event_bytes: MAX_EVENT_BYTES,
    max_shout_bytes: MAX_SHOUT_BYTES,
    max_shout_code_points: MAX_SHOUT_CODE_POINTS,
    measurements,
    preflight_boundary: { accepted_bytes: 900, rejected_bytes: 901 },
    reserved_network_headroom: 1024 - MAX_EVENT_BYTES,
  }),
);