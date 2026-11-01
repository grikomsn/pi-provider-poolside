---
"pi-provider-poolside": patch
---

Restore live model discovery on current pi and honour saved defaults on discovered models at startup.

- pi 0.84 replaced the refresh context's `store` accessor with a read-only `stored` snapshot and `publish()`. The extension still called `context.store.read()`, so every catalog refresh failed on pi ≥ 0.84: only the three bundled models were ever listed and no discovered catalog was saved. Refreshes now use `stored`/`publish`.
- The catalog pi persisted on a previous run is registered up front. pi picks the startup model (`defaultProvider`/`defaultModel`, or a resumed session's model) before its first cache refresh lands, so a saved default on a model outside the bundled list used to fall back to another model. The bundled list is still used when nothing has been discovered yet, and a refresh still replaces the seed.
- `GET /v1/models` retries transient failures (429/502/503/504 and connection errors, honouring `Retry-After` up to 5s, at most three attempts), and refuses redirects so the API key is never forwarded elsewhere.
