# AGENTS.md — Deploy & Release

How this repo gets published. Read this before touching `scripts/`, `master.pub/`, or a release.

---

## 1. What this is

One codebase, **two products**:

| brand | served at | built as |
|---|---|---|
| `hexmob` | `hexmob.win` | `VITE_BRAND=hexmob` |
| `tsa` | `go.tshare.app` | `VITE_BRAND=tsa` |

They differ only in metadata, palette and images (the overlay, §3); application logic is shared.

Production is **a release, not a deploy**: the live build must come from a git tag whose tarball is
signed and published on GitHub, so someone can check that the signed source corresponds to the
JavaScript their browser runs. That is the only reason the ceremony exists. Releases are *not* a
distribution channel — nothing is downloaded from them. Tags are per build; the GitHub release is a
moving pointer that carries whichever build is currently served.

---

## 2. Layout

| path | what it is |
|---|---|
| `scripts/deploy.sh` | the deploy engine: builds one brand in a throwaway worktree and uploads it. **Never creates tags, pushes, or moves branches.** |
| `scripts/release.sh` | the release ceremony: tag, deploy, verify, sign, push, publish. The only thing that pushes. Invoked as `yarn release`. |
| `scripts/ui.zsh` | console styling shared by both (see the rules at its top; helper names must stay `ui_`-prefixed, ignore it and a helper can shadow a command). |
| `master.pub/` | the brand overlay: `<path>.<brand>` is the authoritative version of that file for that brand. |
| `.env.local` | gitignored: `VITE_REOWN_APPKIT_ID` + FTP credentials. Sample in `dot-env.local-sample`. |
| `release/` | gitignored: the tarball and its `.sig`. |
| `dot-htaccess-sample` | manual, one-time server config. Never uploaded. The header directives do **not** take effect on this host (verified), so treat it as documentation only. |

`deploy.sh` internals worth knowing:

| function | role |
|---|---|
| `_make_worktree` / `_remove_worktrees` | create/remove the per-brand worktrees in `./staging/` |
| `_assemble <brand>` | overlay → `yarn build` → prune → rename entry point → write marker. No upload. |
| `_publish <brand>` | upload that brand's `dist/`. No build. |
| `_guarded` | runs one phase, turns a `throw` into a labelled message + exit 2 |
| `_require_*` | the guards (§10) |
| `_prune_apple_junk`, `_write_ftp_command_file` | macOS artefact removal; the lftp command script |

---

## 3. Where things go, and how

| destination | transport | credentials |
|---|---|---|
| `hexmob.win` (`/public_html`) | lftp FTPS mirror | `DEST_HEXMOB_FTP_*` |
| `dev.hexmob.win` (`/dev.hexmob.win`) | lftp FTPS mirror | `DEST_DEV_FTP_*` |
| `go.tshare.app` | `rsync --delete` over ssh (`tsa:`) | ssh keys |

`TARGET` selects the **brand**, `DEPLOY_TARGET` selects the **destination**. They are independent:
the dev flow is `TARGET=tsa DEPLOY_TARGET=dev`.

**Credentials never reach `argv`.** lftp runs as `lftp -f <file>`; the file is mode 0600 and holds
the settings, `open -u user,pass`, the entry-point `rm` and the mirror. `LFTP_PASSWORD` is not an
option — with `open -u user` lftp ignores it and falls back to *anonymous* login (which also gets
you rate-limited).

**TLS** (overridable with `DEST_FTP_VERIFY_CERT` / `DEST_FTP_CHECK_HOSTNAME` / `DEST_FTP_PROTECT_DATA`):

| setting | default | why |
|---|---|---|
| `ssl:verify-certificate` | on | the chain must validate against the system store |
| `ssl:check-hostname` | **off** | the host serves its provider's wildcard (`CN=*.myownserver.net`); no matching name resolves to this box, and the service ignores SNI. Hostname checking can never pass. |
| `ftp:ssl-protect-data` | on | the host accepts `PROT P` (`200 Data protection level set to "private"`) |

