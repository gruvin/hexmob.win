# AGENTS.md — Deploy & Branding Subsystem

A functional brief for the release machinery in this repo: `scripts/deploy.sh`, the
`master.pub/` branding sidecar, and (on `master`) `scripts/release.sh`.

This file explains **what each piece is for and how a deploy is supposed to behave**, so
that changes to it can be made against an understood contract rather than by pattern
matching. Project-wide knowledge (stack, data flow, chains, pricing, i18n, conventions)
lives in `CLAUDE.md`; this file does not repeat it.

Read this before touching anything under `scripts/` or `master.pub/`.

---

## 1. The problem this subsystem solves

One codebase is published as **two different products**:

| Brand | Host | Referred to as | Runtime flag |
|---|---|---|---|
| hexmob | `hexmob.win` | hexmob / HM | `window.hostIsHM === true` |
| tsa | `go.tshare.app` | tsa / TSA / TShare | `window.hostIsTSA === true` |

They differ in name, logo colours, SEO metadata, social card images, Twitter handle and
favicon set — but they share 100% of the application logic. Two separate forks would be
unmaintainable, so the repo builds the *same* source twice, applying a thin brand overlay
before each build, and ships each result to its own host.

Two more requirements shape the design:

- **Production builds must be reproducible and verifiable.** They are built from a git
  tag, not from whatever happens to be in the working tree, and the artifact is archived
  and cryptographically signed so anyone can check that what is live came from a
  particular commit.
- **The shared host has an aggressive static-file cache.** A naive upload can leave
  visitors on a stale HTML entry point for days. The deploy therefore manipulates the
  entry point's *filename* rather than relying on cache headers.

Everything below follows from those four points.

---

## 2. What is in the tree

### `scripts/deploy.sh` (zsh, no dependencies beyond git)

The single entry point for all deploys (`yarn deploy`). It owns target selection, the
brand overlay, the build, the transport and the restore-the-tree-on-exit guarantee.

It is structured as small functions rather than a linear script, because the production
flow needs to run the build step twice with different branding:

| Function | Responsibility |
|---|---|
| `_configure_target` | Resolve `TARGET` (brand) and `DEPLOY_TARGET` (destination) into the concrete `DEST` / `DEST_TRANSPORT` / FTP variables for this run. |
| `_configure_ftp_destination` | Split a `host:/path` destination into `DEST_FTP_HOST` + `DEST_FTP_DIR`. |
| `_prompt_for_secret` | Read an FTP password without echoing it, when `.env.local` does not supply one. |
| `_guarded` | Runs one phase and turns a `throw` into a labelled message plus exit 2. |
| `_assemble` | Build phase for one brand: overlay → `yarn build` → prune → rename entry point. **No upload.** |
| `_publish` | Publish phase for one brand: resolve the target, then upload that brand's `dist/`. **No build.** |
| `_deploy_build_output` | Transport layer: push `dist/` to the resolved destination via lftp (FTPS mirror) or `rsync --delete`. |
| `_write_ftp_command_file` | Writes the lftp command script (settings, credentials, `rm`, `mirror`) to a 0600 temp file, so credentials never reach `argv`. |
| `_make_worktree` / `_remove_worktrees` | Create/remove the per-brand disposable worktrees (§5.1). |
| `_require_tty` / `_require_clean_tree` / `_require_release_branch` / `_require_tag` / `_require_overlay` | The guards (§5) — they block with exit 5 rather than repairing anything. |
| `_cleanup` | Per-phase teardown: return to `$ORIG_PWD`, delete the transient FTP command file (§6). |

`TARGET` and `DEPLOY_TARGET` are deliberately **independent knobs**: `TARGET` says which
brand to compile, `DEPLOY_TARGET` says which destination to upload to. That is what makes
"publish the tsa brand to the dev server" expressible.

### `master.pub/` — the brand overlay source

A *sidecar* directory: it sits outside `src/` and `public/`, so Vite never compiles or
bundles it. It holds, for each file that differs between the brands, one copy per brand
named `<path>.<brand>`:

```
master.pub/
  index.html.hexmob        index.html.tsa        # SEO metadata, social cards, theme-color
  src/theme.scss.hexmob    src/theme.scss.tsa    # Bootstrap colour map (palette per brand)
  public.hexmob/           public.tsa/           # favicons, logos, OG images, manifest icons
  <file>-orig                                    # scratch backups, transient (§6)
```

