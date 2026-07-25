import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Clock3,
  Home,
  LibraryBig,
  Medal,
  MessageCircle,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { createRoom, fetchRoomProjection, fetchRooms, type ConfirmedGrooveEvent, type Room, type RoomWork } from "./rooms-api";
import { prepareGroove, waitForGrooveConfirmation, type GrooveStatus } from "./groove-api";

type View = "home" | "room" | "rankings" | "shelf" | "profile";

type RoomsState =
  | { status: "loading" }
  | { status: "ready"; rooms: Room[] }
  | { status: "empty" }
  | { status: "error"; message: string };

type ProjectionState =
  | { status: "idle" | "loading" }
  | { status: "ready"; events: ConfirmedGrooveEvent[] }
  | { status: "error" };

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

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadline));
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
  const [ballotOpen, setBallotOpen] = useState(false);
  const [topThree, setTopThree] = useState<string[]>([]);
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

  function toggleTopThree() {
    if (!selectedWork) return;
    setTopThree((current) => {
      if (current.includes(selectedWork.id)) return current.filter((id) => id !== selectedWork.id);
      if (current.length >= 3) return current;
      return [...current, selectedWork.id];
    });
  }

  function enterRoom(room: Room) {
    setSelectedRoomId(room.id);
    setSelectedWorkId(room.works[0]?.id ?? null);
    setTopThree([]);
    setProjectionState({ status: "loading" });
    void loadProjection(room.id);
    setView("room");
  }

  async function loadProjection(roomId: string) {
    try {
      const projection = await fetchRoomProjection(roomId);
      setProjectionState({ status: "ready", events: projection.groove });
    } catch {
      setProjectionState({ status: "error" });
    }
  }

  async function submitGroove() {
    if (!selectedRoom || !selectedWork) return;
    setGrooveError(null);
    setGrooveEvidence(null);
    try {
      setGrooveState("connecting");
      const { requireHashPackAccount, submitPreparedGroove } = await import("./hedera-wallet");
      const account = await requireHashPackAccount();
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
      setGrooveState("confirming");
      const evidence = await waitForGrooveConfirmation(preparation.id, transactionId);
      setGrooveEvidence(evidence);
      setGrooveState("confirmed");
      await loadProjection(selectedRoom.id);
    } catch (error) {
      setGrooveError(error instanceof Error ? error.message : "Groove submission failed.");
      setGrooveState("idle");
    }
  }

  return (
    <div className="reader-app">
      {view === "home" && <HomeView roomsState={roomsState} onEnterRoom={enterRoom} onRetry={() => void loadRooms()} />}
      {view === "room" && selectedRoom && selectedWork && (
        <RoomView
          room={selectedRoom}
          work={selectedWork}
          selectedWorkId={selectedWorkId}
          topThree={topThree}
          projectionState={projectionState}
          onBack={() => setView("home")}
          onSelectWork={setSelectedWorkId}
          onOpenGroove={() => setDialogOpen(true)}
          onReviewBallot={() => setBallotOpen(true)}
          onToggleTopThree={toggleTopThree}
        />
      )}
      {view === "rankings" && <RankingsView works={selectedRoom?.works ?? []} roomName={selectedRoom?.name} />}
      {view === "shelf" && <ShelfView topThree={topThree} works={selectedRoom?.works ?? []} />}
      {view === "profile" && <ProfileView onRoomCreated={() => void loadRooms()} />}

      <BottomNav view={view} onNavigate={setView} />

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
        />
      )}
      {ballotOpen && <BallotDialog topThree={topThree} works={selectedRoom?.works ?? []} onClose={() => setBallotOpen(false)} />}
    </div>
  );
}

