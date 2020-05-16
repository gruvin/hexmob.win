import HEX from './hex_contract'
import { BigNumber } from 'bignumber.js'

/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
 */
export const calcBigPayDaySlice = (shares, sharePool, _globals) => {
    const unclaimedSatoshis = Object.entries(_globals).length 
            ? _globals.claimStats.unclaimedSatoshisTotal
            : new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
    return new BigNumber(unclaimedSatoshis.times(HEX.HEARTS_PER_SATOSHI).times(shares))
                                    .idiv(sharePool)
}

export const calcAdoptionBonus = (bigPayDaySlice, _globals) => {
    const { claimedSatoshisTotal, claimedBtcAddrCount } = _globals.claimStats
    const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(HEX.CLAIMABLE_BTC_ADDR_COUNT)
    const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(HEX.CLAIMABLE_SATOSHIS_TOTAL)
    const bonus = viral.plus(criticalMass)
    return bonus
}

