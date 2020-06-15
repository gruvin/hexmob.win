import React from 'react';
import { BigNumber } from 'bignumber.js'
import { calcBigPayDaySlice, calcAdoptionBonus, cryptoFormat } from './util'

const globals = {
    lockedHeartsTotal: BigNumber("5436379302282992615"),
    nextStakeSharesTotal: BigNumber("55961293641264340"),
    shareRate: BigNumber("103576"),
    stakePenaltyTotal: BigNumber("45932328042065"),
    dailyDataCount: 181,
    stakeSharesTotal: BigNumber("9720248700229424525"),
    latestStakeId: 167945,
    claimStats: {
        claimedBtcAddrCount: BigNumber("28615"),
        claimedSatoshisTotal: BigNumber("23310029239470"),
        unclaimedSatoshisTotal: BigNumber("1787305432772087")
    }
}

describe('HEX math helpers', () => {
    test('calcBigPayDaySlice => correct result', () => {
        const result = calcBigPayDaySlice(BigNumber("77345"), BigNumber(7103180085537) , globals)
        expect(result).toEqual(BigNumber("194615843936"))
    })

    test('calcAdoptionBonus => correct result', () => {
        const result = calcAdoptionBonus(BigNumber('8008135413375'), globals) 
        expect(result).toEqual(BigNumber("213296580101"))
    })
})

describe('CryptoVal number formatter: Ether', () => {
    const bnNaN = BigNumber("NaN")
    const bnInfinity = BigNumber(1).div(0)

    const c = 'ETH'
    const ETH = [
        { input:              123.456              , expect: { unit: "Wei", valueString:  "123.456", valueWithUnit:  "123.456 Wei"} },
        { input:              123.4567             , expect: { unit: "Wei", valueString:  "123.456", valueWithUnit:  "123.456 Wei"} },
        { input:              123                  , expect: { unit: "Wei", valueString:      "123", valueWithUnit:      "123 Wei"} },
        { input:           123456.789              , expect: { unit: "Wei", valueString:  "123,456", valueWithUnit:  "123,456 Wei"} },
        { input:        123456789.012              , expect: { unit: "Wei", valueString: "123.456M", valueWithUnit: "123.456M Wei"} },
        { input:     123456789012.345              , expect: { unit: "Wei", valueString: "123.456G", valueWithUnit: "123.456G Wei"} },
        { input: "123456789012345.678"             , expect: { unit: "Wei", valueString: "123,456G", valueWithUnit: "123,456G Wei"} },
        { input: BigNumber("123456789012345678")   , expect: { unit: "ETH", valueString: "0.123456", valueWithUnit: "0.123456 ETH"} },
        { input:           "     0.1234567e18 "    , expect: { unit: "ETH", valueString: "0.123456", valueWithUnit: "0.123456 ETH"} },
        { input:           "     1.2345678e18 "    , expect: { unit: "ETH", valueString: "1.234567", valueWithUnit: "1.234567 ETH"} },
        { input:           "    12.3456789e18 "    , expect: { unit: "ETH", valueString: "12.34567", valueWithUnit: "12.34567 ETH"} },
        { input: BigNumber("   1.2345678e18     ") , expect: { unit: "ETH", valueString: "1.234567", valueWithUnit: "1.234567 ETH"} },
        { input: BigNumber("  12.3456789e18     ") , expect: { unit: "ETH", valueString: "12.34567", valueWithUnit: "12.34567 ETH"} },
        { input: BigNumber(" 123.4567899e18     ") , expect: { unit: "ETH", valueString: "123.4567", valueWithUnit: "123.4567 ETH"} },
        { input:    "123456789012345678999.999"    , expect: { unit: "ETH", valueString: "123.4567", valueWithUnit: "123.4567 ETH"} },
        { input: BigNumber(123.4567e3).times(1e18) , expect: { unit: "ETH", valueString:  "123,456", valueWithUnit:  "123,456 ETH"} },
        { input: BigNumber(123.4567e6).times(1e18) , expect: { unit: "ETH", valueString: "123.456M", valueWithUnit: "123.456M ETH"} },
        { input: BigNumber(123.4567e9).times(1e18) , expect: { unit: "ETH", valueString: "123.456B", valueWithUnit: "123.456B ETH"} },
        { input: BigNumber(123.4567e12).times(1e18), expect: { unit: "ETH", valueString: "123.456T", valueWithUnit: "123.456T ETH"} },
        { input: BigNumber(123.4567e15).times(1e18), expect: { unit: "ETH", valueString: "123.456Q", valueWithUnit: "123.456Q ETH"} },
        { input: BigNumber("NOT A NUMBER")         , expect: { unit:    "", valueString:      "NaN", valueWithUnit:          "NaN"} },
        { input: BigNumber(1).div(0)               , expect: { unit:    "", valueString: "Infinity", valueWithUnit:     "Infinity"} },
    ]

    ETH.forEach(t => {
       test(`Currency:ETH ${BigNumber(t.input).toFormat(4).padStart(54, ' ')} => ${t.expect.valueString.padStart(8, ' ')} ${t.expect.unit}`,
           () => { expect(cryptoFormat(t.input, 'ETH')).toEqual(t.expect) })
    })
})

