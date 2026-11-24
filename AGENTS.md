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
| `_build` | The whole per-brand unit of work: overlay branding → `yarn build` → rename entry point → upload. Wrapped in a `try`/`always` so the tree is restored whatever happens. |
| `_deploy_build_output` | Transport layer: push `dist/` to the resolved destination via lftp (FTPS mirror) or `rsync --delete`. |
| `_cleanup` | The restore contract — see §6. Also reached from the SIGINT trap, so Ctrl-C mid-deploy still leaves a usable repo. |

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
- **Runtime switch** (`window.hostIsHM` / `window.hostIsTSA`, set from
  `window.location.hostname` in `App.tsx`): for React components that simply render
  different markup per brand, e.g. `BrandLogo`. These need no overlay at all — one source
  file serves both products, which is why `BrandLogo.tsx` is not in the overlay list.

New per-brand differences should default to the runtime switch; reach for the overlay only
when the difference has to exist in the built artifact itself.

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
why it stayed on rsync. TLS is configured to encrypt the control channel and to tolerate
the host's certificate chain, since that is the strongest mode the shared host supports.

Uploads are mirrors with `--delete`: the remote directory is made to match `dist/`. Server
config and dot-files are excluded from that reconciliation (`.ht*`, `.DS*`, `.Trashes`,
`.well-known`) so hosting plumbing survives a deploy.

---

## 4. Flow A — dev deployment (default)

Prompt: `Poduction or Dev deployment? [D/p]:` — a **single keypress**, and anything other
than `p`/`P` (including Enter) takes the dev path.

```
DEPLOY_TARGET=dev TARGET=tsa _build
```

1. Overlay the `tsa` brand onto the working tree.
2. `yarn build` (`tsc` then `vite build`) → `dist/`.
3. Rename `dist/index.html` → `dist/index.php` (§7).
4. Mirror `dist/` to `dev.hexmob.win`.
5. `_cleanup`: restore the tree.

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
tsa overlay even though its hostname says hexmob, which is why the runtime brand switch is
better driven by the brand that was compiled than by `window.location.hostname` (see
`ISSUES.md`).

---

## 5. Flow B — production deployment

Prompted sequence, deliberately awkward:

1. `p` to select production.
2. Type the word `yes`. Anything else aborts silently ("Didn't think so.").
3. Enter a release tag. It must be an existing tag — the script runs
   `git stash && git checkout <TAG>`, and aborts (exit 3) if the checkout fails. This is
   what makes the published artifact correspond to a reviewable commit rather than to a
   dirty tree.
4. Confirm the checkout command. Then:

```
export VITE_VERSION="<TAG>"
TARGET=tsa    _build      → go.tshare.app
TARGET=hexmob _build      → hexmob.win
```

Each `_build` is the same overlay → build → rename → upload sequence as the dev path, with
a different brand and destination. `VITE_VERSION` is stamped into the header so the live
site states which release it is.

Afterwards the script:

- archives the final `dist/` (the **hexmob** build) to
  `release/hexmob.win-<TAG>-build.tgz`,
- signs it with a detached GPG signature (`hexmob.win-<TAG>-build.tgz.sig`) and copies the
  signing command to the clipboard as a manual fallback,
- tells you the deployment is live and points at the signature, which is what gets attached
  to the "official release" tag on GitHub.

The stash/checkout discipline exists so a production run is possible from a working tree
that has uncommitted work in it without either losing that work or leaking it into the
build.

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

Every deploy must leave the repo exactly as it was found, on every exit path (success,
`throw`, Ctrl-C). `_cleanup` guarantees:

1. **Files restored.** For each overlay entry, the pre-overlay copy was parked in
   `master.pub/<file>-orig`; it is copied back (`rsync -I`, forced) and the scratch copy
   removed. Directories (e.g. `public`) are restored the same way. After a clean run, no
   `-orig` entries remain in `master.pub/`.
2. **Stash restored.** If the production flow stashed local work, it is popped back.
3. **No accidental master commits.** If the run *started* on `master`, the tree is returned
   to `dev` so a leftover detach/checkout cannot become a commit on the release branch.
4. **Target variables unset**, so a second `_build` in the same process starts from a clean
   slate.

Anything added to this subsystem must hook into this contract. If a new step mutates the
working tree, its undo belongs in `_cleanup` next to the overlay restore.

---

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

- **Run from the repo root.** The script refuses to run otherwise (it sanity-checks for
  `index.html`, `master.pub/` and `src/`), because both the overlay paths and `dist/` are
  relative.
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

`master.pub/*-orig` entries left behind, or a dirty `git status` after a run, mean a deploy
did not complete its contract.

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
| Release tagging, signing, GitHub release | `scripts/release.sh` (master) |
