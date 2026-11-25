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
- [x] **A5** — lftp `--delete` at the web root removed `.well-known/` (exclusion protects the name, not the contents)
- [x] **B1** — FTP password was visible in `ps`; certificate verification off; payload not TLS-protected
- [x] **B2** — entry point was deleted before upload, leaving a live 404 window
- [ ] **B3** — macOS artefacts already on a server are protected from `--delete`, not removed (nothing Apple is uploaded; this is cleanup only)
- [x] **C1** — `dev` and `master` disagreed on signing; release tooling now lives on `dev` and the deploy signs automatically
- [x] **C2** — the "automated signing needs a TTY" hypothesis: tested, false for the passphrase-less local key (the card key would still fail)
- [x] **C3** — failure reporting was opaque (`CAUGHT: []`)
- [x] **C4** — `dot-htaccess-sample` described the superseded `index.html` cache strategy
- [x] **C5** — tag naming drifted between the prompt text and practice
- [x] **C6** — dead variables and no-op assignments around the target configuration
- [x] **C7** — semi-automated tag → sign → push → GitHub release via `yarn release` (retag + replace assets + append notes; new release for milestones)

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

- Both flows build in a disposable `git worktree` (`HEAD` for dev, the tag for release) in
  `./staging/`, with `node_modules` and `.env.local` symlinked in. The main tree's `HEAD`, index
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

### A5 — lftp `--delete` at the web root removed `.well-known/`

**What.** `mirror -R --delete` ran at the document root with `--exclude-glob .well-known` and
`--exclude-glob .ht*` assumed to protect the hosting plumbing. The exclusion protects the
*path* from being transferred, **not its contents**: every file under `.well-known/`
"did not exist in dist/", so they were deleted, the directory was left empty, and lftp then
removed the directory itself.

**Evidence.** The first real dev deploy's own log: `.htaccess` never appears (a file, so the
name exclusion held), but `Removing old directory '.well-known'` does. Live listing confirmed
`.htaccess` present and `.well-known` gone; the directory was then recreated by hand.

**Impact.** Deleted ACME state on the dev host (certbot recreates it at renewal, so no outage,
but a renewal that coincided with a deploy could have failed). The same command would run
against `/public_html` on production — where an ACME renewal mid-deploy, or any other
directory the host keeps in the document root, is the same hazard.

**Done** — `cc795f4`. `--delete` is no longer offered at the web root at all. The root mirror
is additive (`mirror -R` with exclusions, no `--delete`), and the only destructive
reconciliation happens against `assets/`, which is 100% Vite output and therefore safe to
prune exactly:

```
mirror -R --delete <flags> ./dist/assets/ assets/   # old hashed bundles must not accumulate
mirror -R          <flags> ./dist/ .                # add-only: never deletes hosting plumbing
rm -f index.html || echo ...                        # cache-bust, last
```

**Verified** with `mirror --just-print` against `dev.hexmob.win`: every planned `rm` is under
`assets/`, and nothing matching `.well-known` or `.ht*` appears in the plan.

**Accepted trade-off.** Stale *root-level* files (e.g. something deleted from `public/`) now
linger on the server instead of being pruned. That is deliberate: an accumulating stray file
is a cosmetic problem, whereas deleting the wrong path is an incident. If it ever matters,
prune by explicit name rather than by re-enabling `--delete` at the root.

**Note for tooling.** `mirror --just-print` prints transfer URLs *including the password*, so
any dry-run output must be treated as a secret (the transcript of the verification run above
was deleted).

---

## B. Transport & secrets hygiene

### B1 — FTP credentials were visible in the process table; TLS was weakened

**What (as it was).** Three separate weaknesses in `_deploy_build_output`:

1. The password was interpolated into `lftp -e "… open -u user,pass …"`, i.e. into `argv`,
   where `ps` shows it to any local user for the duration of the upload.
