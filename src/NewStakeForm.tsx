import React from 'react'
import Container from "react-bootstrap/Container"
import Form from "react-bootstrap/Form"
import FormControl from "react-bootstrap/FormControl"
import InputGroup from "react-bootstrap/InputGroup"
import Dropdown from "react-bootstrap/Dropdown"
import DropdownButton from "react-bootstrap/DropdownButton"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Image from "react-bootstrap/Image"
import './NewStakeForm.scss'
import { ethers, BigNumber } from 'ethers'
import HEX, { type HEXContract } from './hex_contract'
import * as NSFT from './lib/NewStakeForm'
import { bnCalcBigPayDaySlice, bnCalcAdoptionBonus, bnE } from './util'
import { CryptoVal, WhatIsThis, VoodooButton } from './Widgets'
import { ResponsiveContainer, Bar, BarChart, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'd3-format'
import imgGameLogo from './assets/game-logo.png'

import _axios from 'axios'
const axios = _axios.create({
    baseURL: '/',
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json"},
})

const uriQuery = new URLSearchParams(window.location.search)

import _debug from 'debug'
const debug = _debug('NewStake')
debug('loading')

const bnZero = ethers.constants.Zero
export class NewStakeForm extends React.Component<NSFT.Props, NSFT.State> {

    daysTimer?: NodeJS.Timer
    lastStakeDays?: number
    daysControl?: HTMLInputElement

    constructor(props: NSFT.Props) {
        super(props)
        this.state = {
            startDay: 0,
            endDay: 0,
            stakeAmount: "",
            stakeDays: "",
            startDate: "",
            startTime: "",
            endDate: "",
            endTime: "",
            bnNewStakedHearts: bnZero,
            bnLongerPaysBetter: bnZero, // Hearts
            bnBiggerPaysBetter: bnZero,
            bnBonusTotal: bnZero,
            bnEffectiveHEX: bnZero,
            bnStakeShares: bnZero,
            bnShareRate: ethers.BigNumber.from(10000),
            bnBigPayDay: bnZero,
            percentGain: "0.0",
            percentAPY: "0.0",
            shareRate: 10000.0,
            data: [],
            graphIconClass: "" // .icon-wait-bg || .icon-error-bg
        }
    }

    async componentDidMount() {
        if (localStorage.getItem('debug')) window._NSF = this
        const { shareRate } = this.props.contract.Data.globals
        this.setState({ shareRate })
    }

    resetForm = () => {
        const elStakeAmount = document.getElementById('stake_amount') as HTMLFormElement
        elStakeAmount.value = ""
        const elStakeDays = document.getElementById('stake_days') as HTMLFormElement
        elStakeDays.value = ""
        this.setState({ stakeAmount: "", stakeDays: "" })
        this.updateFigures()
    }

    updateFigures = () => {
        const { currentDay, globals } = this.props.contract.Data
        const { commify, formatUnits } = ethers.utils

        let { stakeDays, stakeAmount } = this.state // input field strings
        const bnStakeDays = BigNumber.from(parseInt(stakeDays) || 0)
        const { LPB_MAX_DAYS, LPB, BPB_MAX_HEARTS, BPB } = HEX // BigNumbers

        let bnNewStakedHearts
        // decimals retained for HEX conversion to hearts (safe for input HEX < 10^12) ...
        const _stakeAmount = parseFloat(stakeAmount) || 0.0
        const stakeHearts = Math.trunc(_stakeAmount * 100000000.0)
        try { // sanity test
            bnNewStakedHearts = BigNumber.from(stakeHearts)
        } catch(e) {
            bnNewStakedHearts = ethers.constants.Zero
        }

        let bnCappedExtraDays = ethers.constants.Zero
        if (bnStakeDays.gt(1)) bnCappedExtraDays = bnStakeDays.lte(LPB_MAX_DAYS) ? bnStakeDays.sub(1) : LPB_MAX_DAYS

        const bnCappedStakedHearts = bnNewStakedHearts.lte(BPB_MAX_HEARTS)
            ? bnNewStakedHearts
            : BPB_MAX_HEARTS

        const bnBiggerPaysBetter = bnNewStakedHearts.mul(bnCappedStakedHearts).div(BPB)
        const bnLongerPaysBetter = bnNewStakedHearts.mul(bnCappedExtraDays).div(LPB)

        // sanity check from .sol
        //let bnBonusHearts = bnCappedExtraDays.mul(BPB).add(bnCappedStakedHearts.mul(LPB))
        //bnBonusHearts = bnNewStakedHearts.mul(bnBonusHearts).div(LPB.mul(BPB))
        // debug("SANITY bnBonusHearts: ", bnBonusHearts.toString())
        const bnBonusTotal = bnLongerPaysBetter.add(bnBiggerPaysBetter)
        const bnEffectiveHEX = bnNewStakedHearts.add(bnBonusTotal)

        debug("updateFigures(): ",
            + `bnNewStakedHearts: ${bnNewStakedHearts.toString()}\n`
            + `bnStakeDays: ${bnStakeDays.toString()}\n`
            + `bnCappedExtraDays: ${bnCappedExtraDays.toString()}\n`
            + `bnCappedStakedHearts: ${bnCappedStakedHearts.toString()}\n`
            + `bnBiggerPaysBetter: ${bnBiggerPaysBetter.toString()}\n`
            + `bnLongerPaysBetter: ${bnLongerPaysBetter.toString()}\n`
            + `bnBonusTotal: ${bnBonusTotal.toString()}\n`
            + `bnEffectiveHEX: ${bnEffectiveHEX.toString()}\n`
        )

        const bnShareRate = BigNumber.from(globals.shareRate).div(10) || BigNumber.from(10000)
        const bnStakeShares = bnEffectiveHEX.mul(10000).div(bnShareRate)

        // Big Pay Day bonuses

        let bnBigPayDay = bnZero
        let bnPercentGain = bnZero
        let bnPercentAPY = bnZero
        if (this.state.endDay > HEX.BIG_PAY_DAY) {
            const BPD_sharePool = globals.bnStakeSharesTotal.add(bnStakeShares)
            const bnBigPaySlice = bnCalcBigPayDaySlice(bnStakeShares, BPD_sharePool, globals)
            const bnAdoptionBonus = bnCalcAdoptionBonus(bnBigPaySlice, globals)
            bnBigPayDay = bnBigPaySlice.add(bnAdoptionBonus)

            bnPercentGain = bnNewStakedHearts.isZero() ? bnZero : bnBigPayDay.mul(1000000).div(bnNewStakedHearts) // 100,000 = 1.0000%
            const startDay = currentDay + 1
            bnPercentAPY = ethers.BigNumber.from(365).mul(bnPercentGain).div(Number(HEX.BIG_PAY_DAY) + 1 - startDay)
        }

        this.setState({
            bnNewStakedHearts,
            bnLongerPaysBetter,
            bnBiggerPaysBetter,
            bnBonusTotal,
            bnEffectiveHEX,
            bnShareRate,
            bnStakeShares,
            bnBigPayDay,
            percentGain: commify(formatUnits(bnPercentGain, 4)),
            percentAPY:  commify(formatUnits(bnPercentAPY, 4)),
        })
    }

    resetFormAndReloadStakes = () => {
        this.resetForm()
        const { reloadStakes } = this.props
        typeof reloadStakes === 'function' && reloadStakes()
    }

    updateBarGraph = async () => {
        if (!uriQuery.has('future')) return // dissabled due to data availability

        const { startDay, endDay } = this.state
        if (isNaN(startDay + endDay)) return
        const numDataPoints = 121
        const graphStartDay = Math.max(startDay, endDay - Math.floor(numDataPoints / 2))

        this.setState({
            data: [],
            graphIconClass: "icon-wait-bg"
        })

        let response
        try {
            response = await axios.get(`https://futureus.win/hexmob/fs/${graphStartDay}/${numDataPoints}`, { timeout: 5000 })
        } catch (e: any) {
            debug("updateBarGraph: ", e.message)
            this.setState({ graphIconClass: "icon-error-bg" })
            return false
        }
        debug('fs response:', response)

        const data = response.data.data.map((d: { endDay: number; totalHearts: string}) => {
            return({
                endDay: d.endDay,
                stakedHex: ethers.BigNumber.from(d.totalHearts).div(1E14).toNumber()
            })
        })
        debug("graph data: ", data)
        this.setState({data, graphIconClass: "" })
    }

    handleDaysChange = (e: React.ChangeEvent<HTMLInputElement> ) => {
        e.preventDefault()
        clearTimeout(this.daysTimer)

        const immediate = Boolean(e.target.dataset.immediate)
        immediate && delete e.target.dataset.immediate

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
        }, this.updateFigures)

        if (!stakeDays) {
            this.setState({
                data: [],
                graphIconClass: ""
            })
        } else if (stakeDays > 0 && stakeDays !== this.lastStakeDays) {
            // process only if >= 1.2 seconds since last stakeDays change
            this.daysTimer = setTimeout(() => {
                this.lastStakeDays = stakeDays
                this.updateBarGraph()
            }, immediate ? 0 : 1200)
        }
    }

    handleDaysBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const stakeDays = parseInt(e.target.value) || 0
        if (!stakeDays) {
            this.setState({
                data: [],
                graphIconClass: ""
            })
        } else if (stakeDays > 0 && this.lastStakeDays !== stakeDays) {
            clearTimeout(this.daysTimer)
            this.updateBarGraph()
        }
    }

    handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault()
        this.setState({
            stakeAmount: e.target.value
        }, this.updateFigures)
    }

    handleAmountSelector = (eventKey: any, e: React.SyntheticEvent<unknown, Event>) => {
        if (!(e.target instanceof HTMLElement)) return
        e.preventDefault()
        const bnBalance = this.props.wallet.bnBalance || BigNumber.from(0)
        if (bnBalance.isZero()) return
        const balanceHEX = Number(ethers.utils.formatUnits(bnBalance, HEX.DECIMALS))
        const v = e.target.dataset.portion || ""
        const portion = parseFloat(v) || 1.0
        const amountHEX : string = (
            (v === 'max')
            ? balanceHEX
            : balanceHEX * portion
        )
        .toFixed(8)
        .replace(/\.?0+$/,"")
        this.setState({ stakeAmount: amountHEX }, this.updateFigures)
    }

    handleDaysSelector = (key: any, e: React.SyntheticEvent<unknown, Event>) => {
        if (!(e.target instanceof HTMLElement)) return
        e.preventDefault()
        function plusYears(years: number): number {
            const n = new Date(Date.now())
            const d = new Date()
            d.setFullYear(n.getFullYear() + years)
            return Math.floor(Number((d.valueOf() - n.valueOf()) / 1000 / 3600 / 24))
        }
        function plusMonths(months: number): number {
            const n = new Date(Date.now())
            const d = new Date()
            d.setMonth(n.getMonth() + months)
            return Math.floor(Number((d.valueOf() - n.valueOf()) / 1000 / 3600 / 24))
        }

        let days: number
        switch (e.target.dataset.days) {
            case 'max': days = 5555; break;
            case '10y': days = plusYears(10); break;
            case  '5y': days = plusYears( 5); break;
            case  '3y': days = plusYears( 3); break;
            case  '2y': days = plusYears( 2); break;
            case  '1y': days = plusYears( 1); break;
            case  '6m': days = plusMonths(6); break;
            case  '3m': days = plusMonths(3); break;
            case  '1m': days = plusMonths(1); break;
            case  '1w': days = 7; break;
            default: days = 1;
        }

        this.setState({
            stakeDays: days.toString(),
        }, () => {
            if (!this.daysControl) return
            this.daysControl.value = days.toString()
            this.daysControl.dataset.immediate = "true"
            this.daysControl.dispatchEvent(new Event("change"))
        })
    }

    GraphCustomCursor = (props: any) => {
        const { x, y, width, height } = props
        const { currentDay } = this.props.contract?.Data
        if (!currentDay) return <></>
        let endDay: number
        try {
            endDay = props.payload[0].payload.endDay
        } catch(err) {
            debug("WARN: GraphCustomCursor: no payload given")
            return <></>
        }

        const handleSelection = (e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
            e.preventDefault()
            this.setState({
                stakeDays: (endDay - currentDay - 2).toString(),
                endDay
            }, () => {
                this.updateFigures()
                this.updateBarGraph()
            })
        }

        return (
            <Rectangle
                fill="rgba(255,255,255,0.3)"
                stroke="none"
                x={x} y={y}
                width={width}
                height={height}
                onClick={handleSelection}
            />
        )
    }

    render() {
        const { contract } = this.props
        const { currentDay } = contract.Data

        return (
            <Form>
                <Row className="overflow-auto">
                    <Col xs={12} sm={5}>
                        <Container className="p-0 pl-2 pe-2">
                            <Row>
                                <Col xs={6} sm={12} className="">
                                    <Form.Group controlId="stake_amount" className="">
                                        <Form.Label className="w-100 mb-0">
                                            Stake Amount<span className="d-none d-sm-inline"> in HEX</span>
                                        </Form.Label>
                                        <InputGroup className="p-0">
                                            <Form.Control
                                                className="p-1"
                                                type="number"
                                                value={this.state.stakeAmount || ""}
                                                placeholder="0"
                                                aria-label="amount to stake in HEX"
                                                aria-describedby="basic-addon1"
                                                onChange={this.handleAmountChange}
                                            />
                                            <DropdownButton
                                                align="end"
                                                variant="dark"
                                                key="percent_balance_selector"
                                                title="HEX"
                                                className="numeric"
                                                onSelect={this.handleAmountSelector}
                                            >
                                                <Dropdown.Item as="button" eventKey="new_stake" data-portion={1.00}>100%</Dropdown.Item>
                                                <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.75}>75%</Dropdown.Item>
                                                <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.50}>50%</Dropdown.Item>
                                                <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.25}>25%</Dropdown.Item>
                                                <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.10}>10%</Dropdown.Item>
                                                <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.05}>5%</Dropdown.Item>
                                            </DropdownButton>
                                        </InputGroup>
                                    </Form.Group>
                                </Col>
                                <Col xs={6} sm={12}className="">
                                    <Form.Group controlId="stake_days" className="">
                                        <Form.Label className="mb-0">Stake Length<span className="d-none d-sm-inline"> in Days</span></Form.Label>
                                        <InputGroup className="p-0">
                                                <FormControl
                                                    ref = {(r: HTMLInputElement) => this.daysControl = r}
                                                    className="p-1"
                                                    type="number"
                                                    placeholder="5555"
                                                    value={Number(this.state.stakeDays) <= 0 ? "" : this.state.stakeDays}
                                                    aria-label="number of days to stake min one day"
                                                    onChange={this.handleDaysChange}
                                                    onBlur={this.handleDaysBlur}
                                                />
                                                <DropdownButton
                                                    align="end"
                                                    variant="dark"
                                                    key="days_selector"
                                                    title="DAYS"
                                                    onSelect={this.handleDaysSelector}
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
                                    </Form.Group>
                                </Col>
                            </Row>
                        </Container>
                    </Col>
                    <Col xs={12} sm={7}>
                        <Container className="px-0 py-3 pl-md-2 ms-0" style={{ maxWidth: "23rem" }}>
                            <Row>
                                <Col className="col-3 m-0 pl-2 pe-0 text-info h4">Start</Col>
                                <Col className="col-3 pe-0"><span className="text-muted small">DAY </span>{this.state.startDay}</Col>
                                <Col className="col-6 pe-0">{this.state.startDate} <span className="text-muted d-none d-md-inline">{this.state.startTime}</span></Col>
                            </Row>
                            <Row>
                                <Col className="col-3 m-0 pl-2 pe-0 text-info h4">End</Col>
                                <Col className="col-3 pe-0"><span className="text-muted small">DAY </span>{this.state.endDay}</Col>
                                <Col className="col-6 pe-0">{this.state.endDate} <span className="text-muted d-none d-md-inline">{this.state.endTime}</span></Col>
                            </Row>
                            <Row>
                                <Col className="col-12 mt-2 mb-0 pl-2 text-info h3">Bonus HEX (effective)</Col>
                            </Row>
                            <Row>
                                <Col className="col-7 ms-0 numeric">Bigger Pays Better</Col>
                                <Col className="col-5 pl-0 pl-0 text-end">+ <CryptoVal value={this.state.bnBiggerPaysBetter} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="col-7 ms-0 numeric">Longer Pays Better</Col>
                                <Col className="col-5 pl-0 text-end">+ <CryptoVal value={this.state.bnLongerPaysBetter} showUnit /></Col>
                                <>{/* XXXXX */}</>
                            </Row>
                            <Row className="pt-2">
                                <Col className="pl-2">
                                    <WhatIsThis showPill tooltip={
                                        <>
                                            Effective HEX is the cost of shares had there been no bonuses, which equals
                                            <span className="text-success"> Stake Amount</span> + <span className="text-success">Stake Bonuses</span>
                                        </>
                                    }>
                                        <span className="h4">Effective HEX</span>
                                    </WhatIsThis>
                                </Col>
                                <Col className="text-end text-success lh-lg bg-success-darkened"><strong><CryptoVal value={this.state.bnEffectiveHEX} /></strong> <span className="text-muted">HEX</span></Col>
                            </Row>
                            <Row className="my-2 text-danger">
                                <Col className="col-3">
                                    {window.hostIsTSA && <Image
                                        src={imgGameLogo} title="Play the Heart Game! :-)"
                                        style={{ width: "90%" }}
                                        onClick={() => window.location.href="https://tshare.app?step=1"}
                                    />}
                                </Col>
                                <Col className="col-9 text-end">
                                    <Row>
                                        <Col className="col-6 text-end">TShare Rate</Col>
                                        <Col className="col-6 text-end numeric">
                                            <strong><CryptoVal value={this.state.bnShareRate} currency="TSHARE_PRICE" /> <span className="text-muted">HEX</span></strong>
                                        </Col>
                                    </Row>
                                    <Row>
                                        <Col className="col-6">
                                            <WhatIsThis showPill tooltip={
                                                <div>
                                                    <span className="text-success">Shares</span> =
                                                    <span className="text-success"> Effective HEX</span> x
                                                    <span className="text-success"> Share Rate</span><br/>
                                                    <span className="text-success">T</span>Share = 1 Trillion shares<br/>
                                                    <span className="text-success">B</span>Share = 1 Billion shares<br/>
                                                    <span className="text-success">M</span>Share = 1 Million shares<br/>
                                                    <span className="text-success">TShare Rate</span> is the cost of one
                                                    <span className="text-success"> T</span>Share<br/>
                                                    (in HEX) and only <span className="text-success"><em>increases</em></span> over time.
                                                </div>
                                            }>
                                                <span className="h5 text-success">Shares</span>
                                            </WhatIsThis>
                                        </Col>
                                        <Col className="col-6 text-end">
                                            <CryptoVal className="h5 text-success" value={this.state.bnStakeShares} currency="SHARES" />
                                        </Col>
                                    </Row>
                                </Col>
                            </Row>
                            <Container className="w-100 text-end mt-3">
                            <VoodooButton
                                contract={window.contract} // window.contract is our signer (Metamask etc)
                                method="stakeStart"
                                params={[this.state.bnNewStakedHearts, this.state.stakeDays/*string*/]}
                                inputValid={ Number(this.state.stakeAmount) > 0 && Number(this.state.stakeDays) > 0 }
                                confirmationCallback={this.resetFormAndReloadStakes}
                                className="stake btn-start"
                            >
                                <strong>STAKE NOW</strong>
                            </VoodooButton>
                            </Container>
                        </Container>

                        { (currentDay < (HEX.BIG_PAY_DAY - 1)) && (
                        <Container className="bg-secondary rounded mt-2 pt-2 pb-2">
                            <Row>
                                <Col>
                                    <WhatIsThis showPill tooltip={
                                        <>
                                            Reduces as others start new stakes.<br/>
                                            Increases as others end their stakes.
                                        </>
                                    }>
                                        <strong>
                                            <span className="text-info">Big</span>
                                            <span className="text-warning">Pay</span>
                                            <span className="text-danger">Day</span>
                                        </strong>
                                    </WhatIsThis>
                                </Col>
                                <Col className="text-end"><CryptoVal value={this.state.bnBigPayDay} /> HEX</Col>
                            </Row>
                            <Row>
                                <Col>% Gain<span className="text-info">*</span> </Col>
                                <Col className="text-end"><CryptoVal value={this.state.percentGain} currency='PERCENT' />%</Col>
                            </Row>
                            <Row>
                                <Col>% APY<span className="text-info">*</span></Col>
                                <Col className="text-end"><CryptoVal value={this.state.percentAPY} currency='PERCENT' />%</Col>
                            </Row>
                            <Row>
                                <Col className="pt-2"><span className="text-info">*</span> <em>If stake still open on BigPayDay</em></Col>
                            </Row>
                        </Container>
                        ) }
                    </Col>

                { this.state.data && uriQuery.has("future") && // disabled due to data availability
                    <Container className="p-3 pt-0">
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart
                                className={ this.state.graphIconClass }
                                data={this.state.data}
                            >
                                <XAxis dataKey="endDay" label={{ value: "day", offset: -10, position: "insideLeft" }} />
                                <YAxis type="number" width={40} label={{ value: "M HEX", position: "insideBottomLeft", offset: 5, angle: -90 }} />
                                <ReferenceLine x={this.state.endDay} strokeDasharray="3 3" />
                                <Bar dataKey="stakedHex" isAnimationActive={true} />
                                <Tooltip
                                    filterNull={true}
                                    labelFormatter={ (label) => <>"day "+{label}</> }
                                    formatter={ (value: string) => ([ parseFloat(value).toFixed(3)+" MHEX" ]) }
                                    wrapperStyle={{ padding: "0" }}
                                    contentStyle={{ padding: "3px", backgroundColor: "rgba(0,0,0,0.3)", border: "none", borderRadius: "3px" }}
                                    labelStyle={{ lineHeight: "1em", padding: "2px 5px", color: "#ffdd00", fontWeight: "bold" }}
                                    itemStyle={{ lineHeight: "1em", padding: "2px 5px", color: "#ddd", backgroundColor: "rgba(0,0,0,0.5)" }}
                                    cursor={<this.GraphCustomCursor/>}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="text-center">
                            <h6 className="text-info m-0">Future Market Supply by HEX Day</h6>
                            <div className="text-muted small">assumes all stakes end on time</div>
                        </div>
                    </Container>
                }
                </Row>
            </Form>

        )
    }
}
