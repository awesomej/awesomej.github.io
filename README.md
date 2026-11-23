# Talks

## Run the observability demo locally

1. Copy `.env.example` to `.env.local`.
2. Fill in `ANAM_API_KEY`, `ANAM_LLM_ID`, `ANAM_AVATAR_ID`, and `ANAM_VOICE_ID`.
3. Run `npm install` once.
4. Run `npm run dev`.
5. Open `http://127.0.0.1:4173/observability/`.

The Vite process serves both the static Reveal.js presentation and the local `/api/anam-session` endpoint. The API key is read only by `vite.config.js`; it is never sent to the browser. `.env.local` is ignored by Git.

The role-specific avatar and voice variables in `.env.example` are optional. If omitted, every character uses the shared avatar and voice while retaining a distinct name, role, knowledge boundary, and system prompt.
