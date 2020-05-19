import React from 'react'
import { 
    Card,
    ProgressBar,
    Accordion,
    Row,
    Col,
    Button,
    Spinner,
    Badge
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
            waitSpinner: false
        }
    }

    handleEndStake = (stake, e) => {
        e.preventDefault();
        const { contract } = this.props
        var target = e.currentTarget // for closure access in .on(..) functions below
        target.classList.add('disabled')
        this.setState({ waitSpinner: 'secondary' })

        contract.methods.stakeEnd(stake.stakeIndex, stake.stakeId).send({
            from: stake.stakeOwner
        })
        .on('transactionHash', (hash) => {
            this.setState({ waitSpinner: 'primary' })
            debug('transactionHash: ', hash)
        })
        .on('confirmation', (confirmationNumber, receipt) => {
            debug('confirmationNumber: %s, receipt: %O', confirmationNumber, receipt)
        })
        .on('receipt', (receipt) => {
            debug('receipt: %O', receipt)
        })
        .on('error', (receipt) => { // eg. rejected or out of gas
            target.classList.remove('disabled')
            this.setState({ waitSpinner: false })
        })
    }

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

        const valueTotal = stake.stakedHearts.plus(stake.payout).plus(currentDay >= HEX.BIG_PAY_DAY ? stake.bigPayDay : 0)
        const percentGain = stake.payout / stake.stakedHearts * 100
        const daysServed = currentDay - stake.startDay
        const percentAPY = currentDay < stake.startDay ? 0 
            : currentDay < stake.endDay ? 365 / Math.min(daysServed, 365) * percentGain
            : percentGain / 365
        const pending = (currentDay < stake.lockedDay)
        return (
            <Accordion xs={12} sm={6} defaultActiveKey="0" key={stake.stakeId} className="m-1 my-2">
                <Card bg="dark" className="m-1 p-1">
                    <Accordion.Toggle as={Card.Header} eventKey={0} className="p-1">
                        <Row>
                            <Col><strong>days</strong></Col>
                            <Col xs={9}className="text-right text-info">
                                <strong><HexNum value={stake.stakedHearts} showUnit /></strong>
                            </Col>
                        </Row>
                        <Row className="mb-1">
                            <Col className="numeric">{startDay+1} to {endDay+1}</Col>
                            <Col className="text-right numeric">{ pending ? <Badge variant="primary">PENDING</Badge> : progress+"%"}</Col>
                        </Row>
                        { pending 
                            ? <ProgressBar variant={progressVariant} now={100} striped />
                            : <ProgressBar variant={progressVariant} now={Math.ceil(progress)}  />
                        }
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey={0} className="bg-secondary mt-1 p-1 rounded">
                        <Card.Body className="p-2">
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
                            <Row>
                                <Col className="text-right mt-3">
                                    <Button variant={'exitbtn '+exitClass} href="#end_stake" onClick={(e) => this.handleEndStake(stake, e)}>
                                        { this.state.waitSpinner && <>
                                            <Spinner
                                                variant={this.state.waitSpinner}
                                                as="span"
                                                animation="border"
                                                size="sm"
                                                role="status"
                                                aria-hidden="true"
                                            />{' '}</>
                                        }
                                        End Stake
                                    </Button>
                                </Col>
                            </Row>

                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}
