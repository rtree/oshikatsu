import { firebaseApp } from "./firebase";

export function App() {
  return (
    <main className="shell">
      <header>
        <p className="eyebrow">POC CONSOLE</p>
        <h1>Oshikatsu</h1>
      </header>
      <section aria-labelledby="environment-heading">
        <h2 id="environment-heading">Environment</h2>
        <dl>
          <div>
            <dt>Web</dt>
            <dd>React + TypeScript + Vite</dd>
          </div>
          <div>
            <dt>Firebase</dt>
            <dd>{firebaseApp ? "Configured" : "Not configured"}</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>Cloud Run ready</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