function HomeView({ roomsState, onEnterRoom, onRetry }: { roomsState: RoomsState; onEnterRoom: (room: Room) => void; onRetry: () => void }) {
  const featuredRoom = roomsState.status === "ready" ? roomsState.rooms.find((room) => room.id === "lisbon-main") ?? roomsState.rooms.find((room) => room.phase === "LIVE") : undefined;
  return (
    <main className="page home-page">
      <header className="brand-bar">
        <div><span className="brand-mark">O</span><strong>Oshikatsu</strong></div>
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
            <span><UsersRound size={17} /> {rooms.length} durable Room{rooms.length === 1 ? "" : "s"}</span>
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
        {roomsState.status === "ready" && roomsState.rooms.map((room) => (
          <button className={room.phase === "LIVE" ? "room-row live-room" : "room-row"} type="button" onClick={() => onEnterRoom(room)} key={room.id}>
            <img src={room.works[0]?.cover_url} alt={`${room.works[0]?.title ?? room.name} cover`} />
            <span className="room-row-copy"><strong>{room.name}</strong><small>Lineup locked · {room.works.length} works</small></span>
            <span className={room.phase === "LIVE" ? "phase-badge" : "phase-badge upcoming"}>{room.phase === "LIVE" && <span className="live-dot" />} {room.phase}</span>
          </button>
        ))}
      </section>

      <section className="special-room">
        <div><p className="kicker gold">SPECIAL ROOM</p><h2>Manga Culture Contribution Award</h2><p>Celebrate the Readers who keep hidden gems alive.</p></div>
        <button type="button" className="ceremony-action">Enter the ceremony</button>
      </section>
    </main>
  );
}

type RoomViewProps = {
  room: Room;
  work: RoomWork;
  selectedWorkId: string | null;
  topThree: string[];
  projectionState: ProjectionState;
  onBack: () => void;
  onSelectWork: (id: string) => void;
  onOpenGroove: () => void;
  onReviewBallot: () => void;
  onToggleTopThree: () => void;
};

function RoomView({ room, work, selectedWorkId, topThree, projectionState, onBack, onSelectWork, onOpenGroove, onReviewBallot, onToggleTopThree }: RoomViewProps) {
  const inTopThree = topThree.includes(work.id);
  const topThreeFull = topThree.length >= 3 && !inTopThree;
  return (
    <main className="page room-page">
      <header className="room-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to Home"><ArrowLeft /></button>
        <div><p className="kicker">{room.phase} ROOM</p><strong>{room.name}</strong></div>
        <span className="phase-badge">{room.phase === "LIVE" && <span className="live-dot" />} {room.phase}</span>
      </header>

      <div className="room-layout">
        <aside className="lineup-panel" aria-labelledby="lineup-title">
          <div className="panel-heading"><div><p className="kicker">LINEUP LOCKED</p><h2 id="lineup-title">Tonight's Lineup</h2></div><span>{room.works.length} works</span></div>
          <div className="lineup-list">
            {room.works.map((item, index) => (
              <button className={item.id === selectedWorkId ? "lineup-item selected" : "lineup-item"} type="button" key={item.id} onClick={() => onSelectWork(item.id)}>
                <span className="lineup-rank">{String(index + 1).padStart(2, "0")}</span>
                <img src={item.cover_url} alt={`${item.title} cover`} />
                <span><strong>{item.title}</strong><small>{item.chapter}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <section className="work-stage" aria-labelledby="work-title">
          <img className="work-art" src={work.hero_url ?? work.cover_url} alt={`${work.title} featured artwork`} />
          <div className="work-vignette" />
          <div className="work-copy">
            <p className="kicker">NOW IN THE GROOVE</p>
            <h1 id="work-title">{work.title}</h1>
            <p>{work.chapter} · Activity pending</p>
            <div className="room-facts"><span><UsersRound size={16} /> {projectionState.status === "ready" ? `${projectionState.events.length} confirmed event${projectionState.events.length === 1 ? "" : "s"}` : "Activity unavailable"}</span><span><Clock3 size={16} /> Closes {formatDeadline(room.deadline)}</span></div>
            <a className="read-link" href={work.reading_url} target="_blank" rel="noreferrer"><BookOpen size={18} /> Read Official Chapter</a>
          </div>
          <div className="work-actions">
            <button className="primary-action" type="button" onClick={onOpenGroove}>Osu! <MessageCircle size={20} /></button>
            <button className={inTopThree ? "secondary-action active" : "secondary-action"} type="button" onClick={onToggleTopThree} disabled={topThreeFull}>{inTopThree ? "Remove from My Top 3" : topThreeFull ? "Top 3 is full" : "Add to My Top 3"}</button>
            <button className="ballot-action" type="button" onClick={onReviewBallot}>Review Top 3 · {topThree.length}/3</button>
          </div>
        </section>

        <aside className="groove-panel" aria-labelledby="groove-title">
          <div className="panel-heading"><div><p className="kicker">CONFIRMED ON HEDERA</p><h2 id="groove-title">Groove Wave</h2></div><span>{projectionState.status === "ready" ? projectionState.events.length : "—"}</span></div>
          {projectionState.status === "loading" && <p className="dialog-note" role="status">Loading confirmed events...</p>}
          {projectionState.status === "error" && <p className="dialog-note" role="alert">Groove evidence unavailable.</p>}
          {projectionState.status === "ready" && projectionState.events.length === 0 && <p className="dialog-note">No confirmed events yet.</p>}
          {projectionState.status === "ready" && <div className="shout-feed">{projectionState.events.map((event) => <GrooveEvidence event={event} key={event.prepare_id} />)}</div>}
        </aside>
      </div>
    </main>
  );
}

function GrooveEvidence({ event }: { event: ConfirmedGrooveEvent }) {
  let message: { s?: string; c?: string } = {};
  try {
    message = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(event.message_base64), (character) => character.charCodeAt(0)))) as { s?: string; c?: string };
  } catch {
    message = {};
  }
  const reaction = reactions.find((item) => item.id === message.s);
  return <p><span>Sequence #{event.sequence_number} · {event.payer_account_id} · {event.message_bytes} bytes</span><strong>{reaction?.label ?? "Confirmed reaction"}</strong>{message.c && <> · {message.c}</>}</p>;
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
};

