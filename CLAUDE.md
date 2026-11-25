# CLAUDE.md — hexmob.win

Project knowledge for Claude Code. Committed to the repo so it syncs across machines via git and loads automatically every session.

## What this is

`hexmob.win` is a community (unofficial) mobile-friendly web UI for viewing/managing HEX stakes across EVM chains (Ethereum mainnet, PulseChain, testnets, ETHW/ETHF forks). Repo: `git@github.com:gruvin/hexmob.win.git` (owner gruvin, private, solo dev). Live: https://hexmob.win, dev: https://dev.hexmob.win.

Work happens on the `dev` branch; PRs target `master`. (Many stale dependabot branches exist on origin.)

## Stack

React 19 + TypeScript + Vite 7 (SWC plugin). `wagmi` v2 (pinned `2.12.0`) + `viem` (^2.45) for on-chain reads (multicall) and wallet connect. `@reown/appkit` 1.8.12 (pinned — WalletConnect successor) for wallet selection UI + network switching. `@tanstack/react-query` for refresh/caching. `react-bootstrap` + `sass`. `i18next` ^26 / `react-i18next` ^17 for wording modes. `recharts` ^3, `d3-format`, `axios` ^1.15, `debug`.

`package.json` has a `resolutions` block pinning `vite` 7.3.2 and `@reown/appkit-adapter-wagmi/@wagmi/connectors` 6.1.3. `react-copy-to-clipboard` runtime dep was dropped; only its `@types` remains (vestigial).

## Scripts

- `yarn dev` — vite dev server
- `yarn build` — `tsc && vite build`
- `yarn test` / `yarn test-once` — vitest (**no test files exist yet** despite the config)
- `yarn deploy:dev` — `./scripts/deploy.sh` (dev preview; production goes through `yarn release`)

There is **no CI** — the GitHub Actions workflow was removed (`.github/workflows/` is gone). Builds/tests are local-only.

## Architecture & data flow

