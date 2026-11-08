<p align="center">
  <img src="assets/cover.jpg" alt="Poolside provider for Pi" width="800">
</p>

# pi-provider-poolside

> [!WARNING]
> **Poolside Platform inference shut down on 31 October 2026.** The hosted API this provider talks to (`inference.poolside.ai`) no longer serves requests, so discovery and inference fail until the endpoint is replaced. Poolside's models are available on [Hugging Face](https://huggingface.co/poolside) for self-hosting; this provider is not compatible with a self-hosted endpoint today (the base URL is fixed, not configurable). The repository is archived.

[![npm](https://img.shields.io/npm/v/pi-provider-poolside)](https://www.npmjs.com/package/pi-provider-poolside)
[![CI](https://github.com/grikomsn/pi-provider-poolside/actions/workflows/ci.yml/badge.svg)](https://github.com/grikomsn/pi-provider-poolside/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A lean [Pi](https://github.com/earendil-works/pi-coding-agent) provider for the Poolside Platform OpenAI-compatible API (now shut down — see the notice above).

## Features

- Discovered **every model available to your account** from Poolside's authenticated `GET /v1/models` endpoint
- Shipped current Poolside Platform model metadata as an offline fallback
- Used live context, output, modality, reasoning, and pricing metadata when Poolside returned it
- Supported Pi's thinking selector using Poolside's `reasoning: { effort }` request format
- Used Pi's built-in OpenAI Chat Completions transport—no custom protocol or runtime dependency

## Install

```sh
pi install npm:pi-provider-poolside
```

To try a local checkout:

```sh
pi -e ./src/index.ts
```

## Authenticate

**The Poolside Platform shut down on 31 October 2026** — keys can no longer be created or used, and the hosted inference endpoint is gone. The instructions below remain for historical reference only.

Historically, you would create a key at [platform.poolside.ai](https://platform.poolside.ai/) and export it before starting Pi:

```sh
export POOLSIDE_API_KEY="your-key"
pi
```

You can instead store an API-key credential for the `poolside` provider in Pi's `auth.json` or override the provider in `models.json`.

Before the shutdown, model selection worked as follows: select a model with `/model`, refresh the remote catalog with Pi's normal model refresh/update flow (`pi update --models`). Transient discovery failures (rate limits, gateway errors, dropped connections) were retried briefly; if discovery was unavailable, the extension retained the last successful catalog, or the documented Laguna S 2.1 and Laguna XS 2.1 fallbacks on first use. The last discovered catalog was also registered at startup, so a saved `defaultProvider`/`defaultModel` pointing at a discovered model (one outside the bundled list) was honoured in every launch, including `pi -p`. As with every authenticated Pi provider, models became selectable after a key was configured.

Live discovery required Pi 0.84 or newer (older versions kept the bundled catalog).

## Thinking effort

Use Pi's thinking-level control as usual. Poolside receives OpenRouter-style reasoning configuration:

```json
{ "reasoning": { "effort": "high" } }
```

Laguna XS 2.1 and dynamically discovered reasoning models exposed `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`. Laguna S 2.1 accurately exposed only `off` and `max`; Pi maps `max` to Poolside's highest wire-level value, `xhigh`.

## Model metadata

The fallback catalog mirrored Poolside's [supported-models documentation](https://docs.poolside.ai/get-started/supported-models) and [model release notes](https://docs.poolside.ai/release-notes/models), last synced against the served catalog on 2026-11-09, days before the shutdown (limits as the hosted API served them):

| Model | Context | Max output | Input | Reasoning |
| --- | ---: | ---: | --- | --- |
| `poolside/laguna-s-2.1` | 262,144 | 32,768 | text | off / max |
| `poolside/laguna-xs-2.1` | 262,144 | 32,768 | text | configurable effort |

`poolside/laguna-m.1` was not in the served catalog; if an account still listed it, live discovery surfaced it with the generic reasoning-model metadata.

While the platform was up, an authenticated `/models` response replaced this list, so newly released or account-specific models appeared without an extension release. Poolside's richer response fields supplied metadata for those models; with a deployment returning only the basic OpenAI model shape, the extension keeps the fallback metadata until richer metadata is available. When `/models` reports a live serving limit, that value takes precedence over the fallback—for example, a deployment may advertise a smaller Laguna S 2.1 context window than the served value.

## Development

```sh
npm install
npm run check
```

## Project

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release process](RELEASING.md)

## License

MIT