2. `ssl:verify-certificate false` meant no certificate validation at all — any certificate,
   self-signed included, would be accepted.
3. `ftp:ssl-protect-data false` sent the payload in the clear; only the control channel was
   under TLS.

**Done** — `5c11cee`.

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

### B2 — entry point was deleted before the mirror, leaving a live 404 window

**What (as it was).** The lftp command file did `rm -f index.html; rm -f index.php` on the
server *before* `mirror -R` uploaded the new files. Between the `rm` and the upload — and
permanently, if the mirror then failed — the site root had no entry point at all.

**Done** — `d3e08c2`. The order inside the lftp script is now:

```
mirror -R ...            # upload everything first, index.php included
rm -f index.html || ...  # only then evict the stale entry point / URL-keyed cache entry
```

`index.php` is never removed: the mirror overwrites it. `index.html` is deleted *after* a
successful upload, purely to evict the URL-keyed server cache, and its `|| echo` form keeps
`cmd:fail-exit` from aborting when it is already absent. If the mirror fails, lftp now aborts
before the `rm`, so the previous working entry point survives.

**Residual.** Not fully atomic: the mirror may overwrite `index.php` before all of the new
hashed assets have landed, so a request in that window can reference assets that are not
there yet. Closing that needs a directory-swap deployment (upload, then flip a symlink), which
is out of scope while the document root is fixed by the host.

**Verify on the next real deploy.** `/` must never return 404, and `/index.html` must still be
404 afterwards.

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

### C1 — `dev` and `master` disagreed on how the release is signed

**What (as it was).** `deploy.sh` differed between branches: on `master` it signed the archive
itself and fell back to the clipboard; on `dev` it only copied the command. `scripts/release.sh`
existed only on `master`, so the guided release flow was unavailable exactly where the work
happens.

**Done** — `8ab13e3`. Ownership settled: **release tooling lives on `dev`**, and `master` gets it
through the normal dev → master merge that `release.sh` performs itself.

- `deploy.sh` signs the archive (`_sign_release`): `${GPG} --batch --yes -b`, then verifies the
  signature it just produced with `${GPG} --verify`. `--batch` is deliberate — C2 proved
  unattended signing works for a passphrase-less key, and batch mode guarantees that a key which
  *does* need a prompt fails fast instead of hanging the deploy behind pinentry. On failure: a
  loud "UNSIGNED" warning, the reason, and the command copied to the clipboard.
- `scripts/release.sh` now exists on `dev` (adapted from the `master` version: a clean-tree guard
  before merging, an explicit abort if the archive or its signature is missing, and a recovery
  hint if the deploy fails after the tag was created), and `package.json` gains `yarn release`.
- `GPG` is resolved again — C6 had removed it as dead code, with a note that C1 would bring it
  back.

**Verify.** `_sign_release` on a throwaway archive: signs, self-verifies, and an independent
`gpg --verify` reports `Good signature … [ultimate]`.

### C2 — the "automated signing needs a TTY" hypothesis, tested

**Hypothesis (as recorded).** Automated signing was assumed to fail because GPG needs an
interactive console / passphrase prompt, which is why the deploy only copied the `gpg` command
to the clipboard for the operator to run.

**Tested — the hypothesis does not hold for the key this machine signs with.** In this
(non-interactive, no controlling terminal) shell:

| test | result |
|---|---|
| `gpg --batch --yes -b file` | signs, exit 0 |
| same after `gpg-connect-agent "clear_passphrase …"` | signs, exit 0 — so not merely a warm agent cache |
| `gpg --batch --yes --pinentry-mode error -b file` | signs — **the key has no passphrase** |
| `env -u GPG_TTY gpg --batch --yes -b file < /dev/null` | signs; `gpg --verify` reports `Good signature … [ultimate]` |

Key in use: `5751D33B09A27356` (Bryan Rentoul <gruvin@gmail.com>), local `sec`, 2019.

