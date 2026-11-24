# ISSUES.md — Deploy & Branding Subsystem

Working checklist of known issues in `scripts/deploy.sh`, `master.pub/`, and the runtime
brand switch. Companion to `AGENTS.md` (which describes how the subsystem is *meant* to
work); this file lists where reality diverges from that, and what to do about it.

How to use:

- One checkbox per item. Tick it when the fix is committed, and leave a one-line note with
  the commit hash — the evidence below is what makes an item re-verifiable later.
- Prefer one item (or one tight group) per commit.
- Keep `AGENTS.md` in step: if a fix changes the described contract, update that section in
  the same commit.
- Items marked **DEFERRED** are knowingly not being worked on yet. Don't tick them by
  accident; move them back to open if the assumption behind the deferral changes.

Suggested order: A1 → A3 → A2 → B1 → B2 → C3 → C4 → C5 → C1/C2 (deferred) → C6 → C7 (deferred).

## Index

Tick these as they are fixed; the sections below hold the detail for each.

- [x] **A1** — tsa rsync target deploys with `--delete` and no excludes (can delete `.htaccess` / `.well-known`)
- [x] **A3** — runtime brand switch follows the hostname, not the published brand (`dev.hexmob.win` shows the HEXmob logo on a tsa-branded page)
- [x] **A2** — production run re-applied the stash between the two brand builds; signed tarball could contain WIP; HEAD left detached
- [x] **A4** — failure while building the second brand left a half-published release (now: build both, then publish both)
- [x] **B1** — FTP password was visible in `ps`; certificate verification off; payload not TLS-protected
- [ ] **B2** — entry point deleted before upload leaves a live 404 window
- [ ] **B3** — macOS artefacts already on a server are protected from `--delete`, not removed (nothing Apple is uploaded; this is cleanup only)
- [ ] **C1** — *DEFERRED* — `dev` and `master` disagree on how the release is signed; `release.sh` exists only on `master`
- [ ] **C2** — *DEFERRED* — untested hypothesis: automated GPG signing needs an interactive TTY
- [ ] **C3** — failure reporting is opaque (`CAUGHT: []`)
- [ ] **C4** — `dot-htaccess-sample` describes the superseded `index.html` cache strategy
- [ ] **C5** — tag naming drift (prompt says `v0.2.3B`, real tags are `0.4.26`)
- [ ] **C6** — dead variables and no-op assignments around target configuration
- [ ] **C7** — *DEFERRED* — semi-automate tag → sign → push → GitHub release with `gh` (replace assets + append "Changes" notes on the latest release; new release only for milestones)

---

## A. Correctness / integrity

### A1 — rsync transport deploys with `--delete` and **no excludes** (destructive)

**What.** The tsa target (`rsync -r --delete dist/ tsa:~/go.tshare.app`) is invoked with
`${RSYNC_APPLE_ARGS}`, a variable that is never defined anywhere. The intended excludes
(`.ht*`, `.DS*`, `.Trashes`, `.well-known`) live in `RSYNC_ARGS` (`scripts/deploy.sh:13`),
which nothing reads. zsh does not run with `nounset`, so the undefined variable expands to
nothing and the upload proceeds bare.

**Evidence.** `scripts/deploy.sh:129` uses `RSYNC_APPLE_ARGS`;
`grep -n RSYNC_ARGS scripts/deploy.sh` shows only the definition at :13.

**Impact.** A single tsa deploy will `--delete` server-side files that are not in `dist/` —
including the web root's `.htaccess` and `.well-known/` (ACME/Let's Encrypt challenges).
The FTP path is unaffected (its excludes are in `LFTP_MIRROR_ARGS`), which is why this has
gone unnoticed: hexmob/dev are the targets used most.

**Fix.** Rename the use site to `RSYNC_ARGS`, and change the definition to an array so the
quoting is correct — the current value has single quotes *inside* a double-quoted string,
so even the right variable would pass `--exclude='.ht*'` as one literal argument including
the quotes. e.g. `RSYNC_ARGS=(--exclude='.ht*' --exclude='.DS*' --exclude='.Trashes'
--exclude='.well-known')` and `${RSYNC} ${RSYNC_ARGS} -r --delete ...`.

