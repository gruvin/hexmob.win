import HEX, {
    type HEXGlobals,
    type ClaimStats, HEXContract,
    type ContractData,
    type DailyData,
} from './hex_contract.js'
import { type Context } from './lib/Stakes'
import BN from 'bn.js'

import { ethers, constants, BigNumber, FixedNumber } from 'ethers'
const { commify, formatUnits } = ethers.utils

import { format } from 'd3-format'

import _debug from 'debug'
import { StakeData } from './lib/Stakes.js'
const debug = _debug('util')

/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
*  where v is a Number() or String() or BN() or ethers.BigNumber and MUST be whole number (int)
 */
const cryptoFormat = (_v: number | BN | BigNumber | string, currency: string) => {
    if (_v === "") return { valueString: "NaN", unit: "", valueWithUnit: "" }
    if (typeof currency === 'undefined' || currency === "") currency = "HEX"

    let si = ""
    let out = ""
    let unit = ""

    const input = _v.toString()
    const len = input.length
    const v = BigNumber.from(input.replace(RegExp("^([^.]+).*"), "$1")) // strip any decimals)

    switch (currency) {
        case "ETH":
            unit = "ETH"
            if (v.isZero())                          out = '0.000'
            if      (len <  7) { unit="wei"; si="";  out = commify(v.toString()); }
            else if (len < 13) { unit="wei"; si="G"; out = formatUnits(v,  9).slice(0, 7); }
            else if (len < 14) { unit="wei"; si="G"; out = commify(formatUnits(v,  9).slice(0, 6)); }
            else if (len < 15) { unit="wei"; si="G"; out = commify(formatUnits(v,  9).slice(0, 5)); }
            else if (len < 16) { unit="wei"; si="G"; out = commify(formatUnits(v,  9).slice(0, 6)); }
            else if (len < 22) { unit="ETH"; si="";  out = commify(formatUnits(v, 18).slice(0, 8)); }
            else if (len < 24) { unit="ETH"; si="";  out = commify(formatUnits(v, 18).slice(0, 7)); }
            else if (len < 25) { unit="ETH"; si="";  out = commify(formatUnits(v, 18).slice(0, 6)); }
            else               { unit="ETH"; si="M"; out = commify(formatUnits(v, 24).slice(0, 7)); } // <= nnn,nnn Gwei (one comma no decimals)
            break

        case "TSHARE_PRICE":
        case "SHARES":
            unit = currency === "SHARES" ? "SHARES" : "HEX/TShare"
            if      (len <  7) { si="";  out = commify(v.toString()); }
            else if (len < 10) { si="M"; out = commify(formatUnits(v,  6).slice(0, len - 2)); }
            else if (len < 13) { si="B"; out = commify(formatUnits(v,  9).slice(0, len - 5)); }
            else if (len < 16) { si="T"; out = commify(formatUnits(v, 12).slice(0, len - 8)); }
            else if (len < 19) { si="P"; out = commify(formatUnits(v, 15).slice(0, 7)); }
            else               { si="!"; out = "whoa" }
            break

        case "%":
        case 'PERCENT':
            unit = "%"
            const n = Number(input)
            if (isNaN(n)) { out = "-.--"; break; }
            if (n <= 1)          out = format(",.3f")(n)
            else if (n <= 100)   out = format(",.2f")(n)
            else                 out = format(",.0f")(n)
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
            if (v.isZero())              out = '0'
            if      (len <  7) { unit="Hearts"; si="";  out = commify(v.toString()); }
            else if (len < 13) { si="";  out = commify(formatUnits(v,  8).slice(0, 6)) }
            else if (len < 14) { si="";  out = commify(formatUnits(v,  8).slice(0, 5)) } // 5 because comma
            else if (len < 15) { si="";  out = commify(formatUnits(v,  8).slice(0, 6)) }
            else if (len < 18) { si="M"; out = commify(formatUnits(v, 14).slice(0, 6)) }
            else if (len < 21) { si="B"; out = commify(formatUnits(v, 17).slice(0, 6)) }
            else               { si="T"; out = commify(formatUnits(v, 20).slice(0, 6)) }
            break

        case "USD":
            const usd = parseFloat(input)
            unit = "USD"
            out = format(",.2f")(usd)
            break

        default: // NaN or Infinity etc
            unit = ""
            out = "NaN"
    }

    return {
        valueString: [out, si].join(""),
        unit,
        valueWithUnit: out + [si, unit].join(" ")
    }
}