`set cmd:fail-exit true` is load-bearing: without it a failed command followed by a successful one
leaves lftp exiting 0, i.e. a "successful" deploy that uploaded nothing.

**Delete policy: only `assets/` is reconciled destructively.** The web root is mirrored
*additively*. lftp's excludes protect a path from transfer but **not its contents**, so
`--delete` at the root once emptied `.well-known/` and removed the directory. Old hashed bundles
must not accumulate, hence `assets/` (100% build output) gets `--delete`. Stale root-level files
lingering is the accepted trade — deleting the wrong path is worse.

**No macOS artefact may be deployed.** `.DS_Store`, `._*`, `.Trashes`, `.Spotlight-V100`,
`.fseventsd`, `.TemporaryItems`, `.DocumentRevisions-V100`, `.apdisk`, `.AppleDouble` are listed
once (`APPLE_JUNK`) and feed the rsync excludes, the lftp excludes, and `_prune_apple_junk`, which
deletes them from `dist/` after the build. The prune is the real guarantee: `public/` is staged
from `master.pub/public.<brand>/`, so a Finder visit can otherwise put junk into the build — and
into the signed tarball.

---

## 4. Commands

```zsh
yarn deploy:dev            # preview: build the tsa brand from HEAD, publish to dev.hexmob.win
yarn release               # production: the whole ceremony (§6)
yarn release --dry-run     # rehearse: every prompt, no merge/tag/deploy/push/gh write
yarn release --republish   # allow re-releasing a tag that already has a published release
```

There is **no production deploy command**. `deploy.sh` refuses `DEPLOY_KIND=p` without
`DEPLOY_TAG` and `DEPLOY_CONFIRM=yes`, which only `release.sh` supplies. Break-glass
(`DEPLOY_KIND=p DEPLOY_CONFIRM=yes DEPLOY_TAG=<tag> ./scripts/deploy.sh`) exists for emergencies
and produces a build that will not byte-match the published artifact; prefer a new patch tag.

---

## 5. Dev deploy

`yarn deploy:dev` → worktree at `HEAD` → overlay tsa → build → prune → `index.html`→`index.php` →
mirror to `dev.hexmob.win`. No prompts beyond the terminal check.

- Uncommitted work is **not** deployed; the script says so when the tree is dirty. Use `yarn dev`
  to preview edits.
- `dev.hexmob.win` deliberately serves the **tsa** brand: `hexmob.win` is the legacy product and
  the tshare presentation is the one most people see. Do not "fix" this to `TARGET=hexmob`; it is
  also why the runtime brand comes from the compiled `VITE_BRAND`, not the hostname.
- `VITE_VERSION` is unset here, so the header shows the fallback version.

---

## 6. Release

`yarn release`, from **`master`** with a clean tree. It never merges — getting `dev` into `master`
is your deliberate act. It **aborts** on any other branch, and if local `dev` is ahead it warns
with the commit count and asks `Proceed anyway? [Yn]` (default yes: releasing a curated `master`
is legitimate, but it must be a choice).

The order is fixed, and each constraint matters:

1. **Preconditions** (local only): on `master`, tree clean.
2. **Gather remote state** (spinners, **no prompts yet**): published releases, drafts, the newest
   tag's state. The operator must see this *before* being asked anything.
3. **Tag** — suggested per §7; a one-line summary is then required, and becomes the tag annotation
   (`git show <tag>`), which is separate from the release notes.
4. **Tag state** → create / reuse / resume / republish (§7).
5. **Release choice** — update the current release or create a new one (no remote calls; §2b
   already fetched it). Default follows the version bump: patch → update, minor/major → new.
6. **Notes in `$EDITOR`** — the current body pre-loaded under a comment header and a marker line.
   Only text below the marker is published, so markdown headings survive. An unchanged body
   aborts; so does a non-zero editor exit. **Before the deploy**, so backing out costs nothing.
