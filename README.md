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
The site itself does not run its own tracking scripts beyond optional anonymous analytics (`react-ga`) where enabled. Wallet addresses are only used to query public blockchain data. Bookmarking multi-account views keeps addresses in plain URL parameters — clear history if that’s a concern.

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
## 12. Contributing (For Curious Users)
While this README targets end users, code contributions are welcome:
1. Fork and clone.
2. Install dependencies (`npm install`).
3. Start dev server (`npm run dev`).
4. Submit focused PRs with clear descriptions.

---
## 13. License
If no explicit license file is present, treat this interface as "source-available" for personal use and review. For redistribution or commercial usage, please open an issue requesting clarification.

---
## 14. Final Notes
Bookmark your favorite multi-account URL. Always double-check the contract address and network. Stay safe, and enjoy exploring your stakes with a cleaner, faster interface.

---
*Not affiliated with HEX founders, PulseChain operators, or any centralized entity.*
