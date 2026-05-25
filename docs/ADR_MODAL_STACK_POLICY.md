# ADR: Modal stack / deny-nesting policy

Date: 2026-05-24

Status: Accepted

## Context

The UI now has a shared interactability contract through `collectUiLockSnapshot()`, `validateUiInteractability()`, and `recoverUiInteractability()`. Recent iPhone/Safari bugs showed that stale modal, inert, display, and pointer-event state can make logically allowed actions physically unclickable.

The remaining design question is not another one-off recovery guard. It is whether the app should support a modal stack, deny nested modals, or use a hybrid policy for game-critical dialogs.

Current modal-like surfaces include:

- `confirmModal`
- `pendingModal`
- `rulesModal`
- `cardDetailModal`
- `cardSelectModal`
- PWA install/update banners
- notice/toast surfaces

## Decision Drivers

- Do not block legal game actions behind stale UI state.
- Keep modal lifecycle simple enough for AI-assisted maintenance.
- Preserve accessibility requirements: focus trap, Esc close where safe, focus restore, `aria-modal`, and inert background handling.
- Avoid breaking pending resolver, confirm, and card selection flows.
- Keep Safari/iPhone behavior deterministic.

## Options

### Option A: Full modal stack

Allow multiple modal roots to be open at once. Maintain a stack of modal descriptors with open order, previous focus, background lock ownership, Esc behavior, and close callbacks.

メリット:

- Supports nested interactions such as card detail inside card selection.
- Each modal can restore focus to its immediate opener.
- Future complex UI workflows have a general mechanism.

デメリット:

- Highest implementation complexity.
- Requires strict stack ownership for inert, aria-hidden, pointer-events, focus trap, and body classes.
- Easy for future edits to pop the wrong modal or leak background locks.
- More difficult to test across Safari, PWA, pending resolver, and restart flows.

実装リスク:

- Existing helper functions assume a small number of modal roots and direct close calls.
- Incorrect stack unwind could reintroduce `ancestorBlocked`, stale `inert`, or hidden root bugs.
- Needs broad DOM tests and real-device manual verification.

### Option B: Deny nested modals globally

Only one blocking modal can be active. Opening a new modal while another blocking modal is active is rejected, logged, or routed to a non-blocking notice.

メリット:

- Smallest runtime model.
- Easier to reason about and test.
- Reduces hidden state and AI mis-edit risk.
- Matches the recent recovery invariant: visible modal, if any, must be the one interactive lock owner.

デメリット:

- Some flows need redesign if they currently expect detail-over-selection behavior.
- Users may lose convenient nested inspection unless the parent view exposes inline detail.
- Hard rejection could feel abrupt unless the caller has a fallback.

実装リスク:

- Existing flows must be audited so denied openings do not silently drop required user choices.
- Card detail and rules/help surfaces may need conversion to inline or non-blocking panels.

### Option C: Hybrid deny-by-default with explicit stack exceptions

Deny nested blocking modals by default. Permit only documented exceptions with a modal registry entry that defines owner, parent, close order, focus restore target, and whether background lock may be inherited.

メリット:

- Keeps the common case simple.
- Allows carefully justified nested flows if needed.
- Gives tests and future agents a single registry to inspect.
- Reduces accidental modal nesting while avoiding a hard product limitation.

デメリット:

- More complex than global deny.
- Requires discipline: every exception must include tests and documentation.
- Partial stack support can still be misunderstood as full stack support.

実装リスク:

- Registry drift if modal open/close helpers bypass it.
- Incomplete exception tests could leave Safari-only pointer-event or focus bugs.

## Decision

Adopt Option C, narrowed for the current implementation stage: deny nested blocking modals by default, with no initial nested blocking modal exceptions. Future exceptions require a registry entry, targeted tests, and manual mobile verification.

Default policy:

- Only one blocking modal may own background inert/pointer lock at a time.
- Attempting to open a second blocking modal should fail closed with diagnostics and a non-blocking notice when user-visible feedback is useful.
- Non-blocking notice/toast and PWA banners are not blocking modals, but they must not steal focus from active game choices.
- `pendingModal` is game-critical and should not be nested under another blocking modal.

Exception policy:

- A nested blocking modal is allowed only if it is registered with:
  - modal id
  - parent modal id
  - opener action
  - close order
  - focus restore target
  - whether Esc closes child only or the entire stack
  - tests that cover open, close, Esc, focus restore, and background lock ownership

## Test Policy

Current tests cover the implemented base policy, and future exception tests must cover:

- Opening a second unregistered blocking modal is denied and leaves the first modal interactive.
- Closing the active modal restores background state only when no registered child remains open.
- `pendingModal` cannot be hidden behind `confirmModal`, `cardDetailModal`, or `rulesModal`.
- Restart/reset closes all blocking modal state and clears modal lock ownership.
- Esc and focus restore work for the base modal and any registered exception.
- `validateUiInteractability()` reports a specific issue when an unregistered nested modal is detected.

Manual verification remains required for:

- iPhone Safari focus behavior.
- Android Chrome/PWA standalone mode.
- Long pending resolver flows with card detail/rules interaction.

## Implementation Status

The base policy is implemented: blocking modal opens are deny-by-default through `MODAL_POLICY_REGISTRY`, and `MODAL_STACK_EXCEPTION_REGISTRY` is intentionally empty. Denied opens are diagnostics, and `recoverUiInteractability()` remains a fallback for stale locks rather than a modal stack unwinder.

Future work is limited to explicit exceptions or new modal UX:

- Keep new blocking modal flows simple.
- Do not add nested modal behavior without a registry entry, targeted tests, and mobile manual verification.
- Prefer inline detail or non-blocking notices for secondary information.
- If an exception is accepted later, document close order, focus restore, Esc behavior, and background lock ownership before implementing it.
