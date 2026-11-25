# hexmob.win
**According solely to ChatGPT 5's review of the codebase**

A fast, mobile-friendly web interface for viewing and managing your HEX stakes across supported EVM networks (Ethereum Mainnet, PulseChain, testnets and selected forks). It focuses on clarity, speed, multi‑account viewing via URL parameters, and a "Free Speech" wording mode for users who prefer alternative terminology.

> This is a community-driven interface – **not** an official HEX website or wallet. Use at your own risk. Nothing herein is financial, tax, accounting, legal or investment advice. Do your own research.

---
## 1. What Is This?
`hexmob.win` lets you:
- Connect a wallet and see current HEX balance, stakes and key global metrics.
- Monitor stake performance: payout, BigPayDay component, penalties, effective APY.
- Toggle live HEX price source between PulseChain (HEX/DAI) and Ethereum (HEX/USDC) when available.
- View multiple addresses' stakes simultaneously by adding `?account=` parameters to the URL.
- Switch wording style (Original vs Free Speech) via `?wording` or `?lang=` parameters.
- Access direct links to the active chain's block explorer for the HEX contract.

Under the hood it uses:
- React + TypeScript + Vite for a snappy front‑end.
- `wagmi` + `viem` for efficient on-chain reads (multicall) and wallet connection.
- PulseX Graph API & Uniswap V2 reserves for near real-time price feeds.
- `react-query` for automatic data refresh and caching.
- `i18next` for runtime wording/language switching.

---
## 2. Live Usage (End User)
You only need a modern browser. No install required.

1. Navigate to: https://hexmob.win (or development: https://dev.hexmob.win)
2. Connect your wallet using the button at the bottom status bar.
3. After connection your stakes and HEX balance load automatically and refresh every ~10s.
4. Click the green price figure at top to toggle price source (PulseChain vs Ethereum) once both have loaded.
5. Open / close Active vs Ended stakes with the interface controls.
6. For multiple addresses, append parameters:
   - `?account=0xYourAddr:Label&account=0xOtherAddr:Friend` (label optional)
7. To change wording mode:
   - `?lang=en` for Original terminology.
   - Omitting or `?lang=en_WP` uses the Free Speech wording variant.
8. To display wording switcher manually add `?wording=1`.

You can bookmark fully parameterized URLs for quick portfolio views.

---
## 3. URL Parameter Reference
| Parameter | Example | Purpose |
|-----------|---------|---------|
| `account` | `?account=0xABC...123:MyStake` | Adds an account row; repeat for multiples. |
| `closed`  | `?closed=1` | Default view shows Active stakes; this hides them initially and shows Closed. |
| `lang`    | `?lang=en` / `?lang=en_WP` | Selects wording style. |
| `wording` | `?wording=1` | Forces language switcher dropdown to appear. |

Combine them: `https://hexmob.win/?account=0xAAA...111:Main&account=0xBBB...222:Alt&lang=en`.

---
## 4. Features In Detail
### Stake Metrics
For each stake the app estimates:
- Accrued payout (inflation) including today’s partial progress.
- BigPayDay slice & adoption bonuses if applicable.
- Early end penalties (simulated) and late end penalties.
- Percentage gain vs staked principal and derived APY.

### Global HEX Data
Shows current day, share rate, total supply, locked hearts, pending claim stats, and other on-chain global values via multicall queries.

### Pricing
- PulseChain source: PulseX subgraph (HEX/DAI) → displays DAI per HEX converted to USD figure.
- Ethereum source: Uniswap V2 pair reserves (HEX/USDC) → on-chain ratio calculation.
- Header toggle independent from the underlying stake calculations.

### Multi-Network Awareness
If your wallet switches network, the interface resets cached queries and reloads HEX contract data mapped to that chain (same address across supported chains). Unsupported chains fall back to a safe display state.

### Wording Modes
Two selectable wording modes to suit user preference. Original vs Free Speech variant. Switch without page reload. Some labels and descriptive text adapt accordingly.

---
## 5. Safety & Disclaimers
- Always verify contract address on the explorer after connecting. A clickable badge displays the address per chain.
- The site never asks for your seed phrase or private keys. If you see such a prompt, leave immediately.
- Transactions (e.g., ending stakes) require standard wallet confirmation; review gas settings and amounts before approving.
- Price feeds are best-effort and may momentarily lag or show "-.-" when sources fail.
- Calculations for APY, penalties, future day payouts are estimates derived from the public HEX contract logic; edge cases (e.g., extreme share rate changes intra-day) may differ slightly from final on-chain settlement.
- Not financial advice; cryptocurrency and staking carry risk including complete loss of value.

---
## 6. Frequently Asked Questions
**Q: Do I need to install anything?**  
No. It’s a pure web app.