`<file>.<brand>` is the **authoritative version of that file for that brand**. Whatever is
in there is what gets compiled and published; the copy tracked in `src/` at the top level
is the working default (it doubles as the tsa brand content, which is what you get when you
run `yarn dev` on localhost).

Because these are real files with real paths, the overlay is content, not configuration:
adding a new per-brand asset means dropping it into `public.hexmob/` and `public.tsa/`.

### `master.pub` vs the runtime brand switch

Two mechanisms coexist, and it matters which one applies to what:

- **Compile-time overlay** (this directory): for things that must be *absent* from a build
  or are read before any JavaScript runs — page title, `<meta>` tags, favicons, the CSS
  palette. A build cannot ship both brands' social cards.
- **Build-time brand constant** (`IS_HM` / `IS_TSA` from `src/brand.ts`): for React
  components that render different markup per brand — `BrandLogo`, the Heart Game promo in
  `NewStakeForm`. `deploy.sh` exports `VITE_BRAND` from `TARGET` before each build, Vite
  inlines that literal, and the constants fold to `true`/`false`, so the non-matching brand's
  markup is dead code and never reaches `dist/`. One source file serves both products, which
  is why `BrandLogo.tsx` is not in the overlay list.

A **runtime** brand switch must never survive into a production bundle. The hostname check in
`src/brand.ts` (`window.location.hostname === "hexmob.win"`) exists only as the fallback for
builds with no stamped brand — `yarn dev`, and a manual `yarn build` — and is eliminated
whenever `VITE_BRAND` is set. So: any component needing a brand decision takes it from
`IS_HM` / `IS_TSA`, never from the hostname. `window.hostIsHM` / `window.hostIsTSA` are still
assigned (from those constants) for console debugging, but nothing in `src/` reads them — do
not add readers, or the branch stops folding.

New per-brand differences should default to the build-time constant; reach for the overlay
only when the difference has to exist in the built artifact itself (SEO tags, CSS palette,
image assets). Either way, verify the result: the *other* brand's markup must be absent from
the built bundle.

### `.env.local` (gitignored, sample in `dot-env.local-sample`)

Supplies `VITE_REOWN_APPKIT_ID` and the FTP credentials. `deploy.sh` sources it with
`set -a`, so every variable it defines is exported to the build. Missing credentials are
prompted for interactively rather than failing the run.

### `release/` (gitignored)

Where the production tarball and its signature are written. Never committed — release
artifacts are attached to a GitHub release instead.

### `dot-htaccess-sample`

Reference copy of the server's cache-control directives. It is **documentation for a manual
one-time server setup**, not something the deploy uploads: the mirror excludes `.ht*`
precisely so that a deploy can never clobber the live server config.

---

## 3. Destinations and transports

| `DEPLOY_TARGET` | Destination | Transport | Credentials |
|---|---|---|---|
| `dev` | `ftp.hexmob.win:/dev.hexmob.win` | lftp FTPS mirror | `DEST_DEV_FTP_*` |
| `hexmob` | `ftp.hexmob.win:/public_html` | lftp FTPS mirror | `DEST_HEXMOB_FTP_*` |
| `tsa` | `tsa:~/go.tshare.app` | `rsync -r --delete` over ssh | ssh keys / `~/.ssh/config` |

The shared hexmob host has no shell access, which is why it is driven over FTPS via lftp
(parallel mirror uploads) instead of rsync; the tshare host is a normal ssh host, which is
why it stayed on rsync.

### FTP transport: credentials and TLS policy

**Credentials never appear in `argv`.** lftp is invoked as `lftp -f <file>`, where the file
(mode 0600, removed by `_cleanup`) holds the settings, the `open -u user,pass`, the entry-point
`rm` and the `mirror`. Passing them on the command line would expose them through `ps` for
the whole upload. Note that lftp's `LFTP_PASSWORD` fallback is *not* an option: it only
applies to `open <site>` forms, not `open -u user` — verified, it silently falls back to
anonymous login, which also gets you rate-limited for failed logins.

**TLS policy** (overridable per deployment; both defaults verified against the host):

