import { useEffect, useRef, useState, type ReactNode } from "react";
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

type View = "home" | "room" | "rankings" | "shelf" | "profile";

type Work = {
  id: string;
  title: string;
  chapter: string;
  cover: string;
  readers: string;
};

const works: Work[] = [
  { id: "level-up", title: "Solo Leveling", chapter: "Chapter 143", cover: "/assets/sample01.webp", readers: "8,241" },
  { id: "cadet", title: "Teenage Mercenary", chapter: "Chapter 85", cover: "/assets/sample02.webp", readers: "6,903" },
  { id: "divine", title: "Divine Delivery", chapter: "Chapter 61", cover: "/assets/sample03.webp", readers: "5,778" },
  { id: "reader", title: "Omniscient Reader", chapter: "Chapter 207", cover: "/assets/sample04.webp", readers: "9,412" },
  { id: "returner", title: "Returner's Magic", chapter: "Chapter 119", cover: "/assets/sample05.webp", readers: "4,806" },
];

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

export function App() {
  const [view, setView] = useState<View>("home");
  const [selectedWorkId, setSelectedWorkId] = useState(works[0].id);
  const [selectedReaction, setSelectedReaction] = useState(reactions[0].id);
  const [shout, setShout] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ballotOpen, setBallotOpen] = useState(false);
  const [topThree, setTopThree] = useState<string[]>([works[0].id]);
  const selectedWork = works.find((work) => work.id === selectedWorkId) ?? works[0];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  function toggleTopThree() {
    setTopThree((current) => {
      if (current.includes(selectedWork.id)) return current.filter((id) => id !== selectedWork.id);
      if (current.length >= 3) return current;
      return [...current, selectedWork.id];
    });
  }

  return (
    <div className="reader-app">
      {view === "home" && <HomeView onEnterRoom={() => setView("room")} />}
      {view === "room" && (
        <RoomView
          work={selectedWork}
          selectedWorkId={selectedWorkId}
          topThree={topThree}
          onBack={() => setView("home")}
          onSelectWork={setSelectedWorkId}
          onOpenGroove={() => setDialogOpen(true)}
          onReviewBallot={() => setBallotOpen(true)}
          onToggleTopThree={toggleTopThree}
        />
      )}
      {view === "rankings" && <RankingsView />}
      {view === "shelf" && <ShelfView topThree={topThree} />}
      {view === "profile" && <ProfileView />}

      <BottomNav view={view} onNavigate={setView} />

      {dialogOpen && (
        <GrooveDialog
          reaction={selectedReaction}
          shout={shout}
          work={selectedWork}
          onClose={() => setDialogOpen(false)}
          onReactionChange={setSelectedReaction}
          onShoutChange={setShout}
          onSubmit={() => setDialogOpen(false)}
        />
      )}
      {ballotOpen && <BallotDialog topThree={topThree} onClose={() => setBallotOpen(false)} />}
    </div>
  );
}

function HomeView({ onEnterRoom }: { onEnterRoom: () => void }) {
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
          <div className="hero-actions"><button className="primary-action" type="button" onClick={onEnterRoom}>Join the Groove <Sparkles size={20} /></button><button className="browse-action" type="button" onClick={onEnterRoom}>Browse First</button></div>
          <div className="live-stats">
            <span><UsersRound size={17} /> 28,431 in the Room</span>
            <span><Clock3 size={17} /> Voting closes in 01:42:18</span>
          </div>
        </div>
      </section>

      <section className="home-section" aria-labelledby="rooms-title">
        <div className="section-heading">
          <div><p className="kicker">ROOMS</p><h2 id="rooms-title">Tonight's shared moments</h2></div>
          <button className="text-action" type="button">View all</button>
        </div>
        <button className="room-row live-room" type="button" onClick={onEnterRoom}>
          <img src="/assets/sample01.png" alt="Solo Leveling cover" />
          <span className="room-row-copy"><strong>Weekly Chapter Drop</strong><small>Lineup locked · 5 works</small></span>
          <span className="phase-badge"><span className="live-dot" /> LIVE</span>
        </button>
        <button className="room-row" type="button">
          <img src="/assets/sample04.png" alt="Omniscient Reader cover" />
          <span className="room-row-copy"><strong>Sunday Reader Night</strong><small>Lobby opens in 03:18:42</small></span>
          <span className="phase-badge upcoming">SOON</span>
        </button>
      </section>

      <section className="special-room">
        <div><p className="kicker gold">SPECIAL ROOM</p><h2>Manga Culture Contribution Award</h2><p>Celebrate the Readers who keep hidden gems alive.</p></div>
        <button type="button" className="ceremony-action">Enter the ceremony</button>
      </section>
    </main>
  );
}