**Q: Can I use on mobile?**  
Yes. Layout is responsive; wallet connection depends on your mobile wallet’s browser / injected provider.

**Q: Why does a stake show zero BigPayDay?**  
Only stakes spanning the original BigPayDay (historical event) receive its bonus slice.

**Q: My stake APY looks huge/low – why?**  
APY is extrapolated from served days vs total payout; very short served periods can produce volatile annualized figures.

**Q: Price isn’t updating.**  
Network hiccups occur. It auto-retries every 10 seconds; try a manual page refresh or confirm you’re online.

**Q: Can I export data?**  
Currently no built-in export. Planned: CSV/JSON download of stake list.

---
## 7. Support & Feedback
- Issues / feature requests: Open a GitHub issue (see footer GitHub link inside the app).
- Security concerns: Please responsibly disclose via GitHub issues marked as security or via a direct contact method (if provided in repo issues template).
- Translations / wording improvements: Contribute new `i18n` JSON locale files (`src/locales/`).

---
## 8. Roadmap & Possible Enhancements
Planned or suggested improvements:
- Stake list CSV/JSON export.
- Historical price chart overlays (Recharts integration already present).
- Dark mode toggle in UI.
- Gas estimation helpers for stake end actions.
- More locale variants & community wording contributions.
- Accessibility refinements (ARIA roles, focus states).
- Offline caching & PWA manifest adjustments.

---
## 9. Privacy
The site runs **no analytics and no tracking of any kind**. There is no `react-ga` (or any other telemetry dependency) in the project. Wallet addresses are used only to query public blockchain data. Bookmarking multi-account views keeps addresses in plain URL parameters — clear history if that's a concern.

---
## 10. Technical Snapshot
| Stack | Notes |
|-------|-------|
| React + TypeScript | Modern component architecture. |
| Vite | Fast dev & optimized production build. |
| wagmi / viem | Reliable wallet & contract read layer (multicall). |
| react-query | Interval refetch + caching. |
| Bootstrap + SCSS | Consistent styling & responsive layout. |
| i18next | Runtime wording / language switching. |
| PulseX Graph & Uniswap | Dual-source price discovery. |

---
## 11. How Calculations Work (Plain English)
- Inflation payout = stake’s shares / total shares × daily inflation pool, aggregated over served days + current partial day.
- BigPayDay (historic) slice = proportional share of unclaimed BTC allocation plus adoption bonuses.
- Early end penalty = a proportion of would-be payout + BigPayDay depending on how early it’s ended relative to minimum served period.
- Late end penalty = linear scaling after a grace window, capped at full stake return.
- APY is annualized gain: (total payout ÷ staked principal) × (365 ÷ days served).

These replicate HEX contract logic using locally calculated values and fetched daily data slices.

---
## 12. Development

Contributions are welcome. Work happens on the `dev` branch; PRs target `master`.

### Setup

```zsh
yarn install
cp dot-env.local-sample .env.local     # then fill it in
yarn dev                               # http://localhost:5173
```

`.env.local` must supply `VITE_REOWN_APPKIT_ID` — the app throws without it. The FTP credentials in
the same file are only needed to deploy.

### Scripts

| command | what it does |
|---|---|
| `yarn dev` | Vite dev server |
| `yarn build` | `tsc && vite build` (type errors fail the build) |
| `yarn test` | vitest — **no test files exist yet** |
| `yarn deploy:dev` | build and publish the preview to `dev.hexmob.win` |
| `yarn release` | tagged, signed production release (see `AGENTS.md`) |

There is **no CI**: the GitHub Actions workflow was removed, so builds and tests are local-only.

### Stack

React 19 + TypeScript (strict) + Vite 7 (SWC plugin). `wagmi` v2 (pinned `2.19.5`) + `viem` ^2.45
for on-chain reads (multicall) and wallet connection; `@reown/appkit` 1.8.12 (pinned) for wallet
selection and network switching; `@tanstack/react-query` for refresh/caching; `react-bootstrap` +
`sass` for styling; `i18next` ^26 / `react-i18next` for wording modes; `recharts`, `d3-format`,
`debug`. HTTP is plain `fetch` — there is no axios. The only two off-chain endpoints are the PulseX
subgraph price (`POST` to `graph.pulsechain.com`) and the future-stake graph (`GET`
`futureus.win`, `?future` only), in `util.ts` / `NewStakeForm.tsx`; timeouts use `AbortController`,
and a non-2xx is turned into a throw so callers keep the axios-era error handling.

