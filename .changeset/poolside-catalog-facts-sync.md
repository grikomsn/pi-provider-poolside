---
"pi-provider-poolside": patch
---

Sync the bundled Poolside fallback with the served catalog as it stood before the 31 October 2026 platform shutdown (verified 2026-11-09): both Laguna models advertise a 262,144-token context and 32,768 max completion tokens (the earlier 1M S-2.1 entry no longer appears in the served catalog), `poolside/laguna-m.1` is no longer bundled, and the README documents the shutdown with pointers to Poolside's Hugging Face models for self-hosting.
