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
    fnCalcPercentGain,
    fnCalcPercentAPY,
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
            eesStatsHEX: (window.ethersSigner.provider._network.chainId !== 1)
        }
        this.esRef = createRef()
    }

    componentDidMount() {
        if (localStorage.getItem('debug')) {
            window._UTIL = {
                fnCalcPercentGain,
                fnCalcPercentAPY,
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
        const _startDate = new Date(HEX.START_DATE.getTime() + startDay * 24 * 3600 * 1000)
        const startDate = _startDate.toLocaleDateString()+' '+_startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
        const endDate = _endDate.toLocaleDateString()+' '+_endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})

        const { bnStakedHearts, bnStakeShares, bnPayout, bnBigPayDay, bnPenalty } = stake
        // NOTE: bnPayout is actually just the yield (interest) produced by the stake

        const bnResidual = bnStakedHearts.sub(bnPenalty)
        const _bnNetValue = bnStakedHearts.add(bnPayout).add(bnBigPayDay).sub(bnPenalty)
        const bnNetValue = _bnNetValue.gt(0) ? _bnNetValue : ethers.BigNumber.from(0)

        //////////////////////////////////////////////////////////////
        // SUMMARY TOTALS
        // @dev Summary totals assume no early end stakes hence no penalties
        const bnSummaryTotal  = bnStakedHearts.add(bnPayout).add(bnBigPayDay)
        const usdSummaryTotal = format(",.2f")(Number(ethers.utils.formatUnits(bnSummaryTotal, HEX.DECIMALS)) * usdhex )
        const percentSummaryGain   = format(".3f")(fnCalcPercentGain(stake).toUnsafeFloat())
        const percentSummaryAPY    = format(".3f")(fnCalcPercentAPY(currentDay, stake).toUnsafeFloat())
        //////////////////////////////////////////////////////////////

        //////////////////////////////////////////////////////////////
        /// PREDICTED (EARLY) END STAKE FIGURES ...

        // Calculate USD values from BN values
        const hexStaked      = Math.trunc(Number(formatUnits(bnStakedHearts, HEX.DECIMALS)))
        const hexPayout      = Math.trunc(Number(formatUnits(bnPayout, HEX.DECIMALS)))
        const hexBPD         = Math.trunc(Number(formatUnits(bnBigPayDay, HEX.DECIMALS)))
        const hexPenalty     = Math.trunc(Number(formatUnits(bnPenalty, HEX.DECIMALS)))
        const hexResidual    = Math.trunc(Number(formatUnits(bnResidual, HEX.DECIMALS)))
        const _usdStaked     = Number((hexStaked * usdhex).toFixed(2))
        const _usdPayout     = Number((hexPayout * usdhex).toFixed(2))
        const _usdBPD        = Number((hexBPD * usdhex).toFixed(2))
        const _usdPenalty    = Number((hexPenalty * usdhex).toFixed(2))
        const _usdResidual   = Number((hexResidual * usdhex).toFixed(2))
        // format USD values for display
        const usdStaked      = format(",.2f")(_usdStaked)
        const usdPayout      = format(",.2f")(_usdPayout)
        const usdBPD         = format(",.2f")(_usdBPD)
        const usdPenalty     = format(",.2f")(_usdPenalty)
        const usdResidual    = format(",.2f")(_usdResidual)
        const usdNetValue    = format(",.2f")(Math.max(0, _usdStaked + _usdBPD + _usdPayout - _usdPenalty))
        //////////////////////////////////////////////////////////////

        const Notes = () => {
            const costValue = !this.state.eesStatsHEX 
                ? <span> ${usdStaked} worth of HEX </span>
                : <span> <CryptoVal className="numeric" value={bnStakedHearts} currency="HEX" />&nbsp;HEX </span>

            const penaltyValue = this.state.eesStatsHEX 
                ? <span><CryptoVal className="numeric" value={bnPenalty} currency="HEX" />&nbsp;HEX</span>
                : <span>${usdPenalty}</span>

            return (
                <ul className="no-bullets">
                    <li>
                        <span><strong>Net Residual</strong> = Miner Cost ({costValue} was burned.) </span>
                        { bnPenalty.gt(0)
                            ? <span><span className="text-danger">minus {penaltyValue}</span> early termination penalties. </span>
                            : <span>No early termination penalties apply. </span> 
                        }
                    </li>
                    { !this.state.eesStatsHEX && <li>
                        <span>Dollar values calculated from HEX at today's rates. </span>
                    </li>}
                    <li>
                        <span>All figures are approximate and could change.</span>
                    </li>
                </ul>
            )
        }

        return (
            <Accordion className="my-2" defaultActiveKey="0"
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
                                    <span className="numeric h3 text-success">{"$"+usdSummaryTotal}</span>
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
                                <Col className="text-end"><strong>Net Gain</strong></Col>
                                <Col className="numeric">{percentSummaryGain}%</Col>
                            </Row>
                            <Row>
                                <Col className="text-end"><strong>APY</strong></Col>
                                <Col className="numeric">{percentSummaryAPY}%</Col>
                            </Row>
                            <Row className="mt-3">
                                <Col className="text-center" ref={this.esRef}>
                                    <Overlay target={this.esRef!.current} show={this.state.esShow} container={this.esRef}>
                                        <Popover>
                                            <Popover.Body className="p-0">
                                                <div id="early-end-stake-alert">
                                                    <div className="bg-dark text-light p-3">
                                                        <h2 className="text-danger text-uppercase text-center">FORFEIT MINER</h2>
                                                        <div>
                                                            Remember that you committed to run this miner to full term!
                                                            This is an advanced feature. <strong><em>You should NOT
                                                            proceed </em> unless you <u>understand</u> <em>exactly</em>
                                                            what it will do</strong>. Forfeiting a miner could potentially<br/>
                                                            <div className="text-light text-uppercase text-center bg-danger mt-2 px-2 py-1" >
                                                                <strong>lose&nbsp;your&nbsp;entire&nbsp;investment!</strong>
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
                                            confirmationCallback={() => {
                                                this.setState({ esShow: false })
                                                this.props.reloadStakes && this.props.reloadStakes()
                                            }}
                                            rejectionCallback={() => this.setState({ esShow: false })}
                                        >
                                            {isEarly && <>I UNDERSTAND<br/></>}
                                        </VoodooButton>
                                        <Button
                                            variant={'exitbtn '+exitClass}
                                            style={{ display: isEarly && !this.state.esShow ? "inline-block" : "none" }}
                                            onClick={(e) => { e.stopPropagation(); this.setState({esShow: isEarly }); }}
                                        >
                                            {isEarly && <>FORFEIT MINER</>}
                                            {!isEarly && <>PUBLISH HEX</>}
                                        </Button>
                                        </>
                                    }
                                </Col>
                            </Row>

                            {/* PREDICTED MINER TERMINATION FIGURES */}
                            <Container
                                style={{ maxWidth: "fit-content", marginTop: "1em" }}
                                onClick={() => this.setState({ eesStatsHEX: !this.state.eesStatsHEX }) }
                            >
                                <Row className="text-light">
                                    <Col>Miner Cost</Col>
                                    <Col className="ms-3 pe-1 text-end text-danger numeric">
                                        { this.state.eesStatsHEX
                                            ? <span>-&nbsp;<CryptoVal value={bnStakedHearts} currency="HEX" />&nbsp;HEX</span>
                                            : <span>-&nbsp;$&nbsp;{usdStaked}</span>
                                        }
                                    </Col>
                                </Row>
                                <Row>
                                    <Col>Miner Yield</Col>
                                    <Col className="ms-3 pe-1 text-end numeric">
                                        { this.state.eesStatsHEX
                                            ? <span>+&nbsp;<CryptoVal value={bnPayout} currency="HEX" />&nbsp;HEX</span>
                                            : <span>+&nbsp;$&nbsp;{usdPayout}</span>
                                        }
                                    </Col>
                                </Row>
                                { hexBPD > 0 &&
                                    <Row>
                                        <Col>
                                            <span className="text-info">Big</span>
                                            <span className="text-warning">Pay</span>
                                            <span className="text-danger">Day</span>
                                        </Col>
                                        <Col className="ms-3 pe-1 text-end numeric">
                                            { this.state.eesStatsHEX
                                                ? <span>+&nbsp;<CryptoVal value={bnBigPayDay} currency="HEX" />&nbsp;HEX</span>
                                                : <span>+&nbsp;$&nbsp;{usdBPD}</span>
                                            }
                                        </Col>
                                    </Row>
                                }
                                <Row>
                                    <Col>
                                        Net&nbsp;Residual{ bnPenalty.gt(0) && <sup className="text-danger">&nbsp;***</sup> }
                                    </Col>
                                    <Col className="ms-3 pe-1 text-end numeric">
                                        <span className={bnResidual.lte(0) ? "text-danger" : ""}>
                                            { this.state.eesStatsHEX
                                                ? <span><CryptoVal value={bnResidual} currency="HEX" />&nbsp;HEX</span>
                                                : <span>$&nbsp;{usdResidual}</span>
                                            }
                                        </span>
                                    </Col>
                                </Row>
                                <Row className="text-success">
                                    <Col className="text-uppercase" style={{ width: "7rem" }}>Net Return</Col>
                                    <Col className="ms-3 pe-1 text-end" style={{ borderTop: "double grey", width: "7rem" }}>
                                        { this.state.eesStatsHEX
                                            ? <span><CryptoVal className="numeric" value={bnNetValue} currency="HEX" />&nbsp;HEX</span>
                                            : <span>$&nbsp;{usdNetValue}</span>
                                        }
                                    </Col>
                                </Row>
                                <Row>
                                    <Col className="text-center text-muted small">
                                        tap for { this.state.eesStatsHEX ? "HEX" : "dollar"} units
                                    </Col>
                                </Row>
                            </Container>
                            <Container style={{ maxWidth: "fit-content"}}>
                                <Row className="small">
                                    <Col>
                                       <Notes/>
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
