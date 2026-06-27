export interface StakeEndSimulation {
  success: boolean;
  error?: string;

  // Stake details (from stakeLists query)
  stakeId: number;
  stakedHearts: bigint;
  stakeShares: bigint;
  lockedDay: number;
  stakedDays: number;
  currentDay: number;
  servedDays: number;
  isMature: boolean;

  // Outcome
  payout: bigint;              // new HEX minted to staker (in hearts)
  principalReturned: bigint;   // linearly vested principal portion
  penaltyPaid: bigint;         // penalty lost (if early end)
  dailyInterest: bigint;       // extra from dailyDataUpdate catch-up
  balanceBefore: bigint;       // staker's HEX balance before
  balanceAfter: bigint;        // staker's HEX balance after
}
