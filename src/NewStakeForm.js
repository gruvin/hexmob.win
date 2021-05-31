import React from 'react'
import { 
    Container,
    Form,
    FormControl,
    InputGroup,
    Dropdown,
    DropdownButton,
    Row,
    Col
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import HEX from './hex_contract'
import { calcBigPayDaySlice, calcAdoptionBonus } from './util'
import { CryptoVal, WhatIsThis, VoodooButton } from './Widgets' 
import { ResponsiveContainer, Bar, BarChart, Label, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
const axios = require('axios').create({
    baseURL: '/',
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json"},
});

const debug = require('debug')('NewStakeForm')
debug('loading')

export class NewStakeForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            stakeAmount: '',
            stakeDays: '',
            longerPaysBetter: BigNumber(0), // Hearts
            biggerPaysBetter: BigNumber(0),
            bonusTotal: BigNumber(0),
            effectiveHEX: BigNumber(0),
            stakeShares: BigNumber(0),
            shareRate: BigNumber(10000),
            bigPayDay: BigNumber(0),
            percentGain: 0.0,
            percentAPY: 0.0,
            data: [],
            graphIconClass: "" // App.scss:  .icon-wait-bg / .icon-error-bg
        }
    }

    async componentDidMount() {
        if (process.env.NODE_ENV === "development") window._NEW = this
        const shareRate = this.props.contract.Data.globals.shareRate.div(10) || BigNumber(10000)
        this.setState({ shareRate })
    }

    resetForm = () => {
        document.getElementById('stake_amount').value = ''
        document.getElementById('stake_days').value = ''
        this.setState({ stakeAmount: null, stakeDays: null })
        this.updateFigures()
    }

    updateFigures = () => {
        const { currentDay, globals } = this.props.contract.Data

        let { stakeDays, stakeAmount } = this.state
        stakeDays = parseInt(this.state.stakeDays) || 0
        stakeAmount = BigNumber(stakeAmount).times(1e8)
        if (stakeAmount.isNaN()) stakeAmount = BigNumber(0)

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

        const newStakedHearts = BigNumber(stakeAmount)
        const cappedStakedHearts = newStakedHearts.lte(BPB_MAX_HEARTS)
            ? newStakedHearts
            : BPB_MAX_HEARTS
        const biggerPaysBetter = stakeAmount.times(cappedStakedHearts)
            .idiv(BPB)

        const bonusTotal = longerPaysBetter.plus(biggerPaysBetter)
        const effectiveHEX = stakeAmount.plus(bonusTotal)
        const shareRate = globals.shareRate.div(10) || BigNumber(10000)
        const stakeShares = effectiveHEX.times(10000).div(shareRate)

        // Big Pay Day bonuses

        let bigPayDay = BigNumber(0)
        let percentGain = BigNumber(0)
        let percentAPY = BigNumber(0)
        if (this.state.endDay > HEX.BIG_PAY_DAY) {
            const BPD_sharePool = globals.stakeSharesTotal.plus(stakeShares)
            const bigPaySlice = calcBigPayDaySlice(stakeShares, BPD_sharePool, globals)
            const adoptionBonus = calcAdoptionBonus(bigPaySlice, globals)
            bigPayDay = bigPaySlice.plus(adoptionBonus)

            percentGain = stakeAmount.isZero() ? stakeAmount : bigPayDay.div(stakeAmount).times(100)
            const startDay = currentDay+1
            percentAPY = BigNumber(365).div(HEX.BIG_PAY_DAY + 1 - startDay).times(percentGain)
        }

        this.setState({
            longerPaysBetter,
            biggerPaysBetter,
            bonusTotal,
            effectiveHEX,
            shareRate,
            stakeShares,
            bigPayDay,
            percentGain: percentGain.toPrecision(6, 1),
            percentAPY: percentAPY.toPrecision(6, 1)
        })
    }

    resetFormAndReloadStakes = () => { 
        this.resetForm()
        this.props.reloadStakes()
    }

    updateBarGraph = async () => {
        const { currentDay } = this.props.contract.Data
        const stakeDays = parseInt(this.state.stakeDays)
        this.setState({ 
            data: [], 
            graphIconClass: "icon-wait-bg"
        })
        if (!stakeDays) return

        const centerOffset = 50
        const graphStartDay = Math.max(currentDay + stakeDays - centerOffset, currentDay) + 3
        const graphEndDay = graphStartDay + centerOffset
        const dataPoints = graphEndDay - graphStartDay
        debug("graphStartDay: ", graphStartDay)
        debug("graphEndDay: ", graphEndDay)
        debug("day: ", graphEndDay - graphStartDay)
        const collated = []
        for(let i=0; i < dataPoints; i++) collated.push({ 
            endDay: (i + graphStartDay).toString(), 
            stakeTShares: 0,
            stakedHex: 0
        })
        debug('INITIAL COLLATED: ', [...collated])

        new Promise(async (resolve, reject)=> {
            const outputData = []
            let dataPoint = 0
            collated.forEach((day, dayIndex) => {
                try {
                    // GRAPH NOTES:
                    //    first must be <= 1000
                    //    skip must be <= 5000
                    axios.post('https://api.thegraph.com/subgraphs/name/codeakk/hex', 
                            JSON.stringify({ query: `
                                {
                                    stakeStarts (
                                        first: 1000
                                        where: {
                                            endDay:${day.endDay},
                                        }
                                    )
                                    {
                                        stakedHearts
                                        stakeTShares
                                        endDay
                                    }
                                }
                                ` 
                            })
                    )
                    .then(response => {
                        const stakeStarts = response.data.data ? response.data.data.stakeStarts : []
                        debug("stakeStarts.length: ", stakeStarts.length)
                        debug('GRAPH stakeStarts %d (day: %s) -- %O', dataPoint, day.endDay, stakeStarts)
                        let stakeTShares = BigNumber(0)
                        let stakedHex = BigNumber(0)
                        stakeStarts.forEach(stakeStart => {
                            stakeTShares = stakeTShares.plus(stakeStart.stakeTShares)
                            stakedHex = BigNumber(stakeStart.stakedHearts).idiv(1e8).plus(stakedHex)
                        })
                        outputData[dayIndex] = { 
                            endDay: Number(day.endDay),
                            stakeTShares: stakeTShares.toNumber(),
                            stakedHex: stakedHex.toNumber()
                        }
                        if(!(++dataPoint < dataPoints)) return resolve(outputData)
                    })
                } catch(e) { return reject(e.message) }
            }) // forEach
        }) // Promise.all
        .then(data => {
            this.setState({data, graphIconClass: "" })
        })
        .catch(e => debug)
    }

    render() {
        const { balance } = this.props.wallet
        const { currentDay } = this.props.contract.Data

        const handleAmountChange = (e) => {
            e.preventDefault()
            this.setState({
                stakeAmount: e.target.value
            }, this.updateFigures)
        }

        const handleDaysBlur = (e) => {
            const stakeDays = parseInt(e.target.value) || 0
            if (!stakeDays) {
                this.setState({
                    data: [],
                    graphIconClass: "icon-wait-bg"
                })
            } else if (this.lastStakeDays !== stakeDays) {
                clearTimeout(this.daysTimer)
                this.updateBarGraph()
            }
        }

        const handleDaysChange = (e) => {
            e.preventDefault()
            clearTimeout(this.daysTimer)

            const immediate = (e.target || false) && (e.target.immediate || false)

            const stakeDays = parseInt(e.target.value) || 0

            const { currentDay } = this.props.contract.Data
            const endDay = currentDay + 2 + stakeDays

            const _startDate = new Date(HEX.START_DATE.getTime() + (currentDay + 1) * 24 * 3600 * 1000)
            const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
            const startDate = _startDate.toLocaleDateString()
            const startTime = _startDate.toLocaleTimeString()
            const endDate = _endDate.toLocaleDateString()
            const endTime = _endDate.toLocaleTimeString()

            this.setState({
                stakeDays: stakeDays > 5555 ? '5555' : stakeDays.toString(),
                startDay: currentDay+2,
                endDay: currentDay+2+stakeDays,
                startDate, 
                startTime,
                endDate,
                endTime
            }, () => {
                this.updateFigures()
                if (!stakeDays) {
                    this.setState({
                        data: [],
                        graphIconClass: ""
                    })
                } else if (stakeDays !== this.lastStakeDays) {
                    // get new graph data only if >= 1.2 seconds since last stakeDays change (don't DDoS graph server between key presses)
                    this.daysTimer = setTimeout(() => { 
                        this.lastStakeDays = stakeDays
                        this.updateBarGraph()
                    }, immediate ? 0 : 1200)
                }
            })
        }
        
        const handleAmountSelector = (key, e) => {
            e.preventDefault()
            const v=e.target.dataset.portion
            const portion = parseFloat(v) || 1.0
            const amount = (v === 'max')
                ? balance.div(1e8)
                : balance.idiv(1e8).times(portion).toFixed(0, 1)
            this.setState({ stakeAmount: amount.toString() }, this.updateFigures)
        }

        const handleDaysSelector = (key, e) => {
            e.preventDefault()

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
            e.target.immediate = true
            this.setState({ 
                stakeDays: days.toString(),
            }, handleDaysChange(e))
        }

        const handleCursorClick = (endDay, e) => {
            e.preventDefault()
            const { currentDay } = this.props.contract.Data
            debug(`endDay: %d, currentDay: %d, result:%s`, endDay, currentDay, (endDay - currentDay - 2).toString())
            this.setState({ 
                stakeDays: (endDay - currentDay - 2).toString(),
                endDay
            }, () => {
                this.updateFigures()
                this.updateBarGraph()
            })
        }

        const GraphCustomCursor = (props) => {
            const { x, y, width, height } = props
            return ( 
                <Rectangle 
                    fill="rgba(0,0,0,0.3)" 
                    stroke="none" 
                    x={x} y={y} 
                    width={width} 
                    height={height}
                    onClick={(e) => handleCursorClick(props.payload[0].payload.endDay, e)}
                />
            )
        }

        return (
            <Form>
                <Row className="overflow-auto">
                    <Col xs={12} sm={5}>
                        <Container className="p-0 pl-2 pr-2">
                            <Form.Group controlId="stake_amount" className="">
                                <Form.Label className="w-100 mb-0">
                                    Stake Amount in HEX
                                </Form.Label> 
                                    <InputGroup className="p-0 col-8 col-sm-12">
                                        <FormControl
                                            type="number"
                                            value={this.state.stakeAmount}
                                            placeholder="amount in HEX"
                                            aria-label="amount to stake in HEX"
                                            aria-describedby="basic-addon1"
                                            onChange={handleAmountChange}
                                        />
                                        <DropdownButton
                                            as={InputGroup.Append}
                                            variant="dark"
                                            key="percent_balance_selector"
                                            title="HEX"
                                            className="numeric"
                                            onSelect={handleAmountSelector}
                                        >
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion="max">MAX</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={1.00}>100%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.75}>75%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.50}>50%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.25}>25%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.10}>10%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.05}>5%</Dropdown.Item>
                                        </DropdownButton>
                                    </InputGroup>
                                </Form.Group>
                                <Form.Group controlId="stake_days" className="">
                                    <Form.Label className="mb-0">Stake Length in Days</Form.Label>
                                        <InputGroup className="p-0 col-12">
                                            <FormControl
                                                type="number"
                                                placeholder="min one day" 
                                                value={this.state.stakeDays <= 0 ? '' : this.state.stakeDays}
                                                aria-label="number of days to stake min one day"
                                                onChange={handleDaysChange} 
                                                onBlur={handleDaysBlur}
                                            />
                                            <DropdownButton
                                                as={InputGroup.Append}
                                                variant="dark"
                                                key="days_selector"
                                                title="DAYS"
                                                onSelect={handleDaysSelector}
                                                className="mr-3 numeric"
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
                                </Form.Group>
                        </Container>
                    </Col>
                    <Col xs={12} sm={7}>
                        <Container className="p-0 pl-2 lr-2" style={{ maxWidth: "360px" }}>
                            <Row>
                                <Col className="col-3 m-0 pr-0 text-info h4">Starts</Col>
                                <Col className="col-3 pr-0"><span className="text-muted small">DAY </span>{this.state.startDay}</Col>
                                <Col className="col-6 pr-0">{this.state.startDate} <span className="text-muted d-none d-md-inline">{this.state.startTime}</span></Col>
                            </Row>
                            <Row>
                                <Col className="col-3 m-0 pr-0 text-info h4">Ends</Col>
                                <Col className="col-3 pr-0"><span className="text-muted small">DAY </span>{this.state.endDay}</Col>
                                <Col className="col-6 pr-0">{this.state.endDate} <span className="text-muted d-none d-md-inline">{this.state.endTime}</span></Col>
                            </Row>
                            <Row>
                                <Col className="col-12 mt-2 mb-0 text-info h3">Bonus HEX!</Col>
                            </Row>
                            <Row>
                                <Col className="col-7 ml-0 ml-md-3 numeric">Bigger Pays Better</Col>
                                <Col className="col-5 text-right">+ <CryptoVal value={this.state.biggerPaysBetter} /> <span className="text-muted">HEX</span></Col>
                            </Row>
                            <Row>
                                <Col className="col-7 ml-0 ml-md-3 numeric">Longer Pays Better</Col>
                                <Col className="col-5 text-right">+ <CryptoVal value={this.state.longerPaysBetter.toFixed(0)} /> <span className="text-muted">HEX</span></Col>
                            </Row>
                            <Row className="pt-2" style={{ backgroundColor: "#042e00" }}>
                                <Col>
                                    <WhatIsThis showPill tooltip={
                                        <>
                                            Effective HEX
                                            <span className="text-success"> = </span><br/>
                                            Stake Amount in HEX
                                            <span className="text-success"> + </span>
                                            Stake Bonuses
                                        </>
                                    }>
                                        <span className="h4">Effective HEX</span>
                                    </WhatIsThis>
                                </Col>
                                <Col className="text-right text-success h3"><strong><CryptoVal value={this.state.effectiveHEX} /></strong> <span className="text-muted">HEX</span></Col>
                            </Row>
                            <Row className="my-2 text-danger">
                                <Col>Share Rate</Col>
                                <Col className="text-right numeric">
                                    <strong><CryptoVal value={this.state.shareRate} currency="TSHARE_PRICE" /> <span className="text-muted">HEX</span></strong>
                                </Col>
                            </Row>
                            <Row>
                                <Col className="col-6">
                                    <WhatIsThis showPill tooltip={
                                        <>
                                            T-Shares
                                            <span className="text-success"> = </span><br/>
                                            Effective HEX
                                            <span className="text-success"> x </span>
                                            Share Rate
                                        </>
                                    }>
                                        <span className="h5 text-success">Shares</span>
                                    </WhatIsThis>
                                </Col>
                                <Col className="col-6 text-right">
                                    <CryptoVal className="h5 text-success" value={this.state.stakeShares} currency="SHARES" />
                                </Col>
                            </Row>
                        </Container>
                        <Container className="text-right my-2">
                            <VoodooButton 
                                contract={this.props.contract}
                                method="stakeStart" 
                                params={[BigNumber(this.state.stakeAmount).times(1e8).toString(), this.state.stakeDays/*string*/]}
                                options={{ 
                                    from: this.props.wallet.address
                                }}
                                inputValid={ (BigNumber(this.state.stakeAmount).gt(0) && this.state.stakeDays > 0) }
                                confirmationCallback={this.resetFormAndReloadStakes}
                                variant="stake btn-start"
                            >
                                <strong>STAKE NOW</strong>
                            </VoodooButton>
                        </Container>

                        { (currentDay < (HEX.BIG_PAY_DAY - 1)) && (
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
                                <Col className="text-right"><CryptoVal value={this.state.bigPayDay} /> HEX</Col>
                            </Row>
                            <Row>
                                <Col>% Gain<span className="text-info">*</span> </Col>
                                <Col className="text-right"><CryptoVal value={this.state.percentGain} currency='PERCENT' />%</Col>
                            </Row>
                            <Row>
                                <Col>% APY<span className="text-info">*</span></Col>
                                <Col className="text-right"><CryptoVal value={this.state.percentAPY} currency='PERCENT' />%</Col>
                            </Row>
                            <Row>
                                <Col className="pt-2"><span className="text-info">*</span> <em>If stake still open on BigPayDay</em></Col>
                            </Row>
                        </Container>
                        ) }
                    </Col>

            { (this.state.data) && 
                    <Container className="p-0 pl-2 pr-2">
                        <h6 className="mt-3 ml-3 text-info">Other Stakes Ending</h6>
                        <ResponsiveContainer width="90%" height={220}>    
                            <BarChart 
                                className={ this.state.graphIconClass }
                                margin={{ top: 16, right: 5, bottom: 16, left: 15 }}
                                data={this.state.data}
                            >
                                <XAxis dataKey="endDay">
                                    <Label value="day" offset={-3} position="insideBottom" fill="#aaa" />
                                </XAxis>

                                <YAxis type="number" domain={[ 0, dataMax => ((Math.round(dataMax / 10)+1) * 10) ]} >
                                    <Label value="TShares   " offset={0} angle={-90} position="insideLeft" fill="#ff7700" />
                                </YAxis>
                                <ReferenceLine x={this.state.endDay} stroke="#ffaa00" strokeDasharray="3 3" />
                                <Bar dataKey="stakeTShares" stroke="#ff7700" fill="#ff7700" isAnimationActive={true} />
                                <Tooltip 
                                    filterNull={true}
                                    labelFormatter={ (value, name, props) => ([ "day "+value ]) }
                                    formatter={ (value, name, props) => ([ parseFloat(value).toFixed(3)+" Tsh" ]) }
                                    wrapperStyle={{ padding: "0" }}
                                    contentStyle={{ padding: "3px", backgroundColor: "rgba(0,0,0,0.3)", border: "none", borderRadius: "3px" }}
                                    labelStyle={{ lineHeight: "1em", padding: "2px 5px", color: "#ffdd00", fontWeight: "bold" }}
                                    itemStyle={{ lineHeight: "1em", padding: "2px 5px", color: "#ddd", backgroundColor: "rgba(0,0,0,0.5)" }}
                                    cursor={<GraphCustomCursor/>}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </Container>
            }
                </Row>
            </Form>
            
        )
    }
}
