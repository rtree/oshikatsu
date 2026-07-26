import { domainHash, type BallotSealEvent, type BallotUpdateEvent, type BallotWithdrawEvent } from "@oshikatsu/protocol";

export const sealedRankingPolicy = {
  policy_id: "ordered-borda-3-2-1-v1",
  position_points: [3, 2, 1] as const,
};

export type BallotReplayManifest = {
  room_id: string;
  manifest_hash: string;
  opens_at: string;
  deadline: string;
  nominee_ids: string[];
  authority_account_id: string;
};

export type GrantedBallotCapability = {
  room_id: string;
  manifest_hash: string;
  capability_event_hash: string;
  payer_account_id: string;
  nominee_ids: [string, string, string];
  sequence_number: number;
  consensus_timestamp: string;
};

export type BallotLifecycleRecord = {
  event: BallotUpdateEvent | BallotWithdrawEvent;
  payer_account_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  chunk_count: number;
};

export type BallotSealRecord = {
  event: BallotSealEvent;
  payer_account_id: string;
  sequence_number: number;
  consensus_timestamp: string;
  chunk_count: number;
};

export type BallotReplayRejectionReason =
  | "NOT_SINGLE_MESSAGE"
  | "ROOM_BINDING_INVALID"
  | "MANIFEST_BINDING_INVALID"
  | "CAPABILITY_NOT_GRANTED"
  | "CAPABILITY_NOT_YET_GRANTED"
  | "CAPABILITY_PAYER_MISMATCH"
  | "MIRROR_PAYER_MISMATCH"
  | "NOMINEE_BINDING_INVALID"
  | "OUTSIDE_WINDOW"
  | "DUPLICATE_SEQUENCE"
  | "MULTIPLE_SEALS"
  | "SEAL_AUTHORITY_INVALID"
  | "SEAL_DEADLINE_INVALID"
  | "SEAL_POLICY_INVALID"
  | "SEAL_CUTOFF_INVALID"
  | "SEAL_RESULT_HASH_INVALID";

export type BallotReplayRejection = {
  event_hash: string;
  sequence_number: number;
  reason: BallotReplayRejectionReason;
};

export type SealedRankingEntry = {
  nominee_id: string;
  rank: number;
  points: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  tied: boolean;
};

export type BallotReplayInput = {
  manifest: BallotReplayManifest;
  capabilities: GrantedBallotCapability[];
  lifecycle: BallotLifecycleRecord[];
  seals?: BallotSealRecord[];
};

function hcsTimestampNanos(value: string) {
  const match = /^(0|[1-9]\d*)\.(\d{9})$/.exec(value);
  if (!match) throw new Error(`Invalid HCS timestamp: ${value}`);
  return BigInt(match[1]!) * 1_000_000_000n + BigInt(match[2]!);
}

