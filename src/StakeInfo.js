import React from 'react'
import { 
    Card,
    ProgressBar,
    Accordion,
    Row,
    Col
} from 'react-bootstrap'
import './Stakes.scss'
import HEX from './hex_contract'
import { format } from 'd3-format'
import { HexNum } from './Widgets' 
const debug = require('debug')('StakeInfo')
debug('loading')

export class StakeInfo extends React.Component {
    constructor(props) {
        super(props)
        this.state = {

        }
    }

    render() {
        const { contract, stake } = this.props
        const { currentDay } = contract.Data
        const progress = Math.min(currentDay - stake.startDay, stake.stakedDays) / stake.stakedDays * 100
        const v = progress < 50 ? "danger" : progress < 100 ? "warning" : "success"
        const valueTotal = stake.stakedHearts.plus(stake.payout).plus(currentDay >= HEX.BIG_PAY_DAY ? stake.bigPayDay : 0)
        const percentGain = valueTotal / stake.stakedHearts * 100
        const daysServed = currentDay - stake.startDay
        const percentAPY = currentDay < stake.endDay
            ? 365 / Math.min(daysServed, 365) * percentGain
            : percentGain / 365
        return (
            <Accordion xs={12} sm={6} defaultActiveKey="0" key={stake.stakeId} className="m-1 mt-3">
                <Card bg="dark" className="m-1 p-1">
                    <Accordion.Toggle as={Card.Header} eventKey={0} className="p-1">
                        <Row>
                            <Col><strong>Day</strong></Col>
                            <Col xs={7}className="text-right"><strong>Staked</strong>{' '}<HexNum value={stake.stakedHearts} showUnit /></Col>
                        </Row>
                        <Row>
                            <Col>{stake.startDay} to {stake.endDay}</Col>
                            <Col className="text-right">{progress.toPrecision(3)}%</Col>
                        </Row>
                        <ProgressBar variant={v} now={Math.ceil(progress)} />
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey={0} className="bg-secondary m-1 p-1 rounded">
                        <Card.Body className="p-1">
                            <Row>
                                <Col><strong>Start Day</strong></Col>
                                <Col className="numeric">{stake.startDay}</Col>
                            </Row>
                            <Row>
                                <Col><strong>End Day</strong></Col>
                                <Col className="numeric">{stake.endDay}</Col>
                            </Row>
                            <Row>
                                <Col><strong>Staked Days</strong></Col>
                                <Col className="numeric">{stake.stakedDays}</Col>
                            </Row>
                            <Row>
                                <Col><strong>Principal</strong></Col>
                                <Col className="numeric"><HexNum value={stake.stakedHearts} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col><strong>Shares</strong></Col>
                                <Col className="numeric"><HexNum value={stake.stakeShares.times(1e8)} /></Col>
                            </Row>
                            <Row>
                                <Col><strong>
                                    <span className="text-info">Big</span>
                                    <span className="text-warning">Pay</span>
                                    <span className="text-danger">Day</span>
                                </strong></Col>
                                <Col className="numeric"><HexNum value={stake.bigPayDay} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col><strong>Interest</strong></Col>
                                <Col className="numeric"><HexNum value={stake.payout} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col><strong>Value</strong></Col>
                                <Col className="numeric"><strong><HexNum value={valueTotal} showUnit /></strong></Col>
                            </Row>
                            <Row>
                                <Col><strong>% Gain</strong></Col>
                                <Col className="numeric">{format(',')(percentGain.toPrecision(5))}%</Col>
                            </Row>
                            <Row>
                                <Col><strong>% APY</strong></Col>
                                <Col className="numeric">{format(',')(percentAPY.toPrecision(5))}%</Col>
                            </Row>

                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}
