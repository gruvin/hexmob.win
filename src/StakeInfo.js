import React from 'react'
import { 
    Container,
    Card,
    ProgressBar,
    Accordion,
    Row,
    Col,
    Badge
} from 'react-bootstrap'
import './Stakes.scss'
import HEX from './hex_contract'
import { format } from 'd3-format'
import { CryptoVal, VoodooButton } from './Widgets' 
import { BigNumber } from 'bignumber.js'

const debug = require('debug')('StakeInfo')
debug('loading')

export class StakeInfo extends React.Component {
    render() {
        const { contract, stake } = this.props
        const { currentDay } = contract.Data
        const { startDay, endDay } = stake
        
        const progress = parseFloat((stake.progress / 1000).toPrecision(3))
        const stakeDay = stake.lockedDay + stake.stakedDays // no. days into active stake
        const exitClass = 
                currentDay < startDay ? "pendingexit"
                : currentDay < stakeDay/2 ? "earlyexit"
                : currentDay < stakeDay ? "midexit"
                : currentDay < stakeDay+7 ? "termexit"
                : "lateexit"
        const progressVariant = 
            exitClass === "pendingexit" ? "secondary"
            : exitClass === "earlyexit" ? "danger"
            : exitClass === "midexit" ? "warning"
            : exitClass === "termexit" ? "success"
            : "info" // latexit

        const interest = stake.payout.plus(stake.bigPayDay)
        const valueTotal = stake.stakedHearts.plus(interest)

        if (stake.stakedHearts.toString() == "2247648431456") {
            debug("INT: %j", { P:stake.stakedHearts.div(1e8).toString(), BPD: stake.bigPayDay.div(1e8).toString(), INT: interest.toString() })
        }

        const percentGain = interest.div(stake.stakedHearts).times(100)
        const daysServed = Math.min(currentDay - stake.startDay, stake.stakedDays)
        const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
        const endDate = _endDate.toLocaleDateString()+' '+_endDate.toLocaleTimeString()
        /*
        const percentAPY = currentDay < stake.startDay 
            ? 0 
            : ( currentDay < stake.endDay 
                ? 365 / Math.min(daysServed, 365) * percentGain
                : percentGain / 365
            )
            */

        const percentAPY = new BigNumber(365).div(daysServed).times(percentGain)

        const pending = (currentDay < stake.lockedDay)

        return (
            <Accordion xs={12} sm={6} defaultActiveKey="0" key={stake.stakeId} className="my-2">
                <Card bg="dark">
                    <Accordion.Toggle as={Card.Header} eventKey={stake.stakeId}>
                        <Container>
                            <Row>
                                <Col xs={6} className="text-left">
                                    <span className="text-muted small">PRINCIPAL </span> 
                                    <strong className="text-info"><CryptoVal value={stake.stakedHearts} /></strong>
                                </Col>
                                <Col xs={6} className="text-right">
                                    <span className="text-muted small">VALUE </span> 
                                    <strong className="text-info"><CryptoVal value={valueTotal} /></strong>
                                </Col>
                            </Row>
                            <Row className="mb-1">
                                <Col xs={7} className="numeric">
                                    <span className="text-muted small mr-1">ENDS </span>
                                    <span style={{ fontSize: "0.9em" }}>{endDate}</span>
                                </Col>
                                <Col xs={5} className="text-right numeric">
                                    { pending ? <Badge variant="primary">PENDING</Badge> 
                                        : <>
                                            <span className="text-muted small ">PROGRESS </span>
                                            <span>{progress+"%"}</span>
                                        </>
                                    }
                                </Col>
                            </Row>
                            { pending 
                                ? <ProgressBar variant={progressVariant} now={100} striped />
                                : <ProgressBar variant={progressVariant} now={Math.ceil(progress)}  />
                            }
                        </Container>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey={stake.stakeId} bg="secondary">
                        <Card.Body>
                            <Row className="mt-2">
                                <Col className="text-right"><strong>Start Day</strong></Col>
                                <Col className="numeric">{stake.startDay+1}</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>End Day</strong></Col>
                                <Col className="numeric">{stake.endDay+1}</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>End Date</strong></Col>
                                <Col className="numeric">{endDate}</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Staked Days</strong></Col>
                                <Col className="numeric">{stake.stakedDays}</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Principal</strong></Col>
                                <Col className="numeric"><CryptoVal value={stake.stakedHearts} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Shares</strong></Col>
                                <Col className="numeric"><CryptoVal value={stake.stakeShares.times(1e8)} /></Col>
                            </Row>
                        { stake.bigPayDay.gt(0) &&
                            <Row>
                                <Col className="text-right"><strong>
                                    <span className="text-info">Big</span>
                                    <span className="text-warning">Pay</span>
                                    <span className="text-danger">Day</span>
                                </strong></Col>
                                <Col className="numeric"><CryptoVal value={stake.bigPayDay} showUnit /></Col>
                            </Row>
                        }
                            <Row>
                                <Col className="text-right"><strong>Interest</strong></Col>
                                <Col className="numeric"><CryptoVal value={interest} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Value</strong></Col>
                                <Col className="numeric"><strong><CryptoVal value={valueTotal} showUnit /></strong></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>% Gain</strong></Col>
                                <Col className="numeric">{format(',')(percentGain.toPrecision(5))}%</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>% APY</strong></Col>
                                <Col className="numeric">{format(',')(percentAPY.toPrecision(5))}%</Col>
                            </Row>
                            <Row>
                                <Col className="text-center mt-3">
                                    <VoodooButton 
                                        contract={window.contract}
                                        method="stakeEnd" 
                                        params={[stake.stakeIndex, stake.stakeId]}
                                        options={{ from: stake.stakeOwner }}
                                        variant={'exitbtn '+exitClass}
                                        confirmationCallback={this.props.reloadStakes}
                                    >
                                        END STAKE
                                    </VoodooButton>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}
