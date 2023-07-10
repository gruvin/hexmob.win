import HEX from './hex_contract'
import { commify } from '@ethersproject/units'
import { formatUnits, parseUnits } from 'viem'
import { Globals, HexData, DailyData } from './hex_contract'
import { StakeData, StakeList } from './lib/Stakes'
import { TewkStakeList } from './lib/Tewkenaire'
import { format } from 'd3-format'
import axios from 'axios'
import _debug from 'debug'
const debug = _debug("util")
debug("loaded")

export const getMainnetUsdHex = async () => {
    const response = await axios.get("https://uniswapdataapi.azurewebsites.net/api/hexPrice")
    debug("HEX-USD: ", response.data?.hexUsd)
    return parseFloat(response.data?.hexUsd || "0.0")
}

export const getPulseXDaiHex = async () => {
    const response = await axios.post("https://graph.pulsechain.com/subgraphs/name/pulsechain/pulsex", {
        query: '{pair(id:"0x6f1747370b1cacb911ad6d4477b718633db328c8"){token1Price}}' // HEX-DAI, where token1Price => DAI per HEX
    })
    debug("HEX-DAI: ", response.data.data.pair.token1Price)
    return parseFloat(response.data.data.pair?.token1Price || "0.0")
}

/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
*  where v is a Number() or String() or BN() or ethers.BigNumber and MUST be whole number (int)
 */
export const cryptoFormat = (_v: number | bigint | string, currency: string) => {
    if (_v === "") return { valueString: "NaN", unit: "", valueWithUnit: "" }
    if (typeof currency === 'undefined' || currency === "") currency = "HEX"

    let si = ""
    let out = ""
    let unit = ""

    const s = _v.toString()
    const n = Number(s)
    const f = parseFloat(s)
    const len = s.length
    const v = BigInt(s.replace(RegExp("^([^.]+).*"), "$1")) // strip any decimals)

    switch (currency) {
        case "TPLS":
        case "tPLS":
        case "PLS":
            unit = "PLS";
            break
        case "ETH":
            unit = "ETH";
            break
        default:
            unit = ""
    }
    switch (currency) {
        case "TPLS":
        case "tPLS":
        case "PLS":
        case "ETH":
            if (v === 0n) out = '0.000'
            if (len < 7) { unit = "wei"; si = ""; out = commify(v.toString()); }
            else if (len < 13) { unit = "wei"; si = "G"; out = formatUnits(v, 9).slice(0, 7); }
            else if (len < 14) { unit = "wei"; si = "G"; out = commify(formatUnits(v, 9).slice(0, 6)); }
            else if (len < 15) { unit = "wei"; si = "G"; out = commify(formatUnits(v, 9).slice(0, 5)); }
            else if (len < 16) { unit = "wei"; si = "G"; out = commify(formatUnits(v, 9).slice(0, 6)); }
            else if (len < 22) { unit = "ETH"; si = ""; out = commify(formatUnits(v, 18).slice(0, 8)); }
            else if (len < 24) { unit = "ETH"; si = ""; out = commify(formatUnits(v, 18).slice(0, 7)); }
            else if (len < 25) { unit = "ETH"; si = ""; out = commify(formatUnits(v, 18).slice(0, 6)); }
            else { unit = "ETH"; si = "M"; out = commify(formatUnits(v, 24).slice(0, 7)); } // <= nnn,nnn Gwei (one comma no decimals)
            break

        case "TSHARE_PRICE":
        case "SHARES":
            unit = currency === "SHARES" ? "Sh" : "HEX"
            if (len < 7) { si = ""; out = commify(v.toString()); }
            else if (len < 10) { si = "M"; out = commify(formatUnits(v, 6).slice(0, len - 2)); }
            else if (len < 13) { si = "B"; out = commify(formatUnits(v, 9).slice(0, len - 5)); }
            else if (len < 16) { si = "T"; out = commify(formatUnits(v, 12).slice(0, len - 8)); }
            else if (len < 19) { si = "P"; out = commify(formatUnits(v, 15).slice(0, 7)); }
            else { si = "!"; out = "whoa" }
            break

        case "%":
        case 'PERCENT':
            unit = "%"
            if (isNaN(n)) { out = "-.--"; break; }
            if (n <= 1) out = format(",.3f")(n)
            else if (n <= 100) out = format(",.2f")(n)
            else out = format(",.0f")(n)
            break
        /*
                    Eth stuff is fixed point. No floating. This the simple length of a string of numbers indicates scale. (K/M/G/T)

                                       1              len =  1 => Hearts
                                      10              len =  2 => Hearts
                                     100              len =  3 => Hearts
                                   1,000              len =  4 => Hearts
                                  10,000              len =  5 => Hearts
                                 100,000              len =  6 => Hearts

                            0.1000   000              len =  7 => HEX (add 4th decimal)
                            1.0000   000              len =  8 => HEX (add 4th decimal)
                           10.0000   000              len =  9 => HEX (add 4th decimal)
                          100.0000   000              len = 10 => HEX (add 4th decimal)

                        1,000.00[00] 000              len = 11 => HEX drop 2 decimals for display (1 K)

                       10,000        000 0000         len = 12 => HEX (10 K)
                      100,000        000 0000         len = 13 => HEX (100 K)

                    1.0000             0 0000 0000    len = 14 => M HEX (   1 M)
                   10.000[0]           0 0000 0000    len = 15 => M HEX (  10 M)
                  100.00[00]           0 0000 0000    len = 16 => M HEX ( 100 M)

                 1.0000             0000 0000 0000    len = 16 => M HEX (  1 B)
                10.000[0]           0000 0000 0000    len = 16 => M HEX ( 10 B)
        */
        case 'HEX':
            unit = "HEX"
            if (v === 0n) out = '0'
            if (len < 7) { unit = v === 0n ? "HEX" : "Hearts"; si = ""; out = commify(v.toString()); }
            else if (len < 13) { si = ""; out = commify(formatUnits(v, 8).slice(0, 6)) }
            else if (len < 14) { si = ""; out = commify(formatUnits(v, 8).slice(0, 5)) } // 5 because comma
            else if (len < 15) { si = ""; out = commify(formatUnits(v, 8).slice(0, 6)) }
            else if (len < 18) { si = "M"; out = commify(formatUnits(v, 14).slice(0, 6)) }
            else if (len < 21) { si = "B"; out = commify(formatUnits(v, 17).slice(0, 6)) }
            else { si = "T"; out = commify(formatUnits(v, 20).slice(0, 6)) }
            break

        case "USD":
            unit = "USD"
            out = format(",.2f")(f)
            break

        default: // NaN or Infinity etc
            unit = ""
            out = "NaN"
    }

    return {
        valueString: [out, si].join(""),
        unit,
        valueWithUnit: out + [si, unit].join("")
    }
}

