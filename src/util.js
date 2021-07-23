const HEX = require('./hex_contract')
const { BigNumber } = require('bignumber.js')
const { format } = require('d3-format')
// const debug = require('debug')("utils")
/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
 */
const calcBigPayDaySlice = (shares, sharePool, globals) => {
    const unclaimedSatoshis = BigNumber(globals.claimStats.unclaimedSatoshisTotal)
    return unclaimedSatoshis.times(HEX.HEARTS_PER_SATOSHI).times(shares).idiv(sharePool)
}

const calcAdoptionBonus = (payout, _globals) => {
    const { claimedSatoshisTotal, claimedBtcAddrCount } = _globals.claimStats
    const viral = payout.times(claimedBtcAddrCount).idiv(HEX.CLAIMABLE_BTC_ADDR_COUNT) // .sol line: 1214
    const criticalMass = payout.times(claimedSatoshisTotal).idiv(HEX.CLAIMABLE_SATOSHIS_TOTAL) // .sol line: 1221
    const bonus = viral.plus(criticalMass)
    return bonus
}

function calcPartDayBonuses(contract, stakeData)  {
    const {
        currentDay, 
        allocatedSupply, 
        globals 
    } = contract.Data

    // Calculate our share of Daily Interest ___for the current (incomplete) day___
    // HEX mints 0.009955% daily interest (3.69%pa) and stakers get adoption bonuses from that, each day
    // .sol:1245:  rs._payoutTotal = rs._allocSupplyCached * 10000 / 100448995
    const dailyInterestTotal = BigNumber(allocatedSupply).times(10000).idiv(100448995)
    const interestShare = dailyInterestTotal.times(stakeData.stakeShares).idiv(globals.stakeSharesTotal)
    const interestBonus = (currentDay < HEX.CLAIM_PHASE_END_DAY) ? calcAdoptionBonus(interestShare, globals) : 0
    return interestShare.plus(interestBonus)
}

function calcPayoutRewards({ context, dailyData, stakeData, fromDay, toDay }) {
    const { contract } = context
    const { currentDay, globals } = contract.Data

    const startDay = stakeData.lockedDay
    const stakedDays = stakeData.stakedDays
    const endDay = startDay + stakedDays

    let payout = BigNumber(0)
    let bigPayDay = BigNumber(0)

    for (let index = fromDay; index < toDay; index++) {
        const binData = BigNumber(dailyData[index]).toString(2).padStart(72+72+56, "0")
        const day = { // extract dailyData struct from uint256 mapping
          payoutTotal:             BigNumber(binData.substr(-72, 72), 2),
          stakeSharesTotal:        BigNumber(binData.substr(-72-72, 72), 2),
          unclaimedSatoshisTotal:  BigNumber(binData.substr(-72-72-56, 56), 2),
        }
  
        const dayPayout = day.payoutTotal.times(stakeData.stakeShares)
                                .idiv(day.stakeSharesTotal) // .sol line: 1586

        payout = payout.plus(dayPayout)
    }

    payout = payout.plus(calcPartDayBonuses(contract, stakeData))

    if (startDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
        const bpdStakeSharesTotal = (currentDay < 352) // day is zero based internally
            ? globals.stakeSharesTotal // prior to BPD 
            : new BigNumber("50499329839740027369", 10) // value on BPD day 352 (zero-based). Never gonna change so don't waste bw looking it up
        const bigPaySlice = calcBigPayDaySlice(stakeData.stakeShares, bpdStakeSharesTotal, globals)
        const bonuses = calcAdoptionBonus(bigPaySlice, globals)
        bigPayDay = bigPaySlice.plus(bonuses)
    }
    return { payout, bigPayDay }
}

