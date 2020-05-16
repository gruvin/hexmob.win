import React from 'react'
import { 
    Container,
    Button,
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
import { format } from 'd3-format'
import HEX from './hex_contract.js'
import { calcBigPayDaySlice, calcAdoptionBonus } from './util.js'
import { HexNum, WhatIsThis } from './widgets.js' 
const debug = require('debug')('NewStakeForm')
debug('loading')

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
            const shareRate = new BigNumber('100000').div(_shareRate)
            const stakeShares = effectiveHEX.times(shareRate)

            // Big Pay Day bonuses

            let bigPayDay = new BigNumber(0)
            let percentGain = new BigNumber(0)
            let percentAPY = new BigNumber(0)
            if (this.state.endDay-1 > HEX.BIG_PAY_DAY) {
                const { globals } = this.state.contractData
                const BPD_sharePool = globals.stakeSharesTotal.plus(stakeShares)
                const bigPaySlice = calcBigPayDaySlice(stakeShares, BPD_sharePool, globals)
                const adoptionBonus = calcAdoptionBonus(bigPaySlice, globals)
                bigPayDay = bigPaySlice.plus(adoptionBonus)

                percentGain = bigPayDay.div(stakeAmount).times(100)
                const startDay = this.state.contractData.currentDay + 1
                percentAPY = new BigNumber(365).div(HEX.BIG_PAY_DAY - startDay + 1).times(percentGain)
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
                                <Col sm={5} className="text-right">
                                    <HexNum value={this.state.shareRate.times(1e8/*fudge non-HEX unit for desired display*/)} />
                                    {' '}/ HEX
                                </Col>
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
                                <Col sm={5} className="text-right">
                                    <HexNum value={this.state.stakeShares.times(1e8/*fudge non-HEX unit for desired display*/)} />
                                </Col>
                            </Row>
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

export default NewStakeForm
