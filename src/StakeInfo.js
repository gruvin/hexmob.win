import React, { createRef, useContext } from 'react'
import { 
    Container,
    Card,
    ProgressBar,
    Accordion,
    AccordionContext,
    useAccordionToggle,
    Row,
    Col,
    Badge,
    Button,
    Overlay,
    Popover,
} from 'react-bootstrap'
import './Stakes.scss'
import HEX from './hex_contract'
import { format } from 'd3-format'
import { CryptoVal, VoodooButton } from './Widgets' 
import { BigNumber } from 'bignumber.js'

const debug = require('debug')('StakeInfo')
debug('loading')

export class StakeInfo extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            esShow: false
        }
        this.esRef = createRef()
    }

    render() {
        const { contract, stake, usdhex} = this.props
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

        const shares = stake.stakeShares
        const interest = stake.payout.plus(stake.bigPayDay)
        const valueTotal = stake.stakedHearts.plus(interest)
        const usdValueTotal = valueTotal.div(1e8).times(usdhex).toNumber()

        const percentGain = interest.div(stake.stakedHearts).times(100)
        const daysServed = Math.min(currentDay - stake.startDay, stake.stakedDays)
        const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
        const endDate = _endDate.toLocaleDateString()+' '+_endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        const percentAPY = new BigNumber(365).div(daysServed).times(percentGain)

        const pending = (currentDay < stake.lockedDay)
        const earlyExit = (currentDay < stakeDay)

        const ContextAwareToggle = ({ children, eventKey, callback }) => {
            const currentEventKey = useContext(AccordionContext);
            const decoratedOnClick = useAccordionToggle(
                eventKey,
                () => callback && callback(eventKey),
            );
            const isCurrentEventKey = currentEventKey === eventKey;
            return (
                <Card.Header
                    className={(isCurrentEventKey ? "card-header-current" : "")}
                    onClick={decoratedOnClick}
                >
                {children}
                </Card.Header>
            );
        }

        return (
            <Accordion xs={12} sm={6} defaultActiveKey="0" key={stake.stakeId} className="my-2">
                <Card bg="dark">
                    <ContextAwareToggle eventKey={stake.stakeId}>
                        <Container>
                            <Row>
                                <Col xs={6} className="text-left pr-0">
                                    <CryptoVal className="numeric font-weight-bold text-info h2" value={shares} currency="SHARES" />
                                    <span className="text-muted small"> SHARES</span> 
                                </Col>
                                <Col xs={6} className="text-right pl-0">
                                    <span className="text-muted small">VALUE </span> 
                                    <span className="numeric h3 text-success">{"$"+format(",.2f")(usdValueTotal)}</span>
                                </Col>
                            </Row>
                            <Row className="mb-1">
                                <Col xs={7} className="pr-0">
                                    <span className="text-muted small">ENDS </span>
                                    <span className="small">{endDate}</span>
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
                    </ContextAwareToggle>
                    <Accordion.Collapse eventKey={stake.stakeId}>
                        <Card.Body onClick={(e) => this.setState({ esShow: false})}>
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
                                <Col><CryptoVal className="numeric" value={stake.stakedHearts} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Shares</strong></Col>
                                <Col><CryptoVal className="numeric" value={stake.stakeShares.times(1e8)} /></Col>
                            </Row>
                        { stake.bigPayDay.gt(0) &&
                            <Row>
                                <Col className="text-right"><strong>
                                    <span className="text-info">Big</span>
                                    <span className="text-warning">Pay</span>
                                    <span className="text-danger">Day</span>
                                </strong></Col>
                                <Col><CryptoVal className="numeric" value={stake.bigPayDay} showUnit /></Col>
                            </Row>
                        }
                            <Row>
                                <Col className="text-right"><strong>Interest</strong></Col>
                                <Col><CryptoVal className="numeric" value={interest} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Value</strong></Col>
                                <Col><strong><CryptoVal className="numeric" value={valueTotal} showUnit /></strong></Col>
                            </Row>
                            <Row>
                                <Col className="text-success text-right"><strong>USD Value</strong></Col>
                                <Col className="numeric text-success"><strong>{ "$"+format(",.2f")(valueTotal.div(1E8).times(usdhex).toNumber() )}</strong></Col>
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
                                <Col className="text-center mt-3" ref={this.esRef}>
                                    <Overlay target={this.esRef.current} show={this.state.esShow}>
                                        <Popover>
                                            <Popover.Content className="p-0">
                                                <div id="early-end-stake-alert">
                                                    <div className="bg-dark text-light p-3">
                                                        <h4 className="text-danger">Emergency End Stake</h4>
                                                        <p>
                                                            Remember that you made a commitment to stay staked. This is an advanced feature 
                                                            for advanced users. <strong><em>You should not proceed</em> unless you <u>fully understand</u> what it 
                                                            will do.</strong>
                                                        </p>
                                                    </div>
                                                </div>
                                            </Popover.Content>
                                        </Popover>
                                    </Overlay>
                                    <VoodooButton
                                        style={{ display: !earlyExit || this.state.esShow ? "inline-block" : "none" }}
                                        contract={window.contract}
                                        method="stakeEnd" 
                                        params={[stake.stakeIndex, stake.stakeId]}
                                        options={{ from: stake.stakeOwner }}
                                        variant={'exitbtn '+exitClass}
                                        confirmationCallback={() => this.props.reloadStakes()}
                                        rejectionCallback={() => this.setState({ esShow: false })} 
                                    >
                                    { earlyExit && <>I UNDERSTAND — </>}END STAKE
                                    </VoodooButton>
                                    <Button 
                                        variant={'exitbtn '+exitClass}
                                        style={{ display: earlyExit && !this.state.esShow ? "inline-block" : "none" }}
                                        onClick={(e) => { e.stopPropagation(); this.setState({ esShow: true })} }>
                                        EARLY END STAKE
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