| knob | default | why |
|---|---|---|
| `DEST_FTP_VERIFY_CERT` → `ssl:verify-certificate` | `true` | The host presents its provider's wildcard cert (`CN=*.myownserver.net`), so trust validates against the system store even though… |
| `DEST_FTP_CHECK_HOSTNAME` → `ssl:check-hostname` | `false` | …the *hostname* can never match. Checking it would fail every deploy. Chain validation is the part that requires a CA-signed certificate and is what protects against a substituted cert. |
| `DEST_FTP_PROTECT_DATA` → `ftp:ssl-protect-data` | `true` | The host accepts `PROT P` (`200 Data protection level set to "private"`), so the payload is encrypted as well as the control channel. |

**What `--delete` is allowed to touch: only `assets/`.** The web root is mirrored *additively*;
`assets/` — pure Vite output — is the only path reconciled destructively, because old hashed
bundles must not accumulate. This is not caution for its own sake: lftp's `--exclude-glob`
protects a *path* from being transferred but not its *contents*, so `--delete` at the root
emptied `.well-known/` (no challenge file "exists in dist/"), then removed the directory.
`.htaccess` survived only because it is a file, whose name the pattern matches. Stale
root-level files lingering instead of being pruned is the accepted trade — see `ISSUES.md` A5.

**`set cmd:fail-exit true` is load-bearing.** Without it a failed command (a bad `cd`, say) is
followed by a successful one and lftp still exits 0 — the deploy would report success having
uploaded to the wrong place. The entry-point `rm`s are written as
`rm -f index.html || echo …` because that is the only way to tolerate a missing file under
`cmd:fail-exit` (a failure followed by an unconditional command aborts; a chained one does not).

Uploads are mirrors with `--delete`: the remote directory is made to match `dist/`. Server
config and dot-files are excluded from that reconciliation (`.ht*`, `.well-known`) so hosting
plumbing survives a deploy.

**No macOS artefact may ever be deployed.** `.DS_Store`, AppleDouble `._*`, `.Trashes`,
`.Spotlight-V100`, `.fseventsd`, `.TemporaryItems`, `.DocumentRevisions-V100`, `.apdisk` and
friends are listed once, as `APPLE_JUNK`, and that single list feeds three consumers: the
rsync excludes, the lftp `--exclude-glob` list, and `_prune_apple_junk`, which deletes them
from `dist/` immediately after the build. The prune is the load-bearing one: it is
transport-independent, and `dist/` also feeds the signed release tarball, which must not ship
macOS litter either. This is not a hypothetical path — `public/` is staged from
`master.pub/public.<brand>/` and Vite copies it verbatim into `dist/`, so a single Finder visit
to any of those directories propagates junk into a build.

Consequence on the receiver side: an *exclude* also protects matching files from `--delete`,
so macOS junk already sitting on a server is left in place rather than removed (tracked as
`ISSUES.md` B3). Nothing Apple is ever uploaded; that is the guarantee, and it is the stronger
of the two.

---

## 4. Flow A — dev deployment (default)

Prompt: `Poduction or Dev deployment? [D/p]:` — a **single keypress**, and anything other
than `p`/`P` (including Enter) takes the dev path.

```
DEPLOY_TARGET=dev TARGET=tsa _build
```

1. Create a throwaway worktree at `HEAD` (§5.1) — the operator's tree is never touched.
2. `_assemble tsa`: overlay the `tsa` brand inside that worktree, `yarn build`
   (`tsc` then `vite build`) → `dist/`, prune macOS litter, rename `dist/index.html` →
   `dist/index.php` (§7).
3. `_publish tsa`: mirror `dist/` to `dev.hexmob.win`. `DEPLOY_TARGET=dev` is set explicitly,
   because the destination is chosen independently of the brand.
4. Delete the worktree.

**Uncommitted work is not deployed.** The ref is `HEAD`, so the dev target previews the
last commit; the script says so explicitly when the tree is dirty. To preview edits
without committing, use `yarn dev` locally.

Dev deploys run a **full production build**, not the Vite dev server. The point is to
exercise exactly what production will serve — the same minified bundle, the same cache
behaviour — on a host where breaking things is cheap. `VITE_VERSION` is not set, so the
header shows the fallback version string.

The dev path builds one brand and pushes it to the dev destination. The destination and the
brand are separate settings, so which brand lands on `dev.hexmob.win` is a one-line choice,
not a structural one.

