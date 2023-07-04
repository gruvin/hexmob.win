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
