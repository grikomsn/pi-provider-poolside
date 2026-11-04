# Changelog

## 0.1.3

### Patch Changes

- 8c41bf6: Restore live model discovery on current pi and honour saved defaults on discovered models at startup.

  - pi 0.84 replaced the refresh context's `store` accessor with a read-only `stored` snapshot and `publish()`. The extension still called `context.store.read()`, so every catalog refresh failed on pi ≥ 0.84: only the three bundled models were ever listed and no discovered catalog was saved. Refreshes now use `stored`/`publish`.
  - The catalog pi persisted on a previous run is registered up front. pi picks the startup model (`defaultProvider`/`defaultModel`, or a resumed session's model) before its first cache refresh lands, so a saved default on a model outside the bundled list used to fall back to another model. The bundled list is still used when nothing has been discovered yet, and a refresh still replaces the seed.
  - `GET /v1/models` retries transient failures (429/502/503/504 and connection errors, honouring `Retry-After` up to 5s, at most three attempts), and refuses redirects so the API key is never forwarded elsewhere.

## 0.1.2

### Patch Changes

- 1ea35ab: Update the Laguna S 2.1 fallback metadata to its verified 1,048,576-token context window and 131,072-token output limit.

## 0.1.1

### Patch Changes

- 10b9c76: Exclude the repository-only icon from the npm package while retaining the cover used by the npm README and Pi package gallery.

## 0.1.0

- Add a lean Poolside provider for Pi using the OpenAI-compatible chat completions API.
- Discover account-specific models and metadata from Poolside's authenticated `/models` endpoint.
- Cache the last successful model catalog and provide hosted-model fallbacks.
- Map Pi thinking levels to Poolside reasoning efforts, including Laguna S 2.1's off/max modes.
- Add tests, package metadata, Changesets, CI, and npm trusted publishing.
