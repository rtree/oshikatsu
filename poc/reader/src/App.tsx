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
import { fetchRoomProjection, fetchRooms, type ConfirmedGrooveEvent, type Room, type RoomProjection, type RoomWork } from "./rooms-api";
import { prepareGroove, waitForGrooveConfirmation, type GrooveStatus } from "./groove-api";

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
  const [grooveState, setGrooveState] = useState<"idle" | "connecting" | "preparing" | "approving" | "confirming" | "confirmed" | "duplicate">("idle");
  const [grooveError, setGrooveError] = useState<string | null>(null);
  const [grooveEvidence, setGrooveEvidence] = useState<Extract<GrooveStatus, { status: "CONFIRMED" }> | null>(null);
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
      const message = error instanceof Error ? error.message : "Shout submission failed.";
      setGrooveError(message === "DUPLICATE_SHOUT" ? "This wallet already has a confirmed Shout in this Room." : message);
      setGrooveState(message === "DUPLICATE_SHOUT" ? "duplicate" : "idle");
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
          projectionState={projectionState}
          onBack={() => setView("home")}
          onSelectWork={setSelectedWorkId}
          onOpenGroove={() => setDialogOpen(true)}
          onToggleShelf={toggleTopThree}
          inShelf={topThree.includes(selectedWork.id)}
        />
      )}
      {view === "rankings" && <RankingsView rooms={rooms} selectedRoom={selectedRoom} projectionState={projectionState} onSelectRoom={(room) => selectRoom(room, "rankings")} />}
      {view === "shelf" && <ShelfView topThree={topThree} works={selectedRoom?.works ?? []} />}
      {view === "profile" && <ProfileView />}

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
        />
      )}
    </div>
  );
}

