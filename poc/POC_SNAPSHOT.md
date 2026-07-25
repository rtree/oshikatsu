# Verified PoC Snapshot

The validated integration console remains in `console/apps/web` and must not be used as the formal Reader UI implementation surface.

- Git baseline: `97085ac`
- Production URL: https://ethglobal-lisbon2026-oshikatsu.web.app/?wallet-test=1
- Cloud Run service: `oshikatsu-api`
- World ID: production protocol 4.0 `proof_of_human`
- Hedera: HashPack-paid single-message Topic Submit confirmed through Mirror Node
- Testnet topic: `0.0.9745676`
- Verified wallet payer: `0.0.9706029`
- Gate evidence: GitHub Issues #1, #2, and #3

The PoC owns integration diagnostics and acceptance spikes. The standalone `reader` project owns the formal product experience. Do not point Firebase Hosting at `reader/dist` until it has an explicitly separate preview site or deployment target.