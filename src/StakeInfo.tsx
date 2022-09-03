import React, { createRef, useContext } from 'react'
import Container from "react-bootstrap/Container"
import ProgressBar from "react-bootstrap/ProgressBar"
import Accordion from "react-bootstrap/Accordion"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Badge from "react-bootstrap/Badge"
import Button from "react-bootstrap/Button"
import Overlay from "react-bootstrap/Overlay"
import Popover from "react-bootstrap/Popover"
import * as InfoT from './lib/StakeInfo'
import './Stakes.scss'
import HEX from './hex_contract'
import { format } from 'd3-format'
import { CryptoVal, VoodooButton } from './Widgets'
import {
    bnCalcInterest,
    bnCalcApy,
    decodeDailyData,
    decodeClaimStats,
} from './util'
import ReactGA from 'react-ga'
import { ethers } from 'ethers'

import _debug from 'debug'
const debug = _debug('StakeInfo')
debug('loading')

export class StakeInfo extends React.Component<InfoT.Props, InfoT.State> {
    esRef?: React.RefObject<HTMLElement>
    state: InfoT.State

    constructor(props: InfoT.Props) {
        super(props)
        this.state = {
            esShow: false,
            eesStatsHEX: false
        }
        this.esRef = createRef()
    }

    componentDidMount() {
        if (localStorage.getItem('debug')) {
            window._UTIL = {
                bnCalcInterest,
                bnCalcApy,
                decodeClaimStats,
                decodeDailyData,
            }
            window._SI = this
        }
    }

