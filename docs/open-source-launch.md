# Open-source launch checklist

Use this as the final gate before changing the GitHub repository to public.

## Must complete before going public

- [x] Add the MIT source-code license.
- [x] Confirm the bundled character and interface images were AI-generated for the project and document their provenance.
- [x] Remove the proprietary `assets/fonts/Segoe UI Italic.ttf` from the public tree. The app now defaults to Nunito, whose OFL license is included.
- [x] Remove local-only tracked files: `.claude/settings.local.json`, `.codex/config.toml`, `.vscode/settings.json`, `HANDOVER.md`, and `tsconfig.tsbuildinfo`.
- [x] Review the complete launch diff and run a final secret scan across all Git history.
- [ ] Merge the launch branch into `main`; the current feature branch contains work that is not on the remote default branch.

## Product and documentation

- [x] Add an interface preview near the top of the README.
- [ ] Record a 30–60 second demo showing topic → editable plan → rendered output.
- [x] Verify setup from a fresh clone without the existing `output/`, ignored assets, or global development state.
- [x] Confirm that all required runtime assets are tracked and that their paths match `config.ts`.
- [x] Run `npm run check` without a populated `.env`; CI passes without paid API calls.
- [ ] Run one small end-to-end generation with a real key and confirm the main video, thumbnail, and three reels are playable.

## GitHub settings

- [ ] Add the description: `Local-first AI video studio for narrated explainers, debates, and social clips.`
- [ ] Add topics: `ai-video`, `nextjs`, `typescript`, `ffmpeg`, `openai`, `text-to-speech`, `content-creation`.
- [ ] Enable Issues, Discussions, private vulnerability reporting, and Dependabot security updates.
- [ ] Protect `main`: require the CI check and at least one approving review for outside contributions.
- [ ] Set the social preview image and verify the README renders correctly on GitHub.
- [ ] Create a `v1.0.0` release only after the fresh-clone and end-to-end checks pass.

## Launch-day sequence

1. Make the repository public and verify it in a logged-out browser window.
2. Re-run the Quick start from a fresh clone.
3. Publish the demo video and LinkedIn announcement.
4. Be available for the first few hours to answer setup questions and fix documentation gaps.
5. Convert repeated questions into README or troubleshooting improvements.

## LinkedIn announcement draft

I’m open-sourcing **KZR Video Generator** — a local-first AI video studio I built to turn a topic into a complete content pack.

Give it a topic and choose an explainer or a two-sided debate. It helps generate and review the script, metadata, thumbnail, voice-over, long-form video, and three vertical clips from one workflow.

The interesting engineering work wasn’t just connecting a model to a UI. I had to make a media pipeline that could survive partial failures, resume without repeating expensive stages, keep structured project state on disk, coordinate FFmpeg rendering, and still let a creator edit the result between steps.

The stack is **Next.js, TypeScript, OpenAI, and FFmpeg**. It runs locally, uses your own API credentials, and includes both a guided web interface and CLI workflows.

I’m sharing it because I’d like other builders to learn from it, challenge the architecture, and help shape where it goes next.

Repository: [add public GitHub URL]
Demo: [add demo video or GIF]

If you work on AI media tools, reliable pipelines, or creator workflows, I’d especially value your feedback.

#opensource #typescript #nextjs #ffmpeg #generativeai #buildinpublic

## Shorter LinkedIn version

I’m open-sourcing **KZR Video Generator**, a local-first Next.js + TypeScript app that turns a topic into an editable script, voice-over, thumbnail, long-form video, and three vertical clips using OpenAI and FFmpeg.

The part I’m proudest of is the workflow behind the demo: structured project state, resumable stages, cost tracking, editable outputs, and local media rendering instead of one fragile end-to-end call.

Repo: [add public GitHub URL]
Demo: [add demo link]

Feedback and contributions are welcome.

#opensource #typescript #nextjs #ffmpeg #generativeai