function GrooveDialog({ reaction, shout, work, onClose, onReactionChange, onShoutChange, onSubmit, state, error, evidence }: GrooveDialogProps) {
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
        <button className="primary-action full" type="button" onClick={onSubmit} disabled={shoutBytes > 600 || !["idle", "confirmed"].includes(state)}>{state === "idle" ? "Send to the Groove" : state === "connecting" ? "Connect HashPack" : state === "preparing" ? "Preparing canonical event" : state === "approving" ? "Approve in HashPack" : state === "confirming" ? "Confirming on Mirror" : "Confirmed on Hedera"} <Sparkles size={20} /></button>
        {error && <p className="dialog-note" role="alert">{error}</p>}
        {evidence && <p className="dialog-note" role="status">Sequence #{evidence.sequence_number} · {evidence.message_bytes} bytes · {evidence.payer_account_id}</p>}
        <p className="dialog-note">Reaction and Shout do not change your formal ballot.</p>
      </section>
    </div>
  );
}

function BallotDialog({ topThree, works, onClose }: { topThree: string[]; works: RoomWork[]; onClose: () => void }) {
  const rankedWorks = topThree.map((id) => works.find((work) => work.id === id)).filter((work): work is RoomWork => Boolean(work));
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ballot-dialog" role="dialog" aria-modal="true" aria-labelledby="ballot-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="kicker">FORMAL BALLOT</p><h2 id="ballot-title">Review your Top 3</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close ballot review"><X /></button></header>
        <ol className="ballot-ranking">{rankedWorks.map((work, index) => <li key={work.id}><span>{index + 1}</span><img src={work.cover_url} alt="" /><div><strong>{work.title}</strong><small>{work.chapter}</small></div></li>)}</ol>
        {rankedWorks.length < 3 && <p className="ballot-warning">Choose {3 - rankedWorks.length} more work{rankedWorks.length === 2 ? "" : "s"} before casting your ballot.</p>}
        <div className="trust-strip"><span>Orb-verified human</span><span>Unique in this Room</span><span>HashPack signed</span></div>
        <a className={rankedWorks.length === 3 ? "primary-action full" : "primary-action full disabled"} href={rankedWorks.length === 3 ? "https://ethglobal-lisbon2026-oshikatsu.web.app/?wallet-test=1" : undefined}>Continue to verified ballot</a>
        <p className="dialog-note">The verified integration opens separately so this Reader UI cannot alter the validated PoC.</p>
      </section>
    </div>
  );
}

