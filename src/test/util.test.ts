import { describe, expect, test } from 'vitest'

import HEX from "../hex_contract"
// import { cryptoFormat, calcPayoutRewards, calcPayoutBpdPenalty, calcBigPayDaySlice, calcAdoptionBonus } from '../util.js'
import { cryptoFormat  } from '../util.js'
import { ethers } from 'ethers'
import { TEST_CONTEXT, TEST_STAKE_DATA, TEST_DAILY_DATA } from './util-data.js'

type TestCase =  { input: bigint | string, expected: { unit: string, valueString: string } }

describe('CryptoVal number formatter - ETH: ', () => {

    const c = 'ETH'
    const ETH = [
        { input:                          123   , expected: { unit: "wei",    valueString:      "123" } }, //         wei
        { input:                         '123'  , expected: { unit: "wei",    valueString:      "123" } }, //         wei
        { input:                        '1234'  , expected: { unit: "wei",    valueString:    "1,234" } }, //   1.234 kwei
        { input:                       '12345'  , expected: { unit: "wei",    valueString:   "12,345" } }, //  12.345 kwei
        { input:                      '123456'  , expected: { unit: "wei",    valueString:  "123,456" } }, // 123.456 kwei
        { input:                     '1234567'  , expected: { unit: "wei",    valueString:   "0.001G" } }, //   1.230 mwei
        { input:                    '12345678'  , expected: { unit: "wei",    valueString:   "0.012G" } }, //  12.340 mwei
        { input:                   '123456789'  , expected: { unit: "wei",    valueString:   "0.123G" } }, // 123.450 mwei
        { input:                  '1234567890'  , expected: { unit: "wei",    valueString:   "1.234G" } }, //         gwei
        { input:                 '12345678901'  , expected: { unit: "wei",    valueString:  "12.345G" } }, //         gwei
        { input:                '123456789012'  , expected: { unit: "wei",    valueString: "123.456G" } }, //         gwei
        { input:               '1234567890123'  , expected: { unit: "wei",    valueString: "1,234.5G" } }, //   1.234 szabo
        { input:              '12345678901234'  , expected: { unit: "wei",    valueString:  "12,345G" } }, //  12.345 szabo
        { input:             '123456789012345'  , expected: { unit: "wei",    valueString: "123,456G" } }, // 123.456 szabo
        { input:            '1234567890123456'  , expected: { unit: "ETH",    valueString:   "0.0012" } }, //   1.234 finney
        { input:           '12345678901234567'  , expected: { unit: "ETH",    valueString:   "0.0123" } }, //  12.345 finney
        { input:          '123456789012345678'  , expected: { unit: "ETH",    valueString:   "0.1234" } }, // 123.456 finney
        { input:         '1234567890123456789'  , expected: { unit: "ETH",    valueString:   "1.2345" } }, // ETH
        { input:        '12345678901234567890'  , expected: { unit: "ETH",    valueString:  "12.3456" } }, // ETH
        { input:       '123456789012345678901'  , expected: { unit: "ETH",    valueString:  "123.456" } }, // ETH
        { input:      '1234567890123456789012'  , expected: { unit: "ETH",    valueString:  "1,234.5" } }, // ETH
        { input:     '12345678901234567890123'  , expected: { unit: "ETH",    valueString:   "12,345" } }, // ETH
        { input:    '123456789012345678901234'  , expected: { unit: "ETH",    valueString:  "123,456" } }, // ETH
        { input:   '1234567890123456789012345'  , expected: { unit: "ETH",    valueString:  "1.2345M" } }, // ETH
    ]

    ETH.forEach(t => {
        const { input, expected } = t as TestCase
        const _input: string = typeof input === 'string' ? input : input.toString()
        const len: string = Number(_input.length).toString()
        test(`Currency:${c} ${input.toString().padStart(24, ' ')} [${len.padStart(3, "0")}] => ${expected.valueString.padStart(8, ' ')}${expected.unit}`,
            () => {
                 const { input } = t
                 const { unit, valueString } = expected
                 expect(cryptoFormat(input, c)).toEqual({
                     unit,
                     valueString,
                     valueWithUnit: `${expected.valueString}${expected.unit}`
             })
         })
     })
})

