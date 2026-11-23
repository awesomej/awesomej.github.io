# Anam session-token worker

This worker keeps the Anam API key out of the GitHub Pages client and creates a short-lived, tightly bounded persona for each meeting slide.

## Required Worker configuration

- Secret: `ANAM_API_KEY`
- Variable: `ANAM_LLM_ID`
- Variables: `ANAM_COO_AVATAR_ID`, `ANAM_COO_VOICE_ID`
- Variables: `ANAM_PRODUCT_AVATAR_ID`, `ANAM_PRODUCT_VOICE_ID`
- Variables: `ANAM_COMMERCIAL_AVATAR_ID`, `ANAM_COMMERCIAL_VOICE_ID`
- Variables: `ANAM_ENGINEERING_AVATAR_ID`, `ANAM_ENGINEERING_VOICE_ID`
- Variable: `ALLOWED_ORIGIN` set to the exact origin hosting the slides

Deploy the worker, then place its URL in `../config.js`. Serve the presentation over HTTPS so the browser can grant microphone access.

The persona prompts live in `worker.js`. They deliberately limit each character to the evidence available at that point in the story.

For local development, the repository's Vite server provides the same endpoint. See the root `README.md`.
