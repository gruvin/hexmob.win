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
- `yarn deploy` — `./scripts/deploy.sh`

There is **no CI** — the GitHub Actions workflow was removed (`.github/workflows/` is gone). Builds/tests are local-only.

## Architecture & data flow

**Entry** (`src/main.tsx`): provider tree `WagmiProvider` (WagmiAdapter from AppKit) → `QueryClientProvider` → `App`. `createAppKit` configures networks `[pulsechain, mainnet]`, defaultNetwork pulsechain, dark theme. Explicit `http` transports per chain: mainnet via Infura (`VITE_INFURA_ID`, falls back to llamarpc), pulsechain via `rpc.pulsechain.com`. Requires `VITE_REOWN_APPKIT_ID` (throws if missing).

**Key files (`src/`):**
- `App.tsx` — top-level. `Header` (price toggle, version/day, wording switcher), `Body` (renders `Stakes`). Reads on-chain globals via `useReadContracts` multicall, builds `HexData`, fetches both prices. Host detection sets `window.hostIsHM` / `window.hostIsTSA`.
- `Stakes.tsx` — per-account stake list; reads stakeCount + stakeLists via wagmi multicall, builds `StakeData[]`, merges dailyData. `StakesList` sub-component sorts/renders.
- `StakeInfo.tsx` — single stake row detail.
- `NewStakeForm.tsx` — create-stake UI. `StakeHistory.tsx` (lazy-loaded) — ended stakes.
- `Widgets.tsx` — shared: `CryptoVal`, `StakeStartButton`, `StakeEndButton` (wagmi writes), `GitHubInfo`, `WalletUtils`, `BurgerHeading`, `WhatIsThis`.
- `hex_contract.ts` — ABI, addresses, types (`HexData`, `Globals`, `StakeData`, `ClaimStats`, `DailyData`), default export object. `hex_contract.sol` is the reference Solidity source. `CHAIN_ADDRESSES` maps chainId→HEX contract.
- `util.ts` — pure HEX math: `calcPayoutRewards`, `calcAdoptionBonus`, `estimatePayoutRewardsDay`, `calcBigPayDaySlice`, `calcLatePenalty`, `calcStakeEnd`, `calcPercentGain`, `calcPercentAPY`, `cryptoFormat`, `formatUnitsWithCommas`, `getPulseXDaiHex` (price), `compactHexString`.
- `chains.ts` — `TChain` metadata map (avatar, rpcURL, explorerURL) keyed by chainId; 0 = "Not Connected".
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

Same codebase ships as two brands; `App.tsx` host-detection sets `window.hostIsHM` vs `window.hostIsTSA` at runtime:
- **hexmob** → hexmob.win (and dev.hexmob.win)
- **tsa** → go.tshare.app ("tshare.app" / TSA)

**Branding swap:** `master.pub/` holds per-brand overrides. `FILES=('index.html' 'src/theme.scss' 'src/BrandLogo.tsx' 'public')`. Before build, deploy.sh backs up each to `master.pub/<file>-orig`, copies `master.pub/<file>.<TARGET>` (e.g. `index.html.hexmob`, `public.hexmob/`, `public.tsa/`) over the working copy, runs `yarn build`, deploys `dist/`, then `_cleanup` restores originals (`git checkout dev` + `git stash pop`). **Don't casually edit the brand-swapped files** — they're overwritten at deploy time.

**Transports/targets:** dev & hexmob → FTP (lftp, ftps) using `.env.local` creds (`DEST_DEV_FTP_*`, `DEST_HEXMOB_FTP_*`). tsa → rsync. Dest hosts: `ftp.hexmob.win:/dev.hexmob.win`, `ftp.hexmob.win:/public_html`, `tsa:~/go.tshare.app`.

**Prod flow:** prompts "Production or Dev"; production requires typing "yes", a release tag (e.g. `v0.2.3B`, must match a master git tag), `git stash && git checkout <TAG>`, sets `VITE_VERSION`, builds both tsa+hexmob, then tars `dist/` to `release/hexmob.win-<TAG>-build.tgz` for GPG signing (`gpg --yes -b ...`, copied to clipboard). Dev flow deploys only to tsa dev target.

**Shared-hosting cache busting:** the production host (nginx + PHP-FPM) has an `open_file_cache` that serves stale `index.html` for days. deploy.sh renames built `dist/index.html` → `index.php` (served via PHP-FPM, bypassing the static cache) and, on the FTP target, runs `rm -f index.html; rm -f index.php` before the `mirror`. `dot-htaccess-sample` (cache-control directives) is committed as reference.

`.env.local` (gitignored) supplies `VITE_REOWN_APPKIT_ID`, `VITE_INFURA_ID`, and FTP creds. Sample in `dot-env.local-sample`.

## Conventions & gotchas

- **Strict TS** (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`). Build runs `tsc` first, so unused vars/params break the build.
- **bigint everywhere** for HEX contract values (currentDay, shares, hearts, payouts). `util.ts` math is bigint; display uses `formatUnitsWithCommas` / `cryptoFormat` / `d3-format`.
- **Wallet/chain data via wagmi hooks** — `useReadContract`/`useReadContracts` (multicall), `useChainId`, `useAccount`. Don't add ethers; legacy ethers5 was removed.
- **Debug logging:** `import _debug from "debug"; const debug = _debug("<scope>")` per module (scopes: app, Stakes, util, …). Enable via `localStorage.debug` / `DEBUG`.
- **i18n wording modes:** default language is `en_WP` ("Free Speech"/WP variant), alt is `en` ("Original"). `keySeparator: false`. Strings in `src/locales/{en,en_WP}/translation.json`. The "WP" badge in the header reflects this default.
- **Be conservative.** Git history shows several reverts of over-eager AI edits (e.g. "reverted AI induced regression", re-instated an "errantly removed" key). Don't remove keys/config you don't understand.
