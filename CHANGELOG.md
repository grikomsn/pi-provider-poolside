# Changelog

## 0.1.0

- Add a lean Poolside provider for Pi using the OpenAI-compatible chat completions API.
- Discover account-specific models and metadata from Poolside's authenticated `/models` endpoint.
- Cache the last successful model catalog and provide hosted-model fallbacks.
- Map Pi thinking levels to Poolside reasoning efforts, including Laguna S 2.1's off/max modes.
- Add tests, package metadata, Changesets, CI, and npm trusted publishing.
