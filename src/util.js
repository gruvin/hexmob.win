const HEX = require('./hex_contract')
const { BigNumber } = require('bignumber.js')
const { format } = require('d3-format')

/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
 */
const calcBigPayDaySlice = (shares, sharePool, _globals) => {
    const unclaimedSatoshis = Object.entries(_globals).length 
            ? _globals.claimStats.unclaimedSatoshisTotal
            : new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
    return new BigNumber(unclaimedSatoshis.times(HEX.HEARTS_PER_SATOSHI).times(shares))
                                    .idiv(sharePool)
}

const calcAdoptionBonus = (bigPayDaySlice, _globals) => {
    const { claimedSatoshisTotal, claimedBtcAddrCount } = _globals.claimStats
    const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(HEX.CLAIMABLE_BTC_ADDR_COUNT)
    const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(HEX.CLAIMABLE_SATOSHIS_TOTAL)
    const bonus = viral.plus(criticalMass)
    return bonus
}

const cryptoFormat = (v, currency) => {
    if (typeof currency === 'undefined') currency = 'HEX'
    let unit = ' HEX'
    let s
    switch (currency) {
        case 'ETH':
            unit = ' ETH'
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    { unit = ' Wei'; s = format(',')(v.toFixed(0)) }
            else if (v.lt( 1e6))    { unit = ' Wei'; s = format(',.0f')(v.toFixed(0)) }
            else if (v.lt( 1e9))    { unit = ' Wei'; s = format(',.3f')(v.div( 1e09).toFixed(3, 1))+'G' }
            else if (v.lt(1e12))    { unit = ' Wei'; s = format(',.0f')(v.div( 1e09).toFixed(0, 1))+'G' }
            else if (v.lt(1e15))    { unit = ' Wei'; s = format(',.3f')(v.div( 1e12).toFixed(3, 1))+'T' }
            else if (v.lt(1e18))    s = format(',.3f')(v.div( 1e15).toFixed(3, 1))+'m'
            else if (v.lt(1e21))    s = format(',.3f')(v.div( 1e18).toFixed(3, 1))
            else if (v.lt(1e24))    s = format(',.0f')(v.div( 1e18).toFixed(0, 1))
            else if (v.lt(1e27))    s = format(',.3f')(v.div( 1e21).toFixed(3, 1))+'M'
            else                    s = format(',.0f')(v.div( 1e21).toFixed(0, 1))+'M'
            break
        default:
            if (v.isZero())         s = '0.000'
            else if (v.lt(1e5))     { unit = ' Hearts'; s = format(',.0f')(v.toFixed(0, 1)) }
            else if (v.lt(1e11))    s = format(',')(v.div( 1e08).toFixed(3, 1))
            else if (v.lt(1e14))    s = format(',')(v.div( 1e08).toFixed(0, 1))
            else if (v.lt(1e17))    s = format(',.3f')(v.div( 1e14).toFixed(3, 1))+'M'
            else if (v.lt(1e20))    s = format(',.3f')(v.div( 1e17).toFixed(3, 1))+'B'
            else if (v.lt(1e23))    s = format(',.3f')(v.div( 1e20).toFixed(3, 1))+'T'
            else                    s = format(',.0f')(v.div( 1e20).toFixed(0, 1))+'T'
    }
    return {
        valueString: s,
        unit,
        valueWithUnit: s + unit
    }
}

module.exports = {
    calcBigPayDaySlice,
    calcAdoptionBonus,
    cryptoFormat
}

