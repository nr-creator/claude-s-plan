# CLAUDE.md — handoff for continuing work on «План»

Read this first in a new chat. It is the working memory of the project: what exists, why it is built this way, how to change it safely, and what is still open. The user-facing guide is `README.md` (Ukrainian).

## 1. The user and how to work with them

- **Language.** Writes in Ukrainian or English. Answer in the language of the latest message. The app UI is bilingual (uk/en); every new string goes into both dictionaries in `js/i18n.js`.
- **Explanations.** Plain language, start from the core of how a mechanism works, **no analogies**.
- **UX bar.** Very demanding about convenience: minimal clicks, everything obvious, yet rich functionality. When they say "make it better", propose improvements boldly, including better ideas than asked.
- **Hard rule: no emoji in the UI.** Icons are hand-made SVGs in `js/icons.js`.
- **Look.** They disliked the first green "blackboard" theme. The current default is neutral grey with a blue accent, a graphite dark theme, plus the deep "Вигляд" customization. Keep it standard and polished.
- **Subjects ≠ folders.** They explicitly want these kept separate.
- **Git.** When asked to "commit but don't push", commit only. They push themselves.
- **Their setup.**
  - Fedora KDE laptop (`narrow-fedora`) with Chrome; also an Android phone and Windows.
  - GitHub user `nr-creator`.
  - Code repo: `nr-creator/claude-s-plan` (public, GitHub Pages) → https://nr-creator.github.io/claude-s-plan/
  - Remote uses SSH (`git@github.com:...`).
  - Planned: data repo `plan-data` (private) and a free GitHub organization for the shared space with a friend.

## 2. Where things live and how to deliver changes

- **Local repo on the user's machine:** `/home/nerov/Projects/Personal/Claude's-Plan` (connected through the Claude desktop app). In `device_bash` it is `$HOME/mnt/Claude's-Plan`.
- **Workflow that worked:**
  1. Copy the repo into the cloud workspace and edit there.
  2. Run the tests there: there is Chrome + Playwright; on the user's machine there is not.
  3. Stage the changed files under `/mnt/user-data/outputs/…`.
  4. `device_commit_files` them to the folder. At most 50 files per call; check mtimes with `device_list_dir` first, so you don't overwrite the user's own edits.
  5. Commit with `device_bash`.
- **Before any git command in `device_bash`,** call `device_request_delete_permission` for the folder. Git creates and removes `.git/index.lock`; without delete permission it leaves a stale lock and git breaks.
- **Commit identity.** `device_bash` has no global git config. Use `git -c user.name="Artom Nerivnia" -c user.email="nerovnaartem006@gmail.com" commit …`. That email is private: use it only for commits.
- **Icons show up as "modified".** File transfer embeds C2PA metadata into `.png`/`.svg`, so icons look changed although the images are identical. Run `git checkout -- icons/` before committing unless icons really changed.
- **Starting the cloud workspace.**
  - Run `python3 -m http.server 8123` (with `setsid nohup`) from the repo dir. It dies when the session pauses, so restart it before tests.
  - Playwright: `import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs'` with `executablePath: '/usr/bin/google-chrome'`.
  - Python has PIL and cv2. cv2 is used to verify QR codes.
- **Releasing a change to users.** Bump `VERSION` in `sw.js` (`plan-vX.Y.Z`) **and** `VERSION` in `js/views/settings.js`. Add every new JS file to `FILES` in `sw.js`: precache uses `addAll`, so a missing file breaks offline install. The app then shows «Доступна нова версія → Оновити».

## 3. Architecture in one screen