**Most likely explanation for the historical failure.** The *other* secret key on this machine,
`097E794A93AF6EEA`, is smartcard-backed (`sec>` with `Card serial no. = 0006 18650236`). Signing
with it needs the card plus its PIN, which cannot happen in a script — so whenever that key was
the default (or was named explicitly), automated signing would have failed exactly as assumed.

**Residual caveat.** This result is a property of the *signing key*, not of the deploy: if the
key ever gains a passphrase, or a card-backed key becomes the default, unattended signing breaks
again. Hence C1 keeps the clipboard fallback and fails loudly rather than hanging (`--batch`
prevents a pinentry prompt from blocking a deploy).

### C3 — failure reporting was opaque

**What (as it was).** Errors were raised as `throw ''` and caught by `if catch '*'; then`, whose
only diagnostic was `print "D'oh! CAUGHT: [$CAUGHT]"`. Every failure therefore reported
`CAUGHT: []`, with no indication of which step died. That is exactly how A1 stayed hidden.

**Done** — `0c8caa6`.

- Every `throw` carries a message now, including the last one (rsync: exit status, source and
  destination). `_guarded` prefixes failures with the phase that failed
  (`D'oh! hexmob build failed: [the build itself failed]`) and suggests the trace flag.
- Guards report a headline plus detail lines instead of dying silently — see `_block` and the
  exit-code table in `AGENTS.md` §6.
- `DEPLOY_DEBUG=1` enables `setopt xtrace` with `PS4='+%x:%I: '` (function:line), which shows
  precisely which command broke. Off by default.
- `_prompt_for_secret` disables tracing around the read and emits the value before resuming it,
  so a password typed at the prompt can never appear in a trace (verified: 0 occurrences of the
  secret in tracelines while the returned value still carries it).

**Verify.** Each guard and each phase failure was exercised: the harness injects build failures
and unreachable destinations, and the messages name the phase, the exit code and the paths.

### C4 — `dot-htaccess-sample` described the superseded cache strategy

