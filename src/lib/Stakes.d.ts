import React from 'react'
import App from '../App'
import { type HEXContract } from '../hex_contract'

export interface Props {
    contract: any
    parent: App
    wallet: Wallet
    usdhex: number
    openActive?: boolean
    className?: string
    publicAddress?: string
    publicName?: string
}

export interface State {
    selectedCard: string
    stakeCount: number
    stakeList: StakeList
    loadingStakes: boolean
    stakeContext: object, // active UI stake context
    showExitModal: boolean
    currentDay: string
    pastStakes?: PastStake[]
    pastStakesSortKey: { keyField: string, dir: number }
    bnTotalValue: BigNumber
}

export interface PastStake {
    [index: string]: BigNumber | number | string
    timestamp: number
    bnStakedHearts: BigNumber
    bnStakeShares: BigNumber
    bnPayout: BigNumber
    bnPenalty: BigNumber
    servedDays: number
    prevUnlocked: number
    stakerAddr: string
    stakeId: BigNumber
}

export interface StakeData {
    stakeId: BigNumber // external contracts may use large numbers as unique IDs
    stakeIndex: number
    lockedDay: number
    stakedDays: number
    bnStakedHearts: BigNumber
    bnStakeShares: BigNumber
    bnPayout: BigNumber
    bnBigPayDay: BigNumber
    bnPenalty: BigNumber
    progress?: number
    isTewkStake: boolean
}

export type StakeList = StakeData[]

export interface Context {
    contract: HEXContract
    address?: string
}