describe('CryptoVal number formatter — HEX: ', () => {

    const c = 'HEX'
    const HEX = [
        { input:                        123  , expected: { unit: "Hearts", valueString:       "123" } },
        { input:                       "123" , expected: { unit: "Hearts", valueString:       "123" } },
        { input:                      '1234' , expected: { unit: "Hearts", valueString:     "1,234" } },
        { input:                     '12345' , expected: { unit: "Hearts", valueString:    "12,345" } },
        { input:                    '123456' , expected: { unit: "Hearts", valueString:   "123,456" } },
        { input:                   '1234567' , expected: { unit:    "HEX", valueString:     "0.012" } },
        { input:                  '12345678' , expected: { unit:    "HEX", valueString:     "0.123" } },
        { input:                 '123456789' , expected: { unit:    "HEX", valueString:     "1.234" } },
        { input:                '1234567890' , expected: { unit:    "HEX", valueString:    "12.345" } },
        { input:               '12345678901' , expected: { unit:    "HEX", valueString:   "123.456" } },
        { input:              '123456789012' , expected: { unit:    "HEX", valueString:   "1,234.5" } },
        { input:             '1234567890123' , expected: { unit:    "HEX", valueString:    "12,345" } },
        { input:            '12345678901234' , expected: { unit:    "HEX", valueString:   "123,456" } },
        { input:           '123456789012345' , expected: { unit:    "HEX", valueString:    "1.234M" } },
        { input:          '1234567890123456' , expected: { unit:    "HEX", valueString:   "12.345M" } },
        { input:          '1234000000000000' , expected: { unit:    "HEX", valueString:   "12.340M" } },
        { input:         '12345678901234567' , expected: { unit:    "HEX", valueString:  "123.456M" } },
        { input:        '123456789012345678' , expected: { unit:    "HEX", valueString:    "1.234B" } },
        { input:       '1234567890123456789' , expected: { unit:    "HEX", valueString:   "12.345B" } },
        { input:      '12345678901234567890' , expected: { unit:    "HEX", valueString:   "123.456B" } },
        { input:     '123456789012345678901' , expected: { unit:    "HEX", valueString:    "1.234T" } },
        { input:    '1234567890123456789012' , expected: { unit:    "HEX", valueString:   "12.345T" } },
    ]

    HEX.forEach(t => {
        const { input, expected } = t as TestCase
        const _input: string = typeof input === 'string' ? input : input.toString()
        const len: string = Number(_input.length).toString()
        test(`Currency:${c} ${input.toString().padStart(24, ' ')} [${len.padStart(3, "0")}] => ${expected.valueString.padStart(8, ' ')}${expected.unit}`,
           () => {
                const { input } = t
                const { unit, valueString } = expected
                expect(cryptoFormat(input, c)).toEqual({
                    unit,
                    valueString,
                    valueWithUnit: `${expected.valueString}${expected.unit}`
            })
        })
    })
})

describe('CryptoVal number formatter — SHARES: ', () => {
    const c = 'SHARES'
    const SHARES = [
        { input:                          123   , expect: { unit: "Sh",    valueString:     "123" } },
        { input:                         '123'  , expect: { unit: "Sh",    valueString:     "123" } },
        { input:                        '1234'  , expect: { unit: "Sh",    valueString:    "1,234" } },
        { input:                       '12345'  , expect: { unit: "Sh",    valueString:   "12,345" } },
        { input:                      '123456'  , expect: { unit: "Sh",    valueString:  "123,456" } },
        { input:                     '1234567'  , expect: { unit: "Sh",    valueString:   "1.234M" } },
        { input:                    '12345678'  , expect: { unit: "Sh",    valueString:  "12.345M" } },
        { input:                   '123456789'  , expect: { unit: "Sh",    valueString: "123.456M" } },
        { input:                   '123450000'  , expect: { unit: "Sh",    valueString: "123.450M" } },
        { input:                  '1234567890'  , expect: { unit: "Sh",    valueString:   "1.234B" } },
        { input:                 '12345678901'  , expect: { unit: "Sh",    valueString:  "12.345B" } },
        { input:                '123456789012'  , expect: { unit: "Sh",    valueString: "123.456B" } },
        { input:               '1234567890123'  , expect: { unit: "Sh",    valueString:   "1.234T" } },
        { input:              '12345678901234'  , expect: { unit: "Sh",    valueString:  "12.345T" } },
        { input:             '123456789012345'  , expect: { unit: "Sh",    valueString: "123.456T" } },
        { input:            '1234567890123456'  , expect: { unit: "Sh",    valueString:   "1.234P" } },
        { input:           '12345678901234567'  , expect: { unit: "Sh",    valueString:  "12.345P" } },
        { input:          '123456789012345678'  , expect: { unit: "Sh",    valueString: "123.456P" } },
    ]

    SHARES.forEach(t => {
        test(`Currency:${c} ${t.input.toString().padStart(24, ' ')} => ${t.expect.valueString.padStart(8, ' ')}${t.expect.unit}`,
            () => {
                const { input } = t
                const { unit, valueString } = t.expect
                expect(cryptoFormat(input, c)).toEqual({
                    unit,
                    valueString,
                    valueWithUnit: `${t.expect.valueString}${t.expect.unit}`
                })
            })
    })
})

// describe('HEX Math Helpers', () => {
//     const { globals } = TEST_CONTEXT.contract.Data
//     const { bnStakeSharesTotal } = globals
//     const { bnStakeShares } = TEST_STAKE_DATA
//     test('calcBigPayDaySlice => correct result', () => {
//         const result = calcBigPayDaySlice(bnStakeShares, bnStakeSharesTotal, globals)
//         expect(result.toString()).toEqual("2414517493771433")
//     })

//     test('calcAdoptionBonus => correct result', () => {
//         const payout = ethers.BigNumber.from('853398190490')
//         const result = calcAdoptionBonus(payout, globals)
//         expect(result.toString()).toEqual("25010442520")
//     })