**What (as it was).** The sample instructed setting a short TTL on `\.html$` entry points. Since
the deployed entry point is `index.php` (renamed to bypass nginx's `open_file_cache`), that rule
matched nothing, and the file never mentioned the PHP-FPM reasoning at all — so anyone applying
it would have cached nothing and wondered why deploys still looked stale.

**Done** — `05c8ffc`. Rewritten around what is actually served:

- the entry point is `index.php`, with `Cache-Control: no-cache, must-revalidate`;
  `\.html$` is called out explicitly as a rule **not** to add, with the reason;
- hashed build output keeps the year-long immutable rule (filename carries the content hash);
- non-hashed files (`public/` images, `seo/` cards) are documented as *deliberately* left to the
  host default, because their names do not change when their content does;
- header blocks stay inside `<IfModule>` so a missing module degrades to "no headers" rather
  than a 500;
- the header states it is manual, one-time, and never uploaded (the mirror excludes `.ht*`).

**Caveat, verified after the rewrite.** On this host the directives are **inert**: the live
`.htaccess` on `dev.hexmob.win` does carry `Header set Cache-Control` rules, yet responses for
`/` and `/index.php` return **no** `Cache-Control`, `ETag` or `Last-Modified` at all
(`Server: nginx`). nginx is evidently serving the entry point without consulting Apache's
header directives, which is also why response headers were never a lever for the staleness
problem — see D5. Treat this file as documentation of intent, not as an active control, until
the host exposes nginx-level configuration.

### C5 — tag naming drifted between the prompt text and practice

**What (as it was).** The prompt suggested `eg. v0.2.3B`, but every real release tag is
`MAJOR.MINOR.PATCH` without a `v` (`0.4.26`) — and `release.sh`'s next-version suggestion greps
`^[0-9]+\.[0-9]+\.[0-9]+$`, so a `v`-prefixed tag would be silently skipped by it while still
being accepted for a deploy.

**Done** — `6c28c9f`. The prompt now says `eg. 0.4.26`, and `_require_tag` warns (rather than
blocks) when the tag is not `MAJOR.MINOR.PATCH`, naming `release.sh`'s suggestion logic as the
reason. Blocking would be wrong: historical tags like `TS1` exist and redeploying one is the
operator's call. The tag still ends up in the UI header and in the signed artifact name, so
consistency matters enough to say it out loud once per run.

**Verify.** `_require_tag 0.4.26` → silent pass; `_require_tag TS1` → note printed, run
continues; `_require_tag 9.9.9` → blocked with the recent-tags list.

### C6 — dead code and no-op assignments around the target configuration

**What (as it was).** `GPG` and `SCP` were resolved at the top and never used (signing happens
by hand on this branch — see C1); `_configure_target` restated the global `DEST_FTP_PROTOCOL`
and `DEST_FTP_PORT` as self-assignments in all three branches
(`DEST_FTP_PROTOCOL=${DEST_FTP_PROTOCOL}`), which do nothing but suggest per-target state that
does not exist.

**Done** — `6c28c9f`. Both variables and all six self-assignment lines are gone; protocol and
port remain plain globals, which is what they are. Verified that all four target combinations
still resolve correctly (`tsa` → rsync to the ssh host, `dev`/`hexmob` → FTPS to the shared
host, and `DEPLOY_TARGET=dev TARGET=tsa` → the dev destination).

**Note for C1.** When signing is wired up on this branch, it will need
`GPG=$(command -v gpg)` again — that is the one thing deliberately removed here, on the
grounds that unused tool lookups are how A1 stayed invisible.

### C7 — semi-automate the tag → sign → push → GitHub release cycle

**What (as it was).** Manual every time: merge `dev` → `master`, create and sign a tag, push,
then either attach the build to the *existing* release or create a new one — which meant
deleting the previous assets by hand, uploading the signed pair, and appending a line to the
release's "Changes" notes. Releases exist here so signed source can be checked against the
JavaScript a browser actually runs, not as a distribution channel, so a release is a moving
pointer carrying the build currently served (AGENTS.md §5).

**Done** — `8ab13e3`. `yarn release` (`scripts/release.sh`) performs the whole sequence:

1. require a clean tree on `dev`;
2. merge `dev` → `master`;
3. suggest and create a **signed** tag;
4. run `yarn deploy` (production prompts unchanged — both brands built, then both hosts);
5. **hard-stop** if the archive or its `.sig` is missing (an unsigned release is pointless);
6. `git push origin master && git push --tags` — before any release operation, because
   `gh release` addresses tags that must already exist on the remote;
7. resolve the target release, defaulting to the latest **published** one (`--exclude-drafts`,
   with a note when drafts exist), and prompt: retag it, or create a new release;
   - *existing (usual)* — `gh release edit <release> --tag <newtag> --verify-tag`, delete the
     previous build's assets (`gh release delete-asset … --yes` — asset names embed the tag, so
     they would otherwise accumulate), `gh release upload … --clobber`, then append the new line
     to the "Changes" notes (`gh release view --json body` → append → `gh release edit
     --notes-file`);
   - *new (milestone)* — `gh release create --draft`, notes seeded from
     `git log <prevTag>..<newTag>`, with room to add more;
8. print the release URL and return to `dev`.

**Design points worth keeping.** Tags stay per build; the release moves. Notes are append-only
and never regenerated (that would wipe the accumulated log). Assets are replaced, not
accumulated. Drafts are deliberately not treated as "current", because a leftover draft from an
abandoned attempt is not what the live site serves.

**Follow-up fixes** (`2b6b186`), both UX rather than correctness:

- `deploy.sh` honours `DEPLOY_TAG`, so `yarn release` states the tag once instead of asking for
  it again at the deploy prompt — where the two answers could silently diverge.