`package.json` carries a `resolutions` block. Two entries are structural: `vite` 7.3.7 (an exact pin —
the lock does not move without it) and `@reown/appkit-adapter-wagmi/@wagmi/connectors` 6.2.0 (which
must match the connectors version wagmi itself pins — 2.19.5 wants exactly 6.2.0, and AppKit's
adapter declares `wagmi >=2.17.5`, so it is satisfied by the same copy). The
rest exist to keep transitive build-tool versions at patched releases (`rollup`, `postcss`,
`js-yaml`, `flatted`, `nanoid`, `source-map-js`, `immutable`) and one to override
`@coinbase/cdp-sdk`'s exact `axios` pin (`1.16.0`), which reaches the tree through the Coinbase
smart-wallet connector and is never bundled. (`@types/react-copy-to-clipboard` remains even though
the runtime dependency was dropped.)

### Architecture & data flow

`src/main.tsx` builds the provider tree — `WagmiProvider` (`WagmiAdapter` from AppKit) →
`QueryClientProvider` → `App` — and configures AppKit with the `[pulsechain, mainnet]` networks,
PulseChain as the default and the dark theme. Transports are `http()` with **no hardcoded URL**, so
each chain resolves to its own definition's default RPC; that deliberately avoids our own endpoints
rotting.

Reads go through a viem **Public Client** (the transport), **never the wallet**; writes and signing
always go through the wallet. So price, HEX day and stake data load with or without a connected
wallet, and transports are a read-path concern only.

### Key files

| file | responsibility |
|---|---|
| `App.tsx` | header (price toggle, version/day, wording switcher), body; reads HEX globals via multicall into `HexData`, fetches both prices |
| `Stakes.tsx` | per-account stake list: `stakeCount` + `stakeLists` multicall → `StakeData[]`, merged with daily data |
| `StakeInfo.tsx`, `NewStakeForm.tsx`, `StakeHistory.tsx` | single stake detail; create-stake form; ended stakes (lazy-loaded) |
| `simulateStakeEnd.ts`, `SimulateStakeEndButton.tsx` | on-chain `stakeEnd` simulation via `debug_traceCall` |
| `Widgets.tsx` | shared bits: `CryptoVal`, `StakeStartButton`, `StakeEndButton`, `GitHubInfo`, `WalletUtils`, `BurgerHeading`, `WhatIsThis` |
| `hex_contract.ts` | ABI, `CHAIN_ADDRESSES`, types (`HexData`, `Globals`, `StakeData`, `ClaimStats`, `DailyData`); `hex_contract.sol` is the reference source |
| `util.ts` | pure HEX math (`calcPayoutRewards`, `calcAdoptionBonus`, `estimatePayoutRewardsDay`, `calcBigPayDaySlice`, `calcLatePenalty`, `calcStakeEnd`, `calcPercentGain`, `calcPercentAPY`, `cryptoFormat`, `formatUnitsWithCommas`, `getPulseXDaiHex`, `compactHexString`) |
| `chains.ts` | `TChain` metadata (name, avatar, rpcURL, explorerURL) per chainId; `0` = “Not Connected” |
| `brand.ts` | `BRAND` / `IS_HM` / `IS_TSA`, folded at build time from `VITE_BRAND`; hostname detection is the `yarn dev` fallback only |
| `Context.tsx` | `HexContext` carrying `HexData | undefined` |
| `lib/*.d.ts` | shared type declarations (`UriAccount`, `StakeData`, `StakeList`) |

URL parameters are documented in §3 above.

### Chains & pricing

Supported: `1` Ethereum, `369` PulseChain, `943` PulseChain testnet v4, `10001` ETHW, `513100`
ETHF, `31337` Hardhat (plus legacy `3` Ropsten). The HEX contract is
`0x2b591e99afe9f32eaa6214f7b7629768c40eeb39` on every real chain. Switching network resets cached
queries and reloads hex data for that chain.

Two independent price sources feed the header: `pulsePrice` from the PulseX subgraph (HEX/DAI,
`getPulseXDaiHex()`), and `ethPrice` from the Uniswap V2 HEX/USDC pair reserves
(`0xF6DCdce0ac3001B2f67F750bc64ea5beB37B5824`). The header figure follows `headerPriceSource`
(toggleable), while `USDHEX` — the value used in stake maths — follows the connected `chainId`
(Ethereum → eth price, otherwise PulseX).

### Conventions & gotchas

