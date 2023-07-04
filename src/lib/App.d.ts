import { ethers, bigint } from "ethers"
import { ReactComponentElement, ReactNode } from "react";
import { type TChain } from "./chains"

declare global {
  interface Window {
    debug: () => void
    contractSigner: HEXContract
    metamaskOnline: () => boolean
    hostIsTSA?: boolean
    hostIsHM?: boolean
    ethereum?: { request: (any) => Promise, isMetaMask?: boolean, _metamask: unknown }
    _APP: object
    _LOBBY: object
    _STAKES: object
    _STATS: object
    _SI: object
    _NSF: object
    _UTIL: object
    _E: object
    _w3M: object
    _HEX: object
    _UNIV2: object
    _TEWK: object
    _P: object
  }
}

export type UriAccount = { address: Address; name: string; }