//     test('calcPayoutRewards => correct results { payout, bnBigPayDay }', () => {
//         const result = calcPayoutRewards({
//             context: TEST_CONTEXT,
//             stakeData: TEST_STAKE_DATA,
//             rawDailyData: TEST_DAILY_DATA,
//             fromDay: TEST_STAKE_DATA.lockedDay,
//             toDay: globals.currentDay - 1,
//         })
//         expect(result.payout.toString()).toEqual(   "853398190490")
//         expect(result.bnBigPayDay.toString()).toEqual("459969766506") // pay - bpd = 393428423984
//     })
// })

// describe('Stake Interest (Yield) / Peanalty Calcs', () => {

//     test('EARLY BEFORE HALF TERM END STAKE: calcPayoutBpdPenalty produces correct results for { payout, bigPayDay, penaly }', () => {
//         const _TEST_CONTEXT = { ...TEST_CONTEXT }
//         _TEST_CONTEXT.contract.Data.currentDay = ethers.BigNumber.from(TEST_STAKE_DATA.lockedDay).add(20)
//         const result = calcPayoutBpdPenalty(_TEST_CONTEXT, TEST_STAKE_DATA, TEST_DAILY_DATA)
//         expect(result.payout.toString()).toEqual("1463266074185")
//         expect(result.bnBigPayDay.toString()).toEqual("459969766506")
//         expect(result.penalty.toString()).toEqual("2923675643222")
//     })

//     // NOTE: The following 3 tests do not have daily data beyond test authoring day 993.
//     //       This does not affect their accuracy as expected results are adjusted accordingly.
//     test('RIGHT ON TIME END STAKE: calcPayoutBpdPenalty produces correct results for { payout, bigPayDay, penaly }', () => {
//         const _TEST_CONTEXT = { ...TEST_CONTEXT }
//         _TEST_CONTEXT.contract.Data.currentDay = ethers.BigNumber
//             .from(TEST_STAKE_DATA.lockedDay)
//             .add(TEST_STAKE_DATA.stakedDays)
//             .add(1)
//             .toNumber()
//         const result = calcPayoutBpdPenalty(_TEST_CONTEXT, TEST_STAKE_DATA, TEST_DAILY_DATA)
//         expect(result.payout.toString()).toEqual("1463266074185")
//         expect(result.bnBigPayDay.toString()).toEqual("459969766506")
//         expect(result.penalty.toString()).toEqual("0")
//     })

//     test('EARLY AFTER HALF TERM END STAKE: calcPayoutBpdPenalty produces correct results for { payout, bigPayDay, penaly }', () => {
//         const _TEST_CONTEXT = { ...TEST_CONTEXT }
//         _TEST_CONTEXT.contract.Data.currentDay = ethers.BigNumber
//             .from(TEST_STAKE_DATA.lockedDay)
//             .add(TEST_STAKE_DATA.stakedDays)
//             .div(2)
//             .add(5)
//             .toNumber()
//         const result = calcPayoutBpdPenalty(_TEST_CONTEXT, TEST_STAKE_DATA, TEST_DAILY_DATA)
//         expect(result.payout.toString()).toEqual("1463266074185")
//         expect(result.bnBigPayDay.toString()).toEqual("459969766506")
//         expect(result.penalty.toString()).toEqual("2923675643222")
//     })

//     test('WITHIN GRACE PERIOD END STAKE: calcPayoutBpdPenalty produces correct results for { payout, bigPayDay, penaly }', () => {
//         const _TEST_CONTEXT = { ...TEST_CONTEXT }
//         _TEST_CONTEXT.contract.Data.currentDay = ethers.BigNumber
//             .from(TEST_STAKE_DATA.lockedDay)
//             .add(TEST_STAKE_DATA.stakedDays)
//             .add(HEX.LATE_PENALTY_GRACE_DAYS)
//             .toNumber()
//         const result = calcPayoutBpdPenalty(_TEST_CONTEXT, TEST_STAKE_DATA, TEST_DAILY_DATA)
//         expect(result.payout.toString()).toEqual("1463266074185")
//         expect(result.bnBigPayDay.toString()).toEqual("459969766506")
//         expect(result.penalty.toString()).toEqual("0")
//     })

// //     test('BEYOND GRACE PERIOD END STAKE: calcPayoutBpdPenalty produces correct results for { payout, bigPayDay, penaly }', () => {
// //         const _TEST_CONTEXT = { ...TEST_CONTEXT }
// //         _TEST_CONTEXT.contract.Data.currentDay = TEST_STAKE_DATA.lockedDay + TEST_STAKE_DATA.stakedDays + HEX.LATE_PENALTY_GRACE_DAYS + 5
// //         const result = calcPayoutBpdPenalty(_TEST_CONTEXT, TEST_STAKE_DATA, TEST_DAILY_DATA)
// //         expect(result.payout.toString(10)).toEqual("13429102854384")
// //         expect(result.bnBigPayDay.toString(10)).toEqual("22303667141244")
// //         expect(result.penalty.toString(10)).toEqual("404498000759")
// //     })

// })
