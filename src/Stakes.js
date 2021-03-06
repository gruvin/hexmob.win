import React from 'react'
import { 
    Container,
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
import { calcBigPayDaySlice, calcAdoptionBonus, calcInterest, calcApy } from './util'
import { NewStakeForm } from './NewStakeForm' 
import { CryptoVal, BurgerHeading } from './Widgets' 
import { StakeInfo } from './StakeInfo'
import BitSet from 'bitset'
const { format } = require('d3-format')

const debug = require('debug')('Stakes')

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            selectedCard: "current_stakes",
            stakeCount: null,
            stakeList: null,
            loadingStakes: true,
            stakeContext: { }, // active UI stake context
            showExitModal: false,
            currentDay: '---',
            pastStakesSortKey: { keyField: '', dir: -1 },
            totalValue: new BigNumber(0),
        }
    }

    unsubscribeEvents = () => {
        try { this.props.contract.clearSubscriptions()} catch(e) { }
    }

    handleSubscriptionError = (e, r) => {
        debug("websock subscription error: ", e)
    }

    subscribeEvents = () => {
        this.props.contract.events.StakeStart( {filter:{stakerAddr:this.props.wallet.address}}, (e, r) => {
        if (e) { debug('ERR: events.StakeStart: ', e); return; }
            debug('events.StakeStart[e, r]: ', e, r)
            debug('CALLING loadAllStakes: this.props.wallet: %O', this.props.wallet)
            this.loadAllStakes()
        })
        .on('connected', id => debug('subbed: StakeStart:', id))
        .on('error', this.handleSubscriptionError)

        this.props.contract.events.StakeEnd({ filter:{ stakerAddr: this.props.wallet.address } }, (e, r) => {
            if (e) { debug('ERR: events.StakeEnd:', e); return; }
            debug('events.StakeEnd[e, r]: ', e, r)
            debug('CALLING loadAllStakes: this.props.wallet: %O', this.props.wallet)
            this.loadAllStakes()
        })
        .on('connected', id => debug('subbed: StakeEnd:', id))
        .on('error', this.handleSubscriptionError)
    }

    static async getStakePayoutData(context, stakeData) {
        const { contract } = context 
        const {
            currentDay, 
            allocatedSupply, 
            globals 
        } = contract.Data

        const startDay = stakeData.lockedDay
        const stakedDays = stakeData.stakedDays
        const endDay = startDay + stakedDays

        if (startDay > currentDay) {
            const z = BigNumber(0)
            return { payout: z, bigPayDay: z, penalty: z, penaltyDelta: z }
        }

        const dailyDataCount = globals.dailyDataCount.toNumber()
        const dailyData = await contract.methods.dailyDataRange(startDay, Math.min(dailyDataCount, endDay)).call()

        function _calcPartDayBonuses()  {
            // Calculate our share of Daily Interest ___for the current (incomplete) day___
            // HEX mints 0.009955% daily interest (3.69%pa) and stakers get adoption bonuses from that, each day
            // .sol:1245:  rs._payoutTotal = rs._allocSupplyCached * 10000 / 100448995
            const dailyInterestTotal = allocatedSupply.times(10000).idiv(100448995)
            const interestShare = dailyInterestTotal.times(stakeData.stakeShares).idiv(globals.stakeSharesTotal)
            const interestBonus = (currentDay < HEX.CLAIM_PHASE_END_DAY) ? calcAdoptionBonus(interestShare, globals) : 0
            return interestShare.plus(interestBonus)
        }

        function _calcPayoutRewards(dayStartIndex, dayEndIndex) {

            let payout = BigNumber(0)
            let bigPayDay = BigNumber(0)

            for (let index = dayStartIndex; index < dayEndIndex; index++) {
                const data = new BigNumber(dailyData[index]).toString(16).padStart(64, '0')
                const day = { // extract dailyData struct from uint256 mapping
                    payoutTotal: new BigNumber(data.slice(46,64), 16),
                    stakeSharesTotal: new BigNumber(data.slice(28,46), 16),
                    unclaimedSatoshisTotal: new BigNumber(data.slice(12,28), 16)
                }
                const dayPayout = day.payoutTotal
                    .times(stakeData.stakeShares)
                    .idiv(day.stakeSharesTotal) // .sol line: 1586

                payout = payout.plus(dayPayout)
            }

            payout = payout.plus(_calcPartDayBonuses())

            if (startDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
                const bpdStakeSharesTotal = (currentDay < 352) // day is zero based internally
                    ? globals.stakeSharesTotal // prior to BPD 
                    : new BigNumber("50499329839740027369", 10) // value on BPD (day 353). Never gonna change so don't waste bw looking it up

                const bigPaySlice = calcBigPayDaySlice(stakeData.stakeShares, bpdStakeSharesTotal, globals)
                const bonuses = calcAdoptionBonus(bigPaySlice, globals)
                bigPayDay = bigPaySlice.plus(bonuses)
                if ( currentDay >= HEX.BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay)
            }
            return { payout, bigPayDay }
        }
        
        let payout = BigNumber(0)
        let bigPayDay = BigNumber(0)
        let penalty = BigNumber(0)

        const daysServed = Math.min(currentDay - startDay, stakedDays)
        
        if (daysServed < stakedDays) {

            const penaltyDays = Math.max(90, Math.ceil(stakedDays / 2))

            if (daysServed === 0) {

                penalty = _calcPartDayBonuses().times(penaltyDays)

            } else if (penaltyDays < daysServed) {

                const _penalty = _calcPayoutRewards(0, penaltyDays)
                const _penaltyDelta = _calcPayoutRewards(penaltyDays, dailyData.length-1)

                payout = _penalty.payout.plus(_penaltyDelta.payout)
                bigPayDay = _penalty.bigPayDay.plus(_penaltyDelta.bigPayDay)
                penalty = _penalty.payout.plus(_penalty.bigPayDay)

            } else {
                // penaltyDays >= servedDays        
                const _interest = _calcPayoutRewards(0, dailyData.length-1)

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
            const _interest = _calcPayoutRewards(0, dailyData.length-1)
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
        }
        // debug("PENALTY: $", format(",.2f")(penalty.div(1E8).times(0.086).toFixed(0)))
        return {
            payout,
            bigPayDay,
            penalty,
        }
        
        // TODO: LATE END-STAKE PENALTY

    }

    static async loadStakes(context) {
        const { contract, address } = context
        const { currentDay } = contract.Data
        debug('Loading stakes for address: ', address)
        if (!address) {
            debug(`WARNING: loadStakes() : invalid (null?) context.address`)
            return null
        }
        let stakeCount
        try {
            stakeCount = await contract.methods.stakeCount(address).call()
        } catch (e) {
            debug("WARNING: loadStakes()::[hex]stakeCount [address = %o] - %s", address, e.message)
            return
        }

        // use Promise.all to load stake data in parallel
        var promises = [ ]
        var stakeList = [ ]
        for (let index = 0; index < stakeCount; index++) {
            promises[index] = new Promise(async (resolve, reject) => { /* see ***, below */ // eslint-disable-line
                // it can happen that stakeCount increases to a new pending stake but our data source
                // hasn't seen it yet. Fail silently if we ask for an index that doesn't (yet) exist
                try {
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
                        // // debug XXX
                        // const debugStake = {
                        //     stakedHearts: BigNumber("269000").times(1E8),
                        //     lockedDay: (588-99),
                        //     startDay: (588-99),
                        //     stakedDays: 5555,
                        //     endDay: (588-99+5555),
                        //     stakeShares: BigNumber(46.8).times(1E12),
                        //     payout: BigNumber(2360).div(0.086).times(1E8),
                        //     bigPayDay: BigNumber(0),
                        //     penalty: BigNumber(0),
                        //     unlockedDay: 0,
                        // }
                        // stakeData = { ...stakeData, ...debugStake }
                        try {
                            const payouts = await Stakes.getStakePayoutData(context, stakeData)
                            stakeData = { ...stakeData, ...payouts }
                        } catch(e) {
                            debug(`WARNING: loadStakes() : getStakePayoutData(address, index) ${e.message}`)
                        }
                    }

                    stakeList = stakeList.concat(stakeData) //*** ESLint complains but it's safe, because non-mutating concat()

                } catch(e) {
                    debug(`WARNING: loadStakes() : stakeLists(address, index) ${e.message}`)
                }
                return resolve()
            })
        }
        await Promise.all(promises)

        return stakeList
    }

    getStaticContext = (publicAddress) => {
        const address = publicAddress || this.props.wallet.address
        const { contract } = this.props
        return { contract, address }
    }

    loadAllStakes = async (publicAddress) => {
        this.setState({ loadingStakes: true })
        const address = publicAddress || null
        const stakeList = await Stakes.loadStakes(this.getStaticContext(address))
        if (stakeList) {
            let totalValue = new BigNumber(0)
            stakeList.forEach(stakeData => {
                const interest = stakeData.payout.plus(stakeData.bigPayDay)
                totalValue = totalValue.plus(interest).plus(stakeData.stakedHearts)
            })
            this.setState({ 
                loadingStakes: false,
                stakeList,
                totalValue
            })
        }
    }

    loadStakeHistory = (publicAddress) => {
        const { contract, address } = this.getStaticContext(publicAddress)
        /* 
        uint40            timestamp       -->  data0 [ 39:  0]
        address  indexed  stakerAddr
        uint40   indexed  stakeId
        uint72            stakedHearts    -->  data0 [111: 40]
        uint72            stakeShares     -->  data0 [183:112]
        uint72            payout          -->  data0 [255:184]
        uint72            penalty         -->  data1 [ 71:  0]
        uint16            servedDays      -->  data1 [ 87: 72]
        bool              prevUnlocked    -->  data1 [ 95: 88]
        */
        this.setState({ pastStakes: [ ] }, () => {
            contract.getPastEvents('StakeEnd',{ 
                fromBlock: 'earliest', 
                filter: { stakerAddr: address }
            }).then(results => {
                const pastStakes = results.map(data => {
                    const { returnValues:r } = data
                    const data0 = new BitSet.fromBinaryString(BigNumber(r.data0).toString(2))
                    const data1 = new BitSet.fromBinaryString(BigNumber(r.data1).toString(2))
                    data0.set(256)
                    data1.set(256)
                    return {
                        timestamp:      Number(     data0.slice(  40, 111 ).toString(10)),
                        stakerAddr:     r.stakerAddr,
                        stakeId:        r.stakeId,
                        stakedHearts:   BigNumber(  data0.slice( 40, 111).toString(10)),
                        stakeShares:    BigNumber(  data0.slice(112, 183).toString(10)),
                        payout:         BigNumber(  data1.slice(184, 255).toString(10)),
                        penalty:        BigNumber(  data1.slice(  0,  71).toString(10)),
                        servedDays:     Number(     data1.slice( 72,  87).toString(10)),
                        prevUnlocked:   Boolean(    data1.slice( 88,  95).toString(10))
                    }
                })
                //debug('PAST_STAKES: %O', pastStakes)
                this.setState({ pastStakes })
            })
        })
    }

    componentDidMount() {
        if (localStorage.getItem('debug')) window._STAKES = this
        if (window.location.pathname === "/stakes") this.setState({ selectedCard: "current_stakes" })
        Promise.all([
            this.loadAllStakes(this.props.publicAddress || null),
            this.loadStakeHistory(this.props.publicAddress || null),
            this.subscribeEvents(),
        ])
    }

    componentDidUpdate = async (prevProps, prevState) => {
        if (prevProps.wallet.address !== this.props.wallet.address) {
            await this.loadAllStakes(this.props.publicAddress || null)
        } else return null
    }

    componentWillUnmount() {
        this.unsubscribeEvents()
    }

    StakesList = (params) => {
        const { currentDay } = this.props.contract.Data
        const stakeList = this.state.stakeList.slice() || null
        stakeList && stakeList.sort((a, b) => (a.progress < b.progress ? (a.progress !== b.progress ? 1 : 0) : -1 ))

        let stakedTotal = new BigNumber(0)
        let sharesTotal = new BigNumber(0)
        let interestTotal = new BigNumber(0)
        let bigPayDayTotal = new BigNumber(0)
        let percentGainTotal = new BigNumber(0)
        let percentAPYTotal = new BigNumber(0)

        if (this.state.loadingStakes)
            return ( <p>loading ...</p> )
        else if (!stakeList.length)
            return ( <p>no stake data found for this address</p> )

        const stakeListOutput = stakeList.map((stakeData) => {
            // debug('stakeData: %o', stakeData)
            const startDay = Number(stakeData.lockedDay)
            const endDay = startDay + Number(stakeData.stakedDays)

            const _startDate = new Date(HEX.START_DATE)
            const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
            const startDate = _startDate.toLocaleDateString()
            const endDate = _endDate.toLocaleDateString()

            const interest = stakeData.payout
            const bigPayDay = stakeData.bigPayDay

            stakedTotal = stakedTotal.plus(stakeData.stakedHearts)
            sharesTotal = sharesTotal.plus(stakeData.stakeShares)
            bigPayDayTotal = bigPayDayTotal.plus(stakeData.bigPayDay)
            interestTotal = interestTotal.plus(interest)

            const stake = {
                startDay,
                endDay,
                startDate,
                endDate,
                ...stakeData,
                interest,
                bigPayDay,
            }

            const percentGain = calcInterest(stake) // 1 == 1%
            const percentAPY = calcApy(currentDay, stake)
                percentGainTotal = percentGainTotal.plus(percentGain)
            percentAPYTotal = percentAPYTotal.plus(percentAPY)

            return stake
        })
        const averagePercentGain = percentGainTotal.div(stakeListOutput.length)
        const averagePercentAPY = percentAPYTotal.div(stakeListOutput.length)

        const numStakes = stakeList.length

        return (
        <>
            <Card xs={12} sm={6} className="mt-2 bg-info-darkened rounded">
                <Card.Body className="p-1 rounded text-light">
                    <h2 className="text-center">Stake Totals Summary</h2>
                    <Row>
                        <Col className="text-right font-weight-bold">Staked</Col>
                        <Col><CryptoVal className="numeric" value={stakedTotal} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-right font-weight-bold">Shares</Col>
                        <Col><CryptoVal className="numeric" value={sharesTotal.times(1e8)} /></Col>
                    </Row>
                    { bigPayDayTotal.gt(0) &&
                    <Row>
                        <Col className="text-right font-weight-bold">
                            <span className="text-info">Big</span>
                            <span className="text-warning">Pay</span>
                            <span className="text-danger">Day</span>
                        </Col>
                        <Col><CryptoVal className="numeric" value={bigPayDayTotal} showUnit /></Col>
                    </Row>
                    }
                    <Row>
                        <Col className="text-right font-weight-bold">Interest</Col>
                        <Col><CryptoVal className="numeric" value={interestTotal} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-right font-weight-bold">Total Value</Col>
                        <Col>
                            <CryptoVal 
                                className="numeric font-weight-bold" 
                                value={stakedTotal.plus(bigPayDayTotal).plus(interestTotal)} showUnit
                            />
                        </Col>
                    </Row>
                    <Row className="text-success">
                        <Col className="text-success text-right font-weight-bold">USD Value</Col>
                        <Col className="text-success numeric font-weight-bold">{"$"+format(",.2f")(this.state.totalValue.idiv(1E8).times(this.props.usdhex).toNumber())}</Col>
                    </Row>
                    <Row className="mt-2">
                        <Col className="text-right font-weight-bold">Average Gain</Col>
                        <Col className="numeric">{averagePercentGain.toFixed(2)}%</Col>
                    </Row>
                    <Row>
                        <Col className="text-right font-weight-bold">Average APY</Col>
                        <Col>{averagePercentAPY.toFixed(2)}%</Col>
                    </Row>
                </Card.Body>
            </Card>
            <Card className="mt-2 text-light bg-success-darkened rounded">
                <Card.Body>
                    <h2 className="text-center">{numStakes || "No"} Active Stake{numStakes > 1 && <>s</>}</h2>
                    <div className="text-center small">tap each stake for more detail</div>
                    {stakeListOutput.map((stakeData) => {
                        return (
                            <StakeInfo 
                                key={stakeData.stakeId}
                                contract={window.contract} 
                                stake={stakeData}
                                reloadStakes={this.loadAllStakes}
                                usdhex={this.props.usdhex}
                                readOnly={this.props.publicAddress}
                            />
                        )
                    })}
                </Card.Body>
            </Card>
        </>
        )
    }

    sortPastStakesStateByField = (keyField) => {
        const { keyField:oldKey, dir:oldDir } = this.state.pastStakesSortKey
        const dir = (oldKey === keyField) ? -oldDir : -1
        const pastStakesSortKey = { keyField, dir }
        this.setState({
            pastStakesSortKey,
            pastStakes: [ ...this.state.pastStakes ].sort((a, b) => {
                const bn_a = BigNumber(a[keyField])
                const bn_b = BigNumber(b[keyField])
                return dir * (bn_a.lt(bn_b) ? -1 : bn_a.gt(bn_b) ? 1 : 0)
            })
        })
    }

    StakesHistory = () => {
        const { pastStakes } = this.state || null
        if (!pastStakes) return ( <>loading</> )

        const handleSortSelection = (e) => {
            e.preventDefault()
            e.stopPropagation()
            const hash = e.target.closest('a').hash
            const keyField = hash.match(/sort_(.+)$/)[1] || null
            debug('keyField: ', keyField)
            keyField && this.sortPastStakesStateByField(keyField)
        }

        return (
            <Container className="p-0 row-highlight-even">
                <Row className="p-0 my-2 mx-0 xs-small text-right font-weight-bold">
                    <Col xs={2} sm={2} className="p-0 text-center">
                        <a href="#sort_servedDays" onClick={handleSortSelection}>
                            Days<span className="d-none d-md-inline"> Served</span>
                        </a>
                    </Col>
                    <Col xs={3} sm={3} className="p-0">
                        <a href="#sort_stakedHearts" onClick={handleSortSelection}>
                            Stake<span className="d-none d-sm-inline">d Amount</span>
                        </a>
                    </Col>
                    <Col xs={3} sm={3} className="p-0"><a href="#sort_stakeShares" onClick={handleSortSelection}>Shares</a></Col>
                    <Col xs={3} sm={3} className="p-0"><a href="#sort_penalty" onClick={handleSortSelection}>Penalty</a></Col>
                </Row>
            {pastStakes && pastStakes.map(stake => {
                return (
                    <Row key={stake.stakeId} className="p-0 m-0 xs-small text-right">
                        <Col xs={2} sm={2} className="p-0 text-center">{stake.servedDays}</Col>
                        <Col xs={3} sm={3} className="p-0"><CryptoVal className="numeric" value={stake.stakedHearts} showUnit /></Col>
                        <Col xs={3} sm={3} className="p-0"><CryptoVal className="numeric" value={stake.stakeShares.times(1e8)} /></Col>
                        <Col xs={3} sm={3} className="p-0"><CryptoVal className="numeric" value={stake.penalty} showUnit /></Col>
                    </Row>
                )
            })
            }
            </Container>
        )
    }

    render() { // class Stakes
        const { currentDay } = this.props.contract.Data
        
        const handleClose = () => this.setState({ showExitModal: false })

        const thisStake = this.state.stakeContext // if any
        const IsEarlyExit = (thisStake.stakeId && currentDay < (thisStake.lockedDay + thisStake.stakedDays)) 

        return (
            !this.state.stakeList
                ? <ProgressBar variant="secondary" animated now={90} label="loading contract data" className="mt-3" />
                : <> 
            <Accordion 
                id='stakes_accordion'
                className="text-left"
                defaultActiveKey={this.props.openActive ? this.state.selectedCard : ""}
            >
            {!this.props.publicAddress && // NewStakeForm not shown for read only ?address=
                <Card className="new-stake" text="light pt-0">
                    <Accordion.Toggle as={Card.Header} eventKey="new_stake">
                        <BurgerHeading className="float-left">
                            Stake HEX
                            <span className="d-none d-sm-inline"> to Mint Shares</span>
                        </BurgerHeading>
                        <div className="float-right pr-1 text-success">
                             <span className="text-muted small">AVAILABLE </span>
                             <CryptoVal className="numeric font-weight-bold" value={this.props.wallet.balance} showUnit />
                        </div>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="new_stake">
                        <Card.Body>
                            <NewStakeForm 
                                contract={window.contract} 
                                wallet={this.props.wallet} 
                                reloadStakes={this.loadAllStakes}
                            />
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
            }
                <Card text="light" className={"active-stakes "+this.props.className}>
                {this.props.publicAddress && 
                    <div className="px-1 text-light text-center small">                        
                        <span className="text-muted">{this.props.publicName || "address"} </span>{this.props.publicAddress}
                    </div>
                }
                    <Accordion.Toggle as={Card.Header} eventKey="current_stakes">
                        <BurgerHeading>Active Stakes</BurgerHeading>
                        <div className="float-right pr-1 text-success">
                            <span className="text-muted small mr-1">USD</span>
                            <span className="numeric h2 font-weight-bold">
                                { "$"+format(",.2f")(this.state.totalValue.idiv(1E8).times(this.props.usdhex).toNumber())}
                            </span>
                        </div>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="current_stakes">
                        <Card.Body className="p-0">
                            <this.StakesList/>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
                <Card className="stake-history text-light pb-0">
                    <Accordion.Toggle as={Card.Header} eventKey="stake_history">
                        <BurgerHeading>Stake History</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="stake_history">
                        <Card.Body>
                            <this.StakesHistory />
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
