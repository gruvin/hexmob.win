import { type HEXContract } from '../hex_contract'
import { BigNumber } from 'ethers'
import { StakeList } from './Stakes'
import { type Stakes } from '../Stakes'
import { type Tewkenaire } from '../Tewkenaire'
import React from 'react'

export { Tewkenaire }

export type TotalT = {
    [index: string]: bigint
    // SYMBOL: string
    bnTotalValue: bigint
}

export interface ListProps {
    parent: Tewkenaire
    contractObject: HEX2 | HEX4 | HEX5
    heading: React.ComponentElement
    usdhex: number
}

export type TewkStakeData = {
    stakeID: number
    hexAmount: bigint
    stakeShares: bigint
    lockedDay: number
    stakedDays: number
    unlockedDay: number
    started: boolean
    ended: boolean
    stakeOwner: string
    payout: bigint
    bigPayDay: bigint
    interest: bigint
    value: bigint
}
export type TewkStakeList = TewkStakeData[]