const bnCalcBigPayDaySlice = (_bnShares: BigNumber, _bnSharePool: BigNumber, globals: HEXGlobals) => {
    const { bnUnclaimedSatoshisTotal } = globals.claimStats as ClaimStats
    const fnUnclaimedSatoshisTotal = FixedNumber.from(bnUnclaimedSatoshisTotal, "ufixed256x0")
    return BigNumber.from(
        fnUnclaimedSatoshisTotal
        .mulUnsafe(FixedNumber.from(HEX.HEARTS_PER_SATOSHI, "ufixed256x0"))
        .mulUnsafe(FixedNumber.from(_bnShares, "ufixed256x0"))
        .divUnsafe(FixedNumber.from(_bnSharePool, "ufixed256x0"))
        .toString()
    )
}

const bnCalcAdoptionBonus = (_bnPayout: BigNumber, _globals: HEXGlobals) => {
    const { bnClaimedSatoshisTotal, bnClaimedBtcAddrCount } = _globals.claimStats as ClaimStats
    const fnPayout = FixedNumber.from(_bnPayout, "ufixed256x0")
    const fnClaimedSatoshisTotal = FixedNumber.from(bnClaimedSatoshisTotal, "ufixed256x0")
    const fnClaimedBtcAddrCount = FixedNumber.from(bnClaimedBtcAddrCount, "ufixed256x0")

    const fnViral = ( // .sol line: 1214
        fnPayout
        .mulUnsafe(fnClaimedBtcAddrCount)
        .divUnsafe(FixedNumber.from(HEX.CLAIMABLE_BTC_ADDR_COUNT, "ufixed256x0"))
    )
    const fnCriticalMass = ( // .sol line: 1221
        fnPayout
        .mulUnsafe(fnClaimedSatoshisTotal)
        .divUnsafe(FixedNumber.from(HEX.CLAIMABLE_SATOSHIS_TOTAL, "ufixed256x0"))
    )
    const fnBonus = (
        fnViral
        .addUnsafe(fnCriticalMass)
    )
    return BigNumber.from(fnBonus.toString())
}

const bnCalcPartDayBonuses = (_contract: HEXContract, _stakeData: StakeData) =>  {
    const {
        currentDay,
        bnAllocatedSupply,
        globals
    } = _contract.Data as ContractData

    //debug(`bnCalcPartDayBonuses:stakeData{} = %O`, _stakeData)
    // Calculate our share of Daily Interest ___for the current (incomplete) day___
    // HEX mints 0.009955% daily interest (3.69%pa) and stakers get adoption bonuses from that, each day
    // .sol:1245:  rs._payoutTotal = rs._allocSupplyCached * 10000 / 100448995
    const fnDailyInterestTotal = (
        FixedNumber.from(bnAllocatedSupply, "ufixed256x0")
        .mulUnsafe(FixedNumber.from(10000, "ufixed256x0"))
        .divUnsafe(FixedNumber.from('100448995', "ufixed256x0"))
    )
    const fnInterestShare = (
        fnDailyInterestTotal
        .mulUnsafe(FixedNumber.from(_stakeData.bnStakeShares, "ufixed256x0"))
        .divUnsafe(FixedNumber.from(globals.bnStakeSharesTotal, "ufixed256x0"))
    )
    const bnInterestBonus = (
        (currentDay < HEX.CLAIM_PHASE_END_DAY)
        ? bnCalcAdoptionBonus(BigNumber.from(fnInterestShare), globals)
        : constants.Zero
    )
    return BigNumber.from(fnInterestShare).add(bnInterestBonus)
}

