import React from 'react'
import { 
    Row, Col,
    Card,
    Button,
    Modal,
    Alert,
    ProgressBar,
    Accordion,
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import HEX from './hex_contract'
import { calcBigPayDaySlice, calcAdoptionBonus } from './util'
import  NewStakeForm from './NewStakeForm' 
import { CryptoVal, BurgerHeading } from './Widgets' 
import { StakeInfo } from './StakeInfo'
import crypto from 'crypto'

const debug = require('debug')('Stakes')
debug('loading')

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.loggedEvents = [ ]
        this.state = {
            selectedCard: 'current_stakes',
            // selectedCard: 'new_stake',
            stakeCount: null,
            stakeList: null,
            loadingStakes: true,
            stakeContext: { }, // active UI stake context
            showExitModal: false
        }

        window._STAKES = this // DEBUG REMOVE ME
    }

    static async getStakePayoutData(context, stakeData) {
        const { contract } = context 
        const {
            currentDay, 
            allocatedSupply, 
            globals 
        } = contract.Data

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

    addToEventLog = (s) => {
        this.loggedEvents = this.loggedEvents.concat(crypto.createHash('sha1').update(s).digest('hex'))
    }
    existsInEventLog = (s) => {
        return this.loggedEvents.includes(crypto.createHash('sha1').update(s).digest('hex'))
    }

    subscribeEvents = async () => {
        await this.props.contract.events.StakeEnd( {filter:{stakerAddr:this.props.wallet.address}}, async (e, r) => {
            if (e) { 
                debug('ERR: events.StakeEnd:', e) 
                return
            }
            debug('events.StakeEnd[e, r]: ', e, r)

            const { id, blockHash, removed, stakeId } = r.returnValues
            if (this.existsInEventLog(id+blockHash+removed+stakeId)) return
            this.addToEventLog(id+blockHash+removed+stakeId)

            debug('CALLING loadAllStakes: this.props.wallet: %O', this.props.wallet)
            await this.loadAllStakes(this)
        })
        .on('connected', (id) => debug('sub: StakeEnd:', id))
        await this.props.contract.events.StakeStart( {filter:{stakerAddr:this.props.wallet.address}}, async (e, r) => {
            if (e) { 
                debug('ERR: events.StakeStart: ', e) 
                return
            }
            debug('events.StakeStart[e, r]: ', e, r)

            const { id, blockHash, removed, stakeId } = r.returnValues
            if (this.existsInEventLog(id+blockHash+removed+stakeId)) return
            this.addToEventLog(id+blockHash+removed+stakeId)

            debug('CALLING loadAllStakes: this.props.wallet: %O', this.props.wallet)
            await this.loadAllStakes(this)
            this.setState({ selectedCard: 'current_stakes' })
        })
        .on('connected', (id) => debug('sub: StakeStart:', id))
    }

    unsubscribeEvents = () => {
        this.web3 && this.web3.shh && this.web3.shh.clearSubscriptions()
        this.web3 && this.web3.eth && this.web3.eth.clearSubscriptions()
    }

    static async loadStakes(context) {
        const { contract, address } = context
        const { currentDay } = contract.Data
        if (!address) {
            debug('******* loadStakes[] called with invalid address ********')
            return null
        }
        debug('Loading stakes for address: ', address)
        const stakeCount = await contract.methods.stakeCount(address).call()

        // use Promise.all to load stake data in parallel
        var promises = [ ]
        var stakeList = [ ]
        for (let index = 0; index < stakeCount; index++) {
            promises[index] = new Promise(async (resolve, reject) => { /* see ***, below */ // eslint-disable-line
                const data = await contract.methods.stakeLists(address, index).call()

                const progress = (currentDay < data.lockedDay) ? 0
                    : Math.trunc(Math.min((currentDay - data.lockedDay) / data.stakedDays * 100000, 100000))

                let stakeData = {
                    stakeOwner: context.address,
                    stakeIndex: index,
                    stakeId: data.stakeId,
                    lockedDay: Number(data.lockedDay),
                    stakedDays: Number(data.stakedDays),
                    stakedHearts: new BigNumber(data.stakedHearts),
                    stakeShares: new BigNumber(data.stakeShares),
                    unlockedDay: Number(data.unlockedDay),
                    isAutoStake: Boolean(data.isAutoStakte),
                    progress,
                    bigPayDay: new BigNumber(0),
                    payout: new BigNumber(0)
                }
                if (currentDay >= stakeData.lockedDay + 1) { // no payouts when pending or until day 2 into term
                    const payouts = await Stakes.getStakePayoutData(context, stakeData)
                    if (payouts) { // just in case
                        stakeData.payout = payouts.interest
                        stakeData.bigPayDay = payouts.bigPayDay
                    }
                }

                stakeList = stakeList.concat(stakeData) //*** ESLint complains but it's safe, because non-mutating concat()
                return resolve()
            })
        }
        // Stakes.updateStakePayout(stakeData)
        await Promise.all(promises)
        return stakeList
    }

    getStaticContext = () => {
        debug('getStaticContext::assert this === window._STAKES: ', (this === window._STAKES)) 
        const { contract } = this.props
        const { address } = this.props.wallet
        return { contract, address }
    }

    loadAllStakes = async (context) => {
        debug('loadAllStakes::assert this === window._STAKES: ', (this === window._STAKES)) 
        await this.setState({ loadingStakes: true })
        const stakeList = await Stakes.loadStakes(this.getStaticContext())
        stakeList && this.setState({ stakeList, loadingStakes: false })
    }

    componentDidMount = async () => {
       await this.loadAllStakes()
       await this.subscribeEvents()
    }

    componentDidUpdate = async (prevProps, prevState) => {
        if (prevProps.wallet.address !== this.props.wallet.address) {
            await this.loadAllStakes()
        }
    }

    componentWillUnmount() {
        this.unsubscribeEvents()
    }

    // start/end stake event call come here from new_stakes or StakeInfo.js
    eventCallback = (eventName, data) => {
        debug('Stakes.js::eventCallback:', eventName, data)
    }

    StakesList = (params) => {
        const stakeList = this.state.stakeList.slice() || null
        stakeList && stakeList.sort((a, b) => (a.progress < b.progress ? (a.progress !== b.progress ? 1 : 0) : -1 ))

        let stakedTotal = new BigNumber(0)
        let sharesTotal = new BigNumber(0)
        let bpdTotal = new BigNumber(0)
        let interestTotal = new BigNumber(0)

        if (this.state.loadingStakes)
            return ( <p>loading ...</p> )
        else if (!stakeList.length)
            return ( <p>no stake data found for this address</p> )
        else
            return (
            <>
                {
                    stakeList.map((stakeData) => {
                        const startDay = Number(stakeData.lockedDay)
                        const endDay = startDay + Number(stakeData.stakedDays)
                        const startDate = new Date(HEX.START_DATE) // UTC but is converted to local
                        const endDate = new Date(HEX.START_DATE)
                        startDate.setUTCDate(startDate.getUTCDate() + startDay)
                        endDate.setUTCDate(endDate.getUTCDate() + endDay)
                        stakedTotal = stakedTotal.plus(stakeData.stakedHearts)
                        sharesTotal = sharesTotal.plus(stakeData.stakeShares)
                        bpdTotal = bpdTotal.plus(stakeData.bigPayDay)
                        interestTotal = interestTotal.plus(stakeData.payout)
                        const stake = {
                            ...stakeData,
                            startDay,
                            endDay,
                            startDate,
                            endDate
                        }
                        return (
                            <StakeInfo 
                                key={stakeData.stakeId}
                                contract={this.props.contract} 
                                stake={stake} 
                                eventCallback={params.eventCallback} 
                                reloadStakes={this.loadAllStakes}
                            />
                        )
                    })
                }
                <Card xs={12} sm={6} bg="dark" className="m-0 p-1">
                    <Card.Header className="bg-dark p-1 text-center text-info"><strong>Stake Totals</strong></Card.Header>
                    <Card.Body className="bg-dark p-1 rounded">
                        <Row>
                            <Col className="text-right"><strong>Staked</strong></Col>
                            <Col><CryptoVal value={stakedTotal} showUnit /></Col>
                        </Row>
                        <Row>
                            <Col className="text-right"><strong>Shares</strong></Col>
                            <Col><CryptoVal value={sharesTotal.times(1e8)} /></Col>
                        </Row>
                        <Row>
                            <Col className="text-right"><strong>BigPayDay</strong></Col>
                            <Col><CryptoVal value={bpdTotal} showUnit /></Col>
                        </Row>
                        <Row>
                            <Col className="text-right"><strong>Interest</strong></Col>
                            <Col><CryptoVal value={interestTotal} showUnit /></Col>
                        </Row>
                    </Card.Body>
                </Card>
            </>
        )
    }

    render() { // class Stakes
        const { currentDay } = this.props.contract.Data
        
        const handleClose = () => this.setState({ showExitModal: false })

        const thisStake = this.state.stakeContext // if any
        const IsEarlyExit = (thisStake.stakeId && currentDay < (thisStake.lockedDay + thisStake.stakedDays)) 

        const handleAccordionSelect = (selectedCard) => {
//            selectedCard && this.setState({ selectedCard })
        //    this.setState({ selectedCard })
        }

        return (
            !this.state.stakeList
                ? <ProgressBar variant="secondary" animated now={90} label="loading contract data" />
                : <> 
            <Accordion 
                id='stakes_accordion'
                className="text-left"
                defaultActiveKey={this.state.selectedCard}
                onSelect={handleAccordionSelect}
            >
                <Card bg="secondary" text="light">
                    <Accordion.Toggle as={Card.Header} eventKey="new_stake">
                        <BurgerHeading className="float-left">New Stake </BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="new_stake">
                        <Card.Body>
                            <NewStakeForm 
                                contract={this.props.contract} 
                                wallet={this.props.wallet} 
                                reloadStakes={this.loadAllStakes}
                            />
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
                <Card bg="secondary" text="light">
                    <Accordion.Toggle as={Card.Header} eventKey="current_stakes">
                        <BurgerHeading>Current Stakes</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="current_stakes">
                        <Card.Body>
                            <this.StakesList eventCallback={this.eventCallback}/>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
                <Card bg="secondary" text="light">
                    <Accordion.Toggle as={Card.Header} eventKey="stake_history">
                        <BurgerHeading>Stake History</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="stake_history">
                        <Card.Body>
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
                    { IsEarlyExit 
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
                    { IsEarlyExit 
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
