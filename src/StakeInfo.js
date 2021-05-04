import React from 'react'
import { 
    Container,
    Card,
    ProgressBar,
    Accordion,
    Row,
    Col,
    Badge,
    Button,
    Overlay,
    OverlayTrigger,
    Popover
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

        const percentGain = interest.div(stake.stakedHearts).times(100)
        const daysServed = Math.min(currentDay - stake.startDay, stake.stakedDays)
        const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
        const endDate = _endDate.toLocaleDateString()+' '+_endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        const percentAPY = new BigNumber(365).div(daysServed).times(percentGain)

        const pending = (currentDay < stake.lockedDay)
        let exitEnabled = (currentDay >= stakeDay)

        const popoverEndStake = (
            <Popover id="popover-basic" placement="auto">
                <Popover.Content style={{ padding: 0 }}>
                    <div id="early-end-stake-alert">
                        <div className="bg-dark text-light p-3">
                            <h4 className="text-danger">Emergency End Stake</h4>
                            <p>
                                Remember that you made a commitment to stay staked. This is an advanced feature 
                                for advanced users. <strong><em>You should not proceed unless you <u>fully understand</u> what it 
                                will do.</em></strong>
                            </p>
                        </div>
                        <Button onClick={exitEnabled=true}>I UNDERSTAND</Button>
                    </div>
                </Popover.Content>
            </Popover>
        )

        return (
            <Accordion xs={12} sm={6} defaultActiveKey="0" key={stake.stakeId} className="my-2">
                <Card bg="dark">
                    <Accordion.Toggle as={Card.Header} eventKey={stake.stakeId}>
                        <Container>
                            <Row>
                                <Col xs={6} className="text-left pr-0">
                                    <span className="text-muted small">PRINCIPAL </span> 
                                    <strong className="text-info"><CryptoVal value={stake.stakedHearts} /></strong>
                                </Col>
                                <Col xs={6} className="text-right pl-0">
                                    <span className="text-muted small">VALUE </span> 
                                    <strong className="text-info"><CryptoVal value={valueTotal} /></strong>
                                </Col>
                            </Row>
                            <Row className="mb-1">
                                <Col xs={7} className="pr-0">
                                    <span className="text-muted small">ENDS </span>
                                    <span className="numeric">{endDate}</span>
                                </Col>
                                <Col xs={5} className="text-right pl-0">
                                    { pending ? <Badge variant="primary">PENDING</Badge> 
                                        : <>
                                            <span className="text-muted small">PROGRESS </span>
                                            <span className="numeric">{progress+"%"}</span>
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
            <>
            { (exitEnabled) 
                ?
                                        <VoodooButton 
                                            contract={window.contract}
                                            method="stakeEnd" 
                                            params={[stake.stakeIndex, stake.stakeId]}
                                            options={{ from: stake.stakeOwner }}
                                            variant={'exitbtn '+exitClass}
                                            confirmationCallback={this.props.reloadStakes}
                                        >
                                            { (currentDay < stakeDay) ? "EARLY " : ""}END STAKE
                                        </VoodooButton>
                :
                                    <OverlayTrigger overlay={popoverEndStake}>
                                        <Button>END STAKE</Button>
                                    </OverlayTrigger>
            }
            </>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}