type RoomViewProps = {
  work: Work;
  selectedWorkId: string;
  topThree: string[];
  onBack: () => void;
  onSelectWork: (id: string) => void;
  onOpenGroove: () => void;
  onReviewBallot: () => void;
  onToggleTopThree: () => void;
};

function RoomView({ work, selectedWorkId, topThree, onBack, onSelectWork, onOpenGroove, onReviewBallot, onToggleTopThree }: RoomViewProps) {
  const inTopThree = topThree.includes(work.id);
  const topThreeFull = topThree.length >= 3 && !inTopThree;
  return (
    <main className="page room-page">
      <header className="room-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to Home"><ArrowLeft /></button>
        <div><p className="kicker">LIVE ROOM</p><strong>Weekly Chapter Drop</strong></div>
        <span className="phase-badge"><span className="live-dot" /> LIVE</span>
      </header>

      <div className="room-layout">
        <aside className="lineup-panel" aria-labelledby="lineup-title">
          <div className="panel-heading"><div><p className="kicker">LINEUP LOCKED</p><h2 id="lineup-title">Tonight's Lineup</h2></div><span>5 works</span></div>
          <div className="lineup-list">
            {works.map((item, index) => (
              <button className={item.id === selectedWorkId ? "lineup-item selected" : "lineup-item"} type="button" key={item.id} onClick={() => onSelectWork(item.id)}>
                <span className="lineup-rank">{String(index + 1).padStart(2, "0")}</span>
                <img src={item.cover} alt={`${item.title} cover`} />
                <span><strong>{item.title}</strong><small>{item.chapter}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <section className="work-stage" aria-labelledby="work-title">
          <img className="work-art" src={work.id === "level-up" ? "/assets/level-up.webp" : work.cover} alt={`${work.title} featured artwork`} />
          <div className="work-vignette" />
          <div className="work-copy">
            <p className="kicker">NOW IN THE GROOVE</p>
            <h1 id="work-title">{work.title}</h1>
            <p>{work.chapter} · {work.readers} Readers finished</p>
            <div className="room-facts"><span><UsersRound size={16} /> 28,431 in the Room</span><span><Clock3 size={16} /> Closes in 01:42:18</span></div>
            <a className="read-link" href="https://www.webtoons.com/" target="_blank" rel="noreferrer"><BookOpen size={18} /> Read Official Chapter</a>
          </div>
          <div className="work-actions">
            <button className="primary-action" type="button" onClick={onOpenGroove}>Osu! <MessageCircle size={20} /></button>
            <button className={inTopThree ? "secondary-action active" : "secondary-action"} type="button" onClick={onToggleTopThree} disabled={topThreeFull}>{inTopThree ? "Remove from My Top 3" : topThreeFull ? "Top 3 is full" : "Add to My Top 3"}</button>
            <button className="ballot-action" type="button" onClick={onReviewBallot}>Review Top 3 · {topThree.length}/3</button>
          </div>
        </section>

        <aside className="groove-panel" aria-labelledby="groove-title">
          <div className="panel-heading"><div><p className="kicker">RIGHT NOW</p><h2 id="groove-title">Groove Wave</h2></div><span>28.4K</span></div>
          <div className="reaction-summary">
            {reactions.slice(0, 6).map((reaction) => <div key={reaction.id}><img src={reaction.icon} alt="" /><span>{reaction.label}</span><strong>{reaction.count}</strong></div>)}
          </div>
          <div className="shout-feed">
            <p><span>Lv.18 Hidden Gem Scout</span>Peak chapter. I cannot recover from this.</p>
            <p><span>Lv.07 Long-Run Supporter</span>That final panel changed everything.</p>
            <p><span>Lv.31 Reader</span>Next chapter. Right now.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

type GrooveDialogProps = {
  reaction: string;
  shout: string;
  work: Work;
  onClose: () => void;
  onReactionChange: (id: string) => void;
  onShoutChange: (value: string) => void;
  onSubmit: () => void;
};

function GrooveDialog({ reaction, shout, work, onClose, onReactionChange, onShoutChange, onSubmit }: GrooveDialogProps) {
  const shoutBytes = new TextEncoder().encode(shout).length;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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
        <button className="primary-action full" type="button" onClick={onSubmit} disabled={shoutBytes > 600}>Send to the Groove <Sparkles size={20} /></button>
        <p className="dialog-note">Reaction and Shout do not change your formal ballot.</p>
      </section>
    </div>
  );
}

function BallotDialog({ topThree, onClose }: { topThree: string[]; onClose: () => void }) {
  const rankedWorks = topThree.map((id) => works.find((work) => work.id === id)).filter((work): work is Work => Boolean(work));
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ballot-dialog" role="dialog" aria-modal="true" aria-labelledby="ballot-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="kicker">FORMAL BALLOT</p><h2 id="ballot-title">Review your Top 3</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close ballot review"><X /></button></header>
        <ol className="ballot-ranking">{rankedWorks.map((work, index) => <li key={work.id}><span>{index + 1}</span><img src={work.cover} alt="" /><div><strong>{work.title}</strong><small>{work.chapter}</small></div></li>)}</ol>
        {rankedWorks.length < 3 && <p className="ballot-warning">Choose {3 - rankedWorks.length} more work{rankedWorks.length === 2 ? "" : "s"} before casting your ballot.</p>}
        <div className="trust-strip"><span>Orb-verified human</span><span>Unique in this Room</span><span>HashPack signed</span></div>
        <a className={rankedWorks.length === 3 ? "primary-action full" : "primary-action full disabled"} href={rankedWorks.length === 3 ? "https://ethglobal-lisbon2026-oshikatsu.web.app/?wallet-test=1" : undefined}>Continue to verified ballot</a>
        <p className="dialog-note">The verified integration opens separately so this Reader UI cannot alter the validated PoC.</p>
      </section>
    </div>
  );
}

function RankingsView() {
  return (
    <main className="page collection-page">
      <header className="collection-header"><p className="kicker">ROOM RESULT</p><h1>Rankings</h1><p>Results become formal only after the Room is sealed and public verification completes.</p></header>
      <section className="pending-result"><Trophy /><div><p className="kicker gold">SEAL PENDING</p><h2>Weekly Chapter Drop</h2><p>Live standings are hidden until the immutable cutoff is confirmed.</p></div><span>01:42:18</span></section>
      <section className="ranking-preview" aria-labelledby="ranking-preview-title"><div className="section-heading"><div><p className="kicker">PREVIEW</p><h2 id="ranking-preview-title">Groove, not final votes</h2></div></div>{works.slice(0,3).map((work,index)=><div className="ranking-row" key={work.id}><strong>{index+1}</strong><img src={work.cover} alt="" /><span><b>{work.title}</b><small>{work.readers} Readers finished</small></span><em>Pending</em></div>)}</section>
    </main>
  );
}

function ShelfView({ topThree }: { topThree: string[] }) {
  const selected = topThree.map((id) => works.find((work) => work.id === id)).filter((work): work is Work => Boolean(work));
  return (
    <main className="page collection-page">
      <header className="collection-header"><p className="kicker">MY OSHIKATSU</p><h1>My Shelf</h1><p>Your current Top 3 stays editable until the Room deadline.</p></header>
      <section className="shelf-grid" aria-label="My Top 3">{[0,1,2].map((slot)=>{const work=selected[slot];return <article className="shelf-slot" key={slot}>{work?<><img src={work.cover} alt={`${work.title} cover`} /><span>#{slot+1}</span><strong>{work.title}</strong><small>{work.chapter}</small></>:<div className="empty-cover"><BookOpen /></div>}</article>})}</section>
      <section className="history-strip"><p className="kicker">ROOM HISTORY</p><h2>Tonight is your first shared Room</h2><p>Verified ballot history will appear after capability is granted.</p></section>
    </main>
  );
}

function ProfileView() {
  return (
    <main className="page collection-page">
      <header className="profile-hero"><div className="profile-avatar">R</div><div><p className="kicker">PSEUDONYMOUS READER</p><h1>Reader 9706</h1><p>Hedera testnet identity · public activity only</p></div></header>
      <section className="badge-grid"><article><Medal /><strong>Rooms Joined</strong><span>1</span></article><article><Sparkles /><strong>Reactions</strong><span>1</span></article><article><LibraryBig /><strong>Works Shelved</strong><span>3</span></article></section>
      <section className="create-room"><p className="kicker">HOST A SHARED MOMENT</p><h2>Create a Room</h2><p>Room creation UI is next. Manifest times and candidate sets will become immutable before voting opens.</p><button type="button" disabled>Create a Room · Not implemented</button></section>
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