function HomeView({ roomsState, onEnterRoom, onRetry }: { roomsState: RoomsState; onEnterRoom: (room: Room) => void; onRetry: () => void }) {
  const featuredRoom = roomsState.status === "ready" ? roomsState.rooms.find((room) => room.id === "lisbon-main") ?? roomsState.rooms.find((room) => room.phase === "LIVE") : undefined;
  const specialRoom = roomsState.status === "ready" ? roomsState.rooms.find((room) => room.room_type === "SPECIAL_TEAM") : undefined;
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

      {specialRoom && <section className="special-room"><div><p className="kicker gold">SPECIAL ROOM · {formatDeadline(specialRoom.deadline)}</p><h2>{specialRoom.name}</h2><p>Support one of {specialRoom.works.length} participating teams. One wallet can send one Shout in this Room.</p></div><button type="button" className="ceremony-action" onClick={() => onEnterRoom(specialRoom)}>Enter the ceremony</button></section>}
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
  return (
    <main className="page room-page">
      <header className="room-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to Home"><ArrowLeft /></button>
        <div><p className="kicker">{room.phase} ROOM</p><strong>{room.name}</strong></div>
        <span className="phase-badge">{room.phase === "LIVE" && <span className="live-dot" />} {room.phase}</span>
      </header>

      <div className="room-layout">
        <aside className="lineup-panel" aria-labelledby="lineup-title">
          <div className="panel-heading"><div><p className="kicker">LINEUP LOCKED</p><h2 id="lineup-title">{isSpecial ? "Participating Teams" : "Tonight's Lineup"}</h2></div><span>{room.works.length} {isSpecial ? "teams" : "works"}</span></div>
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
            <p>{isSpecial ? "Hackathon participant" : work.chapter} · {projectionState.status === "ready" ? `${events.length} confirmed Shout${events.length === 1 ? "" : "s"}` : "Activity unavailable"}</p>
            <div className="room-facts"><span><UsersRound size={16} /> One wallet, one Shout in this Room</span><span><Clock3 size={16} /> Closes {formatDeadline(room.deadline)}</span></div>
            {!isSpecial && <a className="read-link" href={work.reading_url} target="_blank" rel="noreferrer"><BookOpen size={18} /> Read Official Chapter</a>}
          </div>
          <div className="work-actions">
            <button className="primary-action" type="button" onClick={onOpenGroove}>Osu! <MessageCircle size={20} /></button>
            <button className={inShelf ? "secondary-action active" : "secondary-action"} type="button" onClick={onToggleShelf}>{inShelf ? "Remove from My Shelf" : "Add to My Shelf"}</button>
          </div>
        </section>

        <aside className="groove-panel" aria-labelledby="groove-title">
          <div className="panel-heading"><div><p className="kicker">CONFIRMED ON HEDERA</p><h2 id="groove-title">Groove Wave</h2></div><span>{projectionState.status === "ready" ? events.length : "—"}</span></div>
          {projectionState.status === "loading" && <p className="dialog-note" role="status">Loading confirmed events...</p>}
          {projectionState.status === "error" && <p className="dialog-note" role="alert">Groove evidence unavailable.</p>}
          {projectionState.status === "ready" && events.length === 0 && <p className="dialog-note">No confirmed Shouts yet.</p>}
          {projectionState.status === "ready" && <div className="shout-feed">{events.map((event) => <GrooveEvidence event={event} key={event.prepare_id} />)}</div>}
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
  state: "idle" | "connecting" | "preparing" | "approving" | "confirming" | "confirmed" | "duplicate";
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
        <button className="primary-action full" type="button" onClick={onSubmit} disabled={shoutBytes === 0 || shoutBytes > 600 || !["idle", "confirmed"].includes(state)}>{state === "idle" ? "Send my one Shout" : state === "connecting" ? "Connect HashPack" : state === "preparing" ? "Checking Room eligibility" : state === "approving" ? "Approve in HashPack" : state === "confirming" ? "Confirming on Mirror" : state === "duplicate" ? "Already Shouted in this Room" : "Confirmed on Hedera"} <Sparkles size={20} /></button>
        {error && <p className="dialog-note" role="alert">{error}</p>}
        {evidence && <p className="dialog-note" role="status">Sequence #{evidence.sequence_number} · {evidence.message_bytes} bytes · {evidence.payer_account_id}</p>}
        <p className="dialog-note">One wallet can send one confirmed Shout in this Room. This demo rule is not proof of one human, one vote.</p>
      </section>
    </div>
  );
}

function RankingsView({ rooms, selectedRoom, projectionState, onSelectRoom }: { rooms: Room[]; selectedRoom: Room | null; projectionState: ProjectionState; onSelectRoom: (room: Room) => void }) {
  const ranking = projectionState.status === "ready" ? projectionState.projection.ranking : [];
  return (
    <main className="page collection-page">
      <header className="collection-header"><p className="kicker">ONE WALLET · ONE SHOUT</p><h1>Rankings</h1><p>Each Room has an independent ranking built from Mirror-confirmed Shouts. This is a wallet-based demo vote.</p></header>
      <label className="room-selector"><span>Room</span><select value={selectedRoom?.id ?? ""} onChange={(event) => { const room = rooms.find((candidate) => candidate.id === event.target.value); if (room) onSelectRoom(room); }}>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>
      {selectedRoom && <section className="pending-result"><Trophy /><div><p className="kicker gold">{selectedRoom.phase === "LIVE" ? "PROVISIONAL" : selectedRoom.phase}</p><h2>{selectedRoom.name}</h2><p>{projectionState.status === "ready" ? `${projectionState.projection.confirmed_shout_count} confirmed Shout${projectionState.projection.confirmed_shout_count === 1 ? "" : "s"}` : "Ranking evidence is loading."}</p></div><span>{selectedRoom.phase}</span></section>}
      {projectionState.status === "error" && <p className="room-list-status" role="alert">Ranking unavailable.</p>}
      {projectionState.status === "loading" && <p className="room-list-status" role="status">Loading Room ranking...</p>}
      {selectedRoom && projectionState.status === "ready" && <section className="ranking-preview" aria-labelledby="ranking-preview-title"><div className="section-heading"><div><p className="kicker">ROOM RESULT</p><h2 id="ranking-preview-title">Confirmed Shouts</h2></div></div>{ranking.map((entry) => { const work = selectedRoom.works.find((candidate) => candidate.id === entry.work_id); if (!work) return null; return <div className="ranking-row" key={work.id}><strong>{entry.rank}</strong><img src={work.cover_url} alt="" /><span><b>{work.title}</b><small>{entry.shout_count} Shout{entry.shout_count === 1 ? "" : "s"}</small></span><em>{entry.tied ? "Tied" : selectedRoom.phase === "LIVE" ? "Provisional" : "Final"}</em></div>;})}</section>}
    </main>
  );
}

function ShelfView({ topThree, works }: { topThree: string[]; works: RoomWork[] }) {
  const selected = topThree.map((id) => works.find((work) => work.id === id)).filter((work): work is RoomWork => Boolean(work));
  return (
    <main className="page collection-page">
      <header className="collection-header"><p className="kicker">MY OSHIKATSU</p><h1>My Shelf</h1><p>Your current Top 3 stays editable until the Room deadline.</p></header>
      <section className="shelf-grid" aria-label="My Top 3">{[0,1,2].map((slot)=>{const work=selected[slot];return <article className="shelf-slot" key={slot}>{work?<><img src={work.cover_url} alt={`${work.title} cover`} /><span>#{slot+1}</span><strong>{work.title}</strong><small>{work.chapter}</small></>:<div className="empty-cover"><BookOpen /></div>}</article>})}</section>
      <section className="history-strip"><p className="kicker">LOCAL SHELF</p><h2>Your picks stay on this device</h2><p>This demo does not publish Shelf choices as votes. Only a confirmed Shout affects a Room ranking.</p></section>
    </main>
  );
}

function ProfileView() {
  return (
    <main className="page collection-page">
      <header className="profile-hero"><div className="profile-avatar">?</div><div><p className="kicker">PROFILE</p><h1>No public profile yet</h1><p>This demo does not publish wallet identity, badges, participation totals, or personal activity.</p></div></header>
      <section className="profile-empty"><UserRound /><div><p className="kicker">HONEST EMPTY STATE</p><h2>Your Shouts remain Room activity</h2><p>Connect HashPack only when sending a Shout. A personal history and verified achievements are outside this demo scope.</p></div></section>
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