**Verify.** Dry run against the tsa host with `-n --itemize-changes` and confirm no `.ht*`
or `.well-known` deletions appear in the output.

**Done** — `995b4fa`. `RSYNC_ARGS` is now an array and is what the call site expands
(`"${RSYNC_ARGS[@]}"`). Verified locally against a fake web root rather than the live host:
with the old (undefined-variable) form the dry run reports `*deleting .htaccess`,
`.well-known/`, `.DS_Store`; with the fix only the genuinely stale file is deleted. A dry
run against `go.tshare.app` itself is still worth doing once before the next tsa deploy.

---

### A3 — runtime brand switch follows the hostname, not the published brand

**What.** `dev.hexmob.win` is *deliberately* published with the `tsa` overlay (see `AGENTS.md`
§4 — hexmob is the legacy product), but `App.tsx` classifies that hostname as hexmob. So on
the dev host the tsa overlay supplies title/SEO/palette/icons while the JavaScript believes
it is hexmob.

**Evidence.** `src/App.tsx:34-47` (hostname switch lists `dev.hexmob.win` with `hexmob.win`);
`src/BrandLogo.tsx:2` and `src/NewStakeForm.tsx:373` (`hostIsTSA` gates the Heart Game promo
image) consume that flag.

**Impact.** Before `BrandLogo` was moved to a runtime switch this mismatch was invisible.
As of that change the next dev deploy will show the **HEXmob.win** logo and suppress the
Heart Game promo on a page that is otherwise entirely the tshare presentation. This is now
user-visible on `dev.hexmob.win`.

**Fix (preferred).** Drive the switch from the brand actually compiled: export
`VITE_BRAND=$TARGET` inside `_build` and resolve the flag as
`import.meta.env.VITE_BRAND ?? detectFromHostname()`. That removes the hostname table for
deployed hosts and keeps hostname detection only as the fallback for `yarn dev` /
unknown hosts. Cheap interim fix if the flag is not wanted yet: move `dev.hexmob.win` into
the tsa branch of the hostname switch (and note in a comment that it is intentional).

**Verify.** Build tsa with the overlay applied, load the bundle, confirm both the logo and
the Heart Game promo are the tsa variants; repeat for hexmob and confirm the opposite.

**Done** — `7fe05c8`. The preferred fix was implemented: `deploy.sh` exports
`VITE_BRAND=${TARGET}` per build, and `src/brand.ts` folds it into `BRAND` / `IS_HM` /
`IS_TSA`, which `BrandLogo` and the Heart Game promo now consume. Note that stamping the
variable alone was not sufficient — with the brand inlined, both brands' markup still
shipped, because the hostname fallback survived minification; the fallback had to be
written as an `if` block so the bundler eliminates it. Verified per build by grepping the
hashed bundle: tsa build has no hexmob logo and no hostname check, hexmob build has no tsa
logo and no promo, unstamped build keeps both plus the fallback. Hostname detection now
exists only for `yarn dev` / manual builds, i.e. a runtime brand switch is no longer in
production code.

**Remaining risk.** Nothing enforces this: a future component that reads
`window.hostIsHM` instead of `IS_HM` silently reintroduces a runtime branch. Noted in
`AGENTS.md` §2 — worth a lint rule or a build-time grep check if it recurs.

---

### A2 — production run restored the stash between the two brand builds; HEAD left detached

**What (as it was).** `_cleanup` mixed two lifetimes: the per-build overlay restore and the
per-*run* repo state (`git checkout dev`, `git stash pop`). Production calls `_build` twice,
so per-run teardown ran per build. Three defects fell out of that:

1. The stash was popped at the end of the **tsa** build, so the **hexmob** build compiled the
   operator's WIP — and that build is what the signed tarball is made from.
2. `git stash` on a clean tree exits 0 but creates no stash, so the unconditional
   `git stash pop` popped *whatever was parked in `stash@{0}`* — someone else's work, silently,
   twice per run.
3. `dev` was only restored when the run started on `master`, so a normal production run from
   `dev` left the main tree's `HEAD` detached at the tag.