export const findEarliestDay = (stakeList: StakeList | TewkStakeList | null, dailyDataCount: bigint): bigint => {
    let earliestDay: bigint = dailyDataCount
    if (!stakeList) return 0n
    if (!!dailyDataCount && earliestDay === dailyDataCount) {
        stakeList.forEach(stake => {
            if (stake.lockedDay < earliestDay) earliestDay = BigInt(stake.lockedDay)
        })
    }
    return earliestDay
}

export const calcAdoptionBonus = (payout: bigint, globals: Globals): bigint => {
    if (globals === undefined) return 0n
    if (globals.claimStats === undefined) return 0n
    const { claimedSatoshisTotal, claimedBtcAddrCount } = globals.claimStats

    const viral = payout * claimedBtcAddrCount / HEX.CLAIMABLE_BTC_ADDR_COUNT // .sol line: 1214
    const criticalMass = payout * claimedSatoshisTotal / HEX.CLAIMABLE_SATOSHIS_TOTAL // .sol line: 1221
    return viral + criticalMass
}

/**
 * @dev Estimate stake payout for an incomplete day
 * @param hexData context
 * @param stakeShares stake's shares to calculate payout from
 * @param day day to calculate bonusses for
 * @returns bigint payout
 */
export const estimatePayoutRewardsDay = (hexData: HexData, stakeShares: bigint, day: bigint): bigint => {
    const {
        allocatedSupply,
        globals
    } = hexData
    if (globals === undefined) return 0n
    if (globals.claimStats === undefined) return 0n

    // the contract calls _dailyRoundCalc(...) which has no return value but it does update
    // global rs._payoutTotal, so we emulate that here ...
    let partDayInterestTotal = allocatedSupply * 1000n / 100448995n // .sol:1245:  rs._payoutTotal
    // ignore the claim phase days of long ago (.sol:1247-1255)
    if (globals.stakePenaltyTotal !== 0n) partDayInterestTotal += globals.stakePenaltyTotal

    // .sol:1193 payout = rs._payoutTotal * stakeSharesParam / gTmp._stakeSharesTotal
    let payout = partDayInterestTotal * stakeShares / globals.stakeSharesTotal

    if (day === HEX.BIG_PAY_DAY) { // .sol:1195
        const bigPaySlice = globals.claimStats.unclaimedSatoshisTotal * HEX.HEARTS_PER_SATOSHI * stakeShares / globals.stakeSharesTotal
        payout += bigPaySlice + calcAdoptionBonus(payout, globals)
    }
    return payout
}

