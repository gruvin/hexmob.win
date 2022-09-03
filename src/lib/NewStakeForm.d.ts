import { type Wallet } from './lib/App'
import { type HEXContract } from '../hex_contract'

export interface Props {
    contract: HEXContract
    reloadStakes?: Function
    wallet: Wallet
}

export interface State {
    startDay: number
    endDay: number
    stakeDays: string
    stakeAmount: string
    startDate: string
    startTime: string
    endDate: string
    endTime: string
    percentGain: string
    percentAPY: string
    bnNewStakedHearts: BigNumber
    bnLongerPaysBetter: BigNumber
    bnBiggerPaysBetter: BigNumber
    bnBonusTotal: BigNumber
    bnEffectiveHEX: BigNumber
    bnStakeShares: BigNumber
    bnShareRate: BigNumber
    bnBigPayDay: BigNumber
    shareRate: number
    data: []
    graphIconClass: string
}