    render() {
        const { contract, stake, usdhex} = this.props
        const { currentDay } = contract.Data
        const { startDay, endDay, stakedDays } = stake
        const { formatUnits }= ethers.utils
        const progress = parseFloat((stake.progress / 1000).toPrecision(3))
        const stakeDay = currentDay - startDay // day number into active stake
        const exitClass =
                (currentDay < startDay)
                    ? "pendingexit"
                    : (stakeDay < stakedDays / 2)
                        ? "earlyexit"
                        : (stakeDay < stakedDays)
                            ? "midexit"
                            : (stakeDay < stakedDays + 14)
                                ? "termexit"
                                : "lateexit"

        const progressVariant =
            (exitClass === "pendingexit")
                ? "secondary"
                : (exitClass === "earlyexit")
                    ? "danger"
                    : (exitClass === "midexit")
                        ? "warning"
                        : (exitClass === "termexit")
                            ? "success"
                            : "info" // lateexit

        const isEarly = stakeDay < stakedDays

        // format values for display
        const { bnStakedHearts, bnStakeShares, bnPayout, bnBigPayDay, bnPenalty } = stake
        const bnValueTotal    = bnStakedHearts.add(bnPayout).add(bnBigPayDay)

        // predicted end stake figures ... Number()
        const hexStaked     = Number(ethers.utils.formatUnits(bnStakedHearts, HEX.DECIMALS))
        const hexPayout     = Number(ethers.utils.formatUnits(bnPayout, HEX.DECIMALS))
        const hexBPD        = Number(ethers.utils.formatUnits(bnBigPayDay, HEX.DECIMALS))
        const hexPenalty    = Number(ethers.utils.formatUnits(bnPenalty, HEX.DECIMALS))

        const hexValueTotal = hexStaked + hexBPD
        const hexNetValue   = Math.max(0, hexValueTotal - hexPenalty)

        const _usdStaked     = hexStaked * usdhex
        const usdStaked      = format(",.2f")(_usdStaked)

        const _usdPayout     = hexPayout * usdhex
        const usdPayout      = format(",.2f")(_usdPayout)

        const _usdBPD        = hexBPD * usdhex
        const usdBPD         = format(",.2f")(_usdBPD)

        const _usdPenalty    = format(",.2f")(hexPenalty * usdhex)
        const usdPenalty     = format(",.2f")(Number(_usdPenalty))

        const _usdValueTotal = _usdStaked + _usdPayout + _usdBPD
        const usdValueTotal  = format(",.2f")(_usdValueTotal)

        const usdNetValue    = format(",.2f")(Math.max(0, _usdValueTotal - Number(_usdPenalty)))

        const percentGain = format(".3f")(Number(formatUnits(bnCalcInterest(stake), 3))) // 100,000 = 100.000%
        const percentAPY = format(".3f")(Number(formatUnits(bnCalcApy(currentDay, stake), 3)))

        const _startDate = new Date(HEX.START_DATE.getTime() + startDay * 24 * 3600 * 1000)
        const startDate = _startDate.toLocaleDateString()+' '+_startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})

        const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
        const endDate = _endDate.toLocaleDateString()+' '+_endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})

        const eesDisplayHEX = this.state.eesStatsHEX ? "inline" : "none"
        const eesDisplayUSD = !this.state.eesStatsHEX ? "inline" : "none"

        return (
            <Accordion className="my-2"  defaultActiveKey="0"
                onSelect={eventKey => {
                    if (eventKey) ReactGA.pageview("/current_stakes/"+eventKey)
                }}
            >
                <Accordion.Item className="bg-dark" eventKey={stake.stakeId}>
                    <Accordion.Header>
                        <Container className="p-2">
                            <Row>
                                <Col xs={6} className="text-start pe-0">
                                    <CryptoVal className="numeric font-weight-bold text-info h2" value={bnStakeShares} currency="SHARES" />
                                    <span className="text-muted small"> SHARES</span>
                                </Col>
                                <Col xs={6} className="text-end pl-0">
                                    <span className="text-muted small">VALUE </span>
                                    <span className="numeric h3 text-success">{"$"+usdValueTotal}</span>
                                </Col>
                            </Row>
                            <Row>
                                <Col xs={7} className="pe-0">
                                    <span className="text-muted small">ENDS </span>
                                    <span className="small">{endDate}</span>
                                </Col>
                                <Col xs={5} className="text-end pl-0">
                                    { (exitClass === "pendingexit") ? <Badge className="bg-primary">PENDING</Badge>
                                        : <>
                                            <span className="text-muted small">PROGRESS </span>
                                            <span className="numeric">{progress+"%"}</span>
                                        </>
                                    }
                                </Col>
                            </Row>
                            <div className="pb-1">
                            { (exitClass === "pendingexit")
                                ? <ProgressBar variant={progressVariant} now={100} striped />
                                : <ProgressBar variant={progressVariant} now={Math.ceil(progress)}  />
                            }
                            </div>
                        </Container>
                    </Accordion.Header>
                    <Accordion.Collapse eventKey={stake.stakeId}>
                        <Container onClick={() => this.setState({ esShow: false }) }>
                            <Row className="mt-2">
                                <Col className="text-end">
                                    <span className="numeric">{stake.stakedDays}</span>&nbsp;
                                    <strong>Days</strong>
                                </Col>
                                <Col><span className="numeric">{stake.startDay+1}</span>
                                    <strong> to </strong>
                                    {stake.endDay+1}
                                </Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>Start Date</strong></Col>
                                <Col className="numeric">{startDate}</Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>End Date</strong></Col>
                                <Col className="numeric">{endDate}</Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>Principal</strong></Col>
                                <Col><CryptoVal className="numeric" value={bnStakedHearts} currency="HEX" showUnit /></Col>
                            </Row>
                            {/* <Row>
                                <Col className="text-end"><strong>Shares</strong></Col>
                                <Col><CryptoVal className="numeric" value={stake.stakeShares.times(1e8)} /></Col>
                            </Row> */}
                        { bnBigPayDay.gt(0) &&
                            <Row>
                                <Col className="text-end"><strong>
                                    <span className="text-info">Big</span>
                                    <span className="text-warning">Pay</span>
                                    <span className="text-danger">Day</span>
                                </strong></Col>
                                <Col><CryptoVal className="numeric" value={bnBigPayDay} currency="HEX" showUnit /></Col>
                            </Row>
                        }
                            <Row>
                                <Col className="text-end"><strong>Yield</strong></Col>
                                <Col><CryptoVal className="numeric" value={bnPayout} currency="HEX" showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>Total Value</strong></Col>
                                <Col><strong><CryptoVal className="numeric" value={bnValueTotal} currency="HEX" showUnit /></strong></Col>
                            </Row>
                            <Row>
                                <Col className="text-success text-end"><strong>Total USD</strong></Col>
                                <Col className="numeric text-success"><strong>{"$"+usdValueTotal}</strong></Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>Net Gain</strong></Col>
                                <Col className="numeric">{percentGain}%</Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>APY</strong></Col>
                                <Col className="numeric">{percentAPY}%</Col>
                            </Row>
                            <Row className="mt-3">
                                <Col className="text-center" ref={this.esRef}>
                                    <Overlay target={this.esRef!.current} show={this.state.esShow} container={this.esRef}>
                                        <Popover>
                                            <Popover.Body className="p-0">
                                                <div id="early-end-stake-alert">
                                                    <div className="bg-dark text-light p-3">
                                                        <h2 className="text-danger text-uppercase text-center">Emergency End Stake</h2>
                                                        <div>
                                                            Remember that you made a commitment to stay staked. This is an
                                                            advanced feature. <strong><em>You should not proceed </em>
                                                            unless you <u>understand</u> <em>exactly</em> what it
                                                            will do</strong>. Ending a stake early could potentially ...<br/>
                                                            <div className="text-light text-uppercase text-center bg-danger mt-2 px-2 py-1" >
                                                                <strong>lose&nbsp;your&nbsp;entire&nbsp;principal</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Popover.Body>
                                        </Popover>
                                    </Overlay>
                                    { !this.props.readOnly && <>
                                        <VoodooButton
                                            style={{ display: !isEarly || this.state.esShow ? "inline-block" : "none" }}
                                            contract={window.contract}
                                            method="stakeEnd"
                                            params={[stake.stakeIndex, stake.stakeId]}
                                            className={'exitbtn '+exitClass}
                                            confirmationCallback={() => { this.setState({ esShow: false }); this.props.reloadStakes && this.props.reloadStakes() }}
                                            rejectionCallback={() => this.setState({ esShow: false })}
                                        >
                                            {isEarly && <>I UNDERSTAND<br/></>}END STAKE
                                        </VoodooButton>
                                        <Button
                                            variant={'exitbtn '+exitClass}
                                            style={{ display: isEarly && !this.state.esShow ? "inline-block" : "none" }}
                                            onClick={(e) => { e.stopPropagation(); this.setState({esShow: isEarly }); }}
                                        >
                                            {isEarly && <>EARLY </>}END STAKE
                                        </Button>
                                        </>
                                    }
                                </Col>
                            </Row>

                            <Container
                                style={{ maxWidth: "fit-content" }}
                                onClick={() => this.setState({ eesStatsHEX: !this.state.eesStatsHEX }) }
                            >
                                <Row className="text-light">
                                    <Col>principal</Col>
                                    <Col className="ms-3 pe-1 text-end numeric">
                                        <span style={{ display: eesDisplayUSD }}>$<CryptoVal value={usdStaked} currency="USD" /></span>
                                        <span style={{ display: eesDisplayHEX }}><CryptoVal value={bnStakedHearts} currency="HEX" />&nbsp;HEX</span>
                                    </Col>
                                </Row>
                                { hexBPD > 0 &&
                                    <Row className="text-info">
                                        <Col>
                                            <span className="text-info">Big</span>
                                            <span className="text-warning">Pay</span>
                                            <span className="text-danger">Day</span>
                                        </Col>
                                        <Col className="ms-3 pe-1 text-end numeric">
                                            <span style={{ display: eesDisplayUSD }}>+&nbsp;$<CryptoVal value={usdBPD} currency="USD" /></span>
                                            <span style={{ display: eesDisplayHEX }}>+&nbsp;<CryptoVal value={bnBigPayDay} currency="HEX" />&nbsp;HEX</span>
                                        </Col>
                                    </Row>
                                }
                                <Row className="text-info">
                                    <Col>yield</Col>
                                    <Col className="ms-3 pe-1 text-end numeric">
                                        <span style={{ display: eesDisplayUSD }}>+&nbsp;$<CryptoVal value={usdPayout} currency="USD" /></span>
                                        <span style={{ display: eesDisplayHEX }}>+&nbsp;<CryptoVal value={bnPayout} currency="HEX" />&nbsp;HEX</span>
                                    </Col>
                                </Row>
                                <Row className="text-danger">
                                    <Col>penalty</Col>
                                    <Col className="ms-3 pe-1 text-end numeric">
                                        <span style={{ display: eesDisplayUSD }}>-&nbsp;$<CryptoVal value={usdPenalty} currency="USD" /></span>
                                        <span style={{ display: eesDisplayHEX }}>-&nbsp;<CryptoVal value={bnPenalty} currency="HEX" />&nbsp;HEX</span>
                                    </Col>
                                </Row>
                                <Row className="text-success" style={{ fontWeight: "bold"}}>
                                    <Col className="text-uppercase" style={{ width: "7rem" }}>payout</Col>
                                    <Col className="ms-3 pe-1 text-end text-success" style={{ borderTop: "double grey", width: "7rem" }}>
                                        <span  style={{ display: eesDisplayUSD }}>$<CryptoVal className="numeric text-success" value={usdNetValue} currency="USD" /></span>
                                        <span  style={{ display: eesDisplayHEX }}><CryptoVal className="numeric text-success" value={bnValueTotal} currency="HEX" />&nbsp;HEX</span>
                                    </Col>
                                </Row>
                                <Row>
                                    <Col>
                                        <div className="text-center text-muted small">tap to toggle units</div>
                                    </Col>
                                </Row>
                            </Container>
                            <Row>
                                <Col className="text-end text-muted small numeric">{stake.stakeId}</Col>
                            </Row>
                        </Container>
                    </Accordion.Collapse>
                </Accordion.Item>
            </Accordion>
        )
    }
}
