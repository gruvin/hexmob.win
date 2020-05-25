import React from 'react'
import { 
    Container,
    Form,
    FormControl,
    InputGroup,
    Dropdown,
    DropdownButton,
    Row,
    Col,
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'
import HEX from './hex_contract.js'
import { calcBigPayDaySlice, calcAdoptionBonus } from './util.js'
import { CryptoVal, WhatIsThis, VoodooButton } from './Widgets.js' 
const debug = require('debug')('NewStakeForm')
debug('loading')

class NewStakeForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            stakeAmount: '',
            stakeDays: '',
            lastFullDay: '---',
            endDay: '---',
            longerPaysBetter: BigNumber(0), // Hearts
            biggerPaysBetter: BigNumber(0),
            bonusTotal: BigNumber(0),
            effectiveHEX: BigNumber(0),
            stakeShares: BigNumber(0),
            shareRate: BigNumber(100000),
            bigPayDay: BigNumber(0),
            percentGain: 0.0,
            percentAPY: 0.0,
        }
//        window._NEW = this // DEBUG remove me
    }

    componentDidMount() {
        const _shareRate = this.props.contract.Data.globals.shareRate || 100000
        const shareRate = BigNumber('100000').div(_shareRate).times(1e8)
        this.setState({ shareRate })
    }

    resetForm = () => {
        document.getElementById('stake_amount').value = ''
        document.getElementById('stake_days').value = ''
        this.setState({ stakeAmount: null, stakeDays: null })
        this.updateFigures()
    }

    updateFigures = () => {
        const stakeDays = parseInt(this.state.stakeDays) || 0
        const stakeAmount = BigNumber(this.state.stakeAmount).times(1e8) || BigNumber(0)

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
        const _shareRate = this.props.contract.Data.globals.shareRate || 100000
        const shareRate = BigNumber('100000').div(_shareRate)
        const stakeShares = effectiveHEX.times(shareRate)

        // Big Pay Day bonuses

        let bigPayDay = BigNumber(0)
        let percentGain = BigNumber(0)
        let percentAPY = BigNumber(0)
        if (this.state.endDay-1 > HEX.BIG_PAY_DAY) {
            const { globals } = this.props.contract.Data
            const BPD_sharePool = globals.stakeSharesTotal.plus(stakeShares)
            const bigPaySlice = calcBigPayDaySlice(stakeShares, BPD_sharePool, globals)
            const adoptionBonus = calcAdoptionBonus(bigPaySlice, globals)
            bigPayDay = bigPaySlice.plus(adoptionBonus)

            percentGain = stakeAmount.isZero() ? stakeAmount : bigPayDay.div(stakeAmount).times(100)
            const startDay = this.props.contract.Data.currentDay + 1
            percentAPY = BigNumber(365).div(HEX.BIG_PAY_DAY - startDay + 1).times(percentGain)
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

    render() {
        const { balance } = this.props.wallet

        const currentDay = this.props.contract.Data.currentDay + 1

        const handleAmountChange = (e) => {
            e.preventDefault()
            const value = BigNumber(e.target.value)
            this.setState({
                stakeAmount: isNaN(value) ? '' : value.toString()
            }, this.updateFigures)
        }

        const handleDaysChange = (e) => {
            e.preventDefault()
            const stakeDays = parseInt(e.target.value) || null
            this.setState({
                stakeDays: stakeDays ? Math.min(5555, stakeDays).toString() : '',
                lastFullDay: stakeDays ? currentDay + stakeDays : '---',
                endDay: stakeDays ? currentDay + stakeDays + 1 : '---',
            }, this.updateFigures)
        }
        
        const handleAmountSelector = (key, e) => {
            e.preventDefault()
            const v=e.target.dataset.portion
            const portion = parseFloat(v) || 1.0
            const amount = (v === 'max')
                ? balance.div(1e8)
                : BigNumber(balance.idiv(1e8).times(portion).toFixed(0, 1))
            this.setState({ stakeAmount: BigNumber(amount).toString() }, this.updateFigures)
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
                    <Col xs={12} sm={5} className="mb-3">
                        <Form.Group controlId="stake_amount">
                            <Form.Label>Stake Amount in HEX</Form.Label> 
                            <InputGroup>
                                <FormControl
                                    type="number" novalidate
                                    placeholder="number of HEX to stake"
                                    aria-label="amount to stake"
                                    aria-describedby="basic-addon1"
                                    onChange={handleAmountChange}
                                />
                                <DropdownButton
                                    as={InputGroup.Append}
                                    variant="secondary"
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
                            <Form.Text>
                                <span className="text-muted">Bigger pays better</span>
                                <div className="float-right" variant="info" >
                                    <CryptoVal value={balance} showUnit /> available
                                </div>
                            </Form.Text>
                        </Form.Group>
                        <Form.Group controlId="stake_days" className="mb-0">
                            <Form.Label>Stake Length in Days</Form.Label>
                            <InputGroup>
                                <FormControl
                                    type="number" novalidate
                                    placeholder="minimum one day" 
                                    value={this.state.stakeDays <= 0 ? '' : this.state.stakeDays}
                                    aria-label="number of days to stake"
                                    onChange={handleDaysChange} 
                                />
                                <DropdownButton
                                    as={InputGroup.Append}
                                    variant="secondary"
                                    key="days_selector"
                                    title="DAYS"
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
                        <Row className="small mb-3">
                            <Col className="text-center">
                                <strong>Start</strong>:{' '}
                                <span className="numeric">{ format(',')(currentDay + 1) }</span>
                            </Col>
                            <Col className="text-center">
                                <strong>Last</strong>:{' '}
                                <span className="numeric">{ isNaN(this.state.lastFullDay) ? '---' : format(',')(this.state.lastFullDay) }</span>
                            </Col>
                            <Col className="text-center">
                                <strong>End</strong>:{' '}
                                <span className="numeric">{ isNaN(this.state.endDay) ? '---' : format(',')(this.state.endDay) }</span>
                            </Col>
                        </Row>
                        <Row comment="*** STAKE button ****">
                            <Col className='text-right'>
                                <VoodooButton 
                                    contract={this.props.contract}
                                    method="stakeStart" 
                                    params={[BigNumber(this.state.stakeAmount).times(1e8), this.state.stakeDays/*string*/]}
                                    options={{ from: this.props.wallet.address }}
                                    dataValid={BigNumber(this.state.stakeAmount).gt(0) && this.state.stakeDays > 0}
                                    confirmationCallback={this.resetFormAndReloadStakes}
                                    variant="stake btn-start"
                                >
                                    STAKE
                                </VoodooButton>
                            </Col>
                        </Row>
                    </Col>
                    <Col xs={12} sm={7}>
                        <Container>
                            <h4 className="text-info">Bonuses ...</h4>
                            <Row>
                                <Col className="ml-0 ml-md-3">Bigger <span className="d-none d-md-inline">Pays</span> Better</Col>
                                <Col className="text-right">+ <CryptoVal value={this.state.biggerPaysBetter} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="ml-0 ml-md-3">Longer <span className="d-none d-md-inline">Pays</span> Better</Col>
                                <Col className="text-right">+ <CryptoVal value={this.state.longerPaysBetter.toFixed(0)} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="ml-0 ml-md-3"><strong>Total</strong></Col>
                                <Col className="text-right"><strong><CryptoVal value={this.state.bonusTotal} showUnit /></strong></Col>
                            </Row>
                            <Row className="mt-2">
                                <Col>
                                    <strong>Effective HEX</strong>
                                    <WhatIsThis>
                                        Effective HEX
                                        <span className="text-success"> = </span><br/>
                                        Stake Amount in HEX
                                        <span className="text-success"> + </span>
                                        Stake Bonuses
                                    </WhatIsThis>
                                    </Col>
                                <Col className="text-right"><strong><CryptoVal value={this.state.effectiveHEX} showUnit /></strong></Col>
                            </Row>
                            <Row className="mt-3">
                                <Col><strong>Share Rate</strong></Col>
                                <Col className="text-right">
                                    <CryptoVal value={this.state.shareRate.times(1e8/*fudge non-HEX unit for desired display*/)} />
                                    {' '}/ HEX
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <strong>Stake Shares</strong>
                                    <WhatIsThis>
                                        Stake Shares
                                        <span className="text-success"> = </span><br/>
                                        Effective HEX
                                        <span className="text-success"> x </span>
                                        Stake Bonuses
                                    </WhatIsThis>{' '}
                                </Col>
                                <Col className="text-right">
                                    <CryptoVal value={this.state.stakeShares.times(1e8/*fudge non-HEX unit for desired display*/)} />
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
                                <Col className="text-right"><CryptoVal value={this.state.bigPayDay} /> HEX</Col>
                            </Row>
                            <Row>
                                <Col>% Gain<span className="text-info">*</span> </Col>
                                <Col className="text-right"><CryptoVal value={this.state.percentGain} />%</Col>
                            </Row>
                            <Row>
                                <Col>% APY<span className="text-info">*</span></Col>
                                <Col className="text-right"><CryptoVal value={this.state.percentAPY} />%</Col>
                            </Row>
                            <Row>
                                <Col className="pt-2"><span className="text-info">*</span> <em>If stake still open on BigPayDay</em></Col>
                            </Row>
                        </Container>
                        ) }
                    </Col>
                </Row>
            </Form>
        )
    }
}

export default NewStakeForm
