import React from 'react'
import { 
    Container,
    Card,
    Table,
    Button,
    Modal,
    Badge,
    Alert,
    OverlayTrigger,
    Tooltip,
    ProgressBar,
    Accordion,
    Form,
    InputGroup,
    FormControl,
    Dropdown,
    DropdownButton,
    Row,
    Col
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'
import HEX from './hex_contract.js'
const debug = require('debug')('Stakes')
debug('loading')
window.BigNumber = BigNumber

/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
 */
const HexNum = (props) => {
    let v = new BigNumber(props.value) 
    if (isNaN(v)) return ( <>NaN</> )

    let unit
    let s
    if (v.lt(1e6) && !v.isZero()) {
        s = format(',')(v.toString())
        unit = props.showUnit && ' Hearts'
    } else {
        v = v.div(1e8)
        unit = props.showUnit && ' HEX'
        if (v.lt(1e3)) s = format(',.3f')(v.toFixed(3, 1)) // don't want Kilo
        else if (v.lt(1e5)) s = format(',.0f')(v.toPrecision(5, 1))   // d3-format cannot be told to floor instead of round. *yawn*
        else if (v.lt(1e6)) s = format(',.0f')(v.toPrecision(6, 1))
        else if (v.lt(1e7)) s = format(',.5s')(v.toPrecision(5, 1))   // Mega  ...
        else if (v.lt(1e8)) s = format(',.5s')(v.toPrecision(6, 1))
        else if (v.lt(1e9)) s = format(',.5s')(v.toPrecision(7, 1))
        else if (v.lt(1e10)) s = format(',.5s')(v.toPrecision(8, 1))  // Giga ...
        else if (v.lt(1e11)) s = format(',.5s')(v.toPrecision(9, 1))
        else if (v.lt(1e12)) s = format(',.5s')(v.toPrecision(10, 1))
        else if (v.lt(1e13)) s = format(',.5s')(v.toPrecision(11, 1))  // Tera ...
        else if (v.lt(1e14)) s = format(',.5s')(v.toPrecision(12, 1))
        else if (v.lt(1e15)) s = format(',.5s')(v.toPrecision(13, 1))
        else if (v.lt(1e16)) s = format(',.5s')(v.toPrecision(14, 1))  // Peta (enough for a Mellowpuff™)
        else if (v.lt(1e17)) s = format(',.5s')(v.toPrecision(15, 1))
        else if (v.lt(1e18)) s = format(',.5s')(v.toPrecision(16, 1))
        else s = format(',.5s')(v.toString())
    }
    
    // fade fractional part (including the period)
    const r = s.match(/^(.*)(\.\d+)(.*)$/) 
    if (r && r.length > 1)
        return ( 
            <div className="numeric">
                { r[1] } 
                <span style={{ opacity: "0.5" }}>
                    { r[2] }
                </span>
                { r[3] && r[3] }
                { unit }
            </div>
        ) 
        else 
            return ( <div className="numeric">{s}{unit}</div> )
}

const WhatIsThis = (props) => {
    return (
        <OverlayTrigger
            show={true}
            placement="top"
            overlay={
                <Tooltip>
                    {props.children}
                </Tooltip>
            }
        >
            <sup><Badge variant="info" pill>?</Badge></sup>
        </OverlayTrigger>
    )
}

class NewStakeForm extends React.Component {
    constructor(props) {
        super(props)
        const _shareRate = props.context.contractData.globals.shareRate || 100000
        const shareRate = new BigNumber('100000').div(_shareRate).times(1e8)
        this.state = {
            availableBalance: new BigNumber(props.context.availableBalance),
            contractData: props.context.contractData,
            stakeAmount: null,
            stakeDays: null,
            lastFullDay: '---',
            endDay: '---',
            longerPaysBetter: new BigNumber(0), // Hearts
            biggerPaysBetter: new BigNumber(0),
            bonusTotal: new BigNumber(0),
            effectiveHEX: new BigNumber(0),
            shareRate,
            stakeShares: new BigNumber(0),
            bigPayDay: new BigNumber(0),
            percentGain: 0.0,
            percentAPY: 0.0
        }
    }

    static getDerivedStateFromProps(newProps, prevState) {
        const _shareRate = newProps.context.contractData.globals.shareRate || 100000
        const shareRate = new BigNumber('100000').div(_shareRate).times(1e8)
        return { 
            availableBalance: new BigNumber(newProps.context.availableBalance),
            contractData: newProps.context.contractData,
            shareRate
        }
    }
    
    render() {

        const currentDay = this.state.contractData.currentDay + 1
        const BigPayDay = HEX.BIG_PAY_DAY

        const updateFigures = () => {
            const stakeDays = this.state.stakeDays || 0
            const stakeAmount = this.state.stakeAmount || new BigNumber(0)

            const { LPB_MAX_DAYS, LPB, BPB_MAX_HEARTS, BPB } = HEX
            /*
            debug('stakeAmount: ', stakeAmount.toString())
            debug('stakeDays: ', stakeDays)
            debug('LPB: ', LPB.toString())
            debug('LPB_MAX_DAYS: ', LPB_MAX_DAYS.toString())
            debug('BPB: ', LPB.toString())
            debug('BPB_MAX_HEARTS: ', BPB_MAX_HEARTS.toString())
            */

            let cappedExtraDays = 0;
            if (stakeDays >  1) {
                cappedExtraDays = stakeDays <= LPB_MAX_DAYS 
                    ? stakeDays - 1 
                    : LPB_MAX_DAYS;
            }
            const longerPaysBetter = stakeAmount.times(cappedExtraDays)
                                            .div(LPB)

            const newStakedHearts = new BigNumber(stakeAmount)
            const cappedStakedHearts = newStakedHearts.lte(BPB_MAX_HEARTS)
                ? newStakedHearts
                : BPB_MAX_HEARTS
            const biggerPaysBetter = stakeAmount.times(cappedStakedHearts)
                                            .idiv(BPB)

            const bonusTotal = longerPaysBetter.plus(biggerPaysBetter)
            const effectiveHEX = stakeAmount.plus(bonusTotal)
            const _shareRate = this.state.contractData.globals.shareRate || 100000
            const shareRate = new BigNumber('100000').div(_shareRate).times(1e8)
            const stakeShares = effectiveHEX.times(shareRate)
            this.setState({
                longerPaysBetter,
                biggerPaysBetter,
                bonusTotal,
                effectiveHEX,
                shareRate,
                stakeShares
            })
        }

        const handleAmountChange = (e) => {
            e.preventDefault()
            const tv = e.target.value
            const m = tv.match(/^[.0-9]+$/)
            const v = m ? new BigNumber(m[0]).times(1e8) : null
            this.setState({
                stakeAmount: v
            }, updateFigures)
        }

        const handleDaysChange = (e) => {
            e.preventDefault()
            let stakeDays = parseInt(e.target.value) || null
            if (stakeDays && stakeDays > 5555) stakeDays = 5555
            this.setState({
                stakeDays,
                lastFullDay: stakeDays ? currentDay + stakeDays : '---',
                endDay: stakeDays ? currentDay + stakeDays + 1 : '---',
            }, updateFigures)
        }
        
        const handleAmountSelector = (key, e) => {
            e.preventDefault()
            e.stopPropagation() // doesn't seem to work :( So, I set eventKey to 'current_stakes' to prevent Accordion from acting on the event. :/
            const portion = parseFloat(e.target.dataset.portion)
            this.setState({ 
                stakeAmount: new BigNumber(this.state.availableBalance.idiv(1e8).times(portion).times(1e8)) 
            }, updateFigures)
        }

        const handleDaysSelector = (key, e) => {
            function plusYears(years) {
                    const n = new Date(Date.now())
                    const d = new Date()
                    d.setYear(n.getFullYear() + years)
                    return Number((d.valueOf() - n.valueOf()) / 1000 / 3600 / 24).toFixed(0)
            }
            function plusMonths(months) {
                    const n = new Date(Date.now())
                    const d = new Date()
                    d.setMonth(n.getMonth() + months)
                    return Number((d.valueOf() - n.valueOf()) / 1000 / 3600 / 24).toFixed(0)
            }

            e.preventDefault()
            e.stopPropagation() // doesn't seem to work :(
            let days
            switch (e.target.dataset.days) {
                case 'max': days = 5555; break;
                case '10y': days = plusYears(10); break;
                case '5y': days = plusYears(5); break;
                case '3y': days = plusYears(3); break;
                case '2y': days = plusYears(2); break;
                case '1y': days = plusYears(1); break;
                case '6m': days = plusMonths(6); break;
                case '3m': days = plusMonths(3); break;
                case '1m': days = plusMonths(1); break;
                case '1w': days = 7; break;
                default: days = 1;
            }

            e.target.value = days
            this.setState({ 
                stakeDays: days
            }, handleDaysChange(e))
        }

        return (
            <Form>
                <Row>
                    <Col md={5}>
                        <Form.Group controlId="stakeAmount">
                            <Form.Label>Stake Amount in HEX</Form.Label> 
                            <InputGroup>
                                <FormControl
                                    type="text"
                                    placeholder="number of HEX to stake"
                                    value={this.state.stakeAmount ? this.state.stakeAmount.div(1e8).toString() : ''}
                                    aria-label="amount to stake"
                                    aria-describedby="basic-addon1"
                                    onChange={handleAmountChange}
                                />
                                <DropdownButton
                                    as={InputGroup.Append}
                                    drop="right"
                                    variant="secondary"
                                    key="percent_balance_selector"
                                    title="HEX"
                                    id="input-group-dropdown-1"
                                    onSelect={handleAmountSelector}
                                    className="numeric"
                                >
                                    <Dropdown.Item as="button" eventKey="new_stake" data-portion={1.00}>MAX</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.75}>75%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.50}>50%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.25}>25%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.10}>10%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.05}>5%</Dropdown.Item>
                                </DropdownButton>
                            </InputGroup>
                            <Form.Text>
                                <span className="text-muted">Bigger pays better</span>
                                <div className="float-right" variant="info" >
                                    <HexNum value={this.state.availableBalance} showUnit /> available
                                </div>
                            </Form.Text>
                        </Form.Group>
                        <Form.Group controlId="stakeDays">
                            <Form.Label>Stake Length in Days</Form.Label>
                            <InputGroup>
                                <FormControl
                                    type="text" 
                                    placeholder="minimum one day" 
                                    value={this.state.stakeDays <= 0 ? '' : this.state.stakeDays}
                                    aria-label="number of days to stake"
                                    onChange={handleDaysChange} 
                                />
                                <DropdownButton
                                    as={InputGroup.Append}
                                    drop="right"
                                    variant="secondary"
                                    key="days_selector"
                                    title="DAYS"
                                    id="input-group-dropdown-2"
                                    onSelect={handleDaysSelector}
                                    className="numeric"
                                >
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="max">MAX (about 15yrs & 11wks)</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="10y">Ten Years</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="5y">Five Years</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="3y">Three Years</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="2y">Two Years</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="1y">One Year</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="6m">Six Months</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="3m">Three Months</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="1m">One Month</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="1w">One Week</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="new_stake" data-days="min">MIN (one day)</Dropdown.Item>
                                </DropdownButton>
                            </InputGroup>
                            <Form.Text className="text-muted">
                                Longer pays better (max 5555)
                            </Form.Text>
                        </Form.Group>
                        <Row>
                            <Col md={6} className="text-right">Start Day</Col>
                            <Col md={3} className="text-right numeric">{ format(',')(currentDay + 1) }</Col>
                        </Row>
                        <Row>
                            <Col md={6} className="text-right">Last Full Day</Col>
                            <Col md={3} className="text-right numeric">{ isNaN(this.state.lastFullDay) ? '---' : format(',')(this.state.lastFullDay) }</Col>
                        </Row>
                        <Row>
                            <Col md={6} className="text-right">End Day</Col>
                            <Col md={3} className="text-right numeric">{ isNaN(this.state.endDay) ? '---' : format(',')(this.state.endDay) }</Col>
                        </Row>
                    </Col>
                    <Col>
                        <Container>
                            <h4>Bonuses</h4>
                            <Row>
                                <Col className="ml-3">Bigger Pays Better</Col>
                                <Col sm={5} className="text-right">+ <HexNum value={this.state.biggerPaysBetter} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="ml-3">Longer Pays Better</Col>
                                <Col sm={5} className="text-right">+ <HexNum value={this.state.longerPaysBetter.toFixed(0)} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="ml-3"><strong>Total</strong></Col>
                                <Col sm={5} className="text-right"><HexNum value={this.state.bonusTotal} /> HEX</Col>
                            </Row>
                            <Row className="mt-2">
                                <Col>
                                    <strong>Effective HEX</strong>
                                    <WhatIsThis>
                                        Effective HEX
                                        <span className="text-success"> = </span>
                                        Stake Amount in HEX
                                        <span className="text-success"> + </span>
                                        Stake Bonuses
                                    </WhatIsThis>
                                    </Col>
                                <Col sm={5} className="text-right"><HexNum value={this.state.effectiveHEX} /> HEX</Col>
                            </Row>
                            <Row className="mt-3">
                                <Col><strong>Share Rate</strong></Col>
                                <Col sm={5} className="text-right"><HexNum value={this.state.shareRate.times(1e8/*fudge non-HEX val for desired display*/)} /> / HEX</Col>
                            </Row>
                            <Row>
                                <Col>
                                    <strong>Stake Shares</strong>
                                    <WhatIsThis>
                                        Stake Shares
                                        <span className="text-success"> = </span>
                                        Effective HEX
                                        <span className="text-success"> x </span>
                                        Stake Bonuses
                                    </WhatIsThis>{' '}
                                </Col>
                                <Col sm={5} className="text-right"><HexNum value={this.state.stakeShares} /></Col>
                            </Row>
                        </Container>

                        { (currentDay < (BigPayDay - 1)) && (
                        <Container className="bg-secondary rounded mt-2 pt-2 pb-2">
                            <Row>
                                <Col>
                                    <strong>
                                        <span className="text-info">Big</span>
                                        <span className="text-warning">Pay</span>
                                        <span className="text-danger">Day</span>
                                    </strong> 
                                    {' '}
                                    <WhatIsThis>
                                        Reduces as others start new stakes.<br/>
                                        Increases as others end their stakes.
                                    </WhatIsThis>
                                </Col>
                                <Col className="text-right"><HexNum value={this.state.bigPayDay} /> HEX</Col>
                            </Row>
                            <Row>
                                <Col>% Gain<span className="text-info">*</span> </Col>
                                <Col className="text-right"><HexNum value={this.state.percentGain} />%</Col>
                            </Row>
                            <Row>
                                <Col>% APY<span className="text-info">*</span></Col>
                                <Col className="text-right"><HexNum value={this.state.percentAPY} />%</Col>
                            </Row>
                            <Row>
                                <Col className="pt-2"><span className="text-info">*</span> <em>If stake still open on BigPayDay</em></Col>
                            </Row>
                        </Container>
                        ) }

                        <Container className="mt-3 text-right"><Button>BEGIN STAKE</Button></Container>
                    </Col>
                </Row>
            </Form>
        )
    }
}
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

    calcBigPayDaySlice = (shares, pool) => {
        return Object.entries(this.state.contractData.globals).length
            ? new BigNumber(this.state.contractData.globals.claimStats.unclaimedSatoshisTotal).times(10000).times(shares).idiv(pool)
            : new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
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
        const { claimedSatoshisTotal, claimedBtcAddrCount } = globals.claimStats

        const stakeData = { ..._stakeData }
        const startDay = stakeData.lockedDay
        const endDay = startDay + stakeData.stakedDays
        if (currentDay === startDay) return

        this.contract.methods.dailyDataRange(startDay, Math.min(currentDay, endDay)).call()
        .then((dailyData) => {

            const calcAdoptionBonus = (bigPayDaySlice) => {
                const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(HEX.CLAIMABLE_BTC_ADDR_COUNT)
                const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(HEX.CLAIMABLE_SATOSHIS_TOTAL)
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

                if (startDay <= HEX.BIG_PAY_DAY && endDay > HEX.BIG_PAY_DAY) {
                    const bigPaySlice = day.unclaimedSatoshisTotal.times(HEX.HEARTS_PER_SATOSHI).times(stakeData.stakeShares).idiv(globals.stakeSharesTotal)
                    const bonuses = calcAdoptionBonus(bigPaySlice)
                    stakeData.bigPayDay = bigPaySlice.plus(bonuses)
                    if (startDay + dayNumber === HEX.BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay.plus(bonuses))
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

    CurrentStakesTable = () => {
        const { 
            START_DATE,
            currentDay
        } = this.state.contractData

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
                            const startDate = new Date(START_DATE)
                            const endDate = new Date(START_DATE)
                            startDate.setDate(startDate.getDate() + startDay)
                            endDate.setDate(endDate.getDate() + endDay)

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
                                            <div>{ startDay }</div>
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
                                            <div>{ endDay }</div>
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

export default Stakes;
