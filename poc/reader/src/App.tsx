import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult } from "@worldcoin/idkit";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  HardDrive,
  Home,
  LibraryBig,
  Medal,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
  ExternalLink,
  FileSearch,
  X,
} from "lucide-react";
import { archiveDemoRoom, createDemoRoom, fetchDemoRooms, fetchRoomProjection, fetchRooms, type ConfirmedGrooveEvent, type DemoRoomDuration, type Room, type RoomProjection, type RoomWork } from "./rooms-api";
import { GrooveConfirmationTimeoutError, prepareGroove, waitForGrooveConfirmation, type GrooveStatus } from "./groove-api";
import { getLinkedHashPackAccount, requireHashPackAccount, submitPreparedGroove } from "./hedera-wallet";
import { requestGrooveWorldProof, verifyGrooveWorldProof, type GrooveWorldRequest } from "./world-api";

type View = "home" | "room" | "rankings" | "shelf" | "profile";

type RoomsState =
  | { status: "loading" }
  | { status: "ready"; rooms: Room[] }
  | { status: "empty" }
  | { status: "error"; message: string };

type ProjectionState =
  | { status: "idle" | "loading" }
  | { status: "ready"; projection: RoomProjection }
  | { status: "error" };

type ShelfItem = RoomWork & { room_id: string; room_name: string };
type PendingGrooveConfirmation = { preparationId: string; transactionId: string; roomId: string };

const shelfStorageKey = "oshikatsu-reader-shelf-v1";

function loadShelf() {
  try {
    const stored = JSON.parse(localStorage.getItem(shelfStorageKey) ?? "[]") as unknown;
    return Array.isArray(stored) ? stored.filter((item): item is ShelfItem => Boolean(item && typeof item === "object" && "id" in item && "title" in item && "cover_url" in item && "room_id" in item && "room_name" in item)).slice(0, 3) : [];
  } catch {
    return [];
  }
}

const reactions = [
  { id: "peak", icon: "/assets/ico08.webp", label: "Peak Chapter", count: "8,321" },
  { id: "cried", icon: "/assets/ico12.webp", label: "Cried My Eyes Out", count: "2,482" },
  { id: "precious", icon: "/assets/ico13.webp", label: "Too Precious", count: "7,221" },
  { id: "next", icon: "/assets/ico14.webp", label: "Next Chapter Now", count: "11,832" },
  { id: "week", icon: "/assets/ico15.webp", label: "Chapter of the Week", count: "4,281" },
  { id: "dead", icon: "/assets/ico16.webp", label: "I'm Dead", count: "3,912" },
  { id: "melted", icon: "/assets/ico18.webp", label: "I Melted", count: "2,706" },
  { id: "wrecked", icon: "/assets/ico19.webp", label: "Emotionally Wrecked", count: "6,118" },
  { id: "losing", icon: "/assets/ico20.webp", label: "I'm Losing It", count: "5,430" },
];

type SpecialParticipant = {
  name: string;
  role: string;
  level: number;
  specialty: string;
  bio: string;
  image: string;
  stats: Array<{ label: string; value: string }>;
  discoveries: Array<{ title: string; image: string }>;
};

const specialParticipants: Record<string, SpecialParticipant> = {
  "oshikatsu-team": {
    name: "Mina Kurose",
    role: "Community Builder",
    level: 31,
    specialty: "Hidden-gem curator",
    bio: "Creates welcoming spaces where readers can discover stories and celebrate their passion together.",
    image: "/assets/special-participant-01.webp",
    stats: [
      { label: "Titles discovered", value: "24" },
      { label: "Reviews published", value: "182" },
      { label: "Readers reached", value: "1,842" },
      { label: "Active days", value: "162" },
    ],
    discoveries: [
      { title: "Midnight Awakening", image: "/assets/sample01.webp" },
      { title: "Ember Archive", image: "/assets/sample02.webp" },
      { title: "Blue Signal", image: "/assets/sample03.webp" },
    ],
  },
  "issue-18-team": {
    name: "Ren Asakura",
    role: "Protocol Builder",
    level: 28,
    specialty: "Evidence-driven reviewer",
    bio: "Builds verifiable public infrastructure so every participant vote can be inspected and replayed.",
    image: "/assets/special-participant-02.webp",
    stats: [
      { label: "Titles discovered", value: "19" },
      { label: "Reviews published", value: "143" },
      { label: "Readers reached", value: "1,260" },
      { label: "Active days", value: "118" },
    ],
    discoveries: [
      { title: "Reader's Horizon", image: "/assets/sample04.webp" },
      { title: "The Last Returner", image: "/assets/sample05.webp" },
      { title: "Midnight Awakening", image: "/assets/sample01.webp" },
    ],
  },
};

function participantFor(work: RoomWork) {
  return specialParticipants[work.id] ?? {
    name: work.title,
    role: "Finalist",
    level: 1,
    specialty: "Community nominee",
    bio: "A participating finalist in this Special Room.",
    image: work.cover_url,
    stats: [],
    discoveries: [],
  };
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadline));
}