- **Stack and runtime.** Pure ES modules, no build step, no frameworks, **no third-party code, fonts or CDNs**. That is deliberate: it is the security model.
- **CSP** in `index.html` allows scripts only from self and network only to `api.github.com`.
- **App = static files** on GitHub Pages. A Service Worker (`sw.js`) caches them, so the app opens offline. PWA install works on Android, Windows and Fedora with Chrome (Firefox on Linux can't install PWAs).
- **Data = full local copy** in IndexedDB (`js/db.js`), managed by `js/store.js`. Every change is written locally first and marked `dirty`, then synced.
- **Spaces.** One space = one GitHub repo (personal, shared…), or "local only" when no remote is set. Config lives in `localStorage` (`plan.spaces`), **including tokens**: fine-grained PAT with Contents: Read and write on one repo. Settings are in `plan.settings`.
- **Sync** (`js/sync.js` + `js/github.js` + `js/merge.js`), Git Data API.
  - **Pull.** Get the branch ref; if it equals the remembered head, stop (1 request). Otherwise get the recursive tree, compare blob SHAs with each record's `baseSha`, and fetch only the changed blobs.
  - **Push.** Build all dirty records into one tree, one commit and one ref update. A 422 (not fast-forward) means pull and retry.
  - **Blob SHA** is computed locally (`gitBlobSha` in `util.js`).
  - **Empty repo.** A 409 on the ref means the repo is empty: create a README via the Contents API first.
  - **Merge** (`merge3`). Per field: whichever side changed wins. If both changed the body, a line-level diff3 runs; overlaps keep the winner's lines and insert a `> [!conflict]` callout with the loser's lines. Any other field changed on both sides goes to the later `updatedAt`. Sets (`doneDates`, `exdates`) are merged. Losers are written to the conflict log (meta `conflicts`) and can be restored.
  - **Deletions.** Soft delete sets `deletedAt` (trash, 30 days). Purge sets `purge: true` and deletes the file on the next push.
- **Record files** in a data repo: Markdown with a flat front-matter (`js/format.js`; complex values are stored as JSON).
  - `entries/<uuid>.md` holds events, tasks and notes as one entity type. Fields: `title`, `date`, `endDate`, `time`, `end`, `task`, `done`, `doneDates`, `subject`, `folder`, `repeat{freq,interval,days,until,count}`, `exdates`, `parent` + `occurrence` (class notes for one occurrence of a recurring event), `pinned`, `location`, `icsUid`, `createdAt/By`, `updatedAt/By`, `deletedAt`, and the body.
  - `subjects/<uuid>.md`: name, color key, teacher, room, link, archived.
  - `folders/<uuid>.md`: name, parent. Folders are separate from subjects and nested.
  - `assets/<uuid>.<ext>`: images. They are fetched lazily and cached in the IDB `blobs` store.
- **Notes editor** (`js/editor.js`, the largest file). A flat array of blocks with `indent` (model in `js/md.js`, serialized as plain Markdown), one `contenteditable` per text block.
  - **Block types:** p, h1–3, ul, ol, todo, toggle (`+ `), quote, callout (`> [!kind]`), code, math (`$$`), hr, image, table.
  - **Inline:** bold, italic, strikethrough, highlight (`==`), code, links, wiki links `[[Title|id]]`, math `$…$`, `#tags`.
  - **Undo/redo** is our own snapshot history.
  - **Important invariant:** while re-rendering (`rendering` counter), ignore `focusout`. Otherwise stale DOM text is read back into the model (this was a real bug).
- **Math** (`js/math.js`): our own LaTeX → MathML converter; browsers render MathML natively.
- **Colors.** `colorOf(e)` in `cal.js`: `e.color` → subject color → space color (`spaceColor`, 'accent'/'ink' = theme accent); `look.eventColorBy: 'space'` puts space above subject. Spaces have optional `icon` (`SPACE_ICONS`, `spaceIcon` in `ui.js`).
- **Quick add** (`js/parse.js` + `js/qa.js`). Settings `qaMode` ('buttons'|'menu'), `qaLabels`, `qaHidden` (space ids). Buttons don't steal focus (pointerdown preventDefault). Parses uk/en dates, times, ranges and repeats (`щопн`, `по пн, ср`, `every mon`), `!`/`[]` for tasks, `#name`. `#name` becomes a subject **only if that subject exists**; otherwise it is a hashtag kept in the text. Chips show what was recognized; clicking a chip ignores it. Space buttons: «Собі» / «Спільне».
- **Appearance** (`js/theme.js` + `js/views/appearance.js`). `settings.look` is turned into CSS variables on `<html>`. It includes presets, mode, OLED black, contrast, any accent (auto-lightened if invisible on the background), background tint, density, radius, UI font, scale (root font-size %), event style, hour height, weekends, week numbers, sidebar parts, quick-add mode (`top` or `key` = floating on N), and motion. All CSS sizes are in `rem` and vars, so scaling works.
- **Other modules.**
  - `ics.js` + `zip.js` + `views/ics-ui.js`: Google Calendar import (.zip/.ics, time zones, RRULE/EXDATE/RECURRENCE-ID, dedupe by `icsUid`) and export.
  - `transfer.js` + `qr.js`: device setup via a QR/link `#setup=…`, deflated and optionally AES-GCM encrypted with a PIN (PBKDF2).
  - `search.js`: Ctrl+K palette with entries, subjects, folders, `#tags`, dates and commands.
  - `app.js`: shell, hash routes, panel, shortcuts, swipes, reminders, SW registration, startup cleanup of blank notes.
- **Routes:** `#/today`, `#/cal/<day|week|month>/<date>`, `#/notes`, `#/subjects`, `#/subject/<id>`, `#/settings`, `#/appearance`, `#/trash`, `#/conflicts`. Opening an entry appends `?open=<space>|<id>[|<occurrence>]` (Back closes it).
- **Debug handle:** `window.__plan = { store, sync, state }`. Tests use it heavily.

## 4. Tests

```
python3 -m http.server 8123   # in repo root, background
node tests/unit-core.mjs      # parser, recurrence, front-matter, i18n plurals
node tests/unit-md.mjs        # blocks <-> markdown, inline, math, tags
node tests/unit-io.mjs        # merge3/diff3, ics, zip, qr (writes qr*.json for cv2 check)
node tests/e2e-sync.mjs       # 3 "devices" against tests/fake-github.mjs (faithful Git Data API fake)
node tests/e2e-spaces-ui.mjs   # space colors/icons, per-event color, quick-add buttons and their settings
node tests/e2e-smoke.mjs e2e-editor.mjs e2e-mobile.mjs e2e-ics.mjs e2e-offline.mjs e2e-theme.mjs e2e-look.mjs e2e-look-ui.mjs e2e-folders.mjs
```

The whole suite was green at commit `e4d9bc7`. Screenshots (`tests/*.png`) are git-ignored. Look at them after UI changes. The real GitHub API has **never** been hit from the sandbox, only the fake, so watch for the user's first real-world errors.

## 5. Decisions already made (do not re-litigate without reason)

- **GitHub as backend.** Free, versioned, no server. Fine-grained tokens can't access a repo where you're only a collaborator, so **shared spaces must live in a GitHub organization**.
- **Public code repo + Pages.** Pages from a private repo needs a paid plan. The code has no secrets.
- **One file per record, Markdown + front-matter, UUID names.** Readable on GitHub and in Obsidian, rarely conflicts.
- **Blank notes are purged** on close, on navigation and at startup (`store.isBlank`, `store.purgeBlank`). Blank = no title, no body, no date, not a task, not a class note, not pinned.
- **Hashtags are derived from the text** (`md.extractTags`), not stored as a field.

## 6. Open items and ideas (not done yet)

- **Security hardening** (proposed, user hasn't answered yet):
  1. Stricter CSP `img-src 'self' blob: data:` (closes an image-URL exfiltration channel; external images in notes would stop rendering).
  2. Require 6+ character PIN for the QR transfer.
  3. One token per device instead of copying the same token via QR.
  4. Optional end-to-end encryption of a space with a password (trade-off: files are no longer readable on GitHub or in Obsidian).
- **Known limitations:**
  - Reminders only work while the app is open or backgrounded (no server).
  - Google import is one-time, with no live subscription.
  - Conflict resolution trusts device clocks.
  - UI fonts other than system fall back if not installed.
- **Ideas mentioned earlier:**
  - An Electron wrapper (tray, reminders with the window closed, global hotkey). The user said their earlier Electron mention was a mix-up, so treat it as optional.
  - Drag-and-drop of recurring events (currently disabled for series).
  - Live styling of `#tags` while typing (they get styled on the next render).
- **Next step for the user:** first real connection — create `plan-data`, a fine-grained token (resource owner = the user, only that repo, Contents RW), connect in Settings. Then create the organization plus a `shared` repo for the friend.

## 7. Conventions in the code

- Comments are in Ukrainian; keep that style.
- Pure modules (`parse`, `recur`, `format`, `md`, `math`, `merge`, `ics`, `qr`, `util`) must not touch the DOM at top level, because the Node unit tests import them.
- **Event delegation.** Views render HTML strings and set `el.onclick` / `onchange` / `oninput` on the view container. `app.js` resets those before every render. Global clicks (`data-open`, `data-check`, `data-act`, …) are handled in `bindShell`.
- **Views signature:** `render(el, state, ctx)`. `ctx` exposes `open`, `go`, `rerender`, `setLook`, `previewLook`, `setSetting`, `newNote`, `showTag`, `showFolder`, `allTags`, `importIcs`, `history`, …
- **Store API.**
  - Entries: `createEntry`, `createEntries` (bulk), `updateEntry(space, id, patch, {silent})`, `deleteEntry`, `restoreEntry`, `purgeEntry`, `moveEntry`.
  - Subjects and folders: `createSubject` / `createFolder` and their update/delete counterparts.
  - Settings and appearance: `saveSettings`, `saveLook`.
  - Events: `store.on('change' | 'dirty' | 'sync' | 'look' | 'spaces' | 'conflict')`.