7. **Deploy** — `deploy.sh` builds both brands, then publishes both. If an archive from a previous
   attempt exists, it offers to reuse it (see §8), and the default follows what the hosts report.
8. **Live verification** — both hosts must report this tag (`deploy.php`, §9). A mismatch refuses
   to publish unless explicitly overridden (`Publish anyway? [y/N]`, default no).
9. **Sign** — unless the existing signature already verifies.
10. **Archive check** — `.tgz` and `.sig` must both exist.
11. **Push** `master` + tags. Nothing is written to GitHub before this.
12. **Publish** — retag the current release onto the new tag, delete its previous assets, upload the
    new pair, append/replace the notes. Or create a new draft release for a milestone.
13. **Return to `dev`** — the only checkout the script performs.

Invariants: every read before every prompt; nothing written to GitHub before the push; no branch
moves except the final switch; a failed deploy never leaves a pushed tag behind.

---

## 7. Tags

One tag per build. They are signed, and the annotation is a required one-line summary of what the
build is.

On a re-run the script derives the tag's state and does the safe thing:

| state | behaviour |
|---|---|
| no local tag | create and sign |
| local, not on `origin` | **reuse** — already signed; re-signing churns the object |
| local, on `origin`, no release | **resume** — public, but nothing published yet |
| local, on `origin`, released | **block** unless `--republish` |

A lightweight local tag is deleted and recreated signed. A tag that might already be public is
never recreated: re-signing changes the object and would need a force-push, and a published tag is
what the signature exists to keep immutable.

The *suggestion* follows the same logic: an unpublished newest tag is unfinished history, so the
prompt offers it again instead of advancing the patch number. Only a published tag advances it.

---

## 8. Why a retry is cheap

The archive (`release/hexmob.win-<tag>-build.tgz`) is written after a successful deploy, so its
presence means a publish once returned 0 — and its absence means it did not. A retry that failed at
signing or at a `gh` write therefore offers to reuse the archive and skip both the rebuild (two
Vite builds) and the redeploy (two mirrors).

Reuse is conditioned on reality, not on that file: the release asks both hosts what they are
serving (§9). If they confirm the tag, reuse is the default; if not, the default flips to rebuild
and redeploy, because the previous attempt evidently did not finish publishing. Answering `n`
forces a rebuild; a reused archive that is already signed is not re-signed.

Signing lives in `release.sh`, not `deploy.sh` — which is what makes "sign only, don't rebuild"
possible.

---

## 9. Cache busting, and what a host reports

The entry point is served as **`index.php`**, not `index.html`: this host's nginx
`open_file_cache` serves static `.html` for days and cannot be flushed without shell access, while
PHP-FPM revalidates from disk. `/index.html` is therefore deliberately not a valid URL; the site
root and `/index.php` are. `.htaccess` header directives do not reach responses on this host, so
headers are not an alternative. This is permanent by choice: tuning nginx risks reintroducing a
staleness bug that is easy to miss.

Every build also writes **`dist/deploy.php`** — `{"brand","tag","built","assets"}` — for the same
reason: a static `.json` would be served stale. `curl https://hexmob.win/deploy.php` answers "what
is live?" at any time, and `release.sh` uses it to verify before publishing (§6.8) and to decide
whether an archive matches reality (§8).

---

## 10. Worktrees, cleanup and guards

Every build runs in a disposable `git worktree` in **`./staging/`** (`staging/tsa`,
`staging/hexmob`), with `node_modules` and `.env.local` symlinked from the real checkout. The
operator's tree, branch, index and stash are never inputs: nothing to stash, nothing to restore, no
way to build the wrong branch.

- `staging/` is gitignored, outside `tsconfig`'s `include`, and ignored by the Vite dev server.
  Everything in it is disposable: `_clear_staging` removes a killed run's leftovers (including its
  git registration) before each run; `_remove_worktrees` removes it on every exit path.
  **Do not put anything else there.**