function calcPayoutBpdPenalty(context, stakeData, dailyData) {
    const { contract } = context 
    const { currentDay } = contract.Data

    const startDay = stakeData.lockedDay
    const stakedDays = stakeData.stakedDays
    const endDay = startDay + stakedDays

    let payout = BigNumber(0)
    let bigPayDay = BigNumber(0)
    let penalty = BigNumber(0)        
    if (startDay < currentDay) {
        const daysServed = Math.min(currentDay - startDay, stakedDays)        
        if (daysServed < stakedDays) {
            const penaltyDays = Math.max(90, Math.ceil(stakedDays / 2))
            if (daysServed === 0) {
                penalty = calcPartDayBonuses(contract, stakeData).times(penaltyDays)

            } else if (penaltyDays < daysServed) {
                const _interest = calcPayoutRewards({ context, dailyData, stakeData, fromDay: 0, toDay: penaltyDays })
                const _interestDelta = calcPayoutRewards({ context, dailyData, stakeData, fromDay: penaltyDays, toDay: dailyData.length })
                payout = _interest.payout.plus(_interestDelta.payout)
                bigPayDay = _interest.bigPayDay.plus(_interestDelta.bigPayDay)
                penalty = _interest.payout.plus(_interest.bigPayDay)

            } else {
                // penaltyDays >= servedDays        
                const _interest = calcPayoutRewards({ context, dailyData, stakeData, fromDay: 0, toDay: dailyData.length })
                payout = _interest.payout
                bigPayDay = _interest.bigPayDay                
                const interest = payout.plus(bigPayDay)
                if (penaltyDays === daysServed) {
                    penalty = interest
                } else {
                    penalty = interest.times(penaltyDays).idiv(daysServed)
                }
                const totalValue = stakeData.stakedHearts.plus(interest)
                if (penalty.isGreaterThan(totalValue)) penalty = totalValue
            }
        } else { // daysServed >= stakedDays (late end stake)
            const _interest = calcPayoutRewards({ context, dailyData, stakeData, fromDay: 0, toDay: dailyData.length })
            payout = _interest.payout
            bigPayDay = _interest.bigPayDay
            const interest = payout.plus(bigPayDay)
            const maxUnlockedDay = endDay + HEX.LATE_PENALTY_GRACE_DAYS;
            if (currentDay > maxUnlockedDay) {
                penalty = (stakeData.stakedHearts
                    .plus(interest)
                    .times(currentDay - maxUnlockedDay)
                    .idiv(HEX.LATE_PENALTY_SCALE_DAYS)
                )
            }
        } // if (daysServed < stakedDays)
    } // if (startDay > currentDay)
    return {
        payout,
        bigPayDay,
        penalty,
    }
}

const calcInterest = (stakeData) => {
    const { payout, bigPayDay, stakedHearts } = stakeData
    return payout.plus(bigPayDay).times(100).div(stakedHearts) // 1 == 1%
}

const calcApy = (currentDay, stakeData) => {
    const extraDay = 1 // last day has to roll over before hex:stakeEnd() can calculate all interest
    const daysServed = extraDay + Math.min(currentDay - stakeData.startDay, stakeData.stakedDays)
    const interest = calcInterest(stakeData)
    return interest.times(365).div(daysServed > 1 ? daysServed : 1)
    // below, based on go.hex.com, yields same result
    // return daysServed > 0 ? interest.plus(bigPayDay).div(stake.stakedHearts).times(365).div(daysServed).times(100) : BigNumber(0)
}