- **Strict TypeScript** (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`). `yarn build` runs `tsc` first, so an unused variable fails the
  build.
- **`bigint` everywhere** for contract values (day, shares, hearts, payouts). `util.ts` maths are
  bigint; display goes through `formatUnitsWithCommas` / `cryptoFormat` / `d3-format`.
- **wagmi hooks only** for chain data — `useReadContract` / `useReadContracts` (multicall),
  `useChainId`, `useAccount`. Don't add ethers; the legacy ethers5 path was removed.
- **A locked MetaMask is not a disconnected one.** A locked MetaMask still answers `eth_accounts`
  with the address (it keeps the site authorisation in its own storage), so wagmi reconnects and the
  app shows as connected, reading public data over RPC. The lock only gates *signing*; the user gets
  the unlock prompt when a transaction needs a signature. The only dApp-visible “logout” is the user
  disconnecting the site in MetaMask. There is **no reliable signal for “wallet UI is locked”** —
  don't gate the UI on it. Auto-reconnect is left enabled on purpose.
- **Empty state must distinguish loading / error / zero.** Stake reads show “no stakes” only on a
  *confirmed successful zero-count* read (spinner while loading, retry on error), so a slow RPC never
  looks like an empty wallet. Don't collapse this back into `stakeList.length === 0`.
- **Debug logging:** `import _debug from "debug"; const debug = _debug("<scope>")` per module
  (scopes: app, Stakes, util, …). Enable with `localStorage.debug` / `DEBUG`.
- **Wording modes:** default locale `en_WP` (the “Free Speech” variant) with `en` as the original.
  `keySeparator: false`. Strings live in `src/locales/{en,en_WP}/translation.json`; the header's “WP”
  badge reflects this default.
- **Be conservative.** History shows several reverts of over-eager AI edits. Don't remove keys,
  config or “unused” code you don't understand.

### Known dependency advisories

Dependabot alerts on this repo were **dismissed wholesale**, so this list — not the GitHub security
tab — is the record. Re-check with `yarn audit` (there is no CI to do it).

Current state after the axios→`fetch` + wagmi 2.19.5 sweep: **78 advisories, 41 high, confined to
three packages** (`zod`, `ws`, `decode-uri-component`) — down from 139 / 53 high / 21 packages.

Cleared in that sweep, and not to be reintroduced: `axios` · `follow-redirects` · `form-data`
(gone from the bundle entirely — the app uses `fetch`); `vite`, `rollup`, `postcss`, `js-yaml`,
`flatted`, `nanoid`, `minimatch`, `brace-expansion`, `picomatch`, `source-map-js`, `immutable`,
`i18next`, `ajv`, `vitest`, `hono`, `socket.io-parser`, `@coinbase/wallet-sdk` (→ 4.3.6),
`@metamask/sdk` (→ 0.33.1). The last four came in with the wagmi bump, not from an override: wagmi
2.19.5 pulls `@wagmi/connectors` 6.2.0, which already depended on patched Coinbase/MetaMask SDKs.

Accepted, with why:

| advisory | why it stays |
|---|---|
| `zod` < 4.6.6 | `@reown/appkit-wallet` pins `zod` to exactly `3.22.4` and the advisory range is `< 4.6.6`, so **no 3.x patch exists** — and AppKit 2.0.0 still pins `3.22.4`, so a major AppKit upgrade would *not* clear it either. Nothing to do but wait for a Reown release that moves off zod 3. Validation is of AppKit's own config, not untrusted input. |
| `ws` 8.20.1 | the flagged copies sit behind WalletConnect's `jsonrpc-ws-connection` / `ethereum-provider` (Node transports). No `ws` code is in `dist/` — the browser uses the native `WebSocket`. Clearing it means forcing `ws` 8.x into a consumer that asks for `^7.5.1`. |
| `decode-uri-component` 0.2.2 | reached only through `@walletconnect/utils`→`query-string`; the 0.5.x fix is a cross-major (ESM) bump and the code isn't in `dist/`. |

Moderate leftovers are all nested dev-tool copies (`@babel/runtime`, `@humanfs/node`, `minimatch`,
`uuid`) that a range-preserving re-resolve will not move.

Two direct dependencies are imported nowhere: `@stablelib/ed25519` and `@stablelib/random`. Left in
place deliberately (see the last conventions bullet); `@stablelib/ed25519` carries an unpatchable
moderate (signature malleability, no fixed release).

### Branding & deployment

Two brands ship from this one codebase (`hexmob.win` and `go.tshare.app`), differing only in
metadata, palette and images. `AGENTS.md` is the reference for how that works, how to deploy a
preview (`yarn deploy:dev`) and how to cut a release (`yarn release`) — read it before touching
`scripts/` or `master.pub/`.

## 13. License
If no explicit license file is present, treat this interface as "source-available" for personal use and review. For redistribution or commercial usage, please open an issue requesting clarification.

---
## 14. Final Notes
Bookmark your favorite multi-account URL. Always double-check the contract address and network. Stay safe, and enjoy exploring your stakes with a cleaner, faster interface.

---
*Not affiliated with HEX founders, PulseChain operators, or any centralized entity.*
