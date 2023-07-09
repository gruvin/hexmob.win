import React, { useContext, useState } from 'react'
import Container from "react-bootstrap/Container"
import ProgressBar from "react-bootstrap/ProgressBar"
import Accordion from "react-bootstrap/Accordion"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Badge from "react-bootstrap/Badge"
import Button from "react-bootstrap/Button"
import Overlay from "react-bootstrap/Overlay"
import Popover from "react-bootstrap/Popover"
import { StakeData } from './lib/Stakes'
import './Stakes.scss'
import HEX from './hex_contract'
import { HexContext } from './Context'
import { format } from 'd3-format'
import { formatUnits } from 'viem'
import { CryptoVal, StakeEndButton } from './Widgets'
import {
    calcPercentGain,
    calcPercentAPY,
} from './util'
import ReactGA from 'react-ga'

import _debug from 'debug'
const debug = _debug('StakeInfo')
debug('loading')

export const StakeInfo = (props: {
    stake: StakeData,
    usdhex: number,
    readOnly?: boolean,
}) => {
    const hexData = useContext(HexContext)
    const currentDay = hexData?.currentDay || 0n
    if (!currentDay) return <>internal error</>

    const esRef = React.useRef(null)

    const [esShow, setEsShow] = useState(false)
    const [eesStatsHEX, setEesStatsHEX] = useState((hexData?.chainId || 0) in [1,369])

    const { stake, usdhex } = props
    const { lockedDay: startDay, endDay, stakedDays, progress } = stake
    const stakeDay = currentDay - startDay // day number into active stake
    const exitClass =
        (currentDay < startDay)
            ? "pendingexit"
            : (stakeDay < stakedDays / 2n)
                ? "earlyexit"
                : (stakeDay < stakedDays)
                    ? "midexit"
                    : (stakeDay < stakedDays + 14n)
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
    const _startDate = new Date(HEX.START_DATE.getTime() + Number(startDay * 24n * 3600n * 1000n))
    const startDate = _startDate.toLocaleDateString() + ' ' + _startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const _endDate = new Date(HEX.START_DATE.getTime() + Number(endDay * 24n * 3600n * 1000n))
    const endDate = _endDate.toLocaleDateString() + ' ' + _endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const { stakedHearts, stakeShares, payout, bigPayDay, penalty } = stake

    const _netValue = stakedHearts + payout + bigPayDay - penalty
    const netValue = _netValue >= 0 ? _netValue : 0n

    //////////////////////////////////////////////////////////////
    // SUMMARY TOTALS
    // @dev Summary totals assume no early end stakes hence no penalties
    const summaryTotal = stake.stakedHearts + stake.payout + stake.bigPayDay
    const usdSummaryTotal = format(",.2f")(Number(formatUnits(summaryTotal, HEX.DECIMALS)) * usdhex)
    const percentSummaryGain = format(".3f")(calcPercentGain(stake))
    const percentSummaryAPY = format(".3f")(calcPercentAPY(currentDay, stake))
    //////////////////////////////////////////////////////////////

    //////////////////////////////////////////////////////////////
    /// PREDICTED (EARLY) END STAKE FIGURES ...
    const hexStaked = Math.trunc(Number(formatUnits(stakedHearts, HEX.DECIMALS)))
    const hexPayout = Math.trunc(Number(formatUnits(payout, HEX.DECIMALS)))
    const hexBPD = Math.trunc(Number(formatUnits(bigPayDay, HEX.DECIMALS)))
    const hexPenalty = Math.trunc(Number(formatUnits(penalty, HEX.DECIMALS)))
    const hexNetValue = Math.trunc(Number(formatUnits(netValue, HEX.DECIMALS)))
    const usdStaked = Number((hexStaked * usdhex).toFixed(2))
    const usdPayout = Number((hexPayout * usdhex).toFixed(2))
    const usdBPD = Number((hexBPD * usdhex).toFixed(2))
    const usdPenalty = Number((hexPenalty * usdhex).toFixed(2))
    const usdNetValue = Number((hexNetValue * usdhex).toFixed(2))
    //////////////////////////////////////////////////////////////

    return (
        <Accordion className="my-2" defaultActiveKey="0"
            onSelect={eventKey => {
                if (eventKey) ReactGA.pageview("/current_stakes/" + eventKey)
            }}
        >
            <Accordion.Item className="bg-dark" eventKey={stake.stakeId.toString()}>
                <Accordion.Header>
                    <Container className="p-2">
                        <Row>
                            <Col xs={6} className="text-start pe-0">
                                <CryptoVal className="numeric font-weight-bold text-info h2" value={stakeShares} currency="SHARES" />
                                <span className="text-muted small"> SHARES</span>
                            </Col>
                            <Col xs={6} className="text-end pl-0">
                                <span className="text-muted small">VALUE </span>
                                <span className="numeric h3 text-success">{"$" + usdSummaryTotal}</span>
                            </Col>
                        </Row>
                        <Row>
                            <Col xs={7} className="pe-0">
                                <span className="text-muted small">ENDS </span>
                                <span className="small">{endDate}</span>
                            </Col>
                            <Col xs={5} className="text-end pl-0">
                                {(exitClass === "pendingexit") ? <Badge className="bg-primary">PENDING</Badge>
                                    : <>
                                        <span className="text-muted small">PROGRESS </span>
                                        <span className="numeric">{Number(progress).toFixed(1) + "%"}</span>
                                    </>
                                }
                            </Col>
                        </Row>
                        <div className="pb-1">
                            {(exitClass === "pendingexit")
                                ? <ProgressBar variant={progressVariant} now={100} striped />
                                : <ProgressBar variant={progressVariant} now={Math.ceil(Number(progress))} />
                            }
                        </div>
                    </Container>
                </Accordion.Header>
                <Accordion.Collapse eventKey={stake.stakeId.toString()}>
                    <Container>
                        <Row className="mt-2">
                            <Col className="text-end">
                                <span className="numeric">{Number(stake.stakedDays)}</span>&nbsp;
                                <strong>Days</strong>
                            </Col>
                            <Col className="numeric">
                                {Number(stake.lockedDay) + 1}&nbsp;to&nbsp;{Number(stake.endDay) + 1}
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
                            <Col className="text-end"><strong>APY</strong><span className="text-muted"><sup>TD</sup></span></Col>
                            <Col className="numeric">{percentSummaryAPY}%</Col>
                        </Row>
                        <Row className="mt-3">
                            <Col className="text-center" ref={esRef}>
                                <Overlay
                                    target={esRef.current}
                                    container={esRef}
                                    placement={'top'}
                                    show={esShow}
                                >
                                    <Popover>
                                        <Popover.Body className="p-0">
                                            <div id="early-end-stake-alert">
                                                <div className="bg-dark text-light p-3">
                                                    <h2 className="text-danger text-uppercase text-center">FORFEIT MINER</h2>
                                                    <div>
                                                        Remember that you committed to run this miner to full term!
                                                        This is an advanced feature. <strong><em>You should NOT
                                                            proceed </em> unless you <u>understand</u> <em>exactly </em>
                                                            what it will do</strong>. Forfeiting a miner could potentially<br />
                                                        <div className="text-light text-uppercase text-center bg-danger mt-2 px-2 py-1" >
                                                            <strong>lose&nbsp;your&nbsp;entire&nbsp;investment!</strong>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        className="mt-3"
                                                        onClick={() => setEsShow(false)}
                                                    >CANCEL</Button>
                                                </div>
                                            </div>
                                        </Popover.Body>
                                    </Popover>
                                </Overlay>
                                {!props.readOnly && <>
                                    {(!isEarly || esShow) && stake.stakeIndex !== undefined && <>
                                        <StakeEndButton
                                            stakeIndex={stake.stakeIndex}
                                            stakeId={stake.stakeId}
                                            variant={progressVariant}
                                            confirmationCallback={() => setEsShow(false)}
                                            rejectionCallback={() => setEsShow(false)}
                                        >
                                            {isEarly ? <>I UNDERSTAND</> : <>PUBLISH HEX</>}
                                        </StakeEndButton>
                                    </>}
                                    {isEarly && !esShow && <>
                                        <Button
                                            variant="danger"
                                            className={"exitbtn"}
                                            onClick={() => setEsShow(true)}>
                                            <>FORFEIT MINER</>
                                        </Button>
                                    </>}
                                </>}
                            </Col>
                        </Row>

                        {/* PREDICTED MINER TERMINATION FIGURES */}
                        <Container
                            className="ees-estimate mt-3"
                            onClick={() => setEesStatsHEX(!eesStatsHEX)}
                        >
                            <Row className="text-light">
                                <Col>Miner Cost</Col>
                                <Col className="ms-3 pe-1 text-end text-info">
                                    {eesStatsHEX
                                        ? <span><CryptoVal value={stakedHearts} currency="HEX" showUnit /></span>
                                        : <span><CryptoVal value={usdStaked} currency="USD" /></span>
                                    }
                                </Col>
                            </Row>
                            <Row>
                                <Col>Mined</Col>
                                <Col className="ms-3 pe-1 text-end">
                                    {eesStatsHEX
                                        ? <span><CryptoVal value={payout} currency="HEX" showUnit /></span>
                                        : <span><CryptoVal value={usdPayout} currency="USD" symbol={<>&nbsp;$&nbsp;</>} /></span>
                                    }
                                </Col>
                            </Row>
                            {hexBPD > 0 &&
                                <Row>
                                    <Col>
                                        <span className="text-info">Big</span>
                                        <span className="text-warning">Pay</span>
                                        <span className="text-danger">Day</span>
                                    </Col>
                                    <Col className="ms-3 pe-1 text-end">
                                        {eesStatsHEX
                                            ? <span><CryptoVal value={bigPayDay} currency="HEX"  showUnit /></span>
                                            : <span><CryptoVal value={usdBPD} currency="USD" symbol={<>&nbsp;$&nbsp;</>} /></span>
                                        }
                                    </Col>
                                </Row>
                            }
                            <Row>
                                <Col>
                                    Penalties<sup className="text-danger">&nbsp;*</sup>
                                </Col>
                                <Col className="ms-3 pe-1 text-end">
                                    <span className={penalty > 0n ? "text-danger" : ""}>
                                        {eesStatsHEX
                                            ? <span><CryptoVal value={penalty} currency="HEX" symbol={<>&nbsp;</>} showUnit /></span>
                                            : <span><CryptoVal value={usdPenalty} currency="USD" symbol={<>&nbsp;$&nbsp;</>} /></span>
                                        }
                                    </span>
                                </Col>
                            </Row>
                            <Row className="text-success">
                                <Col className="text-uppercase">Net Value</Col>
                                <Col className="ms-3 pe-1 text-end numeric-total">
                                    {eesStatsHEX
                                        ? <span><CryptoVal value={netValue} currency="HEX" showUnit /></span>
                                        : <span><CryptoVal value={usdNetValue} currency="USD" symbol={<>&nbsp;$&nbsp;</>} /></span>
                                    }
                                </Col>
                            </Row>
                            <Row>
                                <Col className="text-center text-muted small">
                                    tap for {!eesStatsHEX ? "HEX" : "dollar"} units
                                </Col>
                            </Row>
                        </Container>
                        <Container>
                            <Row>
                                <Col>
                                    <ul>
                                        <li>
                                            <sup className="text-danger">*&nbsp;</sup>Penalties apply
                                            when a mining contract is forfeited prior to term completion.
                                        </li>
                                        {!eesStatsHEX && <li>
                                            <span>Dollar values calculated from HEX at today&lsquo;s rates. </span>
                                        </li>}
                                        <li>
                                            <span>All figures are approximate and may change without notice.</span>
                                        </li>
                                    </ul>
                                </Col>
                            </Row>
                        </Container>
                        <Row>
                            <Col className="text-end text-muted small numeric">{stake.stakeId.toString()}</Col>
                        </Row>
                    </Container>
                </Accordion.Collapse>
            </Accordion.Item>
        </Accordion>
    )
}

