import { type HEXContract } from '../hex_contract'
import { BigNumber } from 'ethers'
import { StakeList } from './Stakes'
import { type Stakes } from '../Stakes'
import { type Tewkenaire } from '../Tewkenaire'
import React from 'react'

export { Tewkenaire }

export interface Props {
    parent: Stakes
    usdhex: number
}

export interface State {
    contract: HEXContract
    bnTotalValue: BigNumber
}

export interface ListProps {
    parent: Tewkenaire
    contractObject: HEX2 | HEX4 | HEX5
    heading: React.ComponentElement
    usdhex: number
}

export interface ListState {
    stakeList: StakeList.StakeData[]
    progressBar: number,
    progressLabel: string,
    bnTotalValue: BigNumber
}

export interface StakeData {
    stakeID: BigNumber
    bnHexAmount: BigNumber
    bnStakeShares: BigNumber
    lockedDay: number
    stakedDays: number
    unlockedDay: number
    started: boolean
    ended: boolean
    stakeOwner: string
    bnPayout: BigNumber
    bnBigPayDay: BigNumber
    bnInterest: BigNumber
    bnValue: BigNumber
}