**Decision (yours):** require a clean tree for production, and block on anything suspicious
rather than repairing it. `git reset --hard` must never be something the deploy does or
provokes. Also: build in a throwaway worktree rather than touching the dev/master checkout.

**Done** — `0986c2e`. No stash, no checkout, no restore — the whole class is gone:

- Both flows build in a disposable `git worktree` (`HEAD` for dev, the tag for release) under
  `$TMPDIR`, with `node_modules` and `.env.local` symlinked in. The main tree's `HEAD`, index
  and stash are never inputs, so there is nothing to restore and no detached-HEAD trap.
- Overlay applied inside the worktree ⇒ the `-orig` backup/restore machinery is deleted
  outright; `_cleanup` now only returns the shell to `$ORIG_PWD` and drops per-target vars.
- Guards block with exit 5 and print what is in the way: dirty tree (tracked *and* untracked),
  detached/wrong branch, unknown tag, incomplete brand overlay (checked for **both** brands
  before the first upload), missing `node_modules`, non-interactive stdin.
- A dev deploy now builds `HEAD`, so uncommitted edits are **not** deployed; it says so when
  the tree is dirty (preview WIP with `yarn dev` instead).
- `TRAPEXIT` owns worktree removal, because zsh skips an `always` block when `exit` runs
  inside the `try` body — verified. Also fixed: the failure path re-`throw`n from inside
  `always` made the documented `exit 2` unreachable (shell returned 1), and `dist/` is now
  cleared per build so one brand's assets cannot survive into the other's artifact/tarball.

**Verified** end-to-end in a throwaway copy of the repo (fake `yarn`, local rsync
destinations, stubbed prompts): dirty tree → blocked; detached HEAD → blocked; unknown tag →
blocked; missing hexmob variant → blocked *before* any upload; missing `node_modules` →
blocked. Success path from `dev` with a pre-existing stash: exit 0, branch still `dev`,
`git status` empty, **stash list byte-identical**, both brands built at the tag commit (not at
`HEAD`), one worktree left (the main one), tarball contains `dist/index.php` + only the hexmob
asset. Non-tty invocation is refused.

### A4 — a failure while building the second brand left a half-published release

**What (as it was).** Production built *and deployed* each brand in turn: tsa was uploaded
before hexmob was built. A hexmob build failure left go.tshare.app serving the new release and
hexmob.win the old one, with a tag, tarball and signature describing only one host.

**Decision (yours):** build both, publish both — never publish unless both builds succeed, and
keep one worktree per brand side by side so the phases can be separated.

**Done** — `cf07042`. `_build` split into two phases over per-brand worktrees:
`_assemble <brand>` (overlay → build → prune → rename, no upload) and `_publish <brand>`
(`_configure_target` → upload), both wrapped in `_guarded` for labelled failures and exit 2.
A release is now: `_assemble tsa`, `_assemble hexmob`, then `_publish tsa`, `_publish hexmob`.
The dev flow uses the same two phases for its single brand.

**Verified** in the harness with a build failure injected for hexmob only: tsa built, hexmob
build failed → **0 files uploaded to either destination**, no tarball, worktrees and temp dirs
removed, main tree untouched, exit 2.

**Regression caught by the same harness, worth remembering:** splitting `_build` dropped the
`DEPLOY_TARGET=dev` assignment from the dev flow, so the dev preview resolved `TARGET=tsa` →
the *production* `DEST_TSA` and would have deployed a dev preview to go.tshare.app. The dev
flow now sets `DEPLOY_TARGET=dev` explicitly and prints the resolved destination. `TARGET`
(brand) and `DEPLOY_TARGET` (destination) are independent by design, so every call site has
to state both.

## B. Transport & secrets hygiene

### B1 — FTP credentials were visible in the process table; TLS was weakened

**What (as it was).** Three separate weaknesses in `_deploy_build_output`:

1. The password was interpolated into `lftp -e "… open -u user,pass …"`, i.e. into `argv`,
   where `ps` shows it to any local user for the duration of the upload.
2. `ssl:verify-certificate false` meant no certificate validation at all — any certificate,
   self-signed included, would be accepted.
3. `ftp:ssl-protect-data false` sent the payload in the clear; only the control channel was
   under TLS.

**Done** — `<COMMIT>`.

