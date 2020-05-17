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
        this.state = {
            address: props.context.walletAddress,
            contract: props.contract,
            contractData: props.context.contractData,
            availableBalance: props.context.walletHEX,
            stakeCount: null,
            stakeList: [ ],
            stakedTotal: new BigNumber(0),
            sharesTotal: new BigNumber(0),
            bpdTotal: new BigNumber(0),
            interestTotal: new BigNumber(0),
            stakeContext: { }, // active UI stake context
            showExitModal: false,
        }
    }

    static getDerivedStateFromProps = (newProps, prevState) => {
        //debug('newProps, prevState: ', newProps.context.walletAddress, prevState.address)
        if (newProps.context.walletAddress !== prevState.address) {
            return Stakes.loadStakes(newProps, prevState)
        } else {
            return { 
                address: newProps.context.walletAddress,
                availableBalance: new BigNumber(newProps.context.walletHEX),
                contractData: newProps.context.contractData,
            }
        }
    }

    static async loadStakes(context) {
        const { contract, address, contractData } = context
        const stakeCount = await contract.methods.stakeCount(address).call()
        const { currentDay } = contractData

        // use Promise.all to load stake data in parallel
        var promises = [ ]
        var stakeList = [ ]
        for (let index = 0; index < stakeCount; index++) {
            promises[index] = new Promise(async (resolve, reject) => { /* see ***, below */ // eslint-disable-line
                const data = await contract.methods.stakeLists(address, index).call()
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
                const payouts = await Stakes.getStakePayoutData(context, stakeData)
                stakeData.payout = payouts.interest
                stakeData.bigPayDay = payouts.bigPayDay

                stakeList = stakeList.concat(stakeData) //*** ESLint complains but it's safe, due to use of non-mutating concat()
                return resolve()
            })
        }
        // Stakes.updateStakePayout(stakeData)
        await Promise.all(promises)
        return stakeList
    }

    static async getStakePayoutData(context, stakeData) {
        const { contract } = context 
        const {
            currentDay, 
            allocatedSupply, 
            globals 
        } = context.contractData

        const startDay = stakeData.lockedDay
        const endDay = startDay + stakeData.stakedDays
        if (currentDay === startDay) return

        const dailyData = await contract.methods.dailyDataRange(startDay, Math.min(currentDay, endDay)).call()

        // iterate over daily payouts history
        let interest = new BigNumber(0)

        // extract dailyData struct from uint256 mapping
        dailyData.forEach((mapped_dailyData, dayNumber) => {
            const hex = new BigNumber(mapped_dailyData).toString(16).padStart(64, '0')
            const day = {
                payoutTotal: new BigNumber(hex.slice(46,64), 16),
                stakeSharesTotal: new BigNumber(hex.slice(28,46), 16),
                unclaimedSatoshisTotal: new BigNumber(hex.slice(12,28), 16)
            }
            const payout = day.payoutTotal.times(stakeData.stakeShares).idiv(day.stakeSharesTotal)
            interest = interest.plus(payout)
        })

        // Calculate our share of Daily Interest (for the current day)

        // HEX mints 0.009955% daily interest (3.69%pa) and stakers get adoption bonuses from that, each day
        const dailyInterestTotal = allocatedSupply.times(10000).idiv(100448995) // .sol line: 1243 
        const interestShare = stakeData.stakeShares.times(dailyInterestTotal).idiv(globals.stakeSharesTotal)

        // add our doption Bonus
        const interestBonus = calcAdoptionBonus(interestShare, globals)
        
        // add interest (with adoption bonus) to stake's payout total 
        interest = interest.plus(interestShare).plus(interestBonus)

        let bigPayDay = new BigNumber(0)
        if (startDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
            const bigPaySlice = calcBigPayDaySlice(stakeData.stakeShares, globals.stakeSharesTotal, globals)
            const bonuses = calcAdoptionBonus(bigPaySlice, globals)
            bigPayDay = bigPaySlice.plus(bonuses)
            if ( currentDay >= HEX.BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay)
            // TODO: penalties have to come off for late End Stake
        }

        return { interest, bigPayDay }
    }

    componentDidMount = async () => {
        const stakeList = await Stakes.loadStakes(this.state)
        this.setState({ stakeList }) // : [ ...stakeList ] })
    }

    CurrentStakesTable = () => {
        const { currentDay } = this.state.contractData

        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }

        const stakeList = this.state.stakeList.slice()
        const sorted = stakeList.sort((a, b) => (a.progress < b.progress ? (a.progress !== b.progress ? 1 : 0) : -1 ))
        debug('SORTED?: ', sorted)

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
                        stakeList.map((stakeData) => {
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
                                <tr key={stakeData.stakeId}><td colSpan="5">loading</td></tr>
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
