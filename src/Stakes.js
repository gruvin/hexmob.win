import React from 'react'
import { 
    Card,
    Table,
    Button,
    Modal,
    OverlayTrigger,
    Alert,
    Tooltip,
    ProgressBar,
    Accordion,
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import HEX from './hex_contract'
import { calcBigPayDaySlice, calcAdoptionBonus } from './util'
import  NewStakeForm from './NewStakeForm' 
import { HexNum } from './Widgets' 
const debug = require('debug')('Stakes')
debug('loading')

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            address: props.context.walletAddress,
            contractData: props.context.contractData,
            availableBalance: props.context.walletHEX,
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
    static getDerivedStateFromProps(newProps, prevState) {
        return { 
            address: newProps.context.walletAddress,
            availableBalance: new BigNumber(newProps.context.walletHEX),
            contractData: newProps.context.contractData
        }
    }

    loadStakes() {
        this.contract.methods.stakeCount(this.state.address).call()
        .then((stakeCount) => {
            const { currentDay } = this.state.contractData
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
                        bigPayDay: new BigNumber(0),
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
            currentDay, 
            allocatedSupply, 
            globals 
        } = this.state.contractData

        const stakeData = { ..._stakeData }
        const startDay = stakeData.lockedDay
        const endDay = startDay + stakeData.stakedDays
        if (currentDay === startDay) return

        this.contract.methods.dailyDataRange(startDay, Math.min(currentDay, endDay)).call()
        .then((dailyData) => {

            // iterate over daily payouts history
            stakeData.payout = new BigNumber(0)
            stakeData.bigPayDay = new BigNumber(0)

            dailyData.forEach((mapped_dailyData, dayNumber) => {
                // extract dailyData struct from uint256 mapping
                const hex = new BigNumber(mapped_dailyData).toString(16).padStart(64, '0')
                const day = {
                    payoutTotal: new BigNumber(hex.slice(46,64), 16),
                    stakeSharesTotal: new BigNumber(hex.slice(28,46), 16),
                    unclaimedSatoshisTotal: new BigNumber(hex.slice(12,28), 16)
                }
                const payout = day.payoutTotal.times(stakeData.stakeShares).idiv(day.stakeSharesTotal)
                stakeData.payout = stakeData.payout.plus(payout)
            })

            // Calculate our share of Daily Interest (for the current day)

            // HEX mints 0.009955% daily interest (3.69%pa) and stakers get adoption bonuses from that, each day
            const dailyInterestTotal = allocatedSupply.times(10000).idiv(100448995) // .sol line: 1243 
            const interestShare = stakeData.stakeShares.times(dailyInterestTotal).idiv(globals.stakeSharesTotal)

            // add our doption Bonus
            const interestBonus = calcAdoptionBonus(interestShare, globals)
            
            // add interest (with adoption bonus) to stake's payout total 
            stakeData.payout = stakeData.payout.plus(interestShare).plus(interestBonus)

            if (startDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
                const bigPaySlice = calcBigPayDaySlice(stakeData.stakeShares, globals.stakeSharesTotal, globals)
                const bonuses = calcAdoptionBonus(bigPaySlice, globals)
                stakeData.bigPayDay = bigPaySlice.plus(bonuses)
                if ( currentDay >= HEX.BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay)
                // TODO: penalties have to come off for late End Stake
            }

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

    CurrentStakesTable = () => {
        const { currentDay } = this.state.contractData

        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }

        return (
            <Table variant="secondary" size="sm" striped borderless>
                <thead>
                    <tr>
                        <th className="text-center">Start</th>
                        <th className="text-center">End</th>
                        <th className="text-center">Days</th>
                        <th className="text-center">Progress</th>
                        <th className="text-right">Principal</th>
                        <th className="text-right">Shares</th>
                        <th className="text-right">BigPayDay</th> 
                        <th className="text-right">Interest</th>
                        <th className="text-right">Value</th>
                        <th>{' '}</th>
                    </tr>
                </thead>
                <tbody>
                    { this.state.stakeList &&
                        Object.keys(this.state.stakeList).map((key) => {
                            const stakeData = this.state.stakeList[key]
                            
                            const startDay = stakeData.lockedDay
                            const endDay = startDay + stakeData.stakedDays
                            const startDate = new Date(HEX.START_DATE) // UTC but is converted to local
                            const endDate = new Date(HEX.START_DATE)
                            startDate.setUTCDate(startDate.getUTCDate() + startDay)
                            endDate.setUTCDate(endDate.getUTCDate() + endDay)

                            return (typeof stakeData === 'object') ? 
                            (
                                <tr key={stakeData.stakeId}>
                                    <td className="text-center">
                                        <OverlayTrigger
                                            key={stakeData.stakeId}
                                            placement="top"
                                            overlay={
                                                <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                    { startDate.toLocaleString() }
                                                </Tooltip>
                                            }
                                        >
                                            <div>{ startDay + 1 }</div>
                                        </OverlayTrigger>
                                    </td>
                                    <td className="text-center">
                                        <OverlayTrigger
                                            key={stakeData.stakeId}
                                            placement="top"
                                            overlay={
                                                <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                    { endDate.toLocaleString() }
                                                </Tooltip>
                                            }
                                        >
                                            <div>{ endDay + 1 }</div>
                                        </OverlayTrigger>
                                    </td>
                                    <td className="text-center">{ stakeData.stakedDays }</td>
                                    <td className="text-center">
                                        <HexNum value={stakeData.progress / 1000} />%
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.stakedHearts} /> 
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.stakeShares.times(1e8)} /> 
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.bigPayDay} />
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.payout} />
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.stakedHearts.plus(stakeData.payout)} />
                                    </td>
                                    <td align="right">
                                        <Button 
                                            variant="outline-primary" size="sm" 
                                            onClick={(e) => handleShow(stakeData, e)}
                                            className={ 
                                                currentDay < (stakeData.lockedDay + stakeData.stakedDays / 2) ? "exitbtn earlyexit"
                                                    : currentDay < (stakeData.lockedDay + stakeData.stakedDays) ? "exitbtn midexit"
                                                    : currentDay < (stakeData.lockedDay + stakeData.stakedDays + 7) ? "exitbtn termexit"
                                                    : "exitbtn lateexit"
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
                        <td className="text-right">
                            <HexNum value={this.state.stakedTotal} /> 
                        </td>
                        <td className="text-right">
                            <HexNum value={this.state.sharesTotal.times(1e8)} />
                        </td>
                        <td className="text-right">
                            <HexNum value={this.state.bpdTotal} />
                        </td>
                        <td className="text-right">
                            <HexNum value={this.state.interestTotal} />
                        </td>
                        <td className="text-right">
                            <HexNum value={this.state.stakedTotal.plus(this.state.interestTotal)} />
                        </td>
                        <td>{' '}</td>
                    </tr>
                </tfoot>
            </Table>
        )
    }

    render() { // class Stakes

        const { 
            currentDay
        } = this.state.contractData
        
        const handleClose = () => this.setState({ showExitModal: false })

        const thisStake = this.state.stakeContext // if any
        const IsEarlyExit = (thisStake.stakeId && currentDay <= (thisStake.lockedDay + thisStake.stakedDays)) 

        return (
            !this.state.stakeList
                ? <ProgressBar variant="secondary" animated now={90} label="loading contract data" />
                : <> 
            <Accordion defaultActiveKey="new_stake">
                <Card bg="secondary" text="light" className="overflow-auto">
                    <Accordion.Toggle as={Card.Header} eventKey="new_stake">
                        <h3 className="float-left">New Stake</h3>
                        <div className="day-number float-right">Day {currentDay+1}</div>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="new_stake">
                        <Card.Body className="bg-dark">
                            <NewStakeForm context={this.state}/>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
                <Card bg="secondary" text="light" className="overflow-auto">
                    <Accordion.Toggle as={Card.Header} eventKey="current_stakes">
                        <h3 className="float-left">Current Stakes</h3>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="current_stakes">
                        <Card.Body className="bg-dark">
                            <this.CurrentStakesTable />
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
                <Card bg="secondary" text="light" className="overflow-auto">
                    <Accordion.Toggle as={Card.Header} eventKey="stake_history">
                        <h3>Stake History</h3>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="stake_history">
                        <Card.Body className="bg-dark">
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

export default Stakes