- lftp now runs as `lftp -f <file>`, with the settings/credentials/`rm`/`mirror` in a **0600
  temp file** that `_cleanup` removes. Verified by inspecting the live process: the command
  line is `lftp -f /tmp/hexmob-ftp.xxxx`, no credentials. (lftp's `LFTP_PASSWORD` env fallback
  is *not* usable here: with `open -u user` it ignores it and falls back to anonymous login —
  confirmed the hard way, with two failed logins.)
- `ssl:verify-certificate true` by default. The host serves its provider's wildcard cert
  (`CN=*.myownserver.net`), so hostname checking is off — it would fail every deploy — but the
  chain now has to validate against the system store. Confirmed by login.
- `ftp:ssl-protect-data true` by default: the host accepts `PROT P` (`200 Data protection
  level set to "private"`), so the payload is encrypted too. Confirmed from a protocol trace.
- All three are overridable (`DEST_FTP_VERIFY_CERT`, `DEST_FTP_CHECK_HOSTNAME`,
  `DEST_FTP_PROTECT_DATA`), documented in `dot-env.local-sample` and `AGENTS.md` §3.
- Adjacent silent-failure bug fixed: `set cmd:fail-exit true` is now set. Without it, a failed
  command followed by a successful one makes lftp exit **0** — a bad `cd` would report a
  successful deploy that uploaded to the wrong directory.

**Still worth knowing.** Hostname verification is impossible on this host until the hosting
provider offers a cert matching our domain, so a MITM with *any* CA-signed certificate for
another name would pass. Accepting that is the price of shared hosting; the alternative is a
different host or a proxy (see C7-adjacent work if ever revisited).

### B2 — entry point is deleted before the mirror, leaving a live 404 window

**What.** `rm -f index.html; rm -f index.php` runs on the server *before* the mirror uploads
the new `index.php` (`scripts/deploy.sh:161`).

**Evidence.** Same line as B1; the `--delete` mirror would remove the stale `index.html`
anyway, so the pre-delete is belt-and-braces against a cache that keys on URL only.
**Impact.** Between the `rm` and the upload, the site root returns 404 — on production hosts
too, not just dev. Small, but it lands on real users and is avoidable.

**Fix.** Upload `index.php` first, then delete only `index.html` (the file that must not
exist), e.g. a two-step `mirror --only-existing`-style sequence or an explicit `put` of
`index.php` before the `rm -f index.html; mirror -R`. Keep the "old entry point must be
gone" guarantee — that part is load-bearing.

**Verify.** Watch a deploy from a browser: `/` should never 404. `/index.html` should still
be 404 afterwards.

### B3 — macOS artefacts already on a server are protected, not cleaned up

**What.** `.ht*` / `.well-known` / `APPLE_JUNK` are all *excludes*, and rsync treats an exclude
as both "do not transfer" and "protect from `--delete`". So nothing Apple is ever uploaded
(the guarantee that matters), but any `.DS_Store` / `._*` already in a destination web root is
also never removed — the mirror leaves it alone forever.

**Evidence.** Verified with a local rsync dry run (`--itemize-changes`): a destination
containing `.htaccess`, `.well-known/acme/chal`, `.DS_Store` and `assets/._old.js` reports only
the stale app file as deleted.

**Impact.** Cosmetic/hygiene only: served dot-files are not in any index and are small. Worth
doing only because "no Apple artefacts on a production server" is cleaner as an absolute.

**Fix (only if wanted).** Separate the two intents using rsync filter rules: replace the
`.ht*` / `.well-known` excludes with *protect-only* rules (`--filter='P .ht*'`,
`--filter='P .well-known'`) and add `--delete-excluded`, so the receiver is swept of exactly
the `APPLE_JUNK` patterns while hosting plumbing stays protected. Filter order matters (first
match wins: protect rules first). This changes delete semantics on a live web root, so it must
be proven with a local rsync pair — and then a `-n --itemize-changes` dry run against
`go.tshare.app` — before it is allowed near a deploy. Not worth doing until A2/B1/B2 are done.

---

## C. Release tooling

### C1 — DEFERRED — `dev` and `master` disagree on how the release is signed

