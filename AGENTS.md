# Repository Guidelines

## Project Structure & Module Organization

This repository is a small vanilla JavaScript web app for Machi Koro.

- `index.html`: app shell and script loading order.
- `style.css`: all UI styling.
- `server.js`: Express + Socket.IO server for static hosting and online play.
- `js/Card.js`: card definitions and card factory helpers.
- `js/Player.js`: player state model.
- `js/GameManager.js`: core game rules and turn flow.
- `js/CPU.js`: CPU decision logic.
- `js/main.js`: UI, rendering, local storage, online sync, and client actions.

There is currently no `tests/` directory.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `node server.js`: run the local server on `http://localhost:3000`.
- `node --check server.js`: syntax-check the server.
- `node --check js/main.js`: syntax-check a client script after edits.

`npm test` is only a placeholder and currently exits with an error by design.

## Coding Style & Naming Conventions

- Use 4-space indentation in JavaScript, HTML, and CSS.
- Prefer plain ES/CommonJS patterns already used in the repo; do not introduce a framework or bundler casually.
- Keep browser globals simple and explicit.
- Use `camelCase` for functions/variables and preserve existing Japanese game term names in strings and card names.
- Keep files focused:
  rule changes in `js/GameManager.js`, UI changes in `js/main.js`, card content in `js/Card.js`.

There is no configured formatter or linter, so match the surrounding style exactly.

## Testing Guidelines

There is no automated test suite yet. Validate changes with targeted checks:

- Run `node --check` on edited JS files.
- Test both local play and online play when changing shared game logic.
- For online changes, verify room create/join, reconnect, CPU turns, and sync-sensitive actions such as build/undo.

If you add tests, place them in a new `tests/` directory and keep names aligned with the module under test.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example:

- `Validate online actions on server`
- `Preserve dormancy when moving cards`

Follow the same pattern: one-line, present-tense, action-first summaries.

PRs should include:

- a short description of the behavior change
- affected areas (`server.js`, `js/GameManager.js`, etc.)
- manual verification steps
- screenshots or screen recordings for visible UI changes

## Architecture Notes

The server validates and relays online actions, but most game rules live in `js/GameManager.js`. Keep client and server behavior aligned when changing online flow, undo logic, stock handling, or CPU automation.
