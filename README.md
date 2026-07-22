<p align="center">
  <img src="assets/cover.jpg" alt="Poolside provider for Pi" width="800">
</p>

# pi-provider-poolside

[![npm](https://img.shields.io/npm/v/pi-provider-poolside)](https://www.npmjs.com/package/pi-provider-poolside)
[![CI](https://github.com/grikomsn/pi-provider-poolside/actions/workflows/ci.yml/badge.svg)](https://github.com/grikomsn/pi-provider-poolside/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A lean [Pi](https://github.com/earendil-works/pi-coding-agent) provider for the Poolside Platform OpenAI-compatible API.

## Features

- Discovers **every model available to your account** from Poolside's authenticated `GET /v1/models` endpoint
- Ships current Poolside Platform model metadata as an offline fallback
- Uses live context, output, modality, reasoning, and pricing metadata when Poolside returns it
- Supports Pi's thinking selector using Poolside's `reasoning: { effort }` request format
- Uses Pi's built-in OpenAI Chat Completions transport—no custom protocol or runtime dependency

## Install

```sh
pi install npm:pi-provider-poolside
```

To try a local checkout:

```sh
pi -e ./src/index.ts
```

## Authenticate

Create a key at [platform.poolside.ai](https://platform.poolside.ai/) and export it before starting Pi:

```sh
export POOLSIDE_API_KEY="your-key"
pi
```

You can instead store an API-key credential for the `poolside` provider in Pi's `auth.json` or override the provider in `models.json`.

Select a model with `/model`. Refresh the remote catalog with Pi's normal model refresh/update flow (`pi update --models`). If discovery is temporarily unavailable, the extension retains the last successful catalog, or the documented Laguna S 2.1, Laguna M.1, and Laguna XS 2.1 fallbacks on first use. As with every authenticated Pi provider, models become selectable after a key is configured.

## Thinking effort

Use Pi's thinking-level control as usual. Poolside receives OpenRouter-style reasoning configuration:

```json
{ "reasoning": { "effort": "high" } }
```

Laguna M.1, Laguna XS 2.1, and dynamically discovered reasoning models expose `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`. Laguna S 2.1 accurately exposes only `off` and `max`; Pi maps `max` to Poolside's highest wire-level value, `xhigh`.

## Model metadata

The fallback catalog follows Poolside's [supported-models documentation](https://docs.poolside.ai/get-started/supported-models) and [model release notes](https://docs.poolside.ai/release-notes/models):

| Model | Context | Max output | Input | Reasoning |
| --- | ---: | ---: | --- | --- |
| `poolside/laguna-s-2.1` | 262,144 | 32,768 | text | off / max |
| `poolside/laguna-m.1` | 262,144 | 32,768 | text | configurable effort |
| `poolside/laguna-xs-2.1` | 262,144 | 32,768 | text | configurable effort |

An authenticated `/models` response replaces this list, so newly released or account-specific models appear without an extension release. Poolside's richer response fields supply metadata for those models; if a deployment returns only the basic OpenAI model shape, the extension uses conservative text-model defaults until richer metadata is available. The Laguna S 2.1 weights support up to 1M context, but the hosted Poolside Platform endpoint currently advertises a 262,144-token serving limit, which is the limit used here.

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