function isoTimestampNanos(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid manifest timestamp: ${value}`);
  return BigInt(milliseconds) * 1_000_000n;
}

function inWindow(timestamp: string, manifest: BallotReplayManifest) {
  const consensus = hcsTimestampNanos(timestamp);
  return consensus >= isoTimestampNanos(manifest.opens_at) && consensus <= isoTimestampNanos(manifest.deadline);
}

function ordered<T extends { sequence_number: number }>(records: T[]) {
  return [...records].sort((left, right) => left.sequence_number - right.sequence_number);
}

function rankCurrentIntents(manifest: BallotReplayManifest, current: Map<string, [string, string, string] | null>): SealedRankingEntry[] {
  const totals = new Map(manifest.nominee_ids.map((nomineeId) => [nomineeId, {
    nominee_id: nomineeId,
    points: 0,
    first_place_count: 0,
    second_place_count: 0,
    third_place_count: 0,
  }]));
  for (const nominees of current.values()) {
    nominees?.forEach((nomineeId, index) => {
      const entry = totals.get(nomineeId);
      if (!entry) return;
      entry.points += sealedRankingPolicy.position_points[index] ?? 0;
      if (index === 0) entry.first_place_count += 1;
      if (index === 1) entry.second_place_count += 1;
      if (index === 2) entry.third_place_count += 1;
    });
  }
  const manifestOrder = new Map(manifest.nominee_ids.map((nomineeId, index) => [nomineeId, index]));
  const ranking = [...totals.values()].sort((left, right) =>
    right.points - left.points ||
    right.first_place_count - left.first_place_count ||
    right.second_place_count - left.second_place_count ||
    (manifestOrder.get(left.nominee_id) ?? 0) - (manifestOrder.get(right.nominee_id) ?? 0),
  );
  let rank = 1;
  return ranking.map((entry, index) => {
    const previous = ranking[index - 1];
    const tiedWithPrevious = Boolean(previous && previous.points === entry.points && previous.first_place_count === entry.first_place_count && previous.second_place_count === entry.second_place_count);
    if (index > 0 && !tiedWithPrevious) rank = index + 1;
    const tied = ranking.some((candidate) => candidate.nominee_id !== entry.nominee_id && candidate.points === entry.points && candidate.first_place_count === entry.first_place_count && candidate.second_place_count === entry.second_place_count);
    return { ...entry, rank, tied };
  });
}

export function sealedBallotResultHash(manifest: BallotReplayManifest, cutoffSequence: number, ranking: SealedRankingEntry[]) {
  return domainHash("oshikatsu:ballot-result:v1", {
    v: 1,
    room_id: manifest.room_id,
    manifest_hash: manifest.manifest_hash,
    cutoff_sequence: cutoffSequence,
    policy_id: sealedRankingPolicy.policy_id,
    ranking,
  });
}

export function replayBallotLifecycle(input: BallotReplayInput) {
  const { manifest } = input;
  const rejections: BallotReplayRejection[] = [];
  const capabilities = new Map<string, GrantedBallotCapability>();
  const current = new Map<string, [string, string, string] | null>();
  const acceptedEvents: Array<{ event_hash: string; sequence_number: number; event_type: "INITIAL" | "UPDATE" | "WITHDRAW" }> = [];
  let maximumAcceptedSequence = 0;

  for (const capability of ordered(input.capabilities)) {
    if (capability.room_id !== manifest.room_id || capability.manifest_hash !== manifest.manifest_hash || !inWindow(capability.consensus_timestamp, manifest)) continue;
    capabilities.set(capability.capability_event_hash, capability);
    current.set(capability.capability_event_hash, capability.nominee_ids);
    acceptedEvents.push({ event_hash: capability.capability_event_hash, sequence_number: capability.sequence_number, event_type: "INITIAL" });
    maximumAcceptedSequence = Math.max(maximumAcceptedSequence, capability.sequence_number);
  }

  const orderedSeals = ordered(input.seals ?? []);
  const authoritySeals = orderedSeals.filter(({ event, payer_account_id, chunk_count }) =>
    chunk_count === 1
    && event.r === manifest.room_id
    && event.m === manifest.manifest_hash
    && event.a === manifest.authority_account_id
    && payer_account_id === event.a);
  const candidateSeal = authoritySeals[0] ?? orderedSeals[0];
  const seenSequences = new Set(input.capabilities.map((capability) => capability.sequence_number));
  for (const record of ordered(input.lifecycle)) {
    const event = record.event;
    const reject = (reason: BallotReplayRejectionReason) => rejections.push({ event_hash: event.e, sequence_number: record.sequence_number, reason });
    if (seenSequences.has(record.sequence_number)) { reject("DUPLICATE_SEQUENCE"); continue; }
    seenSequences.add(record.sequence_number);
    if (record.chunk_count !== 1) { reject("NOT_SINGLE_MESSAGE"); continue; }
    if (event.r !== manifest.room_id) { reject("ROOM_BINDING_INVALID"); continue; }
    if (event.m !== manifest.manifest_hash) { reject("MANIFEST_BINDING_INVALID"); continue; }
    const capability = capabilities.get(event.c);
    if (!capability) { reject("CAPABILITY_NOT_GRANTED"); continue; }
    if (record.sequence_number <= capability.sequence_number) { reject("CAPABILITY_NOT_YET_GRANTED"); continue; }
    if (event.a !== capability.payer_account_id) { reject("CAPABILITY_PAYER_MISMATCH"); continue; }
    if (record.payer_account_id !== event.a) { reject("MIRROR_PAYER_MISMATCH"); continue; }
    if (event.t === "u" && (new Set(event.n).size !== 3 || event.n.some((nomineeId) => !manifest.nominee_ids.includes(nomineeId)))) { reject("NOMINEE_BINDING_INVALID"); continue; }
    if (!inWindow(record.consensus_timestamp, manifest)) { reject("OUTSIDE_WINDOW"); continue; }
    current.set(event.c, event.t === "u" ? event.n : null);
    acceptedEvents.push({ event_hash: event.e, sequence_number: record.sequence_number, event_type: event.t === "u" ? "UPDATE" : "WITHDRAW" });
    maximumAcceptedSequence = Math.max(maximumAcceptedSequence, record.sequence_number);
  }

  const effectiveCutoff = maximumAcceptedSequence;
  const ranking = rankCurrentIntents(manifest, current);
  const resultHash = sealedBallotResultHash(manifest, effectiveCutoff, ranking);
  let seal = null as null | { event_hash: string; sequence_number: number; valid: boolean; reason?: BallotReplayRejectionReason };
  if (candidateSeal) {
    const { event } = candidateSeal;
    const reason = authoritySeals.length > 1 ? "MULTIPLE_SEALS"
      : candidateSeal.chunk_count !== 1 ? "NOT_SINGLE_MESSAGE"
      : event.r !== manifest.room_id ? "ROOM_BINDING_INVALID"
      : event.m !== manifest.manifest_hash ? "MANIFEST_BINDING_INVALID"
      : event.a !== manifest.authority_account_id || candidateSeal.payer_account_id !== event.a ? "SEAL_AUTHORITY_INVALID"
      : event.d !== manifest.deadline ? "SEAL_DEADLINE_INVALID"
      : event.p !== sealedRankingPolicy.policy_id ? "SEAL_POLICY_INVALID"
      : hcsTimestampNanos(candidateSeal.consensus_timestamp) <= isoTimestampNanos(manifest.deadline) ? "SEAL_DEADLINE_INVALID"
      : event.q !== maximumAcceptedSequence || event.q >= candidateSeal.sequence_number ? "SEAL_CUTOFF_INVALID"
      : event.x !== resultHash ? "SEAL_RESULT_HASH_INVALID"
      : null;
    seal = { event_hash: event.e, sequence_number: candidateSeal.sequence_number, valid: reason === null, ...(reason ? { reason } : {}) };
  }

  return {
    cutoff_sequence: effectiveCutoff,
    accepted_events: ordered(acceptedEvents),
    current_intents: [...current.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([capability_event_hash, nominee_ids]) => ({ capability_event_hash, nominee_ids })),
    ranking,
    result_hash: resultHash,
    rejections,
    seal,
  };
}