**What.** `scripts/deploy.sh` differs between branches. On `master` (tags `0.4.25`+,
`45681b9`/`611d00a`) the script signs the tarball itself (`${GPG} --yes -b …`) and falls back
to copying the command to the clipboard. On `dev` there is no `${GPG}` invocation at all —
it only copies `gpg --yes -b …` to the clipboard for the operator to run. `dev` also has no
`scripts/release.sh`; that file exists only on `master`.

**Evidence.** `git diff dev origin/master -- scripts/deploy.sh`,
`git show origin/master:scripts/release.sh`.

**Why deferred.** Historically automated signing did not work; the suspicion is a real
interactive requirement (see C2). Until that is tested end to end, the clipboard fallback is
what actually ships releases. Also unresolved: which branch should own release tooling —
cherry-picking it onto `dev` inverts the documented dev → master flow for those files.

**When picked up.** Decide the branch ownership first, then either cherry-pick
`611d00a`+`45681b9` onto `dev` or accept master-only tooling and say so in `AGENTS.md` §5.

---

### C2 — DEFERRED — untested hypothesis: automated GPG signing needs an interactive TTY

**What.** Automated signing is assumed to fail because of the passphrase prompt. Untested in
the master variant of `deploy.sh`.

**Things to test, in order** (cheap first):

1. Does signing work at all from a non-interactive context?
   `echo test >/tmp/x && gpg --yes -b /tmp/x` in a fresh shell — and again with stdin
   redirected (`</dev/null`) and with no controlling TTY (`setsid`).
2. Is the key passphrase-protected? `gpg --list-secret-keys` (look for `sec#` vs `sec`).
   If protected, agent caching (`gpg-agent` / macOS Keychain
   `pinentry-program`), `--pinentry-mode loopback --passphrase-file`, or a dedicated
   passphrase-less release key are the options.
3. Is `GPG_TTY` set/exported, and does `pinentry` find a program in the deploy script's
   environment (it does not source `.zprofile` the way an interactive shell would)?
4. Capture the actual stderr. The current master variant fails silently into the clipboard
   fallback, which is why the cause was never identified: log `${GPG}`'s stderr to a file
   before deciding.

**Outcome to record here**, whichever way it goes, so the next person does not re-derive it.

---

### C3 — failure reporting is opaque

**What.** Errors are raised as `throw ''` and caught by `if catch '*'; then`
(`scripts/deploy.sh:195-200`), whose only diagnostic is `print "D'oh! CAUGHT: [$CAUGHT]"`.
Every failure therefore reports `CAUGHT: []`, with no indication of which step died.

**Impact.** Any failed deploy needs manual archaeology. This is exactly how A1 stayed hidden.

**Fix.** Give each `throw` a message (`throw 'overlay: theme swap failed'` etc.) and echo
`$CAUGHT` verbatim; consider `set -x` behind a `DEBUG=1` gate, and `print` the command that
failed.

**Progress (A2 work, `0986c2e`).** The top-level guards report properly (headline + detail
lines + exit 5), the overlay and `dist/` steps now throw messages rather than `''`, and the
failure path exits 2 as documented instead of 1. The remaining `throw ''` calls are in
`_cleanup` and the transport/brand-overlay steps — still worth converting.

**Verify.** Temporarily break one step (e.g. a missing `master.pub` variant) and confirm the
error names that step.

---

### C4 — `dot-htaccess-sample` describes the superseded cache strategy

**What.** The sample instructs setting a short TTL for `\.html$` entry points. Since the
entry point is now served as `index.php`, that rule matches nothing, and the file does not
mention the PHP-FPM/`open_file_cache` reasoning at all.

**Evidence.** `dot-htaccess-sample` vs `scripts/deploy.sh:188-191` (the `.php` rename).

**Fix.** Rewrite the sample to describe the current mechanism (entry point is `index.php`;
hashed assets are immutable and may be cached for a year; do not add a cache rule for the
entry point unless it is understood to bypass the rename). Keep it as manual-setup
documentation — it is deliberately not uploaded.

---

### C5 — tag naming drift between prompt text and practice

