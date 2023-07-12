export type StakeData = {
    stakeId: bigint
    stakeIndex?: bigint
    lockedDay: bigint
    stakedDays: bigint
    endDay: bigint
    stakedHearts: bigint
    stakeShares: bigint
    unlockedDay: bigint
    payout: bigint
    bigPayDay: bigint
    penalty: bigint
    stakeReturn: bigint
    cappedPenalty: bigint
    isAutoStake: boolean
    isTewkStake?: boolean
    progress?: number
}
export type StakeList = StakeData[]

export type EventStakeHistory = {
    stakerAddr: Address,
    stakeId: bigint,
    timestamp: bigint
    stakedHearts: bigint
    stakeShares: bigint
    payout: bigint
    penalty: bigint
    servedDays: bigint
    prevUnlocked: boolean
    stakeReturn: bignum
} | null
