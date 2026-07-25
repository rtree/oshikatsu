# Oshikatsu Reader

Standalone formal product UI. This project intentionally has its own package manifest, lockfile, build output, and dev server.

It must not import source files or wallet dependencies directly from `../console/apps/web`. Shared protocol code can be introduced later only through an explicit package boundary.

```bash
npm install
npm run check
npm run build
npm run dev
```

Development runs on http://localhost:5180 and proxies `/api` to the existing Cloud Run-compatible API on port 8080.

The verified integration PoC remains at `../console/apps/web` and its production Hosting target must not be overwritten by this project.

The formal Reader deploys through its own `firebase.json` to the separate Hosting site `oshikatsu-reader-lisbon26`.