**Entry** (`src/main.tsx`): provider tree `WagmiProvider` (WagmiAdapter from AppKit) → `QueryClientProvider` → `App`. `createAppKit` configures networks `[pulsechain, mainnet]`, defaultNetwork pulsechain, dark theme. Transports are `http()` with **no hardcoded URL** per chain, so each resolves to its chain-definition default RPC (pulsechain → `rpc.pulsechain.com`, mainnet → viem's maintained default) — deliberately avoiding our own endpoints that could rot (Infura/llamarpc were removed once the old on-chain stats/history queries went away). Reads (`call()`) go through a Viem **Public Client** = the transport, **never the wallet**; writes/signing always go through the wallet. So transports are a read-path concern only, and read-only data (price, HEX day, stakes) works with or without a connected wallet. Requires `VITE_REOWN_APPKIT_ID` (throws if missing).

**Key files (`src/`):**
- `App.tsx` — top-level. `Header` (price toggle, version/day, wording switcher), `Body` (renders `Stakes`). Reads on-chain globals via `useReadContracts` multicall, builds `HexData`, fetches both prices. Brand is a build-time constant: `deploy.sh` exports `VITE_BRAND` from `TARGET`, `src/brand.ts` folds it into `IS_HM`/`IS_TSA`, and the loser brand's markup is dead-code eliminated. `window.hostIsHM`/`hostIsTSA` are set for compat but nothing reads them.
- `Stakes.tsx` — per-account stake list; reads stakeCount + stakeLists via wagmi multicall, builds `StakeData[]`, merges dailyData. `StakesList` sub-component sorts/renders.
- `StakeInfo.tsx` — single stake row detail.
- `NewStakeForm.tsx` — create-stake UI. `StakeHistory.tsx` (lazy-loaded) — ended stakes.
- `Widgets.tsx` — shared: `CryptoVal`, `StakeStartButton`, `StakeEndButton` (wagmi writes), `GitHubInfo`, `WalletUtils`, `BurgerHeading`, `WhatIsThis`.
- `hex_contract.ts` — ABI, addresses, types (`HexData`, `Globals`, `StakeData`, `ClaimStats`, `DailyData`), default export object. `hex_contract.sol` is the reference Solidity source. `CHAIN_ADDRESSES` maps chainId→HEX contract.
- `util.ts` — pure HEX math: `calcPayoutRewards`, `calcAdoptionBonus`, `estimatePayoutRewardsDay`, `calcBigPayDaySlice`, `calcLatePenalty`, `calcStakeEnd`, `calcPercentGain`, `calcPercentAPY`, `cryptoFormat`, `formatUnitsWithCommas`, `getPulseXDaiHex` (price), `compactHexString`.
- `chains.ts` — `TChain` metadata map (avatar, rpcURL, explorerURL) keyed by chainId; 0 = "Not Connected".
- `brand.ts` — `BRAND` / `IS_HM` / `IS_TSA`, derived at build time from `VITE_BRAND` (stamped by deploy.sh); falls back to hostname detection under `yarn dev`, where the branch is the only place a brand is decided at runtime.
- `Context.tsx` — `HexContext` (React context carrying `HexData | undefined`); consumed via `useContext(HexContext)`.
- `lib/*.d.ts` — type decls (`App.d.ts` → `UriAccount`, `Stakes.d.ts` → `StakeData`/`StakeList`).

**URL params** (`URLSearchParams` in App): `?account=0xADDR:Label` (repeatable, multi-account view), `?closed=1` (show ended first), `?lang=en|en_WP`, `?wording=1` (show language switcher).

## Chains & pricing

**Two HEX/USD price sources, fetched independently in `App.tsx`:**
- `pulsePrice` — `getPulseXDaiHex()` in `util.ts`: axios POST to PulseX subgraph (`graph.pulsechain.com/.../pulsex`), queries pair `0x6f17...28c8` `token1Price` = DAI per HEX.
- `ethPrice` — on-chain `useReadContract` against Uniswap V2 HEX/USDC pair `0xF6DCdce0ac3001B2f67F750bc64ea5beB37B5824`, computed from reserves.

`headerPriceSource` state (`"ethereum" | "pulsechain"`, default `"pulsechain"`) controls which figure the header shows; clicking the green price toggles it (meaningful once both prices loaded). `USDHEX` (value feeding stake calcs) is chosen by connected `chainId`: chain 1 → ethPrice, else pulsePrice.

**Supported chains** (`chains.ts` + `hex_contract.ts` CHAIN_ADDRESSES): 1 Ethereum, 369 PulseChain, 943 PulseChain testnet v4, 10001 ETHW, 513100 ETHF, 31337 Hardhat, 3 Ropsten (legacy). HEX contract `0x2b591e99afe9f32eaa6214f7b7629768c40eeb39` on all real chains. chainId 0 = "Not Connected" (`/disconnected.png`). On network switch the app resets cached queries and reloads HEX data for that chain.

## Dual branding & deploy (`scripts/deploy.sh`, zsh)

Same codebase ships as two brands. The brand is decided at **build** time (`VITE_BRAND` → `src/brand.ts` → `IS_HM`/`IS_TSA`), with hostname detection kept only as the fallback for `yarn dev`:
- **hexmob** → hexmob.win (and dev.hexmob.win)
- **tsa** → go.tshare.app ("tshare.app" / TSA)

**Branding swap:** `master.pub/` holds per-brand overrides: `FILES=('index.html' 'src/theme.scss' 'public')`, copied in as `master.pub/<file>.<TARGET>`. `src/BrandLogo.tsx` is deliberately *not* swapped; it picks its brand at runtime from `window.hostIsHM`. Each build happens in a disposable `git worktree` under `./staging/`, so the overlay is applied there and thrown away with it — the working tree, branch and stash are never touched, and there are no backups to restore. **Don't casually edit the brand-swapped files** — for a deployed brand the `master.pub` copy is authoritative.

**Transports/targets:** dev & hexmob → FTP (lftp, ftps) using `.env.local` creds (`DEST_DEV_FTP_*`, `DEST_HEXMOB_FTP_*`). tsa → rsync. Dest hosts: `ftp.hexmob.win:/dev.hexmob.win`, `ftp.hexmob.win:/public_html`, `tsa:~/go.tshare.app`.

**Flows.** `yarn deploy:dev` builds the tsa brand from `HEAD` and publishes to `dev.hexmob.win` (uncommitted work is not included). Production is only ever `yarn release`, run from `master`: it never merges or checks out, asks for a signed tag whose annotation is a required one-line summary, gathers all remote state before prompting, edits the release notes in `$EDITOR`, deploys both brands, verifies both hosts report the new tag (`deploy.php`), signs `release/hexmob.win-<TAG>-build.tgz`, pushes, publishes the GitHub release, and finally returns to `dev`. `--dry-run` rehearses it; `--republish` re-releases an already-published tag. See `AGENTS.md`.

**Shared-hosting cache busting:** the host's nginx `open_file_cache` serves stale static files for days. deploy.sh renames built `dist/index.html` → `index.php` (PHP-FPM revalidates from disk), mirrors first and only then deletes the stale `index.html`, and writes `dist/deploy.php` — a small marker saying which tag the host is serving, used by the release to verify reality. `.htaccess` header directives do not reach responses on this host, so `dot-htaccess-sample` is reference only. Only `assets/` is reconciled with `--delete`; the web root is mirrored additively.

`.env.local` (gitignored) supplies `VITE_REOWN_APPKIT_ID` and FTP creds. Sample in `dot-env.local-sample`. (`VITE_INFURA_ID` is no longer used — mainnet RPC now uses the chain-default endpoint.)

## Conventions & gotchas

- **Strict TS** (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`). Build runs `tsc` first, so unused vars/params break the build.
- **bigint everywhere** for HEX contract values (currentDay, shares, hearts, payouts). `util.ts` math is bigint; display uses `formatUnitsWithCommas` / `cryptoFormat` / `d3-format`.
- **Wallet/chain data via wagmi hooks** — `useReadContract`/`useReadContracts` (multicall), `useChainId`, `useAccount`. Don't add ethers; legacy ethers5 was removed.
- **MetaMask "locked" ≠ "disconnected" (hard-won).** A *locked* MetaMask still leaves the site **authorized**: it keeps that authorization in its *own* extension storage (clearing the dApp's site-data does **not** disconnect it) and still answers `eth_accounts` with the address, so wagmi auto-reconnects and the app shows as connected — reading public data over RPC without the wallet. The vault lock only gates *signing*; the user gets MetaMask's unlock prompt when a tx needs a signature. The **only** dApp-visible "logout" is the user explicitly *Disconnecting the site* in MetaMask (→ `eth_accounts` returns `[]`). There is **no reliable dApp signal for "wallet UI is locked"** (`_metamask.isUnlocked()` proved unreliable and is MetaMask-only). So don't try to gate the UI on lock state — it can't be done. Auto-reconnect (`enableReconnect`/`reconnectOnMount`, both default-on) is intentionally left enabled.
- **Empty-state must distinguish loading/error/zero.** Stake reads (`Stakes.tsx`) only show "no stakes" on a *confirmed successful zero-count* read — spinner while loading, retry on error — so a slow/flaky RPC never looks like an empty wallet (which alarmed users). Don't collapse these back to a bare `stakeList.length === 0` check.
- **Debug logging:** `import _debug from "debug"; const debug = _debug("<scope>")` per module (scopes: app, Stakes, util, …). Enable via `localStorage.debug` / `DEBUG`.
- **i18n wording modes:** default language is `en_WP` ("Free Speech"/WP variant), alt is `en` ("Original"). `keySeparator: false`. Strings in `src/locales/{en,en_WP}/translation.json`. The "WP" badge in the header reflects this default.
- **Be conservative.** Git history shows several reverts of over-eager AI edits (e.g. "reverted AI induced regression", re-instated an "errantly removed" key). Don't remove keys/config you don't understand.