const cryptoFormat = (v, currency) => {
    if (typeof currency === 'undefined') currency = 'HEX'
    if (typeof v === 'string' || typeof v === 'number') v = BigNumber(v)
    if (!v.isFinite()) currency='INVALID' // trigger switch default

    let unit = 'HEX'
    let s
    switch (currency) {
        case 'ETH':
            unit = 'ETH'
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    { unit = 'Wei'; s = format(',')(v.toFixed(3, 1)) }
            else if (v.lt( 1e6))    { unit = 'Wei'; s = format(',.0f')(v.toFixed(0, 1)) }
            else if (v.lt( 1e9))    { unit = 'Wei'; s = format(',.3f')(v.div( 1e06).toFixed(3, 1))+'M' }
            else if (v.lt(1e12))    { unit = 'Wei'; s = format(',.3f')(v.div( 1e09).toFixed(3, 1))+'G' }
            else if (v.lt(1e15))    { unit = 'Wei'; s = format(',.0f')(v.div( 1e09).toFixed(0, 1))+'G' } // RH uses nnn.nnnT. We prefer GWei over TWei
            else if (v.lt(1e24))    s = format(',')(v.div( 1e18).toFixed(8, 1)).slice(0, 8)
            else if (v.lt(1e27))    s = format(',')(v.div( 1e24).toFixed(8, 1)).slice(0, 7)+'M'
            else if (v.lt(1e30))    s = format(',')(v.div( 1e27).toFixed(8, 1)).slice(0, 7)+'B'
            else if (v.lt(1e33))    s = format(',')(v.div( 1e30).toFixed(8, 1)).slice(0, 7)+'T'
            else if (v.lt(1e36))    s = format(',')(v.div( 1e33).toFixed(8, 1)).slice(0, 7)+'Q'
            else                    s = format(',')(v.div( 1e33).toFixed(0, 1))+'Q' // [nnn,...,]nnn,nnn Q
            s = s.replace(/(^[-,0-9]+)[.0]+(M|B|T)?$/, "$1$2") // nn.000 => nn
            s = s.replace(/(^\d+\.\d{3})0+$/, "$1") // nn.123000 => nn.123
            break
        case 'TSHARE_PRICE':
            unit = 'HEX / T-Share'
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e6))    s = format(',.0f')(v)
            else if (v.lt( 1e9))    s = format(',.3f')(v.div(1e6).toFixed(3, 1))+'M'
            else if (v.lt(1e12))    s = format(',.3f')(v.div(1e9).toFixed(3, 1))+'B'
            else if (v.lt(1e15))    s = format(',.3f')(v.div(1e12).toFixed(3, 1))+'T'
            else                    s = format(',.0f')(v.div(1e12).toFixed(0))+'T'
            break
        case 'SHARES':
            unit = 'Shares'
            if (v.isZero())         s = '0.000'
            else if (v.lt(1e03))    s = format(',.3f')(v.div(1e03).toFixed(3, 1))
            else if (v.lt(1e06))    s = format(',.3f')(v.div(1e03).toFixed(3, 1))+'K'
            else if (v.lt(1e09))    s = format(',.3f')(v.div(1e06).toFixed(3, 1))+'M'
            else if (v.lt(1e12))    s = format(',.3f')(v.div(1e09).toFixed(3, 1))+'B'
            else if (v.lt(1e15))    s = format(',.3f')(v.div(1e12).toFixed(3, 1))+'T'
            else                    s = format(',.0f')(v.div(1e12).toFixed(0))+'T'
            break
        case 'PERCENT': // where 1.0 = 1%
            unit = '%'
            v = BigNumber(v)
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    s = format(',.3f')(v.toFixed(3, 1))
            else                    s = format(',.0f')(v.toFixed(0, 1))
            break
        case 'HEX': 
            if (v.isZero())         s = '0.000'
            else if (v.lt(1e6))     { unit = 'Hearts'; s = format(',.6f')(v.toPrecision(6, 1)) }
            else if (v.lt(1e08))    s = format(',.4f')(v.div(1E08).toPrecision(4, 1)) // <         1 HEX
            else if (v.lt(1e09))    s = format(',.4f')(v.div(1E08).toPrecision(5, 1)) // <        10 HEX
            else if (v.lt(1e10))    s = format(',.4f')(v.div(1E08).toPrecision(6, 1)) // <       100 HEX
            else if (v.lt(1e11))    s = format(',.3f')(v.div(1E08).toPrecision(6, 1)) // <     1,000 HEX
            else if (v.lt(1e12))    s = format(',.2f')(v.div(1E08).toPrecision(6, 1)) // <    10,000 HEX
            else if (v.lt(1e13))    s = format(',.1f')(v.div(1E08).toPrecision(6, 1)) // <   100,000 HEX
            else if (v.lt(1e14))    s = format(',.1f')(v.div(1E08).toPrecision(6, 1)) // < 1,000,000 HEX
            else if (v.lt(1e15))    s = format(',.4f')(v.div(1E14).toPrecision(5, 1))+'M'
            else if (v.lt(1e16))    s = format(',.4f')(v.div(1E14).toPrecision(6, 1))+'M'
            else if (v.lt(1e17))    s = format(',.3f')(v.div(1E14).toPrecision(6, 1))+'M'
            else if (v.lt(1e18))    s = format(',.4f')(v.div(1E17).toPrecision(5, 1))+'B'
            else if (v.lt(1e19))    s = format(',.4f')(v.div(1E17).toPrecision(6, 1))+'B'
            else if (v.lt(1e20))    s = format(',.3f')(v.div(1E17).toPrecision(6, 1))+'B'
            else if (v.lt(1e21))    s = format(',.4f')(v.div(1E20).toPrecision(5, 1))+'T'
            else if (v.lt(1e22))    s = format(',.4f')(v.div(1E20).toPrecision(6, 1))+'T'
            else if (v.lt(1e23))    s = format(',.3f')(v.div(1E20).toPrecision(6, 1))+'T'
            else                    s = format(',')(v.div(1E20))+'T'
            s = s.replace(/(^[-,0-9]+)[.0]+(M|B|T)?$/, "$1$2") // nn.000 => nn
            break

        case "USD":
            unit = 'USD'
            if (v.isZero())   s = '0.00'
            else s = format(',.2f')(v)
            break;
        default: // NaN or Infinity
            unit = ''
            s = v.toString()
    }
    return {
        valueString: s,
        unit,
        valueWithUnit: s + (unit === '' ? '' : ' '+unit)
    }
}

const detectTrustWallet = () => {
    if (window.ethereum && window.ethereum.isMetaMask) return false
    return (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust)
}

const fetchWithTimeout  = (url, params, timeout) => {
    return new Promise( (resolve, reject) => {
        // Set timeout timer
        const timer = setTimeout( () => reject(new Error('Request timed out') ), timeout);
        fetch( url, params ).then(
            response => resolve( response ),
            err => reject( err )
        ).finally( () => clearTimeout(timer) );
    })
}

module.exports = {
    calcBigPayDaySlice,
    calcAdoptionBonus,
    calcPartDayBonuses,
    calcPayoutRewards,
    calcPayoutBpdPenalty,
    calcInterest,
    calcApy,
    cryptoFormat,
    detectTrustWallet,
    fetchWithTimeout,
}
