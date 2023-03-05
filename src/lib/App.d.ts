import { ethers, BigNumber } from "ethers"
import { type TChain } from "./chains"

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
    ethereum?: any
    ethersSigner?: any
    web3provider?: any
    signClient?: any
    Trust?: any
    _W3provider?: any
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
    _P: any
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
  chainId: numbe
  network: TChain | null
  currentProvider: string
  walletConnected: boolean
  wallet: Wallet
  contractReady: boolean
  contractGlobals: object // TODO
  currentDay: number
  USDHEX: number
  donation: string
  bnTotalHearts: BigNumber
  USD: number
  referrer: string
  accounts: any[]
}

type ContractAddress = string