describe('CryptoVal number formatter: HEX', () => {
    const bnNaN = BigNumber("NaN")
    const bnInfinity = BigNumber(1).div(0)

    const c = 'HEX'
    const HEX = [
        { input:              123.456             , expect: { unit: "Hearts", valueString:  "123.456", valueWithUnit:  "123.456 Hearts"} },
        { input:              123.4567            , expect: { unit: "Hearts", valueString:  "123.456", valueWithUnit:  "123.456 Hearts"} },
        { input:             "123.0000"           , expect: { unit: "Hearts", valueString:      "123", valueWithUnit:      "123 Hearts"} },
        { input:             1234.567             , expect: { unit: "Hearts", valueString:  "1,234.5", valueWithUnit:  "1,234.5 Hearts"} },
        { input:            12345.678             , expect: { unit: "Hearts", valueString:   "12,345", valueWithUnit:   "12,345 Hearts"} },
        { input:           123456.789             , expect: { unit: "Hearts", valueString:  "123,456", valueWithUnit:  "123,456 Hearts"} },
        { input:          1234567.890             , expect: { unit:    "HEX", valueString:  "0.01234", valueWithUnit:  "0.01234 HEX"} },
        { input:         12345678.901             , expect: { unit:    "HEX", valueString:  "0.12345", valueWithUnit:  "0.12345 HEX"} },
        { input:        123456789.012             , expect: { unit:    "HEX", valueString:  "1.23456", valueWithUnit:  "1.23456 HEX"} },
        { input:       1234567890.123             , expect: { unit:    "HEX", valueString:  "12.3456", valueWithUnit:  "12.3456 HEX"} },
        { input:      12345678901.234             , expect: { unit:    "HEX", valueString:  "123.456", valueWithUnit:  "123.456 HEX"} },
        { input:     123456789012.345             , expect: { unit:    "HEX", valueString:  "1,234.5", valueWithUnit:  "1,234.5 HEX"} },
        { input:   "1234567890123.456"            , expect: { unit:    "HEX", valueString:   "12,345", valueWithUnit:   "12,345 HEX"} },
        { input:  "12345678901234.567"            , expect: { unit:    "HEX", valueString:  "123,456", valueWithUnit:  "123,456 HEX"} },
        { input: "123456789012345.678"            , expect: { unit:    "HEX", valueString:  "1.2345M", valueWithUnit:  "1.2345M HEX"} },
        { input: BigNumber(    "12345678E08")     , expect: { unit:    "HEX", valueString:  "12.345M", valueWithUnit:  "12.345M HEX"} },
        { input: BigNumber(   "123456789E08")     , expect: { unit:    "HEX", valueString:  "123.45M", valueWithUnit:  "123.45M HEX"} },
        { input: BigNumber(  "1234567890E08")     , expect: { unit:    "HEX", valueString:  "1.2345B", valueWithUnit:  "1.2345B HEX"} },
        { input: BigNumber( "12345678901E08")     , expect: { unit:    "HEX", valueString:  "12.345B", valueWithUnit:  "12.345B HEX"} },
        { input: BigNumber("123456789012E08")     , expect: { unit:    "HEX", valueString:  "123.45B", valueWithUnit:  "123.45B HEX"} },
        { input: BigNumber(  "1234567890E11")     , expect: { unit:    "HEX", valueString:  "1.2345T", valueWithUnit:  "1.2345T HEX"} },
        { input: BigNumber( "12345678901E11")     , expect: { unit:    "HEX", valueString:  "12.345T", valueWithUnit:  "12.345T HEX"} },
        { input: BigNumber("123456789012E11")     , expect: { unit:    "HEX", valueString:  "123.45T", valueWithUnit:  "123.45T HEX"} },
        { input: BigNumber("NOT A NUMBER")        , expect: { unit:       "", valueString:      "NaN", valueWithUnit:          "NaN"} },
        { input: BigNumber(1).div(0)              , expect: { unit:       "", valueString: "Infinity", valueWithUnit:     "Infinity"} },
    ]

    HEX.forEach(t => {
       test(`Currency:HEX ${BigNumber(t.input).toFormat(4).padStart(54, ' ')} => ${t.expect.valueString.padStart(8, ' ')} ${t.expect.unit}`,
           () => { expect(cryptoFormat(t.input, 'HEX')).toEqual(t.expect) })
    })
})