- the notes moved **before** the push, and are now edited in `$EDITOR` with the current body
  pre-loaded (comment header + marker line, the `git commit` pattern) instead of answering a
  one-line prompt after everything was already live. Markdown headings survive because only
  text above the marker is discarded. A non-zero editor exit, empty notes, or "quit without
  saving" leaves the release untouched.
- **`--dry-run` / `DRY_RUN=1`** (`a6d3d62`): every prompt runs, read-only `gh` calls are real
  (so the release list and the notes body are live), and every destructive step prints
  `[dry-run] …` instead of executing. Verified in a rehearsal repo with a stubbed `gh` that
  fails on any mutating call: both paths (retag-existing and new-draft) complete with **zero**
  mutating calls, unchanged tag list, clean tree, `dev` still checked out, and the final notes
  printed.

  Also reworded after the first real rehearsal (`<UXHASH>`): the choice prompt read
  "Publish to '0.4.26'?", which sounded like publishing *onto* the old tag when it means
  retagging it. It now spells out both branches ("update the existing release \"<title>\"
  (currently on tag <tag>) … retagged; assets replaced; notes edited" vs "create a NEW
  release … the existing one is left untouched"), and the release list shows tag, title and
  `<= latest`, since those releases carry descriptive titles. New-release notes were also
  seeding 35 commit subjects into the *published* body; the commits are now reference material
  above the marker, with the body starting as `## Changes`.

  Three flaws the rehearsal itself found and fixed: `[dry-run]` lines for asset deletions were
  swallowed by a `> /dev/null` redirect; the closing message pointed at a notes file that the
  EXIT trap deletes; and the milestone path seeded notes from `<prevTag>..<newTag>`, which fails
  when the new tag does not exist yet (dry run) — it now uses `HEAD` as the range end, and
  prefers a version-shaped previous tag so a stray `TS1` cannot sort above `0.4.26`.

**Not exercised end to end.** Step 4 publishes to both live hosts, so the first full run needs
watching. The `gh` steps were checked against `gh 2.93.0`'s real flags (`--tag`, `--verify-tag`,
`--clobber`, `delete-asset --yes`, `--exclude-drafts`); the signing step was verified
independently (C1); and the editor flow was tested with stub editors (append keeps headings,
non-zero exit aborts, empty body is refused).

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
- [x] **D5 — the `index.php` entry point stays (deliberately kept).** It exists only to dodge
  this host's nginx `open_file_cache`, which serves static `.html` for days after a deploy with
  no way to flush it without shell access (`53ba042`, after `6b4bc5a` failed to fix it by
  deleting the file first). PHP-FPM responses are not in that cache, so a deploy becomes
  visible within seconds. The trade-off — an unconventional entry point, `/index.html`
  deliberately absent — is accepted: nginx *could* be disabled or its cache tuned, but the
  operator cannot be bothered and, more importantly, would risk forgetting the consequences of
  re-enabling it later. **If nginx/open_file_cache settings on this box ever change, re-test
  the staleness before touching the rename**, and note that `.htaccess` header rules do not
  reach responses here (C4), so headers are not a substitute.
- [x] **D4 — no macOS artefact may be deployed.** `APPLE_JUNK` is now the single list
  (`.DS_Store`, `._*`, `.AppleDouble`, `.Trashes`, `.Trash`, `.Spotlight-V100`, `.fseventsd`,
  `.TemporaryItems`, `.DocumentRevisions-V100`, `.apdisk`) generating the rsync excludes, the
  lftp `--exclude-glob` list, and a post-build prune of `dist/`. The prune is what makes the
  guarantee transport-independent — and it keeps the signed tarball clean too, since that is
  made from `dist/`. Verified by seeding a fake `dist/` with ten artefacts (two nested
  `.DS_Store`, nested `._*`, the V100/fseventsd/TemporaryItems directories): all removed,
  real files untouched. Receiver-side protection semantics reviewed and tracked as B3.