**It is deliberate that `dev.hexmob.win` is published with the `tsa` brand.** `hexmob.win` is
the legacy product; the tshare presentation is the one most users prefer today, so the dev
host previews that brand rather than the hexmob one. This is a product decision, not an
oversight — do not "correct" it to `TARGET=hexmob`. It does mean the dev host exercises the
tsa overlay even though its hostname says hexmob — which is exactly why the brand comes from
the compiled brand (`VITE_BRAND` → `IS_HM` / `IS_TSA`, §2) and not from
`window.location.hostname`.

---

## 5. Flow B — production deployment

Prompted sequence, deliberately awkward — every step is a guard:

1. `p` to select production.
2. **Blocking checks, before anything happens:** the working tree must be clean (tracked
   *and* untracked), and the starting branch must be `dev` or `master` (a detached HEAD is
   refused). A release starts from a committed state; the script will not stash, reset or
   discard anything to get there — it tells you what is in the way and exits 5.
3. Type the word `yes`. Anything else aborts ("Didn't think so.").
4. Enter a release tag. It must exist as a local tag, or the run blocks with the list of
   recent tags.
5. Confirm the summary (tag, branch, both destinations, and the build-then-publish order).
6. Two throwaway worktrees are created at the tag — one per brand — and both brands'
   overlays are preflighted, so a missing variant cannot surface after the other brand has
   already been published.

Then, in this order:

```
export VITE_VERSION="<TAG>"
_assemble tsa      → build in the tsa worktree
_assemble hexmob   → build in the hexmob worktree
_publish  tsa      → go.tshare.app
_publish  hexmob   → hexmob.win
```

**Both builds must succeed before either is published.** `_assemble` and `_publish` are
deliberately separate phases over per-brand worktrees: if the second brand fails to build,
nothing has been uploaded, so a release lands on both hosts or on neither (see `ISSUES.md`
A4 for why this matters). `VITE_VERSION` is stamped into the header so the live site states
which release it is.

### 5.1 The build happens in a throwaway worktree

Every build runs in a disposable `git worktree` — `HEAD` for a dev preview, the tag for a
release — created under `$TMPDIR`, with `node_modules` and `.env.local` borrowed by symlink
from the real checkout (they are gitignored, so they do not exist in a fresh worktree).
A release keeps **one worktree per brand, side by side**, each with its own overlay and its
own `dist/`, which is what makes the build phase separable from the publish phase.

This is the single most important property of the subsystem: **the operator's tree, branch,
index and stash are never inputs to a deploy.** There is nothing to stash, nothing to
restore, no way for the overlay to leave the tree half-branded, and no way for a build to
happen on the wrong branch. The overlay is applied inside the worktree and disappears with
it — which is why there are no `-orig` backups any more, and why `_cleanup` only has to leave
the shell in the right directory.

Two consequences worth knowing:

- A release checkout cannot be "left behind": the main tree's `HEAD` never moves, so there is
  no detached-HEAD trap and no `git reset --hard` in anyone's future.
- The archive is produced from the worktree with `tar -C <worktree> … dist`, so paths inside
  the tarball stay relative (`dist/...`).

Afterwards the script:

- archives the final `dist/` (the **hexmob** build) to
  `release/hexmob.win-<TAG>-build.tgz`,
- signs it with a detached GPG signature (`hexmob.win-<TAG>-build.tgz.sig`) and copies the
  signing command to the clipboard as a manual fallback,
- tells you the deployment is live and points at the signature, which is what gets attached
  to the "official release" tag on GitHub.

Nothing is stashed, and nothing needs to be: a release refuses to start from a dirty tree
(§5 step 2), and the build would not see uncommitted files anyway, because it happens in a
worktree at the tagged commit. The guard exists for the operator's sake, not the build's.

`scripts/release.sh` (carried on `master`) drives this flow end to end: verify a clean
starting point on `dev`, merge `dev` → `master`, suggest and create a **signed** tag, run
`yarn deploy` and let the operator answer the production prompts, verify the tarball and
signature exist, push `master` + tags, then create a **draft** GitHub release with the
`.tgz` and `.sig` attached. Its whole value is that the manual steps — tag format, prompt
answers, upload of both artifacts — happen in the right order every time.

### What a published release is for (and what it is not)

GitHub releases are **not a distribution channel** here. Nothing is downloaded or installed
from them. They exist for exactly one reason: so someone who wants to can verify that the
signed source of a release corresponds to the JavaScript their browser actually executed.
For a crypto dApp that is a trust claim — so far unexercised, but optics with substance —
and it is the only reason the signing ceremony in §5 exists at all.