export const calcBigPayDaySlice = (shares: bigint, sharePool: bigint, globals: Globals): bigint => {
    if (globals === undefined) return 0n
    const unclaimedSatoshisTotal = globals?.claimStats?.unclaimedSatoshisTotal || 0n
    return unclaimedSatoshisTotal * HEX.HEARTS_PER_SATOSHI * shares / sharePool
}

export interface PayoutRewardsInput {
    hexData: HexData
    dailyData?: DailyData[]
    stakeShares: bigint
    beginDay: bigint
    endDay: bigint
}
export interface PayoutRewardsResult {
    payout: bigint
    bigPayDay: bigint
    penalty: bigint
}
export const calcPayoutRewards = (
    {
        hexData,
        dailyData,
        stakeShares,
        beginDay,
        endDay,
    }: PayoutRewardsInput
): PayoutRewardsResult => {
    const { currentDay, globals } = hexData
    if (globals === undefined || dailyData === undefined) return { payout: 0n, bigPayDay: 0n, penalty: 0n }

    let payout = 0n
    let bigPayDay = 0n

    for (let index = beginDay; index < endDay; index++) { // .sol:1585
        const dayData = dailyData[Number(index)]
        if (dayData === undefined) continue
        const dayPayout = dayData.payoutTotal * stakeShares / dayData.stakeSharesTotal // .sol line: 1586
        payout += dayPayout
    }

    // payout += calcPartDayBonuses(hexData, stake)

    if (beginDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
        const bpdStakeSharesTotal = (currentDay < 352n) // day is zero based internally
            ? globals.stakeSharesTotal // prior to BPD
            : 50499329839740027369n // value on BPD day 352 (zero-based). Never gonna change so don't waste bw looking it up
        const bigPaySlice = calcBigPayDaySlice(stakeShares, bpdStakeSharesTotal, globals)
        const bonuses = calcAdoptionBonus(bigPaySlice, globals)
        bigPayDay = bigPaySlice + bonuses
    }
    return { payout, bigPayDay, penalty: 0n }
}