**What.** The production prompt suggests `eg. v0.2.3B`, but every real tag is
`MAJOR.MINOR.PATCH` without a `v` (`0.4.26`) — and `release.sh`'s next-version suggestion
greps `^[0-9]+\.[0-9]+\.[0-9]+$`, so a `v`-prefixed tag would break its suggestion logic
while still being accepted.

**Fix.** Update the prompt example, and validate the entered tag against the same regex
`release.sh` uses. Low risk, but the tag ends up in the UI header and in the signed artifact
name, so consistency matters.

---

### C6 — dead code and no-op assignments around the target configuration

**What.** `GPG` (`:10`) and `SCP` are resolved but unused on `dev` (`GPG` is used on master,
`SCP` on neither); `_configure_target` contains
self-assignments like `DEST_FTP_PROTOCOL=${DEST_FTP_PROTOCOL}` (`:79-80`, `:88-89`,
`:97-98`) that do nothing; the FTP protocol/port are global constants but treated as
per-target state.

**Impact.** None functional, but these are the kind of leftovers that made A1 hard to spot.

**Fix.** Delete what is unused, or make protocol/port genuinely per-target (`DEST_<TARGET>_FTP_*`)
rather than restating a constant three times. Fold into whichever item next touches that
region.

### C7 — DEFERRED — semi-automate the tag → sign → push → GitHub release cycle with `gh`

**Current manual process** (as actually practised): merge `dev` → `master`; create a new
version tag by hand; sign it; push `master` + tags to GitHub; then either **attach the new
build to the existing latest release** (the usual case — a small patch) or, when the patch is
significant enough, **create a brand-new release** and attach it there. For the usual case
that means: move the existing release onto the **newly pushed tag**, delete the previous
build's assets from it, upload the new signed pair from `release/`, and append a line or two
to the release's "Changes" notes. Tedious, and done by hand every time.

**Why a release looks the way it does.** Releases here are not a distribution channel —
nothing is installed from them. They exist so the signed source of a deploy can be checked
against the JavaScript a browser actually runs. That makes "one release per milestone,
carrying only the current build, with append-only notes" the *correct* model rather than an
unconventional one. Rationale is recorded in `AGENTS.md` §5 ("What a published release is for").

**What already exists.** `scripts/release.sh` on `master` implements roughly the first half:
verify clean state on `dev`, merge `dev` → `master`, suggest the next patch version, `git tag
-s`, run `yarn deploy` and let the operator answer the production prompts, verify the tarball
`.tgz` + `.sig` exist, push `master` + tags, then `gh release create <tag> … --draft` with both
assets. What it does **not** model is the release *policy* — that most builds join the existing
release rather than starting a new one.

**Wanted: one command, four decisions made for me.** Semi-automated, with the operator still
confirming at the two points that matter (the production deploy, and which release the build
lands in):

1. verify clean state and that we are on `dev`;
2. merge `dev` → `master`;
3. derive the next patch version (reuse `release.sh`'s logic) and create a **signed** tag;
4. run the production deploy (`deploy.sh` prompts unchanged);
5. hard-stop if `release/hexmob.win-<TAG>-build.tgz.sig` is missing — the artifact is not
   publishable unsigned (gated on C2);
6. push `master` + tags **before** touching releases — `gh release` operations require the tag
   to already exist on the remote;
7. resolve the target release and prompt, defaulting to the latest existing release
   (`gh release view --json tagName,isLatest`), with a "create new release" option for
   significant patches:
   - existing (the usual path) → **retag it onto the new tag** (`gh release edit <release>
     --tag <newtag>`, possible only once the tag exists remotely, hence step 6), then delete
     the previous build's assets (`gh release delete-asset <newtag> <name> --yes`, `.tgz` and
     `.sig`), then `gh release upload <newtag> release/*.tgz release/*.tgz.sig --clobber`,
     then append the new entry to the "Changes" notes (`gh release edit <newtag>
     --notes-file <tmp>`);
   - new (milestone) → `gh release create <tag> release/*.tgz release/*.tgz.sig --draft
     --title … --notes …`, optionally seeded from `git log <prevTag>..<tag> --oneline`;
8. print the resulting release URL.

**Design notes / gotchas.**

