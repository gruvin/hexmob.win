// Which brand this build is. Read by components that render brand-specific markup, so that
// the decision is a build-time constant rather than a runtime branch.
//
// deploy.sh exports VITE_BRAND from TARGET before each build, and Vite inlines that literal
// into the bundle: `BRAND`, `IS_HM` and `IS_TSA` all collapse to literals, so the non-matching
// brand's markup is dead code and is dropped from `dist/`. A production build therefore
// contains one brand only.
//
// Hostname detection is the fallback for `yarn dev` and any build made without a stamped
// brand - that is the only situation in which the brand is decided at runtime, and the
// `if` below (rather than a ternary or `??`) is what lets the bundler drop it entirely when
// a brand was stamped.
export type Brand = "hexmob" | "tsa";

const brandFromEnv: Brand | undefined = import.meta.env.VITE_BRAND;
// cast is safe: when nothing was stamped, the block below assigns a brand before it is read
let brand: Brand = brandFromEnv as Brand;

if (!brandFromEnv) {
  brand = window.location.hostname === "hexmob.win" ? "hexmob" : "tsa";
}

export const BRAND: Brand = brand;

export const IS_HM: boolean = BRAND === "hexmob";
export const IS_TSA: boolean = BRAND !== "hexmob";