- Per-phase teardown (`_cleanup`) only returns the shell to `$ORIG_PWD` and removes the transient
  FTP command file. Per-run teardown is `TRAPEXIT` (`_remove_worktrees`) — an `always` block is not
  enough, because zsh skips it when `exit` runs inside the `try` body.
- The tarball is made with `tar -C <worktree>`, so paths inside stay relative (`dist/…`).

Guards block (exit 5) and print what is in the way; nothing is ever auto-repaired:

| guard | blocks when |
|---|---|
| `_require_tty` | stdin is not a terminal — `read -k1` failures would silently mean "yes" |
| `_require_clean_tree` | tracked or untracked changes (release only) |
| `_require_release_branch` | not on `dev`/`master`, or a detached HEAD |
| `_require_tag` | the tag does not exist locally |
| `_require_overlay` | a brand variant is missing — checked for **both** brands before the first upload |

Exit codes: `0` success or a deliberate abort; `2` a build/publish phase failed (a failed build
means nothing was published); `4` SIGINT; `5` blocked by a guard.

---

## 11. Operating rules

- Run from the repo root from an interactive shell; both scripts refuse otherwise.
- Never edit a brand-overlaid file in `src/` or `public/` to change a deployed brand — the
  published content comes from `master.pub/<file>.<brand>`.
- Keep `master.pub` in step with the app. A brand variant is a fork, and forks rot. Prefer the
  build-time constant (`VITE_BRAND` → `IS_HM`/`IS_TSA`) to a new variant, and verify that the other
  brand's markup is absent from the built bundle.
- Never deploy a tag you are unwilling to support: production builds come from tags, and the tag
  also signs the artifact.
- `.htaccess` / server config is manual and never uploaded; the excludes exist to protect it.
- Treat a failed run as "tree may be dirty" — check `git status` before doing anything else.
- If you add a step that touches the main tree, it needs a `TRAPEXIT` undo and a very good reason.
  Prefer the worktree.
- Sign the release from a key that needs no interactive prompt (a passphrase-less key works; a
  card-backed one cannot sign unattended, which is why the fallback copies the command to the
  clipboard).

---

## 12. Verifying what is live

| question | check |
|---|---|
| which release is live? | `curl https://hexmob.win/deploy.php` (and `go.tshare.app`) |
| is the entry point right? | root and `/index.php` → 200; `/index.html` → 404 |
| which brand did a host get? | `<title>` / `og:site_name` in the root HTML |
| did a CSS change reach a host? | palette hex values in the hashed `assets/*.css` |
| did a JS change reach a host? | a string that only exists in the new code, in the hashed JS |
| did a deploy touch my repo? | `git status` unchanged, `git stash list` unchanged, `git worktree list` = 1 |

After any run: `git status --porcelain` is what it was before, `git worktree list` shows only the
main checkout, and `staging/` is gone.

---

## 13. Where to change what

| goal | touch |
|---|---|
| per-brand metadata / social cards | `master.pub/index.html.<brand>` |
| per-brand palette | `master.pub/src/theme.scss.<brand>` |
| per-brand images / icons | `master.pub/public.<brand>/` |
| which brand is compiled, and where it goes | `TARGET` / `DEPLOY_TARGET` in `deploy.sh` |
| upload mechanics / excludes / TLS | `_deploy_build_output`, `_write_ftp_command_file`, `RSYNC_ARGS`, `LFTP_MIRROR_ARGS` |
| the list of overlaid files | `FILES` in `deploy.sh` |
| the deploy marker | `_assemble` (writes `dist/deploy.php`) |
| guards | `_require_tty`, `_require_clean_tree`, `_require_release_branch`, `_require_tag`, `_require_overlay` |
| tag states / suggestion / notes / publish | `release.sh` |
| console styling | `scripts/ui.zsh` (keep helper names `ui_`-prefixed, palette small) |