function formatCountdown(deadline: string, now: number) {
  const remaining = Math.max(0, Date.parse(deadline) - now);
  if (remaining === 0) return "Closed";
  const totalSeconds = Math.ceil(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `Closes in ${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function mirrorTransactionId(transactionId: string) {
  const match = /^(0\.0\.\d+)@(\d+)\.(\d+)$/.exec(transactionId);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : transactionId;
}

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? "brand-logo compact" : "brand-logo"} src="/assets/01_title.png" alt="Oshikatsu - Manga x Otaku x Love" />;
}

function CollectionBrand() {
  return <div className="collection-brand"><BrandLogo /></div>;
}

export function App() {
  const [view, setView] = useState<View>("home");
  const [roomsState, setRoomsState] = useState<RoomsState>({ status: "loading" });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [projectionState, setProjectionState] = useState<ProjectionState>({ status: "idle" });
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedReaction, setSelectedReaction] = useState(reactions[0].id);
  const [shout, setShout] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grooveState, setGrooveState] = useState<"idle" | "connecting" | "preparing" | "approving" | "confirming" | "confirmed">("idle");
  const [grooveError, setGrooveError] = useState<string | null>(null);
  const [grooveEvidence, setGrooveEvidence] = useState<Extract<GrooveStatus, { status: "CONFIRMED" }> | null>(null);
  const [pendingGrooveConfirmation, setPendingGrooveConfirmation] = useState<PendingGrooveConfirmation | null>(null);
  const [worldRequest, setWorldRequest] = useState<GrooveWorldRequest | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>(loadShelf);
  const rooms = roomsState.status === "ready" ? roomsState.rooms : [];
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedWork = selectedRoom?.works.find((work) => work.id === selectedWorkId) ?? selectedRoom?.works[0] ?? null;

  async function loadRooms(signal?: AbortSignal) {
    setRoomsState({ status: "loading" });
    try {
      const loadedRooms = await fetchRooms(signal);
      setRoomsState(loadedRooms.length > 0 ? { status: "ready", rooms: loadedRooms } : { status: "empty" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRoomsState({ status: "error", message: error instanceof Error ? error.message : "Rooms could not be loaded." });
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadRooms(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  useEffect(() => {
    localStorage.setItem(shelfStorageKey, JSON.stringify(shelfItems));
  }, [shelfItems]);

  function toggleTopThree() {
    if (!selectedRoom || !selectedWork) return;
    setShelfItems((current) => {
      const key = `${selectedRoom.id}:${selectedWork.id}`;
      if (current.some((item) => `${item.room_id}:${item.id}` === key)) return current.filter((item) => `${item.room_id}:${item.id}` !== key);
      if (current.length >= 3) return current;
      return [...current, { ...selectedWork, room_id: selectedRoom.id, room_name: selectedRoom.name }];
    });
  }

  function enterRoom(room: Room) {
    setSelectedRoomId(room.id);
    setSelectedWorkId(room.works[0]?.id ?? null);
    setProjectionState({ status: "loading" });
    void loadProjection(room.id);
    setView("room");
  }

  function selectRoom(room: Room, nextView: View = view) {
    setSelectedRoomId(room.id);
    setSelectedWorkId(room.works[0]?.id ?? null);
    setProjectionState({ status: "loading" });
    void loadProjection(room.id);
    setView(nextView);
  }

  function navigate(nextView: View) {
    if (nextView === "rankings") {
      const room = selectedRoom ?? rooms.find((candidate) => candidate.id === "lisbon-main") ?? rooms[0];
      if (room) selectRoom(room, "rankings");
      else setView("rankings");
      return;
    }
    setView(nextView);
  }

  async function loadProjection(roomId: string) {
    try {
      const projection = await fetchRoomProjection(roomId);
      setProjectionState({ status: "ready", projection });
    } catch {
      setProjectionState({ status: "error" });
    }
  }

  async function confirmSubmittedGroove(pending: PendingGrooveConfirmation) {
    try {
      setGrooveError(null);
      setGrooveState("confirming");
      const evidence = await waitForGrooveConfirmation(pending.preparationId, pending.transactionId);
      setPendingGrooveConfirmation(null);
      setGrooveEvidence(evidence);
      setGrooveState("confirmed");
      await loadProjection(pending.roomId);
    } catch (error) {
      if (!(error instanceof GrooveConfirmationTimeoutError)) setPendingGrooveConfirmation(null);
      setGrooveError(error instanceof Error ? error.message : "Shout confirmation failed.");
      setGrooveState("idle");
    }
  }

  async function submitGroove() {
    if (pendingGrooveConfirmation) {
      await confirmSubmittedGroove(pendingGrooveConfirmation);
      return;
    }
    if (!selectedRoom || !selectedWork) return;
    setGrooveError(null);
    setGrooveEvidence(null);
    let connectedAccount: Awaited<ReturnType<typeof requireHashPackAccount>> | null = null;
    try {
      setGrooveState("connecting");
      const account = await requireHashPackAccount();
      connectedAccount = account;
      setGrooveState("preparing");
      const preparation = await prepareGroove({
        room_id: selectedRoom.id,
        work_id: selectedWork.id,
        account_id: account.accountId,
        reaction_id: selectedReaction,
        ...(shout ? { shout } : {}),
      });
      setGrooveState("approving");
      const transactionId = await submitPreparedGroove(preparation, account.signerAccountId);
      const pending = { preparationId: preparation.id, transactionId, roomId: selectedRoom.id };
      setPendingGrooveConfirmation(pending);
      await confirmSubmittedGroove(pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shout submission failed.";
      if (message === "WORLD_PROOF_REQUIRED" && selectedRoom) {
        try {
          const account = connectedAccount ?? await requireHashPackAccount();
          setWorldRequest(await requestGrooveWorldProof(selectedRoom.id, account.accountId));
          setWorldOpen(true);
          setGrooveError("Your first Shout in this DEMO Room needs one World human proof.");
          setGrooveState("idle");
          return;
        } catch (worldError) {
          setGrooveError(worldError instanceof Error ? worldError.message : "World proof request failed.");
          setGrooveState("idle");
          return;
        }
      }
      setGrooveError(message);
      setGrooveState("idle");
    }
  }

  async function verifyFirstShoutHuman(proof: IDKitResult) {
    if (!worldRequest) throw new Error("World proof request is missing.");
    await verifyGrooveWorldProof(worldRequest, proof);
    setWorldOpen(false);
    setWorldRequest(null);
    setGrooveError(null);
    void submitGroove();
  }

  return (
    <div className="reader-app">
      {view === "home" && <HomeView roomsState={roomsState} onEnterRoom={enterRoom} onRetry={() => void loadRooms()} />}
      {view === "room" && selectedRoom && selectedWork && (
        <RoomView
          room={selectedRoom}
          work={selectedWork}
          selectedWorkId={selectedWorkId}
          projectionState={projectionState}
          onBack={() => setView("home")}
          onSelectWork={setSelectedWorkId}
          onOpenGroove={() => setDialogOpen(true)}
          onToggleShelf={toggleTopThree}
          inShelf={shelfItems.some((item) => item.room_id === selectedRoom.id && item.id === selectedWork.id)}
        />
      )}
      {view === "rankings" && <RankingsView rooms={rooms} selectedRoom={selectedRoom} projectionState={projectionState} onSelectRoom={(room) => selectRoom(room, "rankings")} />}
      {view === "shelf" && <ShelfView items={shelfItems} onRemove={(roomId, workId) => setShelfItems((current) => current.filter((item) => item.room_id !== roomId || item.id !== workId))} />}
      {view === "profile" && <ProfileView onRoomsChanged={() => void loadRooms()} />}

      <BottomNav view={view} onNavigate={navigate} />

      {dialogOpen && selectedWork && (
        <GrooveDialog
          reaction={selectedReaction}
          shout={shout}
          work={selectedWork}
          onClose={() => setDialogOpen(false)}
          onReactionChange={setSelectedReaction}
          onShoutChange={setShout}
          onSubmit={() => void submitGroove()}
          state={grooveState}
          error={grooveError}
          evidence={grooveEvidence}
          retryConfirmation={pendingGrooveConfirmation !== null}
        />
      )}
      {worldRequest && <IDKitRequestWidget
        key={worldRequest.context_token}
        open={worldOpen}
        onOpenChange={(open) => setWorldOpen(open)}
        app_id={worldRequest.app_id}
        action={worldRequest.action}
        action_description={worldRequest.action_description}
        rp_context={worldRequest.rp_context}
        allow_legacy_proofs={false}
        environment="production"
        polling={{ interval: 1_000, timeout: 180_000 }}
        preset={proofOfHuman({ signal: worldRequest.signal })}
        handleVerify={verifyFirstShoutHuman}
        onSuccess={() => undefined}
        onError={(code) => {
          setGrooveError(`World ID: ${code}`);
          setWorldOpen(false);
          setWorldRequest(null);
        }}
      />}
    </div>
  );
}

function HomeView({ roomsState, onEnterRoom, onRetry }: { roomsState: RoomsState; onEnterRoom: (room: Room) => void; onRetry: () => void }) {
  const featuredRoom = roomsState.status === "ready" ? roomsState.rooms.find((room) => room.id === "lisbon-main") ?? roomsState.rooms.find((room) => room.phase === "LIVE") : undefined;
  const specialRoom = roomsState.status === "ready" ? roomsState.rooms.find((room) => room.room_type === "SPECIAL_TEAM") : undefined;
  return (
    <main className="page home-page">
      <header className="brand-bar">
        <BrandLogo />
        <a className="account-pill" href="https://ethglobal-lisbon2026-oshikatsu.web.app/?wallet-test=1"><span className="live-dot" /> Start My Oshikatsu</a>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <img src="/assets/room-stage.webp" alt="Readers gathering in a luminous manga event venue" />
        <div className="home-hero-shade" />
        <div className="home-hero-content">
          <p className="kicker">WEEKLY CHAPTER DROP · LIVE NOW</p>
          <h1 id="home-title">Read together.<br />Lose it together.</h1>
          <p className="hero-copy">Five new chapters. One shared night. Enter the Room and find the story everyone is shouting about.</p>
          <div className="hero-actions"><button className="primary-action" type="button" onClick={() => featuredRoom && onEnterRoom(featuredRoom)} disabled={!featuredRoom}>Join the Groove <Sparkles size={20} /></button><button className="browse-action" type="button" onClick={() => document.getElementById("rooms-title")?.scrollIntoView({ behavior: "smooth" })}>Browse First</button></div>
          <div className="live-stats">
            <span><UsersRound size={17} /> {roomsState.status === "ready" ? `${roomsState.rooms.length} durable Room${roomsState.rooms.length === 1 ? "" : "s"}` : "Room count unavailable"}</span>
            <span><Clock3 size={17} /> {featuredRoom ? `Closes ${formatDeadline(featuredRoom.deadline)}` : "Room schedule unavailable"}</span>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="rooms-title">
        <div className="section-heading">
          <div><p className="kicker">ROOMS</p><h2 id="rooms-title">Tonight's shared moments</h2></div>
          <button className="text-action" type="button">View all</button>
        </div>
        {roomsState.status === "loading" && <p className="room-list-status" role="status">Loading Rooms...</p>}
        {roomsState.status === "empty" && <p className="room-list-status">No Rooms are open yet.</p>}
        {roomsState.status === "error" && <div className="room-list-status" role="alert"><span>Rooms could not be loaded.</span><button className="text-action" type="button" onClick={onRetry}>Retry</button></div>}
        {roomsState.status === "ready" && roomsState.rooms.filter((room) => room.room_type === "MANGA").map((room) => (
          <button className={room.phase === "LIVE" ? "room-row live-room" : "room-row"} type="button" onClick={() => onEnterRoom(room)} key={room.id}>
            <img src={room.works[0]?.cover_url} alt={`${room.works[0]?.title ?? room.name} cover`} />
            <span className="room-row-copy"><strong>{room.name}</strong><small>Lineup locked · {room.works.length} works</small></span>
            <span className={room.phase === "LIVE" ? "phase-badge" : "phase-badge upcoming"}>{room.phase === "LIVE" && <span className="live-dot" />} {room.phase}</span>
          </button>
        ))}
      </section>

      {specialRoom && <section className="special-room" aria-labelledby="special-room-title"><img className="special-room-art" src="/assets/room-stage.webp" alt="A live audience raising glow sticks at a finalist ceremony" /><div className="special-room-shade" /><div className="special-room-copy"><p className="kicker gold">PARTICIPANT VOTE · {specialRoom.phase}</p><h2 id="special-room-title">{specialRoom.name}</h2><p>Meet the finalists and vote for the person you want to support. Your latest Mirror-confirmed Shout is your current participant vote.</p><div className="special-room-facts"><span><UsersRound size={16} /> {specialRoom.works.length} finalists</span><span><MessageCircle size={16} /> Public Hedera vote</span><span><Clock3 size={16} /> Closes {formatDeadline(specialRoom.deadline)}</span></div><div className="special-team-preview" aria-label="Participating finalists">{specialRoom.works.slice(0, 4).map((work) => { const participant = participantFor(work); return <figure key={work.id}><img src={participant.image} alt={participant.name} /><figcaption><strong>{participant.name}</strong><span>{participant.role}</span></figcaption></figure>; })}</div><button type="button" className="ceremony-action" onClick={() => onEnterRoom(specialRoom)}>Meet the finalists <ArrowLeft className="forward-arrow" size={18} /></button></div></section>}
    </main>
  );
}

type RoomViewProps = {
  room: Room;
  work: RoomWork;
  selectedWorkId: string | null;
  projectionState: ProjectionState;
  onBack: () => void;
  onSelectWork: (id: string) => void;
  onOpenGroove: () => void;
  onToggleShelf: () => void;
  inShelf: boolean;
};

function RoomView({ room, work, selectedWorkId, projectionState, onBack, onSelectWork, onOpenGroove, onToggleShelf, inShelf }: RoomViewProps) {
  const events = projectionState.status === "ready" ? projectionState.projection.groove : [];
  const isSpecial = room.room_type === "SPECIAL_TEAM";
  const selectedParticipant = participantFor(work);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const closed = now > Date.parse(room.deadline);
  return (
    <main className={isSpecial ? "page room-page special-room-page" : "page room-page"}>
      <header className="room-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to Home"><ArrowLeft /></button>
        <BrandLogo compact />
        <div><p className="kicker">{room.phase} ROOM</p><strong>{room.name}</strong></div>
        <span className="phase-badge">{room.phase === "LIVE" && <span className="live-dot" />} {room.phase}</span>
      </header>

      <div className="room-layout">
        <aside className="lineup-panel" aria-labelledby="lineup-title">
          <div className="panel-heading"><div><p className="kicker">{isSpecial ? "FINALISTS" : "LINEUP LOCKED"}</p><h2 id="lineup-title">{isSpecial ? "Participant Vote" : "Tonight's Lineup"}</h2></div><span>{room.works.length} {isSpecial ? "people" : "works"}</span></div>
          <div className="lineup-list">
            {room.works.map((item, index) => { const participant = participantFor(item); return (
              <button className={item.id === selectedWorkId ? "lineup-item selected" : "lineup-item"} type="button" key={item.id} onClick={() => onSelectWork(item.id)}>
                <span className="lineup-rank">{String(index + 1).padStart(2, "0")}</span>
                <img src={isSpecial ? participant.image : item.cover_url} alt={isSpecial ? participant.name : `${item.title} cover`} />
                <span><strong>{isSpecial ? participant.name : item.title}</strong><small>{isSpecial ? participant.role : item.chapter}</small></span>
              </button>
            ); })}
          </div>
        </aside>

        <section className="work-stage" aria-labelledby="work-title">
          <img className="work-art" src={isSpecial ? selectedParticipant.image : work.hero_url ?? work.cover_url} alt={isSpecial ? `${selectedParticipant.name}, participant finalist` : `${work.title} featured artwork`} />
          <div className="work-vignette" />
          {isSpecial && <div className="work-intro special-intro">
            <p className="kicker gold">SELECTED FINALIST</p>
            <h1 id="work-title">{selectedParticipant.name}</h1>
            <p>{selectedParticipant.role} · {projectionState.status === "ready" ? `${events.length} confirmed Shout${events.length === 1 ? "" : "s"}` : "Activity unavailable"}</p>
            <p className="participant-bio">{selectedParticipant.bio}</p>
          </div>}
          <div className="work-copy">
            {!isSpecial && <div className="work-intro"><p className="kicker">NOW IN THE GROOVE</p><h1 id="work-title">{work.title}</h1><p>{work.chapter} · {projectionState.status === "ready" ? `${events.length} confirmed Shout${events.length === 1 ? "" : "s"}` : "Activity unavailable"}</p></div>}
            {isSpecial && <section className="participant-profile" aria-label={`${selectedParticipant.name} demo profile`}>
              <div className="participant-profile-heading"><div><span>DEMO PROFILE</span><strong>Lv.{selectedParticipant.level}</strong></div><p>{selectedParticipant.specialty}</p></div>
              <dl className="participant-stats">{selectedParticipant.stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
              <div className="participant-discoveries"><div><BookOpen size={17} /><strong>Books discovered</strong><span>Mock highlights</span></div><ul>{selectedParticipant.discoveries.map((discovery) => <li key={discovery.title}><img src={discovery.image} alt="" /><span>{discovery.title}</span></li>)}</ul></div>
            </section>}
            <div className="room-facts"><span><UsersRound size={16} /> One current Shout per wallet</span><span className={closed ? "deadline closed" : "deadline"}><Clock3 size={16} /> {formatCountdown(room.deadline, now)}</span></div>
            {!isSpecial && <a className="read-link" href={work.reading_url} target="_blank" rel="noreferrer"><BookOpen size={18} /> Read Official Chapter</a>}
          </div>
          <div className="work-actions">
            <button className="primary-action" type="button" onClick={onOpenGroove}>{closed ? "Shout · not counted" : isSpecial ? "Vote for this participant" : "Osu!"} <MessageCircle size={20} /></button>
            {!isSpecial && <button className={inShelf ? "secondary-action active" : "secondary-action"} type="button" onClick={onToggleShelf}>{inShelf ? "Remove from My Shelf" : "Add to My Shelf"}</button>}
          </div>
        </section>

        <aside className="groove-panel" aria-labelledby="groove-title">
          <div className="panel-heading"><div><p className="kicker">CONFIRMED ON HEDERA</p><h2 id="groove-title">Groove Wave</h2></div><span>{projectionState.status === "ready" ? events.length : "—"}</span></div>
          {projectionState.status === "loading" && <p className="dialog-note" role="status">Loading confirmed events...</p>}
          {projectionState.status === "error" && <p className="dialog-note" role="alert">Groove evidence unavailable.</p>}
          {projectionState.status === "ready" && events.length === 0 && <p className="dialog-note">No confirmed Shouts yet.</p>}
          {projectionState.status === "ready" && <div className="shout-feed">{events.map((event) => { const eventWork = room.works.find((candidate) => candidate.id === event.work_id) ?? null; const participant = eventWork ? participantFor(eventWork) : null; return <GrooveEvidence event={event} work={eventWork} displayImage={isSpecial ? participant?.image : eventWork?.cover_url} displayTitle={isSpecial ? participant?.name : eventWork?.title} key={event.prepare_id} />; })}</div>}
        </aside>
      </div>
    </main>
  );
}

function GrooveEvidence({ event, work, displayImage, displayTitle }: { event: ConfirmedGrooveEvent; work: RoomWork | null; displayImage?: string; displayTitle?: string }) {
  const [expanded, setExpanded] = useState(false);
  let message: { r?: string; m?: string; a?: string; s?: string; c?: string } = {};
  try {
    message = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(event.message_base64), (character) => character.charCodeAt(0)))) as { r?: string; m?: string; a?: string; s?: string; c?: string };
  } catch {
    message = {};
  }
  const reaction = reactions.find((item) => item.id === message.s);
  const late = event.projection_state === "LATE";
  const evidenceId = `evidence-${event.event_hash}`;
  return <article className={late ? "shout-row late" : "shout-row"}>
    {displayImage && <img className="shout-cover" src={displayImage} alt={displayTitle ?? work?.title ?? "Vote target"} />}
    <div className="shout-content"><span>{late ? "LATE · NOT COUNTED" : `HEDERA CONFIRMED · SEQUENCE #${event.sequence_number}`}</span><b>{displayTitle ?? work?.title ?? event.work_id}</b><strong>{reaction && <img src={reaction.icon} alt="" />}{reaction?.label ?? "Confirmed reaction"}</strong>{message.c && <p>{message.c}</p>}<button className="evidence-toggle" type="button" aria-expanded={expanded} aria-controls={evidenceId} onClick={() => setExpanded((current) => !current)}><FileSearch size={15} /> Evidence</button></div>
    {expanded && <section className="shout-evidence" id={evidenceId}><h3>Shout evidence</h3><p>This wallet-signed Shout was matched to one exact Hedera topic message. It proves the payer and message bytes recorded on HCS; it is not a Ballot v2 record.</p><dl><div><dt>Payer</dt><dd>{event.payer_account_id}</dd></div><div><dt>Topic</dt><dd>{event.topic_id}</dd></div><div><dt>Consensus</dt><dd>{event.consensus_timestamp}</dd></div><div><dt>Event hash</dt><dd>{event.event_hash}</dd></div></dl><h4>World grant binding</h4><p className="grant-note">The API checked this Room-scoped eligibility before preparing the first Shout. Later Shouts inherit that eligibility; raw World proof is not reused or exposed.</p><dl className="grant-fields"><div><dt>Scope</dt><dd>FIRST_SHOUT_GATE</dd></div><div><dt>Room</dt><dd>{message.r ?? event.room_id}</dd></div><div><dt>Manifest</dt><dd>{message.m ?? "Not decoded"}</dd></div><div><dt>Wallet</dt><dd>{message.a ?? event.payer_account_id}</dd></div><div><dt>Reuse</dt><dd>Same Room + manifest + payer</dd></div><div><dt>Nullifier commitment</dt><dd>Service-held · not exposed by current API</dd></div><div><dt>Verified at</dt><dd>Service-held · not exposed by current API</dd></div><div><dt>Attestation</dt><dd>Service-attested; not independently replayable from this row</dd></div></dl><p className="later-proof-note"><strong>Independent later verification:</strong> Ballot v2 commits the public artifact and World anchor needed for replay.</p><div className="evidence-links"><a href={`https://testnet.mirrornode.hedera.com/api/v1/topics/${event.topic_id}/messages/${event.sequence_number}`} target="_blank" rel="noreferrer">Topic message <ExternalLink size={13} /></a><a href={`https://testnet.mirrornode.hedera.com/api/v1/transactions/${mirrorTransactionId(event.transaction_id)}`} target="_blank" rel="noreferrer">Transaction <ExternalLink size={13} /></a></div></section>}
  </article>;
}

type GrooveDialogProps = {
  reaction: string;
  shout: string;
  work: RoomWork;
  onClose: () => void;
  onReactionChange: (id: string) => void;
  onShoutChange: (value: string) => void;
  onSubmit: () => void;
  state: "idle" | "connecting" | "preparing" | "approving" | "confirming" | "confirmed";
  error: string | null;
  evidence: Extract<GrooveStatus, { status: "CONFIRMED" }> | null;
  retryConfirmation: boolean;
};

function GrooveDialog({ reaction, shout, work, onClose, onReactionChange, onShoutChange, onSubmit, state, error, evidence, retryConfirmation }: GrooveDialogProps) {
  const shoutBytes = new TextEncoder().encode(shout).length;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeDialog = useEffectEvent(onClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function updateShout(value: string) {
    onShoutChange([...value].slice(0, 200).join(""));
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="groove-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="kicker">SEND TO THE GROOVE</p><h2 id="dialog-title">How did {work.title} hit you?</h2></div><button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Close"><X /></button></header>
        <div className="reaction-grid">
          {reactions.map((item) => (
            <button className={reaction === item.id ? "reaction-option selected" : "reaction-option"} type="button" key={item.id} onClick={() => onReactionChange(item.id)} aria-pressed={reaction === item.id}>
              <img src={item.icon} alt="" /><span>{item.label}</span>
            </button>
          ))}
        </div>
        <label className="shout-field"><span>Shout</span><textarea value={shout} onChange={(event) => updateShout(event.target.value)} placeholder="Drop your post-chapter scream..." /><small>{[...shout].length}/200 · {shoutBytes}/600 UTF-8 bytes</small></label>
        <button className="primary-action full" type="button" onClick={onSubmit} disabled={(!retryConfirmation && (shoutBytes === 0 || shoutBytes > 600)) || !["idle", "confirmed"].includes(state)}>{state === "idle" ? retryConfirmation ? "Retry confirmation" : "Send Shout" : state === "connecting" ? "Connecting HashPack..." : state === "preparing" ? "Checking Room eligibility" : state === "approving" ? "Approve in HashPack" : state === "confirming" ? "Confirming on Mirror" : "Send another Shout"} <Sparkles size={20} /></button>
        {error && <p className="dialog-note" role="alert">{error}</p>}
        {evidence && <p className="dialog-note" role="status">Sequence #{evidence.sequence_number} · {evidence.message_bytes} bytes · {evidence.payer_account_id}</p>}
        <p className="dialog-note">You can Shout again. Your latest HCS-confirmed Shout becomes current for this Room; this wallet rule is not proof of one human, one vote.</p>
      </section>
    </div>
  );
}

function RankingsView({ rooms, selectedRoom, projectionState, onSelectRoom }: { rooms: Room[]; selectedRoom: Room | null; projectionState: ProjectionState; onSelectRoom: (room: Room) => void }) {
  const ranking = projectionState.status === "ready" ? projectionState.projection.ranking : [];
  const formal = projectionState.status === "ready" ? projectionState.projection.ballot.rankings : null;
  const formalRecordCount = formal ? formal.summary.recorded_unverified + formal.summary.unverifiable + formal.summary.verified + formal.summary.invalid : 0;
  return (
    <main className="page collection-page">
      <CollectionBrand />
      <header className="collection-header"><p className="kicker">ONE WALLET · ONE CURRENT SHOUT</p><h1>Rankings</h1><p>Each Room ranks the latest HCS-confirmed Shout from each payer. This is a wallet-based demo vote.</p></header>
      <label className="room-selector"><span>Room</span><select value={selectedRoom?.id ?? ""} onChange={(event) => { const room = rooms.find((candidate) => candidate.id === event.target.value); if (room) onSelectRoom(room); }}>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>
      {selectedRoom && <section className="pending-result"><Trophy /><div><p className="kicker gold">{selectedRoom.phase === "LIVE" ? "PROVISIONAL" : selectedRoom.phase}</p><h2>{selectedRoom.name}</h2><p>{projectionState.status === "ready" ? `${projectionState.projection.confirmed_shout_count} confirmed Shout${projectionState.projection.confirmed_shout_count === 1 ? "" : "s"}` : "Ranking evidence is loading."}</p></div><span>{selectedRoom.phase}</span></section>}
      {projectionState.status === "error" && <p className="room-list-status" role="alert">Ranking unavailable.</p>}
      {projectionState.status === "loading" && <p className="room-list-status" role="status">Loading Room ranking...</p>}
      {selectedRoom && projectionState.status === "ready" && <section className="ranking-preview" aria-labelledby="ranking-preview-title"><div className="section-heading"><div><p className="kicker">ROOM RESULT</p><h2 id="ranking-preview-title">Confirmed Shouts</h2></div></div>{ranking.map((entry) => { const work = selectedRoom.works.find((candidate) => candidate.id === entry.work_id); if (!work) return null; return <div className="ranking-row" key={work.id}><strong>{entry.rank}</strong><img src={work.cover_url} alt="" /><span><b>{work.title}</b><small>{entry.shout_count} Shout{entry.shout_count === 1 ? "" : "s"}</small></span><em>{entry.tied ? "Tied" : selectedRoom.phase === "LIVE" ? "Provisional" : "Final"}</em></div>;})}</section>}
      {selectedRoom && formal && formalRecordCount > 0 && <section className="formal-ranking" aria-labelledby="formal-ranking-title"><div className="section-heading"><div><p className="kicker">FORMAL PROTOCOL PREVIEW</p><h2 id="formal-ranking-title">Provisional and verified</h2></div><span>{formal.policy.policy_id}</span></div><p className="formal-ranking-note">Provisional includes recorded or currently unverifiable ballots. Verified preview includes only historically verified ballots. The preview policy is not manifest-bound and is not a sealed result.</p><div className="formal-ranking-columns"><FormalRanking title={formal.provisional.label} entries={formal.provisional.entries} room={selectedRoom} /><FormalRanking title={formal.verified.label} entries={formal.verified.entries} room={selectedRoom} /></div><p className="formal-ranking-summary">Recorded {formal.summary.recorded_unverified} · Unverifiable {formal.summary.unverifiable} · Verified {formal.summary.verified} · Invalid {formal.summary.invalid}</p></section>}
    </main>
  );
}

function FormalRanking({ title, entries, room }: { title: string; entries: RoomProjection["ballot"]["rankings"]["provisional"]["entries"]; room: Room }) {
  return <section><h3>{title}</h3>{entries.map((entry) => { const work = room.works.find((candidate) => candidate.id === entry.nominee_id); return <div className="formal-ranking-row" key={entry.nominee_id}><strong>{entry.rank}</strong><span>{work?.title ?? entry.nominee_id}</span><em>{entry.points} pts{entry.tied ? " · tied" : ""}</em></div>;})}</section>;
}

function ShelfView({ items, onRemove }: { items: ShelfItem[]; onRemove: (roomId: string, workId: string) => void }) {
  return (
    <main className="page collection-page shelf-page">
      <CollectionBrand />
      <header className="collection-header shelf-header"><div><p className="kicker">MY OSHIKATSU</p><h1>My Shelf</h1><p>Keep up to three favorites from any Room on this device.</p></div><div className="shelf-capacity" aria-label={`${items.length} of 3 Shelf slots used`}><strong>{items.length}</strong><span>/ 3 saved</span></div></header>
      <section className="shelf-grid" aria-label="My Top 3">{[0,1,2].map((slot)=>{const work=items[slot];return <article className={work ? "shelf-slot filled" : "shelf-slot empty"} key={slot}>{work?<><div className="shelf-cover"><img src={work.cover_url} alt={`${work.title} cover`} /><span>#{slot+1}</span><button type="button" onClick={() => onRemove(work.room_id, work.id)} aria-label={`Remove ${work.title} from My Shelf`}><Plus /></button></div><strong>{work.title}</strong><small>{work.room_name}</small></>:<><div className="empty-cover"><img src="/assets/room-stage.webp" alt="" /><span><Plus /><b>Open slot</b></span></div><strong>Pick from a Room</strong><small>Use Add to My Shelf</small></>}</article>})}</section>
      <section className="history-strip shelf-local-note"><HardDrive /><div><p className="kicker">LOCAL SHELF</p><h2>Saved only in this browser</h2><p>Shelf picks are not protocol data and never affect Room rankings. Only a Mirror-confirmed Shout is counted.</p></div></section>
    </main>
  );
}

type DemoRoomsState =
  | { status: "loading"; rooms: Room[] }
  | { status: "ready"; rooms: Room[] }
  | { status: "working"; rooms: Room[] }
  | { status: "error"; rooms: Room[]; message: string };

function ProfileView({ onRoomsChanged }: { onRoomsChanged: () => void }) {
  const [demoRooms, setDemoRooms] = useState<DemoRoomsState>({ status: "loading", rooms: [] });
  const [duration, setDuration] = useState<DemoRoomDuration>("5m");
  const [walletAccount, setWalletAccount] = useState<string | null | undefined>(undefined);

  async function refreshDemoRooms() {
    try { setDemoRooms({ status: "ready", rooms: await fetchDemoRooms() }); }
    catch (error) { setDemoRooms((current) => ({ status: "error", rooms: current.rooms, message: error instanceof Error ? error.message : "Demo Rooms unavailable." })); }
  }

  useEffect(() => { void refreshDemoRooms(); void getLinkedHashPackAccount().then((account) => setWalletAccount(account?.accountId ?? null)); }, []);

  async function handleCreateDemoRoom() {
    setDemoRooms((current) => ({ status: "working", rooms: current.rooms }));
    try { await createDemoRoom(duration); await refreshDemoRooms(); onRoomsChanged(); }
    catch (error) { setDemoRooms((current) => ({ status: "error", rooms: current.rooms, message: error instanceof Error ? error.message : "Demo Room creation failed." })); }
  }

  async function handleArchiveDemoRoom(room: Room) {
    setDemoRooms((current) => ({ status: "working", rooms: current.rooms }));
    try { await archiveDemoRoom(room); await refreshDemoRooms(); onRoomsChanged(); }
    catch (error) { setDemoRooms((current) => ({ status: "error", rooms: current.rooms, message: error instanceof Error ? error.message : "Demo Room archive failed." })); }
  }

  return (
    <main className="page collection-page profile-page">
      <CollectionBrand />
      <header className="profile-hero"><img src="/assets/room-stage.webp" alt="Readers gathered at an Oshikatsu event" /><div className="profile-hero-shade" /><div className="profile-hero-copy"><div className="profile-avatar"><img src="/assets/profile-avatar.webp" alt="Reader avatar" /></div><p className="kicker">MY PROFILE</p><h1>Guest Reader</h1></div></header>
      <section className="demo-room-tools" aria-labelledby="demo-room-title">
        <div className="section-heading"><div><p className="kicker gold">DEMO TOOLS</p><h2 id="demo-room-title">Create a Room for the demo</h2></div><button className="primary-action" type="button" onClick={() => void handleCreateDemoRoom()} disabled={demoRooms.status === "working" || demoRooms.rooms.length >= 3}><Plus size={18} /> {demoRooms.status === "working" ? "Working..." : "Create random Room"}</button></div>
        <label className="demo-duration"><span>Room duration</span><select value={duration} onChange={(event) => setDuration(event.target.value as DemoRoomDuration)}><option value="2m">2 minutes</option><option value="3m">3 minutes</option><option value="5m">5 minutes</option><option value="10m">10 minutes</option><option value="1h">1 hour</option><option value="1d">1 day</option></select></label>
        <p className="demo-room-note">Creates a DEMO Room with a random title and three random manga. Archive removes it from active lists while retaining immutable evidence.</p>
        {demoRooms.status === "loading" && <p role="status">Loading your demo Rooms...</p>}
        {demoRooms.status === "error" && <p className="demo-room-error" role="alert">{demoRooms.message}</p>}
        {demoRooms.status !== "loading" && demoRooms.rooms.length === 0 && <p className="demo-room-empty">No demo Rooms created in this browser yet.</p>}
        <div className="demo-room-list">{demoRooms.rooms.map((room) => <article key={room.id}><div><span>DEMO · {room.phase}</span><strong>{room.name.replace(/^DEMO · /, "")}</strong><small>{room.works.map((work) => work.title).join(" · ")}</small></div><button type="button" onClick={() => void handleArchiveDemoRoom(room)} disabled={demoRooms.status === "working"}>Archive</button></article>)}</div>
      </section>
      <section className="profile-status" aria-labelledby="profile-status-title"><div className="section-heading"><div><p className="kicker">AVAILABILITY</p><h2 id="profile-status-title">What this Reader knows</h2></div><ShieldCheck /></div><div className="profile-status-list"><p><CheckCircle2 /><span><strong>Local Shelf</strong><small>Stored in this browser only</small></span><b>Available</b></p><p><UserRound /><span><strong>Wallet identity</strong><small>{walletAccount ? <a href={`https://hashscan.io/testnet/account/${walletAccount}`} target="_blank" rel="noreferrer">{walletAccount} <ExternalLink size={12} /></a> : walletAccount === undefined ? "Checking HashPack session" : "No active HashPack session"}</small></span><b>{walletAccount ? "Linked" : walletAccount === undefined ? "Checking" : "Not linked"}</b></p><p><Medal /><span><strong>Badges and achievements</strong><small>No verified achievement backend</small></span><b>Unavailable</b></p><p><Clock3 /><span><strong>Personal Shout history</strong><small>Room activity is not assembled into a profile</small></span><b>Unavailable</b></p></div></section>
      <section className="profile-empty"><MessageCircle /><div><p className="kicker">ROOM-FIRST ACTIVITY</p><h2>Your Shouts stay with the Room</h2><p>Confirmed events can appear in each Room's Groove Wave. This page does not infer ownership, totals, reputation, or proof of personhood from those public events.</p></div></section>
    </main>
  );
}

function BottomNav({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const items: Array<{ id: View; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <Home /> },
    { id: "rankings", label: "Rankings", icon: <Medal /> },
    { id: "shelf", label: "My Shelf", icon: <LibraryBig /> },
    { id: "profile", label: "Profile", icon: <UserRound /> },
  ];
  const activeView = view === "room" ? "home" : view;
  return <nav className="bottom-nav" aria-label="Primary navigation">{items.map((item) => <button type="button" key={item.id} className={activeView === item.id ? "active" : ""} aria-current={activeView === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>;
}