const decodeDailyData = (_data0: string): DailyData => {
    const data0 = new BN(_data0)
    let dayData
    try {
        dayData = { // extract dailyData struct from uint256 mapping
            // hex_contract.sol:
            // struct DailyDataStore {
                //     uint72 dayPayoutTotal;
                //     uint72 dayStakeSharesTotal;
                //     uint56 dayUnclaimedSatoshisTotal;
                // }
                // ...
                // v = uint256(dailyData[src].dayUnclaimedSatoshisTotal) << (HEART_UINT_SIZE * 2);  // 72x2 = 144
                // v |= uint256(dailyData[src].dayStakeSharesTotal) << HEART_UINT_SIZE;             // 72
                // v |= uint256(dailyData[src].dayPayoutTotal);
            bnPayoutTotal:             BigNumber.from(data0.maskn(72).toString()),
            bnStakeSharesTotal:        BigNumber.from(data0.shrn(72).maskn(72).toString()),
            bnUnclaimedSatoshisTotal:  BigNumber.from(data0.shrn(144).maskn(56).toString()),
        }
    } catch(e: any) {
        throw new Error(`DECODE_FAILURE: _data0 = ${"0b"+data0.toString(2)}\nERROR: `, e)
    }
    return dayData
}

const decodeClaimStats = (_claimStats: string) => {
    const claimStats = new BN(_claimStats)
    const SATOSHI_UINT_SIZE = 51 // bits
    return {
        bnClaimedBtcAddrCount: BigNumber.from(claimStats.shrn(SATOSHI_UINT_SIZE * 2).toString()),
        bnClaimedSatoshisTotal: BigNumber.from(claimStats.shrn(SATOSHI_UINT_SIZE).maskn(SATOSHI_UINT_SIZE).toString()),
        bnUnclaimedSatoshisTotal: BigNumber.from(claimStats.maskn(SATOSHI_UINT_SIZE).toString())
    }
}

interface PayoutRewardsInput {
    context: Context
    dailyData?: DailyData
    rawDailyData?: BigNumber[]
    stakeData: any
    fromDay: number
    toDay: number
}
const bnCalcPayoutRewards = ({ context, rawDailyData, stakeData, fromDay, toDay }: PayoutRewardsInput) => {
    let result = { bnPayout:constants.Zero, bnBigPayDay: constants.Zero}

    if (typeof rawDailyData === 'undefined') return result

    const { contract } = context
    const { currentDay, globals } = contract.Data

    const startDay = stakeData.lockedDay
    const stakedDays = stakeData.stakedDays
    const endDay = startDay + stakedDays

    let bnPayout = constants.Zero

    for (let index = fromDay; index < toDay; index++) {
        const _data0 = rawDailyData[index]
        if (typeof _data0 === 'undefined') {
            debug("fromDay: %d   toDay: %d   index: %d   dailyData[index]: %O", fromDay, toDay, index, rawDailyData[index])
            continue
        }
        const dayData = decodeDailyData(_data0.toString())

        // debug("DECODED CLAIMSTATS: %O", dayData)
        let bnDayPayout = constants.Zero
        try { // dayData data could be missing, incorrectly requested or simply invalid but don't die
            bnDayPayout = BigNumber.from(  // .sol line: 1586
                FixedNumber.from(dayData.bnPayoutTotal, "ufixed256x0")
                .mulUnsafe(FixedNumber.from(stakeData.bnStakeShares, "ufixed256x0"))
                .divUnsafe(FixedNumber.from(dayData.bnStakeSharesTotal, "ufixed256x0"))
            )
        } catch(e) {
            // debug("DAY: ", Object.keys(dayData).map((k, i) => `${k}: bn(${dayData[k].toString()})` ))
        }
        bnPayout = bnPayout.add(bnDayPayout)
    }

    bnPayout = bnPayout.add(bnCalcPartDayBonuses(contract, stakeData))

    let bnBigPayDay = constants.Zero
    if (startDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
        const bnBpdStakeSharesTotal = (currentDay < 352) // day is zero based internally
            ? globals.bnStakeSharesTotal // prior to BPD
            : BigNumber.from('50499329839740027369') // value on BPD day 352 (zero-based). Never gonna change so don't waste bw looking it up
        const bnBigPaySlice = bnCalcBigPayDaySlice(stakeData.bnStakeShares, bnBpdStakeSharesTotal, globals)
        const bnBonuses = bnCalcAdoptionBonus(bnBigPaySlice, globals)
        bnBigPayDay = bnBigPaySlice.add(bnBonuses)
    }
    // debug("bnPayout: %s, bnBigPayDay: %s = ", bnPayout.toString(), bnBigPayDay.toString())

    result = { bnPayout, bnBigPayDay }
    return result
}

