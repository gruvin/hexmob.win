import { Wallet } from "./lib/App"
import { ReactComponentElement } from "react"
import { BigNumber } from "ethers"
import { XfLobbyEnter } from "./hex_contract"
import { types } from "sass"


export interface Props {
    appRoot: TApp
    contract?: HEXContract
    wallet: Wallet

}

export interface State {
    historyDataReady: boolean
    error: string
    dailyDataCount: number
    lobbyData: any[]
    lobbyDataUI: any[]
    pastEntries: any[]
    entryETH: string
    todayAvailableHEX: string
    todayPendingETH: string
    HEXperETH: string
    todayYourHEXPending: string
    todayYourEntriesRawTotal: string
    unmintedEntries: UnmintedEntries
    entryHEX: string
    lobbySortKey: { keyField: string, dir: number }
    walletETHBalance: BigNumber
}

export type Entry = {
    entryId?: BigNumber // bitwise encoded { day, entryNum, bnRawAmount }
    data0?: BigNumber
    memberAddr?: string
    referrerAddr?: string
    bnRawAmount?: BigNumber
    bnMintedHEX?: BigNumber
}
export type Entries = Array<Array<LobbyT.Entry>>

// This one is type-casting around some early code I wrote before I knew JS arrays are sparse,
// internally string index hash tables. I was trying to solve memoery allocation isses that don't exist. :p
// quirks/features. The AA Lobby is long over now that I'm converting to Typescript. So, meh. :|
interface UnmintedEntries { [index: string ]: LobbyEntry[] }

export interface EntryTotals {
    bnPotentialHEXTotal: BigNumber
    bnMintedHEXTotal: BigNumber
    bnRawEntriesTotal: BigNumber
    dayEntriesTotal: number
}
