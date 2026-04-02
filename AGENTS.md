# Repository Guidelines

## Project Structure & Module Organization

This repo is a small vanilla JavaScript Machi Koro web app.

- `index.html`: app shell and script load order.
- `style.css`: all visual styling.
- `server.js`: Express + Socket.IO server for local hosting and online rooms.
- `js/Card.js`: card data, shared catalog, card factory helpers.
- `js/Player.js`: player state model.
- `js/GameManager.js`: rules engine, turn flow, pending effects.
- `js/CPU.js`: CPU decision logic.
- `js/ui.js`: rendering, tutorial UI, log UI, card/rules modals.
- `js/storage.js`: save/resume, reconnect, undo, settings persistence.
- `js/main.js`: game bootstrapping, online wiring, CPU scheduling, input handlers.
- `tests/gamemanager.test.js`: regression tests for core rules.

Keep rule changes in `js/GameManager.js`, UI work in `js/ui.js`, persistence in `js/storage.js`, and network flow in `server.js` / `js/main.js`.

## Build, Test, and Development Commands

- `npm install`: install runtime dependencies.
- `node server.js`: start the app locally at `http://localhost:3000`.
- `npm test`: run `tests/gamemanager.test.js`.
- `node --check js/main.js`: syntax-check a client file after edits.
- `node --check server.js`: syntax-check the server.

When touching multiple client files, run `node --check` on each edited `js/*.js` file.

## Coding Style & Naming Conventions

- Use 4-space indentation in JS, HTML, and CSS.
- Follow existing plain browser-global/CommonJS patterns; do not add a bundler or framework casually.
- Use `camelCase` for functions and variables.
- Preserve existing Japanese card names, labels, and game terms.
- Match surrounding style exactly; there is no formatter or linter configured.

## Testing Guidelines

- Add or update regression tests in `tests/gamemanager.test.js` when changing rules.
- After client refactors, run syntax checks plus `npm test`.
- For online changes, manually verify room create/join, reconnect, CPU turns, build, and undo sync.

## Commit & Pull Request Guidelines

Recent history uses short imperative commit subjects, for example:

- `Split UI and storage helpers from main`
- `Expand tutorial levels and log details`
- `Fix per-card pending action selection`

Keep commits focused and action-first. PRs should include the behavior change, affected files, manual verification steps, and screenshots for visible UI changes.

## Architecture Notes

`GameManager` is the source of truth for rules. The server validates and relays online actions, while the client renders state and schedules CPU play. Keep server validation, client actions, and saved-state restore logic aligned whenever you change online flow or turn resolution.