That purpose makes several unconventional-looking practices correct rather than sloppy:

- **One release per milestone, many builds per release.** Each production deploy moves the
  *current* release onto the newly pushed tag and replaces its artifacts, instead of creating
  a new release; a new release is created only when a group of changes is significant enough
  to deserve its own milestone. So tags stay **per build** (the deploy and its signature are
  tag-anchored, and every tag remains in git as a permanent record), while the release is a
  **moving pointer** to whatever is currently served. That decoupling is deliberate.
- **A release describes the current build, not the history of builds.** The `.tgz` and its
  `.sig` are replaced on each patch. Because asset filenames embed the tag
  (`hexmob.win-<TAG>-build.tgz`), uploading a new tag's build does **not** displace the
  previous one — the old tarball must be deleted explicitly, or the release slowly
  accumulates artifacts that no longer match what is served.
- **The "Changes" notes are an append-only log.** Each patch appends a line or two to the
  existing release body rather than regenerating notes from `git log`. Non-standard for a
  release body, but it is the cheapest durable record of what each signed build was, and
  regenerating would wipe it.
- **Delete-then-reupload is the normal path**, not a repair — which is precisely why the
  manual process is tedious, and what `ISSUES.md` C7 is about automating.

---

## 6. The cleanup contract

Splitting the two lifetimes is what makes this subsystem safe — and it is the thing to keep
straight when changing it:

| lifetime | owner | guarantee |
|---|---|---|
| **per phase** | `_cleanup`, from `_guarded` | leave the shell in `$ORIG_PWD`. Nothing on disk needs restoring: the overlay was applied inside the brand's disposable worktree. |
| **per run** | `_remove_worktrees`, called from `TRAPEXIT` | every worktree under `$TMPDIR` and their git registrations are gone on **every** exit path. |
| **never** | — | the operator's tree, branch, index and stash are not inputs and are never modified. No `stash`, no `reset`, no `checkout` of a release ref in the main tree. |

`TRAPEXIT` is the backstop rather than an `always` block around the main flow, because
**zsh does not run an `always` block when `exit` is called inside its `try` body** — and the
production path exits in several places. `TRAPEXIT` survives `exit N`, `throw`, and the
SIGINT trap (`TRAPINT` → `_cleanup` → `exit 4` → `TRAPEXIT`). It does not fire in the
`( … )` subshells `_cleanup` uses.

The success path adds one convenience: a release that started on `master` leaves the
operator on `dev` (`_finish_release`), because further work does not belong on the release
branch. Nothing else about the repo is touched.

### Exit codes

| code | meaning |
|---|---|
| `0` | success, or a deliberate abort at a prompt |
| `2` | a build or publish phase failed (`_guarded` caught a `throw`); worktrees are removed, and a failed build means **nothing** was published |
| `4` | SIGINT, after per-build cleanup |
| `5` | **blocked by a guard** — dirty tree, detached HEAD, missing tag, missing overlay variant, missing `node_modules`, non-interactive invocation. Nothing was built or uploaded. |

## 7. Cache busting: why the entry point is `index.php`

The production host runs nginx with `open_file_cache`, which can serve a stale static
`index.html` for days with no way to flush it without shell access. Cache-control headers
do not help against that cache.

Two mechanisms are used together:

- The built entry point is renamed `index.html` → **`index.php`**, so requests are routed
  through PHP-FPM, which revalidates from disk every couple of seconds. The directory index
  serves it as the site root.
- Before mirroring, the remote `index.html` and `index.php` are deleted, so the mirror's
  `--delete` reconciliation cannot leave an old entry point behind.

Consequence to keep in mind: **`/index.html` is intentionally not a valid URL** on the
deployed hosts; the site root and `/index.php` are. Anything that links to or hardcodes
`index.html` is wrong by construction.

---

## 8. Operating rules

- **Run from the repo root, from an interactive shell.** The script refuses to run
  otherwise: it sanity-checks for `index.html`, `master.pub/` and `src/`, and it refuses a
  non-terminal stdin, because the prompts are the safety mechanism (zsh's `read -k1` fails
  silently without a tty, which used to select the dev path by accident).
