import { useEffect, useState } from "react";
import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import {
  connectHashPack,
  createReactionEnvelope,
  submitReaction,
  submitPreparedBallot,
  type PreparedBallot,
  type WalletEvidence,
} from "./hedera-wallet";

type WorldIdRequest = {
  action: string;
  action_description: string;
  app_id: `app_${string}`;
  context_token: string;
  rp_context: RpContext;
  room_id: string;
  signal: string;
};

type Room = {
  id: string;
  name: string;
  acceptance_run_id?: string;
  works?: Array<{ id: string }>;
};

type VerificationArtifact = {
  protocol: string;
  identifier: string;
  roomId: string;
  signalMatches: boolean;
};

function getWorldIdErrorMessage(errorCode: string) {
  if (errorCode === "timeout") {
    return "接続が完了しませんでした。World Appの前回結果を閉じてから、新しいQRで再試行してください。";
  }

  return `World ID: ${errorCode}`;
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value)}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const ballotV2Mode = searchParams.get("ballot") === "v2";
  const worldCaptureMode = searchParams.get("capture") === "world" || ballotV2Mode;
  const [request, setRequest] = useState<WorldIdRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IDKitResult | null>(null);
  const [artifact, setArtifact] = useState<VerificationArtifact | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [accountId, setAccountId] = useState("0.0.9706029");
  const [nomineeIds, setNomineeIds] = useState("");
  const [walletEvidence, setWalletEvidence] = useState<WalletEvidence | null>(null);
  const [walletStatus, setWalletStatus] = useState("HashPack未接続");
  const [artifactSha256, setArtifactSha256] = useState("");
  const [artifactReference, setArtifactReference] = useState("");
  const [ballotPreparation, setBallotPreparation] = useState<PreparedBallot | null>(null);
  const [ballotReceipt, setBallotReceipt] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void fetch("/api/rooms")
      .then((response) => response.json())
      .then(({ rooms: availableRooms }: { rooms: Room[] }) => {
        const selectableRooms = ballotV2Mode
          ? availableRooms.filter((room) => room.acceptance_run_id === "reader-demo")
          : availableRooms;
        setRooms(selectableRooms);
        const initialRoom = selectableRooms[0];
        setRoomId(initialRoom?.id ?? "");
        setNomineeIds(initialRoom?.works?.slice(0, 3).map((work) => work.id).join(",") ?? "");
      })
      .catch(() => setError("Room一覧を取得できませんでした。"));
  }, []);

  async function startProof() {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setArtifact(null);
    setLastErrorCode(null);

    try {
      const response = await fetch("/api/world-id/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });
      if (!response.ok) {
        throw new Error("World ID request could not be prepared.");
      }

      setRequest((await response.json()) as WorldIdRequest);
      setIsOpen(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "World ID request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyProof(proof: IDKitResult) {
    const response = await fetch("/api/world-id/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context_token: request?.context_token,
        proof,
        signal: request?.signal,
      }),
    });
    const verification = (await response.json()) as {
      success?: boolean;
      code?: string;
      signal_matches?: boolean;
    };

    if (!response.ok || verification.success !== true) {
      throw new Error(verification.code ?? "World ID proof verification failed.");
    }

    setArtifact({
      protocol: proof.protocol_version,
      identifier: proof.responses[0]?.identifier ?? "unknown",
      roomId: request?.room_id ?? "unknown",
      signalMatches: verification.signal_matches === true,
    });
    if (worldCaptureMode && request) {
      const nominees = nomineeIds.split(",").map((value) => value.trim()).filter(Boolean);
      if (!/^0\.0\.\d+$/.test(accountId) || nominees.length !== 3 || new Set(nominees).size !== 3) {
        throw new Error("Capture requires one Hedera account and three distinct nominee IDs.");
      }
      const captureId = new Date().toISOString().replaceAll(/[:.]/g, "-");
      downloadJson(`oshikatsu-world-capture-input-${captureId}.json`, {
        proof,
        binding: {
          room_id: request.room_id,
          account_id: accountId,
          nominee_ids: nominees,
          action: request.action,
          signal: request.signal,
        },
      });
    }
  }

  async function openHashPack() {
    setError(null);
    setWalletStatus("HashPackで接続を承認してください");
    try {
      await connectHashPack();
      setWalletStatus("接続画面を開きました。HashPackでtestnet accountを選択してください");
    } catch (caughtError) {
      setWalletStatus("HashPack接続失敗");
      setError(caughtError instanceof Error ? caughtError.message : "HashPack connection failed.");
    }
  }

  async function sendReaction() {
    setError(null);
    setWalletEvidence(null);
    setWalletStatus("HashPackでHCS投稿を承認してください");
    try {
      const evidence = await submitReaction(createReactionEnvelope());
      setWalletEvidence(evidence);
      setWalletStatus("Mirror確認済み");
    } catch (caughtError) {
      setWalletStatus("HCS投稿未確認");
      setError(caughtError instanceof Error ? caughtError.message : "HCS submission failed.");
    }
  }

  async function sendBallotV2() {
    setError(null);
    setBallotPreparation(null);
    setBallotReceipt(null);
    setWalletStatus("公開済みartifactを検証してBallot v2を準備中");
    try {
      const nominees = nomineeIds.split(",").map((value) => value.trim()).filter(Boolean);
      if (!roomId || !/^0\.0\.\d+$/.test(accountId) || nominees.length !== 3 || new Set(nominees).size !== 3) {
        throw new Error("Select one DEMO Room, one expected payer, and three distinct ordered nominees.");
      }
      const preparationResponse = await fetch("/api/ballots/v2/prepare-from-artifact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_sha256: artifactSha256,
          artifact_reference: artifactReference,
          room_id: roomId,
          account_id: accountId,
          nominee_ids: nominees,
        }),
      });
      const preparationBody = await preparationResponse.json() as { preparation?: PreparedBallot; error?: string };
      if (!preparationResponse.ok || !preparationBody.preparation) throw new Error(preparationBody.error ?? "Ballot preparation failed.");
      const preparation = preparationBody.preparation;
      setBallotPreparation(preparation);
      setWalletStatus("HashPackでBallot v2投稿を承認してください");
      const transactionId = await submitPreparedBallot(preparation);
      setWalletStatus("Mirror確認中。まだ票には数えません");
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const statusResponse = await fetch(`/api/ballots/status/${encodeURIComponent(transactionId)}?prepare_id=${encodeURIComponent(preparation.id)}`);
        const status = await statusResponse.json() as Record<string, unknown> & { status?: string; error?: string };
        if (!statusResponse.ok) throw new Error(status.error ?? "Ballot status failed.");
        if (status.status === "RECORDED_UNVERIFIED") {
          setBallotReceipt({ ...status, transaction_id: transactionId });
          setWalletStatus("Hedera記録済み・World historical verification待ち");
          return;
        }
        if (status.status === "INVALID") throw new Error(String(status.reason ?? "Ballot is invalid."));
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      throw new Error("Mirror confirmation timed out.");
    } catch (caughtError) {
      setWalletStatus("Ballot v2未確認");
      setError(caughtError instanceof Error ? caughtError.message : "Ballot v2 submission failed.");
    }
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">GATE 0-A · PRODUCTION</p>
        <h1>Oshikatsu</h1>
      </header>
      <section aria-labelledby="proof-heading">
        <h2 id="proof-heading">Proof of Human</h2>
        <p className="lede">World Appで人間性を証明し、投票権を受け取ります。</p>
        <label className="room-field">
          <span>Room</span>
          <select value={roomId} onChange={(event) => { const nextRoom = rooms.find((room) => room.id === event.target.value); setRoomId(event.target.value); setNomineeIds(nextRoom?.works?.slice(0, 3).map((work) => work.id).join(",") ?? ""); }}>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        {worldCaptureMode && <div className="capture-fields"><label className="room-field"><span>Expected Hedera account</span><input value={accountId} onChange={(event) => setAccountId(event.target.value)} /></label><label className="room-field"><span>Ordered nominee IDs</span><input value={nomineeIds} onChange={(event) => setNomineeIds(event.target.value)} placeholder="first,second,third" /></label><p className="message">Before scanning a new QR, close any previous Completed or Failed screen in World App. After successful Portal verification, the raw proof and exact binding download to this device only.</p></div>}
        <button type="button" onClick={startProof} disabled={!roomId || isLoading || isOpen}>
          {isLoading ? "準備中..." : "World IDで証明"}
        </button>
        {error && <p className="message error">{error}</p>}
        {result && <p className="message success">人間証明を受け取りました。</p>}
        {artifact && (
          <dl className="artifact">
            <div>
              <dt>Room</dt>
              <dd>{artifact.roomId}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>{artifact.protocol}</dd>
            </div>
            <div>
              <dt>Credential</dt>
              <dd>{artifact.identifier}</dd>
            </div>
            <div>
              <dt>Signal</dt>
              <dd>{artifact.signalMatches ? "Matched" : "Rejected"}</dd>
            </div>
          </dl>
        )}
      </section>
      {request && (
        <IDKitRequestWidget
          key={request.context_token}
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setRequest(null);
            }
          }}
          app_id={request.app_id}
          action={request.action}
          action_description={request.action_description}
          rp_context={request.rp_context}
          allow_legacy_proofs={false}
          environment="production"
          polling={{ interval: 1_000, timeout: 180_000 }}
          preset={proofOfHuman({ signal: request.signal })}
          handleVerify={verifyProof}
          onSuccess={setResult}
          onError={(errorCode) => {
            setLastErrorCode(errorCode);
            setError(getWorldIdErrorMessage(errorCode));
            setIsOpen(false);
            setRequest(null);
          }}
        />
      )}
      {lastErrorCode && <p className="message error">Diagnostic: {lastErrorCode}</p>}
      <section className="wallet-section" aria-labelledby="wallet-heading">
        <h2 id="wallet-heading">HashPack + HCS</h2>
        <p className="lede">900 bytes以下のReactionを1件だけtestnetへ投稿します。</p>
        <div className="wallet-actions">
          <button type="button" onClick={openHashPack}>HashPackを接続</button>
          <button type="button" onClick={sendReaction}>ReactionをHCSへ投稿</button>
        </div>
        <p className="message">{walletStatus}</p>
        {walletEvidence && (
          <dl className="artifact">
            <div><dt>Payer</dt><dd>{walletEvidence.accountId}</dd></div>
            <div><dt>Bytes</dt><dd>{walletEvidence.messageBytes}</dd></div>
            <div><dt>Sequence</dt><dd>{walletEvidence.sequenceNumber}</dd></div>
            <div><dt>Consensus</dt><dd>{walletEvidence.consensusTimestamp}</dd></div>
          </dl>
        )}
      </section>
      {ballotV2Mode && <section className="wallet-section" aria-labelledby="ballot-v2-heading"><h2 id="ballot-v2-heading">Ballot v2 optimistic receipt</h2><p className="lede">Publish the canonical World artifact at a commit-fixed GitHub raw URL. The API fetches and verifies those exact bytes before HashPack approval. The Hedera receipt remains uncounted until historical verification.</p><label className="room-field artifact-reference-field"><span>Artifact SHA-256</span><input value={artifactSha256} onChange={(event) => { setArtifactSha256(event.target.value.trim().toLowerCase()); setBallotPreparation(null); setBallotReceipt(null); }} placeholder="64 lowercase hex characters" /></label><label className="room-field artifact-reference-field"><span>Commit-fixed artifact URL</span><input type="url" value={artifactReference} onChange={(event) => { setArtifactReference(event.target.value.trim()); setBallotPreparation(null); setBallotReceipt(null); }} placeholder="https://raw.githubusercontent.com/rtree/oshikatsu/&lt;commit&gt;/a/&lt;sha&gt;.json" /></label><button type="button" onClick={() => void sendBallotV2()} disabled={!/^[0-9a-f]{64}$/.test(artifactSha256) || !artifactReference}>Verify artifact and submit Ballot v2</button>{ballotPreparation && <dl className="artifact"><div><dt>Preparation</dt><dd>{ballotPreparation.id}</dd></div><div><dt>Bytes</dt><dd>{ballotPreparation.message_bytes}</dd></div><div><dt>Expected payer</dt><dd>{ballotPreparation.account_id}</dd></div></dl>}{ballotReceipt && <dl className="artifact"><div><dt>Status</dt><dd>{String(ballotReceipt.status)}</dd></div><div><dt>Sequence</dt><dd>{String(ballotReceipt.sequence_number)}</dd></div><div><dt>Payer</dt><dd>{String(ballotReceipt.payer_account_id)}</dd></div><div><dt>Counted</dt><dd>{String(ballotReceipt.counted)}</dd></div></dl>}</section>}
    </main>
  );
}