export interface CalcPayoutBpdPenalty {
    bnPayout: BigNumber
    bnBigPayDay: BigNumber
    bnPenalty: BigNumber
}
const bnCalcPayoutBpdPenalty = (context: Context, stakeData: StakeData, rawDailyData: BigNumber[]): CalcPayoutBpdPenalty => {
    const { contract } = context
    const { currentDay } = contract.Data

    const startDay = stakeData.lockedDay
    const stakedDays = stakeData.stakedDays
    const endDay = startDay + stakedDays
    // debug(`currentDay: ${currentDay}    startDay: ${startDay}    stakedDays: ${stakedDays}     endDay: ${endDay}`)

    let bnPayout = constants.Zero
    let bnBigPayDay = constants.Zero
    let bnPenalty = constants.Zero
    if (startDay < currentDay) {
        const daysServed = stakeData.stakeId === 603970 ? 90 : Math.min(currentDay - startDay, stakedDays)
        // debug(`daysServed: ${daysServed}`)
        if (daysServed < stakedDays) {
            const penaltyDays = Math.max(90, Math.ceil(stakedDays / 2))
            // debug÷(`penaltyDays: ${penaltyDays}`)
            if (daysServed === 0) {
                bnPenalty = bnCalcPartDayBonuses(contract, stakeData).mul(penaltyDays)
            } else if (penaltyDays < daysServed) {
                const _bnInterest = bnCalcPayoutRewards({ context, rawDailyData, stakeData, fromDay: 0, toDay: penaltyDays })
                const _bnInterestDelta = bnCalcPayoutRewards({ context, rawDailyData, stakeData, fromDay: penaltyDays, toDay: rawDailyData.length })
                bnPayout = _bnInterest.bnPayout.add(_bnInterestDelta.bnPayout)
                bnBigPayDay = _bnInterest.bnBigPayDay
                bnPenalty = _bnInterest.bnPayout.add(_bnInterest.bnBigPayDay)
                // debug("PENALTY: penaltyDays < daysServed: ", bnPenalty.toString())

            } else {
                // penaltyDays >= servedDaybnS
                const _bnInterest = bnCalcPayoutRewards({ context, rawDailyData, stakeData, fromDay: 0, toDay: rawDailyData.length })
                bnPayout = _bnInterest.bnPayout
                bnBigPayDay = _bnInterest.bnBigPayDay
                const bnInterest = bnPayout.add(bnBigPayDay)
                if (penaltyDays === daysServed) {
                    bnPenalty = bnInterest
                } else {
                    bnPenalty = BigNumber.from(
                        FixedNumber.from(bnInterest, "ufixed256x0")
                        .mulUnsafe(FixedNumber.from(penaltyDays, "ufixed256x0"))
                        .divUnsafe(FixedNumber.from(daysServed, "ufixed256x0"))
                    )
                }
                const bnTotalValue = stakeData.bnStakedHearts.add(bnInterest)
                if (bnPenalty.gt(bnTotalValue)) bnPenalty = bnTotalValue
                // debug("PENALTY: penaltyDays >= servedDays: ", bnPenalty.toString())
            }
        } else { // daysServed >= stakedDays (potential late end stake)
            const _bnInterest = bnCalcPayoutRewards({ context, rawDailyData, stakeData, fromDay: 0, toDay: rawDailyData.length })
            bnPayout = _bnInterest.bnPayout
            bnBigPayDay = _bnInterest.bnBigPayDay
            const bnInterest = bnPayout.add(bnBigPayDay)
            const maxUnlockedDay = endDay + HEX.LATE_PENALTY_GRACE_DAYS;
            if (currentDay > maxUnlockedDay) { // contract: 1781
                const bnRawStakeReturn = stakeData.bnStakedHearts.add(bnInterest)
                bnPenalty = BigNumber.from(
                    FixedNumber.from(bnRawStakeReturn, "ufixed256x0")
                    .mulUnsafe(FixedNumber.from(currentDay - maxUnlockedDay, "ufixed256x0"))
                    .divUnsafe(FixedNumber.from(HEX.LATE_PENALTY_SCALE_DAYS, "ufixed256x0"))
                )
            }
            // debug("PENALTY: late end: ", bnPenalty.toString())
        } // if (daysServed < stakedDays)
    } // if (startDay > currentDay)

    return {
        bnPayout,
        bnBigPayDay,
        bnPenalty,
    }
}

