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

export function App() {
  const [request, setRequest] = useState<WorldIdRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IDKitResult | null>(null);
  const [artifact, setArtifact] = useState<VerificationArtifact | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [walletEvidence, setWalletEvidence] = useState<WalletEvidence | null>(null);
  const [walletStatus, setWalletStatus] = useState("HashPack未接続");

  useEffect(() => {
    void fetch("/api/rooms")
      .then((response) => response.json())
      .then(({ rooms: availableRooms }: { rooms: Room[] }) => {
        setRooms(availableRooms);
        setRoomId(availableRooms[0]?.id ?? "");
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
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
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
          polling={{ interval: 1_000, timeout: 60_000 }}
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
    </main>
  );
}
