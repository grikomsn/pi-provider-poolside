# Changelog

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