- **A release requires a clean tree on `dev` or `master`.** Not because the build needs it —
  it runs in a worktree — but because a dirty tree means attention is elsewhere. The script
  blocks and prints what is in the way; it never stashes, resets or discards to proceed.
- **Never add a step that mutates the main tree.** Overlay work belongs in the worktree. If
  something genuinely must touch the real checkout, it needs a `TRAPEXIT` undo and a very
  good reason.
- **Do not "fix" a deployed brand by editing files in `src/`.** For overlay files, the
  published content comes from `master.pub/<file>.<brand>`. Editing `src/theme.scss` changes
  localhost and nothing else.
- **Keep the overlay in sync with the app.** When a change to `index.html`, `public/` assets
  or the palette ships, the corresponding `master.pub` copies are part of that change. A
  brand variant is a fork of a file, and forks rot: this is the subsystem's main recurring
  risk, and the reason `BrandLogo.tsx` moved to a runtime switch instead.
- **Prefer the runtime switch to a new brand variant.** Add an overlay entry only when the
  difference has to be present in the built file itself.
- **`.htaccess` / server config is manual.** It is never uploaded; the excludes are there to
  protect it.
- **Never deploy a tag you are not willing to support.** Production builds come from tags;
  the tag is the contract with the user, since it also signs the artifact.
- **Treat a failed run as "tree may be dirty".** `_cleanup` runs on failure and on SIGINT,
  but check `git status` after any interrupted deploy before doing anything else.

---

## 9. Verifying what is actually live

Cheap, objective checks — no screenshots needed:

| Question | Check |
|---|---|
| Which release is live? | Header shows `VITE_VERSION` (e.g. `0.4.26`); dev builds show the fallback version. |
| Is the entry point correct? | Site root and `/index.php` return 200; `/index.html` returns 404. |
| Which brand did a target receive? | Fetch the root HTML: `<title>` and `og:site_name` carry the brand (`HEXmob.win` vs `go.tshare.app`), and the hashed JS/CSS asset names change per build. |
| Did the palette change reach a host? | The hashed CSS asset contains the palette's hex values (e.g. the brand's info/warning colours). |
| Did a React change reach a host? | Grep the hashed JS asset for a string that only exists in the new code. |
| Did the deploy touch my repo? | `git status` unchanged, `git stash list` unchanged, `git worktree list` = 1 entry. |
| Which brand is in a build? | The other brand's markup must be **absent** from the hashed JS (e.g. a tsa build must not contain the HEXmob `header_logo` text, and must not contain a `location.hostname` brand check of its own). |

Two cheap invariants after any deploy: `git status --porcelain` is exactly what it was
before the run, and `git worktree list` shows only the main checkout. A leftover
`hexmob-deploy.*` directory under `$TMPDIR` means the worktree removal did not run.

---

## 10. Where to change what

| Goal | Touch |
|---|---|
| Per-brand SEO metadata / social cards | `master.pub/index.html.<brand>` |
| Per-brand palette | `master.pub/src/theme.scss.<brand>` |
| Per-brand images / favicons / manifest icons | `master.pub/public.<brand>/` |
| Per-brand React markup that needs no build-time split | the component, keyed off `window.hostIsHM` |
| Which brand is compiled, and where it goes | `TARGET` / `DEPLOY_TARGET` at the call site in `deploy.sh`, plus `_configure_target` for a new destination |
| Upload mechanics / excludes / TLS | `_deploy_build_output`, `LFTP_MIRROR_ARGS` |
| The list of overlaid files | `FILES` in `deploy.sh` — must match what actually differs per brand |
| What a build is made from | `_make_worktree <ref> <brand>`: `HEAD` for dev, the tag for a release. Never the live checkout |
| Build/publish order | production calls `_assemble` for each brand, then `_publish` for each. Do not interleave them — that is what makes a release all-or-nothing |
| Which host a publish goes to | `DEPLOY_TARGET` (destination) vs `TARGET` (brand) — they are independent; the dev flow must set `DEPLOY_TARGET=dev` explicitly |
| Guards / blocking behaviour | `_require_tty`, `_require_clean_tree`, `_require_release_branch`, `_require_tag`, `_require_overlay` |
| Worktree lifecycle / teardown | `_make_worktree`, `_remove_worktree` (via `TRAPEXIT`), `_finish_release` |
| Release tagging, signing, GitHub release | `scripts/release.sh` (master) |
