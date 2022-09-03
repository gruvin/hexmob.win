import { ethers, BigNumber } from "ethers"

// method ethers.BigNumber.toBN() exist but isn't typed in @ethersproject/lib/bignumber
declare module 'ethers' {
  interface BigNumber {
    toBN(): BN;
  }
}

declare global {
  interface Window {
    debug: any
    contract: HEXContract
    metamaskOnline: Function
    hostIsTSA?: boolean
    hostIsHM?: boolean
    web3signer?: any
    Trust?: any
    _w3?: any
    _APP: any
    _LOBBY: any
    _STAKES: any
    _STATS: any
    _SI: any
    _NSF: any
    _UTIL: any
    _E: any
    _w3M: any
    _HEX: any
    _UNIV2: any
    _TEWK: any
  }
}

export interface Wallet {
  address: string
  bnBalance?: BigNumber
  bnBalanceETH?: BigNumber
}

export interface Props {
}

export interface State {
  chainId: number,
  network: string,
  currentProvider: string,
  walletConnected: boolean,
  wallet: Wallet,
  contractReady: boolean,
  contractGlobals: object, // XXX
  currentDay: number,
  USDHEX: number,
  donation: string,
  bnTotalHearts: BigNumber,
  USD: number,
  referrer: string,
  accounts: any[],
}
