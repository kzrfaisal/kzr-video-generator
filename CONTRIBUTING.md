# Contributing to KZR Video Generator

Thanks for helping improve the project. Bug reports, documentation fixes, tests, and focused feature proposals are welcome.

## Before you start

- Search the existing issues before opening a new one.
- For a large feature or architectural change, open a discussion or feature request first so the approach can be agreed before implementation.
- Never include API keys, access tokens, generated user projects, or private media in an issue or pull request.

## Local development

You need Node.js 20.9 or newer plus FFmpeg and FFprobe on `PATH`.

```bash
npm install
cp .env.example .env
npm run next:dev
```

An OpenAI key is needed only for generation and speech calls. The standard verification commands do not make paid API calls:

```bash
npm run check
```

## Pull requests

1. Keep each pull request focused on one concern.
2. Add or update tests for behavior changes.
3. Update the README or files under `docs/` when commands, configuration, or architecture change.
4. Run `npm run check` before submitting.
5. Explain user-visible changes, validation performed, and any remaining tradeoffs in the pull request description.

Generated files under `output/`, temporary files, local credentials, and editor/agent settings should not be committed.

## Architecture

Read [`docs/architecture.md`](docs/architecture.md) before introducing a new dependency direction or moving pipeline behavior into the web layer. The project deliberately keeps domain logic, local infrastructure, external services, and the Next.js interface separated.

## Reporting security issues

Please do not disclose a vulnerability in a public issue. Follow [`SECURITY.md`](SECURITY.md) instead.
