import React, { useState } from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { 
    Container,
    Card,
    Table,
    Row,
    Col,
    Button,
    Modal,
    Badge,
    Alert,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap'
import { FormattedDate, FormattedNumber} from 'react-intl'
import styles from './Stakes.css'
import parseWeb3Response from './utils.js'
import web3 from 'web3'
import coder from 'web3-eth-abi'
import { BigNumber } from 'bignumber.js'

class StakeDetail extends React.Component {

    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            stakeId: props.stakeData.stakeId,
            startDay: props.stakeData.lockedDay,
            endDay: props.stakeData.stakedDays - props.stakeData.lockedDay,
            stakeShares: props.stakeData.stakeShares,
            currentDay: props.currentDay,
            payout: 0
        }

    }

    componentDidMount() {
        const CLAIM_PHASE_START_DAY = 1
        const CLAIM_PHASE_DAYS = 7 * 50
        const CLAIM_PHASE_END_DAY = CLAIM_PHASE_START_DAY + CLAIM_PHASE_DAYS
        const BIG_PAY_DAY = CLAIM_PHASE_END_DAY + 1
        const CLAIMABLE_BTC_ADDR_COUNT = new BigNumber('27997742')
        const CLAIMABLE_SATOSHIS_TOTAL = new BigNumber('910087996911001')
        const HEARTS_PER_SATOSHI = 10000
        const claimedSatoshisTotal = new BigNumber(this.contract.globals.claimStats.claimedSatoshisTotal)
        const unclaimedSatoshisTotal = new BigNumber(this.contract.globals.claimStats.unclaimedSatoshisTotal)
        const claimedBtcAddrCount = new BigNumber(this.contract.globals.claimStats.claimedBtcAddrCount)
        const stakeSharesTotal = new BigNumber(this.contract.globals.stakeSharesTotal)
        const nextStakeSharesTotal = new BigNumber(this.contract.globals.nextStakeSharesTotal)

        console.log('StakeId: ', this.state.stakeId)
        this.contract.methods.dailyDataRange(this.state.startDay, Math.min(this.state.currentDay, this.state.endDay)).call()
        .then((dailyData) => {

            const calcAdoptionBonus = (bigPaySlice) => {
                let viral = bigPaySlice.times(claimedBtcAddrCount).idiv(CLAIMABLE_BTC_ADDR_COUNT)
                let criticalMass = bigPaySlice.times(claimedSatoshisTotal).idiv(CLAIMABLE_SATOSHIS_TOTAL)
                return bigPaySlice.plus(viral).plus(criticalMass)
            }

            let payout = new BigNumber(0)
            let BPDdayStakeSharesTotal = 0
            dailyData.forEach((dailyDataMapping, dayNumber) => {
                // extract dailyData struct from uint256 mapping
                let hex = new BigNumber(dailyDataMapping).toString(16).padStart(64, '0')
                let dayPayoutTotal = new BigNumber(hex.slice(46,64), 16)

                let dayStakeSharesTotal = new BigNumber(hex.slice(28,46), 16)
                if ((dayNumber+Number(this.state.startDay)) <= BIG_PAY_DAY) BPDdayStakeSharesTotal = dayStakeSharesTotal 
                
                let dayUnclaimedSatoshisTotal = new BigNumber(hex.slice(12,28), 16)
                
                payout = payout.plus(dayPayoutTotal.times(this.state.stakeShares).idiv(dayStakeSharesTotal))

                if (Number(this.state.startDay) <= BIG_PAY_DAY && Number(this.state.endDay) > BIG_PAY_DAY) {
                    const bigPaySlice = dayUnclaimedSatoshisTotal.times(HEARTS_PER_SATOSHI) .times(this.state.stakeShares).idiv(BPDdayStakeSharesTotal)
                    if (this.startDay + dayNumber === BIG_PAY_DAY) payout = payout.plus(calcAdoptionBonus(bigPaySlice))
                }
            })

            // add this stake's share of adoption bonus from current, "pending" day's HEX dailyInterest
            
            // HEX mints 0.009955% daily interest (3.69%pa) and statkers get adoption bonuses from that each day
            let dailyInterest = new BigNumber(this.contract.allocatedSupply).times(10000).idiv(100448995) // .sol line: 1243 
            let adoptionBonusTotal = calcAdoptionBonus(dailyInterest)

            // now our share ...
            let stakeBonus = adoptionBonusTotal.times(this.state.stakeShares).idiv(stakeSharesTotal.plus(nextStakeSharesTotal))

            payout = payout.plus(stakeBonus)
            this.setState({ payout: payout.div(1e8).toFixed(4) })
        })
    }

    render() {
        return (
            <Card>
                <Card.Title>Stake Detail</Card.Title>
                <Card.Body>
                    { <pre>{ this.state.payout }HEX</pre> }
                </Card.Body>
            </Card>
        )
    }

}

export default StakeDetail
