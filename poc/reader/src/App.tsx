import { useEffect, useState, type ReactNode } from "react";
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
  { id: "level-up", title: "Solo Leveling", chapter: "Chapter 143", cover: "/assets/sample01.png", readers: "8,241" },
  { id: "cadet", title: "Teenage Mercenary", chapter: "Chapter 85", cover: "/assets/sample02.png", readers: "6,903" },
  { id: "divine", title: "Divine Delivery", chapter: "Chapter 61", cover: "/assets/sample03.png", readers: "5,778" },
  { id: "reader", title: "Omniscient Reader", chapter: "Chapter 207", cover: "/assets/sample04.png", readers: "9,412" },
  { id: "returner", title: "Returner's Magic", chapter: "Chapter 119", cover: "/assets/sample05.png", readers: "4,806" },
];

const reactions = [
  { id: "peak", icon: "/assets/ico08.png", label: "Peak Chapter", count: "8,321" },
  { id: "cried", icon: "/assets/ico12.png", label: "Cried My Eyes Out", count: "2,482" },
  { id: "precious", icon: "/assets/ico13.png", label: "Too Precious", count: "7,221" },
  { id: "next", icon: "/assets/ico14.png", label: "Next Chapter Now", count: "11,832" },
  { id: "week", icon: "/assets/ico15.png", label: "Chapter of the Week", count: "4,281" },
  { id: "dead", icon: "/assets/ico16.png", label: "I'm Dead", count: "3,912" },
  { id: "melted", icon: "/assets/ico18.png", label: "I Melted", count: "2,706" },
  { id: "wrecked", icon: "/assets/ico19.png", label: "Emotionally Wrecked", count: "6,118" },
  { id: "losing", icon: "/assets/ico20.png", label: "I'm Losing It", count: "5,430" },
];

export function App() {
  const [view, setView] = useState<View>("home");
  const [selectedWorkId, setSelectedWorkId] = useState(works[0].id);
  const [selectedReaction, setSelectedReaction] = useState(reactions[0].id);
  const [shout, setShout] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [topThree, setTopThree] = useState<string[]>([works[0].id]);
  const selectedWork = works.find((work) => work.id === selectedWorkId) ?? works[0];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  function toggleTopThree() {
    setTopThree((current) => {
      if (current.includes(selectedWork.id)) return current.filter((id) => id !== selectedWork.id);
      if (current.length >= 3) return [...current.slice(1), selectedWork.id];
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
          onToggleTopThree={toggleTopThree}
        />
      )}
      {view === "rankings" && <PlaceholderView icon={<Trophy />} title="Rankings" copy="Tonight's result appears after the Room is sealed." />}
      {view === "shelf" && <PlaceholderView icon={<LibraryBig />} title="My Shelf" copy="Your Rooms, Top 3, and new oshi discoveries live here." />}
      {view === "profile" && <PlaceholderView icon={<UserRound />} title="Profile" copy="Your pseudonymous Reader profile and badges." />}

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
    </div>
  );
}

function HomeView({ onEnterRoom }: { onEnterRoom: () => void }) {
  return (
    <main className="page home-page">
      <header className="brand-bar">
        <div><span className="brand-mark">O</span><strong>Oshikatsu</strong></div>
        <button className="account-pill" type="button"><span className="live-dot" /> Browse mode</button>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <img src="/assets/room-stage.png" alt="Readers gathering in a luminous manga event venue" />
        <div className="home-hero-shade" />
        <div className="home-hero-content">
          <p className="kicker">WEEKLY CHAPTER DROP · LIVE NOW</p>
          <h1 id="home-title">Read together.<br />Lose it together.</h1>
          <p className="hero-copy">Five new chapters. One shared night. Enter the Room and find the story everyone is shouting about.</p>
          <button className="primary-action" type="button" onClick={onEnterRoom}>Join the Groove <Sparkles size={20} /></button>
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
  onToggleTopThree: () => void;
};

function RoomView({ work, selectedWorkId, topThree, onBack, onSelectWork, onOpenGroove, onToggleTopThree }: RoomViewProps) {
  const inTopThree = topThree.includes(work.id);
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
          <img className="work-art" src={work.id === "level-up" ? "/assets/level-up.png" : work.cover} alt={`${work.title} featured artwork`} />
          <div className="work-vignette" />
          <div className="work-copy">
            <p className="kicker">NOW IN THE GROOVE</p>
            <h1 id="work-title">{work.title}</h1>
            <p>{work.chapter} · {work.readers} Readers finished</p>
            <a className="read-link" href="https://www.webtoons.com/" target="_blank" rel="noreferrer"><BookOpen size={18} /> Read Official Chapter</a>
          </div>
          <div className="work-actions">
            <button className="primary-action" type="button" onClick={onOpenGroove}>Osu! <MessageCircle size={20} /></button>
            <button className={inTopThree ? "secondary-action active" : "secondary-action"} type="button" onClick={onToggleTopThree}>{inTopThree ? "Remove from My Top 3" : "Add to My Top 3"}</button>
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
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="groove-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="kicker">SEND TO THE GROOVE</p><h2 id="dialog-title">How did {work.title} hit you?</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X /></button></header>
        <div className="reaction-grid">
          {reactions.map((item) => (
            <button className={reaction === item.id ? "reaction-option selected" : "reaction-option"} type="button" key={item.id} onClick={() => onReactionChange(item.id)} aria-pressed={reaction === item.id}>
              <img src={item.icon} alt="" /><span>{item.label}</span>
            </button>
          ))}
        </div>
        <label className="shout-field"><span>Shout</span><textarea value={shout} maxLength={200} onChange={(event) => onShoutChange(event.target.value)} placeholder="Drop your post-chapter scream..." /><small>{[...shout].length}/200 · {shoutBytes}/600 UTF-8 bytes</small></label>
        <button className="primary-action full" type="button" onClick={onSubmit} disabled={shoutBytes > 600}>Send to the Groove <Sparkles size={20} /></button>
        <p className="dialog-note">Reaction and Shout do not change your formal ballot.</p>
      </section>
    </div>
  );
}

function PlaceholderView({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <main className="page placeholder-page"><div className="placeholder-icon">{icon}</div><p className="kicker">OSHIKATSU READER</p><h1>{title}</h1><p>{copy}</p></main>;
}

function BottomNav({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const items: Array<{ id: View; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <Home /> },
    { id: "rankings", label: "Rankings", icon: <Medal /> },
    { id: "shelf", label: "My Shelf", icon: <LibraryBig /> },
    { id: "profile", label: "Profile", icon: <UserRound /> },
  ];
  const activeView = view === "room" ? "home" : view;
  return <nav className="bottom-nav" aria-label="Primary navigation">{items.map((item) => <button type="button" key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>;
}