/**
 * @notice Calculates total net interest percantage
 * @param stakeData stake data object
 * @returns ufixed256x8
 */
const fnCalcPercentGain = (stakeData: StakeData): FixedNumber => {
    // catch divide-by-zero (shouldn't happen)
    if (stakeData.bnStakedHearts.isZero()) return FixedNumber.from(0, "ufixed256x8")

    const fnPayoutHEX       = FixedNumber.from(formatUnits(stakeData.bnPayout, 8), "ufixed256x8")
    const fnBigPayDayHEX    = FixedNumber.from(formatUnits(stakeData.bnBigPayDay, 8), "ufixed256x8")
    const fnStakedHEX       = FixedNumber.from(formatUnits(stakeData.bnStakedHearts, 8), "ufixed256x8")
    const fnPercentGain = (
        fnPayoutHEX
        .addUnsafe(fnBigPayDayHEX)
        .mulUnsafe(FixedNumber.from(100, "ufixed256x8"))
        .divUnsafe(fnStakedHEX)
    )
    return fnPercentGain
}

/**
 * @notice Calculates APY percantage
 * @param stakeData stake data object
 * @returns ufixed256x8
 */
 const fnCalcPercentAPY = (currentDay: number, stakeData: StakeData): FixedNumber => {
    const extraDay = 1 // last day has to roll over before hex:stakeEnd() can calculate all interest
    const daysServed = extraDay + Math.min(currentDay - stakeData.lockedDay, stakeData.stakedDays)
    const fnInterest = fnCalcPercentGain(stakeData)
    const fnDays = FixedNumber.from(
        daysServed > 1
        ? daysServed
        : 1,
        "ufixed256x8"
    )
    return (
        fnInterest
        .mulUnsafe(FixedNumber.from(365, "ufixed256x8"))
        .divUnsafe(fnDays)
    )
}

// bring back scientific notation ffs! :/
const bnE = (strSci: string): BigNumber => {
    const [ n, e ] = strSci.toUpperCase().split('E')
    return BigNumber.from(n).mul(10).pow(e)
}

const detectTrustWallet = () => {
    if (window.ethereum && window.ethereum.isMetaMask) return false
    return (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust)
}

interface _indexableObj { [index: string | number]: any}
const bnPrefixObject = (_obj: any) => {
    let obj = { } as _indexableObj
    for (const k in _obj) {
        if (isNaN(parseInt(k))) {
            if (_obj[k]._isBigNumber)
                obj["bn"+k.slice(0,1).toUpperCase()+k.slice(1)] = _obj[k] // ethers.BigNumber
            else
                obj[k] = _obj[k]
        }
    }
    return obj
}

export {
    bnCalcBigPayDaySlice,
    bnCalcAdoptionBonus,
    bnCalcPartDayBonuses,
    bnCalcPayoutRewards,
    bnCalcPayoutBpdPenalty,
    fnCalcPercentGain,
    fnCalcPercentAPY,
    decodeDailyData,
    decodeClaimStats,
    cryptoFormat,
    detectTrustWallet,
    bnPrefixObject,
    bnE,
}