function RankingsView({ works, roomName }: { works: RoomWork[]; roomName?: string }) {
  return (
    <main className="page collection-page">
      <header className="collection-header"><p className="kicker">ROOM RESULT</p><h1>Rankings</h1><p>Results become formal only after the Room is sealed and public verification completes.</p></header>
      <section className="pending-result"><Trophy /><div><p className="kicker gold">SEAL PENDING</p><h2>{roomName ?? "No Room selected"}</h2><p>Live standings are hidden until the immutable cutoff is confirmed.</p></div><span>Pending</span></section>
      <section className="ranking-preview" aria-labelledby="ranking-preview-title"><div className="section-heading"><div><p className="kicker">PREVIEW</p><h2 id="ranking-preview-title">Groove, not final votes</h2></div></div>{works.slice(0,3).map((work,index)=><div className="ranking-row" key={work.id}><strong>{index+1}</strong><img src={work.cover_url} alt="" /><span><b>{work.title}</b><small>Activity pending</small></span><em>Pending</em></div>)}</section>
    </main>
  );
}

function ShelfView({ topThree, works }: { topThree: string[]; works: RoomWork[] }) {
  const selected = topThree.map((id) => works.find((work) => work.id === id)).filter((work): work is RoomWork => Boolean(work));
  return (
    <main className="page collection-page">
      <header className="collection-header"><p className="kicker">MY OSHIKATSU</p><h1>My Shelf</h1><p>Your current Top 3 stays editable until the Room deadline.</p></header>
      <section className="shelf-grid" aria-label="My Top 3">{[0,1,2].map((slot)=>{const work=selected[slot];return <article className="shelf-slot" key={slot}>{work?<><img src={work.cover_url} alt={`${work.title} cover`} /><span>#{slot+1}</span><strong>{work.title}</strong><small>{work.chapter}</small></>:<div className="empty-cover"><BookOpen /></div>}</article>})}</section>
      <section className="history-strip"><p className="kicker">ROOM HISTORY</p><h2>Tonight is your first shared Room</h2><p>Verified ballot history will appear after capability is granted.</p></section>
    </main>
  );
}

function ProfileView({ onRoomCreated }: { onRoomCreated: () => void }) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setCreatedRoom(null);
    try {
      const room = await createRoom({
        name,
        opens_at: new Date().toISOString(),
        deadline: new Date(deadline).toISOString(),
        topic_id: "0.0.9745676",
        works: [
          { id: "work-one", title: "First Work", chapter: "Chapter 1", cover_url: `${window.location.origin}/assets/sample01.webp`, hero_url: null, reading_url: "https://www.webtoons.com/" },
          { id: "work-two", title: "Second Work", chapter: "Chapter 1", cover_url: `${window.location.origin}/assets/sample02.webp`, hero_url: null, reading_url: "https://www.webtoons.com/" },
        ],
      });
      setCreatedRoom(room);
      onRoomCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Room creation failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page collection-page">
      <header className="profile-hero"><div className="profile-avatar">?</div><div><p className="kicker">WALLET IDENTITY</p><h1>Not connected</h1><p>Identity and public activity appear only after verified wallet evidence.</p></div></header>
      <section className="badge-grid"><article><Medal /><strong>Rooms Joined</strong><span>—</span></article><article><Sparkles /><strong>Confirmed Reactions</strong><span>—</span></article><article><LibraryBig /><strong>Works Shelved</strong><span>Local</span></article></section>
      <section className="create-room"><p className="kicker">HOST A SHARED MOMENT</p><h2>Create a Room</h2><p>This creates a durable Room manifest with two starter works on Hedera testnet topic 0.0.9745676.</p><form onSubmit={(event) => void submit(event)}><label>Room name<input required minLength={3} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday Reader Night" /></label><label>Deadline<input required type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><button className="primary-action" type="submit" disabled={creating}>{creating ? "Creating durable Room" : "Create Room"}</button></form>{error && <p role="alert">{error}</p>}{createdRoom && <p role="status">Created {createdRoom.id}<br />Manifest {createdRoom.manifest_hash}</p>}</section>
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
