# Repository Guidelines

## Project Overview

This repository is a vanilla JavaScript Machi Koro web app for local and online play.

- Client game rules run in the browser.
- `server.js` manages rooms, validation, reconnect, and action relay for online games.
- The app is also maintained as a PWA, and recent work includes Service Worker update flow and Android/TWA packaging.

When changing behavior, keep local play, online sync, reconnect restore, saved-state handling, and PWA update behavior aligned.

## Project Structure & Ownership

Top-level files:

- `index.html`: app shell and script load order.
- `style.css`: all visual styling.
- `manifest.json`: PWA manifest.
- `sw.js`: Service Worker update and cache behavior.
- `server.js`: Express + Socket.IO server, room lifecycle, validation, reconnect, restore.
- `package.json`: runtime/test scripts.
- `.github/workflows/build-apk.yml`: Android/TWA build workflow.
- `TESTPLAN.md`: manual regression checklist for high-risk gameplay and online flows.

Client modules:

- `js/Card.js`: card catalog, effect/category constants, card helpers.
- `js/Player.js`: player state, landmark definitions, win checks.
- `js/GameManager.js`: source of truth for rules, phases, pending effects, logs.
- `js/CPU.js`: CPU evaluation and action selection.
- `js/online.js`: Socket.IO client flow, action application, online session bootstrap, restart recovery.
- `js/ui.js`: rendering, modals, logs, build menu, filters, tutorial UI.
- `js/storage.js`: local save/resume, reconnect persistence, settings storage.
- `js/main.js`: bootstrapping, event handlers, CPU scheduling, title/game flow orchestration.
- `js/audio.js`: sound helpers.
- `js/confetti.js`: confetti animation helpers.
- `js/stats.js`: gameplay stats helpers/UI support.

Tests:

- `tests/run-all.js`: test entrypoint used by `npm test`.
- `tests/gamemanager.test.js`: rules and phase regression tests.
- `tests/server.test.js`: server validation and room behavior tests.
- `tests/cpu.test.js`: CPU decision logic tests.
- `tests/online.test.js`: online client flow tests.
- `tests/main.test.js`: main bootstrap / flow regression tests.

Default ownership rules:

- Rule changes belong in `js/GameManager.js`.
- Card definitions, effect constants, and descriptions belong in `js/Card.js`.
- CPU tuning belongs in `js/CPU.js`.
- UI and modal behavior belong in `js/ui.js`.
- Save/reconnect persistence belongs in `js/storage.js`.
- Online client flow belongs in `js/online.js` and `js/main.js`.
- Server-side validation, room lifecycle, reconnect, and restore belong in `server.js`.

## Architecture Notes

Critical invariants:

- `GameManager` is the source of truth for gameplay rules.
- Online play is deterministic: the host generates authoritative actions and all clients replay them.
- The server does not own full game state; it validates actions and relays/rebuilds room state from session metadata and action logs.
- Long-running online rooms may compact old actions into a server-side `stateSnapshot`; reconnect logic must handle both snapshot restore and tail action replay.
- Reconnect and post-restart room recovery are first-class features, not edge cases.

Important gameplay/runtime details from the current implementation:

- Script load order matters. Preserve the dependency order defined in `index.html`.
- Use existing frozen constants such as `CARD_EFFECTS`, `CARD_CATEGORIES`, `LANDMARK_NAMES`, `GAME_PHASES`, and `LOG_TYPES` instead of string literals.
- Log entries are structured objects, not free-form strings.
- Player order can be shuffled for online play, so validations must use the server's mapped player order rather than assuming UI index equals socket player index.
- CPU turns are host-driven online. Changes to CPU action timing must be checked for duplicate sends and stalled turns.
- App-level Socket.IO failures use the dedicated `appError` event; avoid overloading transport-level `error`.
- Service Worker/version mismatch behavior is part of the product. If you touch cached assets, startup flow, or online game screens, consider update-banner and reload behavior.

When adding a new card or effect, update all relevant layers:

- `js/Card.js`: effect constant, description, and card data.
- `js/GameManager.js`: rule execution.
- `js/CPU.js`: evaluation/decision logic if needed.
- `js/ui.js`: available card sets or presentation where applicable.
- Tests covering the affected rule path.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `node server.js`: start the app locally at `http://localhost:3000`.
- `npm test`: run the full Node test suite via `tests/run-all.js`.
- `node --check server.js`: syntax-check the server.
- `node --check js/<file>.js`: syntax-check an edited client file.

Expected verification:

- If you edit one or more client files, run `node --check` on each edited `js/*.js` file.
- If you change rules, online flow, server validation, or shared gameplay behavior, run `npm test`.
- If you change online/reconnect behavior, manually verify room create/join, reconnect, host migration or restart recovery, CPU turns, and undo sync.
- If you change PWA/update behavior, manually verify Service Worker update prompts and reload behavior.

## Coding Style & Editing Conventions

- Use 4-space indentation in JS, HTML, CSS, and workflow YAML.
- Follow the existing browser-global/CommonJS style. Do not introduce a bundler, framework, or module-system rewrite casually.
- Use `camelCase` for functions and variables.
- Preserve existing Japanese card names, labels, and game terms.
- Match surrounding style exactly; there is no formatter or linter configured.
- Prefer extending existing constants and helper tables instead of adding new stringly-typed branches.
- Keep DOM-facing confirmation flows on the custom modal path; do not reintroduce native `confirm()`.

## Testing Guidance

- Add or update regression tests in the most relevant file under `tests/`.
- Prefer targeted assertions around rules, validation, replay safety, and edge-case state transitions.
- UI-only animation/presentation changes may need manual verification instead of Node tests.
- Use `TESTPLAN.md` for high-risk manual scenarios, especially around pending actions, online CPU flow, reconnect, undo, and invalid target handling.

## Commit & Pull Request Guidelines

Recent history shows a clear convention:

- Use a prefix such as `feat:`, `fix:`, `docs:`, or `debug:`.
- Write the subject in concise Japanese.
- Keep the subject focused on the behavioral change, often with a short parenthetical when it clarifies the failure mode.

Examples from recent history:

- `feat: サーバー再起動後にオンラインゲームへ復帰できる機能を追加`
- `fix: シャッフル後の人間プレイヤーアクションがサーバーで拒否されるバグを修正`
- `fix: タイトル画面中のSW更新を自動適用（ゲーム中は手動バナー）`
- `docs: CLAUDE.mdを最新状態に更新`

Prefer small, behavior-focused commits. Separate gameplay, online/server, PWA, and CI/APK changes unless they are tightly coupled.

PRs should include:

- What behavior changed.
- Which files/modules were touched.
- Automated checks run.
- Manual verification performed, especially for online/PWA changes.
- Screenshots or recordings for visible UI changes.

## Environment Notes

This repository is often worked on from Android + Termux. Avoid assumptions that only hold on a full desktop shell environment.

- Some tooling notes in `CLAUDE.md` are specific to Termux and `termux-chroot`.
- Keep commands simple and portable where possible.
- If you add workflow or build steps, prefer reproducible non-interactive commands.
