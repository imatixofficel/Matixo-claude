# Matixo|Claude

**English** · [فارسی](README.md)

A local multi-provider gateway that lets Claude Code talk to any OpenAI-compatible API. It ships with a **bilingual (Persian / English) dashboard**, local key storage, and an Anthropic Messages → OpenAI Chat Completions translator.

GitHub: [github.com/imatixofficel](https://github.com/imatixofficel)

> This is a compatibility layer, not a full re-implementation of Anthropic's API. Text, images, tool calling and streaming work; PDFs, prompt caching and computer use are not supported.

## Features

- RTL/LTR dashboard in Persian and English (choice is remembered) with the bundled Vazirmatn font — no CDN, no Google Fonts
- Live traffic chart and request table (count, errors, latency, tokens) — kept in memory only
- Fetch the live model list from your provider, or type any model name
- Multiple custom providers with your own names
- Smart routing: Haiku requests go to the *fast* model, everything else to the *main* model
- Automatic `max_tokens` correction when it exceeds the model limit; `o`-series / `gpt-5` support (`max_completion_tokens`)
- CSRF / DNS-rebinding protection for the local panel
- 50+ automated tests and GitHub Actions

## Requirements

- Node.js 18.17+ (20 or 22 recommended)
- Claude Code installed (`claude` command)
- An API key from a compatible provider

## Install

```bash
npm install -g git+https://github.com/imatixofficel/matixo-claude.git
matixo
```

From source:

```bash
git clone https://github.com/imatixofficel/matixo-claude.git
cd matixo-claude && npm install && npm link
```

## Quick start

```bash
matixo          # start the server and open the dashboard (http://127.0.0.1:3456)
matixo launch   # open the dashboard and let its button start Claude Code
```

Add a key in **Providers**, pick models in **Models**, then press **Run Claude Code**.

| Command | Purpose |
|---|---|
| `matixo` | start the server and open the dashboard |
| `matixo start [-p port]` | server only (port applies to this run only) |
| `matixo launch [-p port]` | dashboard + run Claude Code from the button |
| `matixo config` | show settings (keys masked) |
| `matixo reset` | reset settings and delete keys |
| `matixo env [-s bash\|powershell\|cmd]` | print the environment variables for Claude Code |

Without `launch`:

```bash
eval "$(matixo env)" && claude                              # Bash / Zsh
matixo env --shell powershell | Invoke-Expression; claude   # PowerShell
```

## Environment variables (optional)

`MATIXO_PORT` · `MATIXO_AUTH_TOKEN` · `MATIXO_DATA_DIR` — see `.env.example`.

## Security

- Settings live in `data/config.json` (git-ignored, mode `600`).
- The server listens on `127.0.0.1` only and rejects requests with a non-local `Host` or foreign `Origin`.
- Provider keys are never sent back to the browser (masked only). The JSON file is not encrypted — use disk encryption.

## Known limitations

- OpenAI-compatible APIs only.
- PDFs, extended thinking, prompt caching and batch are not translated; images inside tool results are ignored.
- Token counting is an estimate.

## Development

```bash
npm install
npm test
```

## License

MIT. Vazirmatn fonts are distributed under the OFL.
