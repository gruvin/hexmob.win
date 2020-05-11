import React from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { 
    Card,
    Table,
    Button,
    Modal,
    Badge,
    Alert,
    OverlayTrigger,
    Tooltip,
    ProgressBar,
    Accordion
} from 'react-bootstrap'
import { FormattedDate } from 'react-intl';
import './Stakes.css'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'

function hexFormat(v) {
    return format(v < 1e6 ? (v < 1e3 ? ",.3f" : ",.0f") : ",.5s")(v)
}

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            address: props.walletAddress,
            contractData: props.contractData,
            stakeCount: null,
            stakeList:  null,
            stakedTotal: new BigNumber(0),
            sharesTotal: new BigNumber(0),
            bpdTotal: new BigNumber(0),
            interestTotal: new BigNumber(0),
            stakeContext: { }, // active UI stake context
            showExitModal: false,
        }
    }

    calcBigPayDaySlice = (shares, pool) => {
        return Object.entries(this.state.contractData.globals).length
            ? new BigNumber(this.state.contractData.globals.claimStats.unclaimedSatoshisTotal).times(10000).times(shares).idiv(pool)
            : new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
    }

    loadStakes() {
        this.contract.methods.stakeCount(this.state.address).call()
        .then((stakeCount) => {
            const { currentDay, globals } = this.state.contractData
            this.setState({
                stakeList: { },
                stakeCount: Number(stakeCount),
                stakedTotal: new BigNumber(0),
                sharesTotal: new BigNumber(0),
                bpdTotal: new BigNumber(0),
                interestTotal: new BigNumber(0)
            })
            for (let index = 0; index < this.state.stakeCount; index++) {
                this.contract.methods.stakeLists(this.state.address, index).call()
                .then((data) => {
                    let stakeData = {
                        stakeId: data.stakeId,
                        lockedDay: Number(data.lockedDay),
                        stakedDays: Number(data.stakedDays),
                        stakedHearts: new BigNumber(data.stakedHearts),
                        stakeShares: new BigNumber(data.stakeShares),
                        unlockedDay: Number(data.unlockedDay),
                        isAutoStake: Boolean(data.isAutoStakte),
                        progress: Math.trunc(Math.min((currentDay - data.lockedDay) / data.stakedDays * 100000, 100000)),
                        bigPayDay: this.calcBigPayDaySlice(data.stakeShares, globals.stakeSharesTotal),
                        payout: new BigNumber(0)
                    }
                    const stakeList = { ...this.state.stakeList }
                    stakeList[data.stakeId] = stakeData

                    // update this.state
                    this.setState({ 
                        stakeList,
                        stakedTotal: this.state.stakedTotal.plus(data.stakedHearts),
                        sharesTotal: this.state.sharesTotal.plus(data.stakeShares),
                    })

                    this.updateStakePayout(stakeData)
                })
                .catch((e) => console.log(`Stakes::loadStakes:contract.methods.stakeLists(${this.state.address}, ${index}).call()`, e))
            }
        })
        .catch((e) => console.log(`Stakes::loadStakes:contract.methods.stakeCount(${this.state.address}).call()`, e))
    }

    updateStakePayout(_stakeData) {
        
        const { 
            CLAIMABLE_BTC_ADDR_COUNT, 
            CLAIMABLE_SATOSHIS_TOTAL, 
            HEARTS_PER_SATOSHI, 
            BIG_PAY_DAY,
            currentDay, 
            allocatedSupply, 
            globals 
        } = this.state.contractData
        const { claimedSatoshisTotal, claimedBtcAddrCount } = globals.claimStats

        const stakeData = { ..._stakeData }
        const startDay = stakeData.lockedDay
        const endDay = startDay + stakeData.stakedDays
        if (currentDay === startDay) return

        this.contract.methods.dailyDataRange(startDay, Math.min(currentDay, endDay)).call()
        .then((dailyData) => {

            const calcAdoptionBonus = (bigPayDaySlice) => {
                const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(CLAIMABLE_BTC_ADDR_COUNT)
                const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(CLAIMABLE_SATOSHIS_TOTAL)
                const bonus = viral.plus(criticalMass)
                return bonus
            }

            const calcDailyBonus = (shares, sharesTotal) => {
                // HEX mints 0.009955% daily interest (3.69%pa) and statkers get adoption bonuses from that each day
                const dailyInterest = allocatedSupply.times(10000).idiv(100448995) // .sol line: 1243 
                const bonus = shares.times(dailyInterest.plus(calcAdoptionBonus(dailyInterest))).idiv(sharesTotal)
                return bonus
            }

            // iterate over daily payouts history
            stakeData.payout = new BigNumber(0)
            stakeData.bigPayDay = new BigNumber(0)

            dailyData.forEach((mapped_dailyData, dayNumber) => {
                // extract dailyData struct from uint256 mapping
                const hex = new BigNumber(mapped_dailyData).toString(16).padStart(64, '0')
                const day = {
                    payoutTotal: new BigNumber(hex.slice(46,64), 16),
                    stakeSharesTotal: new BigNumber(hex.slice(28,46), 16),
                    unclaimedSatoshisTotal: BigNumber(hex.slice(12,28), 16)
                }
                
                stakeData.payout = stakeData.payout.plus(day.payoutTotal.times(stakeData.stakeShares).idiv(day.stakeSharesTotal))

                if (startDay <= BIG_PAY_DAY && endDay > BIG_PAY_DAY) {
                    const bigPaySlice = day.unclaimedSatoshisTotal.times(HEARTS_PER_SATOSHI).times(stakeData.stakeShares).idiv(globals.stakeSharesTotal)
                    const bonuses = calcAdoptionBonus(bigPaySlice)
                    stakeData.bigPayDay = bigPaySlice.plus(bonuses)
                    if (startDay + dayNumber === BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay.plus(bonuses))
                }

            })
            stakeData.payout = stakeData.payout.plus(calcDailyBonus(stakeData.stakeShares, globals.stakeSharesTotal))

            const stakeList = { ...this.state.stakeList }
            stakeList[stakeData.stakeId] = stakeData

            this.setState({ 
                bpdTotal: this.state.bpdTotal.plus(stakeData.bigPayDay),
                interestTotal: this.state.interestTotal.plus(stakeData.payout),
                stakeList
            })
        })
        .catch((e) => console.log(`Stakes::updateStakePayout:contract.methods.dailyDataRange(${startDay}, Math.min(${currentDay}, ${endDay}).call()`, e))
    }

    componentDidMount() {
        if (this.contract) this.loadStakes()
    }
    componentDidUpdate = (prevProps, prevState) => {
        if (prevProps.walletAddress !== this.props.walletAddress) {
            this.setState(
                { address: this.props.walletAddress },
                this.loadStakes
            )
        }
    }

    render() {

        const { 
            START_DATE,
            currentDay
        } = this.state.contractData

        const handleClose = () => this.setState({ showExitModal: false })
        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }
        const thisStake = this.state.stakeContext // if any
        const IsEarlyExit = (thisStake.stakeId && currentDay <= (thisStake.lockedDay + thisStake.stakedDays)) 

        return (
            !this.state.stakeList
                ? <ProgressBar animated now={90} label="loading contract data" />
                : <> 
            <Accordion defaultActiveKey="0">
            <Card bg="primary" text="light" className="overflow-auto m-2">
                <Accordion.Toggle as={Card.Header} eventKey="0">
                    Current Stakes <Badge variant='info' className="float-right">Day {currentDay+1}</Badge>
                </Accordion.Toggle>
                <Accordion.Collapse eventKey="0">
                <Card.Body className="p-3 pt-0">
                    <Table variant="secondary" size="sm" striped borderless>
                        <thead>
                            <tr>
                                <th className="day-value">Start</th>
                                <th className="day-value">End</th>
                                <th className="day-value">Days</th>
                                <th className="day-value">Progress</th>
                                <th className="hex-value">Principal</th>
                                <th className="shares-value">Shares</th>
                                <th className="hex-value">BigPayDay</th> 
                                <th className="hex-value">Interest</th>
                                <th className="hex-value">Value</th>
                                <th>{' '}</th>
                            </tr>
                        </thead>
                        <tbody>
                            { this.state.stakeList &&
                                Object.keys(this.state.stakeList).map((key) => {
                                    const stakeData = this.state.stakeList[key]
                                    
                                    const startDay = stakeData.lockedDay
                                    const endDay = startDay + stakeData.stakedDays
                                    const startDate = new Date(START_DATE)
                                    const endDate = new Date(START_DATE)
                                    startDate.setDate(startDate.getDate() + startDay)
                                    endDate.setDate(endDate.getDate() + endDay)

                                    return (typeof stakeData === 'object') ? 
                                    (
                                        <tr key={stakeData.stakeId}>
                                            <td className="day-value">
                                                <OverlayTrigger
                                                    key={stakeData.stakeId}
                                                    placement="top"
                                                    overlay={
                                                        <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                            { startDate.toLocaleString() }
                                                        </Tooltip>
                                                    }
                                                >
                                                    <div>{ startDay }</div>
                                                </OverlayTrigger>
                                            </td>
                                            <td className="day-value">
                                                <OverlayTrigger
                                                    key={stakeData.stakeId}
                                                    placement="top"
                                                    overlay={
                                                        <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                            { endDate.toLocaleString() }
                                                        </Tooltip>
                                                    }
                                                >
                                                    <div>{ endDay }</div>
                                                </OverlayTrigger>
                                            </td>
                                            <td className="day-value">{ stakeData.stakedDays }</td>
                                            <td className="day-value">
                                                { hexFormat(stakeData.progress / 1000) }%
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.stakedHearts / 1e8)} 
                                            </td>
                                            <td className="shares-value">
                                                {hexFormat(stakeData.stakeShares)} 
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.bigPayDay / 1e8) }
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.payout / 1e8) }
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.stakedHearts.plus(stakeData.payout) / 1e8) }
                                            </td>
                                            <td align="right">
                                                <Button 
                                                    variant="outline-primary" size="sm" 
                                                    onClick={(e) => handleShow(stakeData, e)}
                                                    className={ 
            currentDay < (stakeData.lockedDay + stakeData.stakedDays / 2) ? "earlyexit"
                : currentDay < (stakeData.lockedDay + stakeData.stakedDays) ? "midexit"
                : currentDay < (stakeData.lockedDay + stakeData.stakedDays + 7) ? "termexit"
                : "lateexit"
                                                    }
                                                >
                                                    Exit
                                                </Button>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={stakeData}><td colSpan="5">loading</td></tr>
                                    )
                                })
                            }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="4"></td>
                                <td className="hex-value">
                                    { hexFormat(this.state.stakedTotal / 1e8)} 
                                </td>
                                <td className="shares-value">
                                    { hexFormat(this.state.sharesTotal) }
                                </td>
                                <td className="hex-value">
                                    { hexFormat(this.state.bpdTotal / 1e8) }
                                </td>
                                <td className="hex-value">
                                    { hexFormat(this.state.interestTotal / 1e8) }
                                </td>
                                <td className="hex-value">
                                    { hexFormat(this.state.stakedTotal.plus(this.state.interestTotal) / 1e8) }
                                </td>
                                <td>{' '}</td>
                            </tr>
                        </tfoot>
                    </Table>
                </Card.Body>
            </Accordion.Collapse>
            </Card>
            <Card bg="primary" text="light" className="overflow-auto m-2">
                <Accordion.Toggle as={Card.Header} eventKey="1">
                    New Stake
                </Accordion.Toggle>
                <Accordion.Collapse eventKey="1">
                <Card.Body className="p-3">
                    Enter new stake data TODO
                </Card.Body>
                </Accordion.Collapse>
            </Card>
            <Card bg="primary" text="light" className="overflow-auto m-2">
                <Accordion.Toggle as={Card.Header} eventKey="2">
                    Stake History
                </Accordion.Toggle>
                <Accordion.Collapse eventKey="2">
                <Card.Body className="p-3">
                    <p>HISTORY TODO</p>
                    <p>HISTORY TODO</p>
                    <p>HISTORY TODO</p>
                    <p>HISTORY TODO</p>
                    <p>HISTORY TODO</p>
                </Card.Body>
                </Accordion.Collapse>
            </Card>
            </Accordion>

            <Modal show={this.state.showExitModal} onHide={handleClose} animation={false} variant="primary">
                <Modal.Header closeButton>
                    <Modal.Title>End Stake</Modal.Title>
                </Modal.Header>
               <Modal.Body>
                    {IsEarlyExit 
                        ?  
                            <Alert variant="danger">
                                <Alert.Heading>LOSSES AHEAD</Alert.Heading>
                                <p>
                                    Exiting stakes early can lead to <em>significant</em> losses!
                                </p>
                                <hr />
                                <p>
                                    <Alert.Link href="#">Learn more</Alert.Link>
                                </p>
                            </Alert>
                        :
                            <Alert variant="success">
                                <Alert.Heading>Term Complete</Alert.Heading>
                                <p>
                                    This stake has served its full term and is safe to exit.
                                </p>
                                <p> TODO: add stake stats / yield etc </p>
                            </Alert>
                    }
                </Modal.Body>
                <Modal.Footer>
                    {IsEarlyExit 
                        ? <div>
                            <Button variant="secondary" onClick={handleClose}>
                                Accept Penalty
                            </Button>
                            <Button variant="primary" className="ml-3" onClick={handleClose}>
                                Get me outta here!
                            </Button>
                        </div>
                        : <Button variant="primary" onClick={handleClose}>End Stake</Button>
                    }
                </Modal.Footer>
            </Modal>
            </>
        )
    }
}

export default Stakes;