- **Retagging is part of the usual path.** The existing release is moved onto the new tag
  (`gh release edit --tag`), so the release always advertises the build that is currently
  served, while the individual tags stay in git as the per-build record. This must happen
  *after* `git push --tags` (a release can only point at a tag that exists on the remote) and
  *before* the asset swap (so the assets are addressed under the release's new tag).
  Side effect to be aware of: GitHub release URLs are `/releases/tag/<tag>`, so any link to
  the release under its previous tag stops resolving — fine here, since the release is a
  moving pointer by design, but don't rely on old release URLs.
- **Replacing the previous build is the normal path, not the exception.** Because asset names
  embed the tag (`hexmob.win-<TAG>-build.tgz`), uploading a new tag's files does *not* displace
  the old ones — they accumulate. The step must be: delete the stale assets
  (`gh release delete-asset <tag> <name> --yes`, for both the `.tgz` and its `.sig`), then
  `gh release upload <tag> release/*.tgz release/*.tgz.sig --clobber`. Without the delete, a
  release ends up advertising builds that no longer correspond to anything served.
- **The notes are an append-only log, so never regenerate them.** Fetch the current body
  (`gh release view <tag> --json body -q .body`), append the new entry under the existing
  "Changes" heading, and write it back with `gh release edit <tag> --notes-file <tmp>`. Seeding
  notes from `git log <prevTag>..<tag>` is fine for a *new* release; it would wipe the
  accumulated log on an existing one.
- Never silently overwrite assets on an already-published release — confirm the delete step
  explicitly, and default new releases to `--draft`.
- Draft releases are excluded from `gh release list` unless `--include-drafts` is passed, so a
  "latest release" lookup can pick the wrong target if drafts are in play.
- The decoupling is deliberate: **tags are per build** (the deploy and the signature are
  tag-anchored), **releases are per milestone** (one release carries the current build). Now
  stated in `AGENTS.md` §5 — keep both in step.
- Depends on C1 (which branch owns release tooling) and C2 (does automated signing actually
  work). Don't start before those are settled — this item's step 5 is meaningless otherwise.

---

## D. Done / decisions (for context, do not re-litigate)

- [x] **D1 — stale code in the branding folders.** `master.pub/src/theme.scss.{tsa,hexmob}`
  were 2023 copies still calling the deprecated global `scale-color()`; regenerated on the
  current source structure (`@use "sass:color"` + `color.scale()`), hex palette preserved
  including the tuned `info-darkened: -89%`. `src/BrandLogo.tsx` was removed from the
  overlay entirely (`FILES` now `index.html` / `src/theme.scss` / `public`) and its two
  stale per-brand copies deleted: the component selects its brand at runtime, so vendoring
  per-brand copies only guaranteed an old logo in every build. Verified by replaying both
  overlays and building: correct title/SEO/palette per brand, both logo branches in the
  bundle, no sass deprecation warnings.
- [x] **D2 — `dev.hexmob.win` serves the `tsa` brand. INTENTIONAL, not a bug.** `hexmob.win`
  is the legacy product and the tshare presentation is preferred by most users, so the dev
  host previews that brand. Recorded in `AGENTS.md` §4. The *consequence* of this decision
  (the runtime brand switch disagreeing with the published brand) is tracked as A3.
- [x] **D3 — local `master` was 27 commits stale; fast-forwarded to `origin/master`** (no
  push). `dev` needed no pull — it was already current with `origin/dev`.
- [x] **D4 — no macOS artefact may be deployed.** `APPLE_JUNK` is now the single list
  (`.DS_Store`, `._*`, `.AppleDouble`, `.Trashes`, `.Trash`, `.Spotlight-V100`, `.fseventsd`,
  `.TemporaryItems`, `.DocumentRevisions-V100`, `.apdisk`) generating the rsync excludes, the
  lftp `--exclude-glob` list, and a post-build prune of `dist/`. The prune is what makes the
  guarantee transport-independent — and it keeps the signed tarball clean too, since that is
  made from `dist/`. Verified by seeding a fake `dist/` with ten artefacts (two nested
  `.DS_Store`, nested `._*`, the V100/fseventsd/TemporaryItems directories): all removed,
  real files untouched. Receiver-side protection semantics reviewed and tracked as B3.
