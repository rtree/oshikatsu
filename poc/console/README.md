# Oshikatsu Console

React/TypeScript frontend and Cloud Run API for the Oshikatsu proof of concept.

## Local setup

Requirements: Node.js 24+, npm 11+, Firebase CLI when deploying Hosting, and Google Cloud CLI when using GCP services.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev:web
```

Run the API in another terminal:

```bash
npm run dev:api
```

The API reads server-only development values from `poc/.env`. Start from `poc/.env.example`. The web app only receives variables prefixed with `VITE_`; never put Hedera keys, World RP signing keys, service-account JSON, or Google Cloud credentials in a `VITE_` variable.

## Google Cloud authentication

Local server development uses Application Default Credentials:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

Cloud Run uses its attached service account. Do not upload a service-account key or set `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run. Grant the runtime service account only the roles required by implemented endpoints.

No Google Cloud project or API is enabled by this repository. API enablement must be reviewed explicitly before running a `gcloud services enable` command.

## AI safety boundary

- Do not enable the Gemini Developer API / Generative Language API (`generativelanguage.googleapis.com`).
- Do not use browser API keys to call generative AI APIs.
- Use the Google Gen AI SDK for TypeScript (`@google/genai`) from the Cloud Run API only.
- The server-only factory in `apps/api/src/vertex-ai.ts` explicitly sets `vertexai: true`, project, and location. Do not construct `GoogleGenAI` elsewhere or add an `apiKey` option.
- Local Vertex AI authentication uses ADC. Cloud Run uses its attached service account and IAM.
- The Firebase web API key is public application metadata, not a secret. Restrict it in Google Cloud API Credentials to the required Firebase APIs and authorized web origins.
- Enable Firebase App Check for supported Firebase resources before production traffic.
- Configure budgets, billing alerts, Cloud Monitoring alerts, and service quotas before enabling billable AI workloads.

The API contains the Google Gen AI SDK boundary but no model invocation endpoint. Run `npm run security:check` to require Vertex AI mode and reject known Developer API packages and API-key environment variables.

## Firebase

Create a Firebase project only when the GCP project is selected. Register a web app, put its public web config in `apps/web/.env.local`, then copy `.firebaserc.example` to `.firebaserc` and replace the project ID. `.firebaserc` and local Firebase state are ignored.

Deploy Hosting only after a successful build:

```bash
npm run build --workspace @oshikatsu/web
firebase deploy --only hosting
```

## Cloud Run

Build from `poc/console` so the workspace lockfile is available:

```bash
gcloud builds submit \
  --project ethglobal-lisbon2026-oshikatsu \
  --config cloudbuild.api.yaml .
```

Use Secret Manager references for Hedera and World server keys. Do not pass secret values directly on a command line or store them in Firebase Hosting configuration.

## Validation

```bash
npm run security:check
npm run check
npm run build
```

### Strict production acceptance

`npm run acceptance:production` tests only deployed HTTPS services and the public Hedera
testnet Mirror Node. Missing endpoints, credentials, human-produced evidence, and prior-run
persistence evidence fail the run. The command has no mock mode and no skipped tests.

Required inputs:

```bash
export ACCEPTANCE_API_BASE=https://ethglobal-lisbon2026-oshikatsu.web.app
export ACCEPTANCE_PERSISTED_ROOM_ID=<room-id-created-by-an-earlier-run>
export ACCEPTANCE_GROOVE_EVIDENCE_FILE=/absolute/path/to/groove-evidence.json
export ACCEPTANCE_WORLD_VERIFY_FILE=/absolute/path/to/fresh-world-verification.json
npm run acceptance:production
```

The Groove evidence file must contain the wallet submission's exact public correlation data:

```json
{
  "topic_id": "0.0.123",
  "transaction_id": "0.0.456@1234567890.000000000",
  "payer_account_id": "0.0.456",
  "message_base64": "eyJ2IjoxfQ=="
}
```

The World file is the fresh request body for `/api/world-id/verify`: `context_token`, `signal`,
and the production `proof`. Proof contexts expire, so archived or replayed fixtures fail.

Room persistence is a two-run gate. Preserve the newly created `evidence.room.room.id` from one
successful run as `ACCEPTANCE_PERSISTED_ROOM_ID` for a later run, including a run after a Cloud
Run revision restart or deployment. A first run without an independently retained prior Room is
NG by design; it cannot prove persistence.

## Deployment targets

- `apps/web`: Firebase Hosting
- `apps/api`: Cloud Run using `apps/api/Dockerfile`
- Authentication: ADC locally and an attached Cloud Run service account in production
- Secrets: Secret Manager references exposed only to the API service