/*** .sol:1724 (payout, penalty) = _calcPayoutAndEarlyPenalty(...) ***/
const calcPayoutAndEarlyPenalty = (
    hexData: HexData,
    dailyData: DailyData[],
    stakedHearts: bigint,
    lockedDay: bigint,
    stakedDays: bigint,
    servedDays: bigint,
    stakeShares: bigint,
): {
    stakeReturn: bigint,
    payout: bigint,
    bigPayDay: bigint,
    penalty: bigint,
    cappedPenalty: bigint
} => {
    /* 50% of stakedDays (rounded up) with a minimum applied */
    let penaltyDays = (stakedDays + 1n) / 2n
    if (penaltyDays < HEX.EARLY_PENALTY_MIN_DAYS) penaltyDays = HEX.EARLY_PENALTY_MIN_DAYS

    const servedEndDay = lockedDay + servedDays

    // acumulators
    let stakeReturn = 0n
    let payout = 0n
    let bigPayDay = 0n
    let penalty = 0n

    if (servedDays === 0n) { // .sol:1743
        /* Fill penalty days with the estimated average payout */
        penalty = estimatePayoutRewardsDay(hexData, stakeShares, lockedDay) * penaltyDays // .sol:1745-1746
        stakeReturn = stakedHearts + payout + bigPayDay
        return { stakeReturn, payout, bigPayDay, penalty, cappedPenalty: penalty > stakeReturn ? stakeReturn : penalty }
    }

    if (servedDays >= penaltyDays) { // .sol:1750
        const penaltyEndDay = lockedDay + penaltyDays
        const interest = calcPayoutRewards({ hexData, dailyData, stakeShares, beginDay: lockedDay, endDay: penaltyEndDay })
        const interestDelta = calcPayoutRewards({ hexData, dailyData, stakeShares, beginDay: penaltyEndDay, endDay: servedEndDay })
        payout = interest.payout + interestDelta.payout
        penalty = interest.payout + interest.bigPayDay // the contract combines payout & bigPayDay into one sum
        bigPayDay = interest.bigPayDay // don't include any bigPayDay from the delta period)
        stakeReturn = stakedHearts + payout + bigPayDay
        return { stakeReturn, payout, bigPayDay, penalty, cappedPenalty: penalty > stakeReturn ? stakeReturn : penalty }
    }

    // .sol:1767
    // penaltyDays >= servedDays
    const _interest = calcPayoutRewards({ hexData, dailyData, stakeShares, beginDay: lockedDay, endDay: servedEndDay })
    payout = _interest.payout
    bigPayDay = _interest.bigPayDay
    const interest = payout + bigPayDay
    if (penaltyDays === servedDays) {
        penalty = interest
    } else if (servedDays < stakedDays) {
        penalty = interest * penaltyDays / servedDays
    }
    stakeReturn = stakedHearts + payout + bigPayDay
    return { stakeReturn, payout, bigPayDay, penalty, cappedPenalty: penalty > stakeReturn ? stakeReturn : penalty }
}

export const calcStakeEnd = (
    hexData: HexData,
    dailyData: DailyData[],
    stake: StakeData
): {
    stakeReturn: bigint,
    payout: bigint,
    bigPayDay: bigint,
    penalty: bigint,
    cappedPenalty: bigint
} => {
    const { currentDay } = hexData

    let stakeReturn = 0n
    let payout = 0n
    let bigPayDay = 0n
    let penalty = 0n
    let cappedPenalty = 0n
    let servedDays = 0n

    // .sol:1414 stakeEnd
    if (currentDay >= stake.lockedDay) { // .sol:1449
        if (stake.unlockedDay > 0) { // good accounted
            servedDays = stake.stakedDays
        } else {
            servedDays = currentDay - stake.lockedDay;
            if (servedDays > stake.stakedDays) {
                servedDays = stake.stakedDays;
            }
        }
        ({ stakeReturn, payout, bigPayDay, penalty, cappedPenalty = 0n } = calcPayoutAndEarlyPenalty(
            hexData,
            dailyData,
            stake.stakedHearts,
            stake.lockedDay,
            stake.stakedDays,
            servedDays,
            stake.stakeShares,
        ))
    } else {
        if (stake.isAutoStake) return { stakeReturn: 0n, payout: 0n, bigPayDay: 0n, penalty: 0n, cappedPenalty: 0n }
        stakeReturn = stake.stakedHearts
    }

    return { stakeReturn, payout, bigPayDay, penalty, cappedPenalty }
}

export const calcPercentGain = (stakeData: StakeData): number => {
    const payoutHEX = Number(parseUnits(stakeData.payout.toString(), HEX.DECIMALS))
    const bigPayDayHEX = Number(parseUnits(stakeData.bigPayDay.toString(), HEX.DECIMALS))
    const stakedHEX = Number(parseUnits(stakeData.stakedHearts.toString(), HEX.DECIMALS))
    return (payoutHEX + bigPayDayHEX) * 100 / stakedHEX
}

/**
 * @notice Calculates APY percantage
 * @param stakeData stake data object
 * @returns ufixed256x8
 */
export const calcPercentAPY = (currentDay: bigint, stakeData: StakeData): number => {
    const extraDay = 1 // last day has to roll over before hex:stakeEnd() can calculate all interest
    const daysServed = extraDay + Math.min(Number(currentDay) - Number(stakeData.lockedDay), Number(stakeData.stakedDays))
    const days = daysServed > 1 ? daysServed : 1
    return calcPercentGain(stakeData) * 365 / days
}

export const compactHexString = (hex: `0x${string}`): string => {
    return hex.slice(0,6)+"..."+hex.slice(-4)
}