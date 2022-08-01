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
import { calcInterest, calcApy } from './util'
import ReactGA from 'react-ga'
// import BigNumber from 'bignumber.js'

const debug = require('debug')('StakeInfo')
debug('loading')

export class StakeInfo extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            esShow: false,
            eesStatsHEX: false
        }
        this.esRef = createRef()
    }

    componentDidMount() {
        if (localStorage.getItem('debug')) window._SI = this
    }

    render() {
        const { contract, stake, usdhex} = this.props
        const { currentDay } = contract.Data
        const { startDay, endDay, stakedDays } = stake
        
        const progress = parseFloat((stake.progress / 1000).toPrecision(3))
        const stakeDay = currentDay - startDay // day number into active stake
        const exitClass = 
                currentDay < startDay ? "pendingexit"
                : stakeDay < stakedDays/2 ? "earlyexit"
                : stakeDay < stakedDays ? "midexit"
                : stakeDay < stakedDays+14 ? "termexit"
                : "lateexit"
        const progressVariant = 
            exitClass === "pendingexit" ? "secondary"
            : exitClass === "earlyexit" ? "danger"
            : exitClass === "midexit" ? "warning"
            : exitClass === "termexit" ? "success"
            : "info" // lateexit
        const isEarly = stakeDay < stakedDays

        const { stakedHearts, stakeShares, payout, bigPayDay, penalty } = stake
        const valueTotal = stakedHearts.plus(payout).plus(stake.bigPayDay)

        const hexStaked     = Number(stakedHearts)
        const hexPayout     = Number(payout)
        const hexBPD        = Number(bigPayDay)
        const hexPenalty    = Number(penalty)
        const hexValueTotal = Number(hexStaked + hexPayout + hexBPD)
        const hexNetValue   = Number(Math.max(0, hexValueTotal - hexPenalty))

        const usdStaked     = Number((hexStaked / 1e8 * usdhex).toFixed(2))
        const usdPayout     = Number((hexPayout / 1e8 * usdhex).toFixed(2))
        const usdBPD        = Number((hexBPD / 1e8 * usdhex).toFixed(2))
        const usdPenalty    = Number((hexPenalty / 1e8 * usdhex).toFixed(2))
        const usdValueTotal = Number((usdStaked + usdPayout + usdBPD).toFixed(2))
        const usdNetValue   = Number(Math.max(0, usdValueTotal - usdPenalty).toFixed(2))

        const percentGain = calcInterest(stake) // 1 == 1%
        const percentAPY = calcApy(currentDay, stake)

        const _startDate = new Date(HEX.START_DATE.getTime() + startDay * 24 * 3600 * 1000)
        const startDate = _startDate.toLocaleDateString()+' '+_startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        
        const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
        const endDate = _endDate.toLocaleDateString()+' '+_endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})

        const ContextAwareToggle = ({ children, eventKey, callback }) => {
            const currentEventKey = useContext(AccordionContext);
            const decoratedOnClick = useAccordionToggle(
                eventKey,
                () => callback && callback(eventKey),
            )
            const isCurrentEventKey = currentEventKey === eventKey;
            return (
                <Card.Header
                    className={(isCurrentEventKey ? "card-header-current" : "")}
                    onClick={decoratedOnClick}
                >
                {children}
                </Card.Header>
            )
        }

        const eesDisplayHEX = this.state.eesStatsHEX ? "block" : "none"
        const eesDisplayUSD = !this.state.eesStatsHEX ? "block" : "none"

        return (
            <Accordion xs={12} sm={6} defaultActiveKey="0" key={stake.stakeId} className="my-2"
                onSelect={eventKey => {
                    if (eventKey) ReactGA.pageview("/current_stakes/"+eventKey)
                }}   
            >
                <Card bg="dark">
                    <ContextAwareToggle eventKey={stake.stakeId}>
                        <Container>
                            <Row>
                                <Col xs={6} className="text-left pr-0">
                                    <CryptoVal className="numeric font-weight-bold text-info h2" value={stakeShares} currency="SHARES" />
                                    <span className="text-muted small"> SHARES</span> 
                                </Col>
                                <Col xs={6} className="text-right pl-0">
                                    <span className="text-muted small">VALUE </span> 
                                    <span className="numeric h3 text-success">{"$"+format(",.2f")(usdValueTotal)}</span>
                                </Col>
                            </Row>
                            <Row>
                                <Col xs={7} className="pr-0">
                                    <span className="text-muted small">ENDS </span>
                                    <span className="small">{endDate}</span>
                                </Col>
                                <Col xs={5} className="text-right pl-0">
                                    { (exitClass === "pendingexit") ? <Badge variant="primary">PENDING</Badge> 
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
                    </ContextAwareToggle>
                    <Accordion.Collapse eventKey={stake.stakeId}>
                        <Card.Body onClick={(e) => this.setState({ esShow: false})}>
                            <Row className="mt-2">
                                <Col className="text-right">
                                    <span className="numeric">{stake.stakedDays}</span>&nbsp;
                                    <strong>Days</strong>
                                </Col>
                                <Col><span className="numeric">{stake.startDay+1}</span>
                                    <strong> to </strong>
                                    {stake.endDay+1}
                                </Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Start Date</strong></Col>
                                <Col className="numeric">{startDate}</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>End Date</strong></Col>
                                <Col className="numeric">{endDate}</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Principal</strong></Col>
                                <Col><CryptoVal className="numeric" value={stake.stakedHearts} showUnit /></Col>
                            </Row>
                            {/* <Row>
                                <Col className="text-right"><strong>Shares</strong></Col>
                                <Col><CryptoVal className="numeric" value={stake.stakeShares.times(1e8)} /></Col>
                            </Row> */}
                        { bigPayDay.gt(0) &&
                            <Row>
                                <Col className="text-right"><strong>
                                    <span className="text-info">Big</span>
                                    <span className="text-warning">Pay</span>
                                    <span className="text-danger">Day</span>
                                </strong></Col>
                                <Col><CryptoVal className="numeric" value={bigPayDay} showUnit /></Col>
                            </Row>
                        }
                            <Row>
                                <Col className="text-right"><strong>Yield</strong></Col>
                                <Col><CryptoVal className="numeric" value={payout} showUnit /></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Total Value</strong></Col>
                                <Col><strong><CryptoVal className="numeric" value={valueTotal} showUnit /></strong></Col>
                            </Row>
                            <Row>
                                <Col className="text-success text-right"><strong>Total USD</strong></Col>
                                <Col className="numeric text-success"><strong>{ "$"+format(",.2f")(usdValueTotal)}</strong></Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>Net Gain</strong></Col>
                                <Col className="numeric">{format(',')(percentGain.toPrecision(5))}%</Col>
                            </Row>
                            <Row>
                                <Col className="text-right"><strong>APY</strong></Col>
                                <Col className="numeric">{format(',')(percentAPY.toPrecision(5))}%</Col>
                            </Row>
                            <Row>
                                <Col className="text-center mt-3" ref={this.esRef}>
                                    <Overlay target={this.esRef.current} show={this.state.esShow}>
                                        <Popover>
                                            <Popover.Content className="p-0">
                                                <div id="early-end-stake-alert">
                                                    <div className="bg-dark text-light p-3">
                                                        <h2 className="text-danger text-uppercase text-center">Emergency End Stake</h2>
                                                        <div>
                                                            Remember that you made a commitment to stay staked. This is an 
                                                            advanced feature. <strong><em>You should not proceed </em> 
                                                            unless you <u>understand</u> <em>exactly</em> what it 
                                                            will do</strong>. Ending a stake early could potentially ...<br/>
                                                            <div 
                                                                className="text-light text-uppercase text-center bg-danger"
                                                                style={{
                                                                    marginTop: "8px",
                                                                    padding: "2px 0.8em",
                                                                    fontSize: "0.95em",
                                                                    fontWeight: "bold",
                                                                    borderRadius: "5px",
                                                                    margin: "auto"
                                                                }}
                                                            >lose&nbsp;your&nbsp;entire&nbsp;principal</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Popover.Content>
                                        </Popover>
                                    </Overlay>
                                    { !this.props.readOnly && <>
                                        <VoodooButton
                                            style={{ display: (!isEarly) || this.state.esShow ? "inline-block" : "none" }}
                                            contract={window.contract}
                                            method="stakeEnd" 
                                            params={[stake.stakeIndex, stake.stakeId]}
                                            options={{ from: stake.stakeOwner }}
                                            variant={'exitbtn '+exitClass}
                                            confirmationCallback={() => this.props.reloadStakes()}
                                            rejectionCallback={() => this.setState({ esShow: false })} 
                                            >
                                        {isEarly && <>I UNDERSTAND — </>}END STAKE
                                        </VoodooButton>
                                        <Button
                                            variant={'exitbtn '+exitClass}
                                            style={{ display: isEarly && !this.state.esShow ? "inline-block" : "none" }}
                                            onClick={(e) => { e.stopPropagation(); this.setState({ esShow: true })} }>
                                            {isEarly && <>EARLY </>}END STAKE
                                        </Button>
                                        </>
                                    }
                                </Col>
                            </Row>

                            <Row onClick={() => this.setState({ eesStatsHEX: !this.state.eesStatsHEX }) }>
                                <Col xs={12}>
                                    {/* HEX values */}
                                    <table style={{ display: eesDisplayHEX, margin: "1em auto", width: "min-content", fontSize: "0.95em", lineHeight: "1em" }}>
                                        <tbody>
                                        <tr className="text-light">
                                            <td className="col-sm-2">principal</td>
                                            <td className="col-sm-4 pr-0 text-right"><CryptoVal className="numeric" value={hexStaked} currency="HEX" />&nbsp;HEX</td>
                                        </tr>
                                        { hexBPD > 0 &&
                                            <tr className="text-info">
                                                <td className="col-sm-2">
                                                    <span className="text-info">B</span>
                                                    <span className="text-warning">P</span>
                                                    <span className="text-danger">D</span>
                                                </td>
                                                <td className="col-sm-4 pr-0 text-right">+&nbsp;<CryptoVal className="numeric" value={hexBPD} currency="HEX" />&nbsp;HEX</td>
                                            </tr>
                                        }
                                        <tr className="text-info">
                                            <td className="col-sm-2">yield</td>
                                            <td className="col-sm-4 pr-0 text-right">+&nbsp;<CryptoVal className="numeric" value={hexPayout} currency="HEX" />&nbsp;HEX</td>
                                        </tr>
                                        <tr className="text-danger">
                                            <td className="col-sm-2">penalty</td>
                                            <td className="col-sm-4 pr-0 text-right">-&nbsp;<CryptoVal className="numeric" value={hexPenalty} currency="HEX" />&nbsp;HEX</td>
                                        </tr>
                                        <tr className="text-success" style={{ fontWeight: "bold"}}>
                                            <td className="col-sm-2 text-uppercase">payout</td>
                                            <td className="col-sm-4 pr-0 text-right" style={{ borderTop: "double grey" }}>
                                                <span className="text-success"><CryptoVal 
                                                    className="numeric text-success" value={hexNetValue} 
                                                    currency="HEX" />&nbsp;HEX
                                                </span>
                                            </td>
                                        </tr>
                                        </tbody>
                                    </table>

                                    {/* USD values */}
                                    <table style={{ display: eesDisplayUSD, margin: "1em auto", width: "min-content", fontSize: "0.95em", lineHeight: "1em" }}>
                                        <tbody>
                                        <tr className="text-light">
                                            <td className="col-sm-2">principal</td>
                                            <td className="col-sm-2 pr-0 text-right">$<CryptoVal className="numeric" value={usdStaked} currency="USD" /></td>
                                        </tr>
                                        { usdBPD > 0 &&
                                            <tr className="text-info">
                                                <td className="col-sm-2">
                                                    <span className="text-info">B</span>
                                                    <span className="text-warning">P</span>
                                                    <span className="text-danger">D</span>
                                                </td>
                                                <td className="col-sm-2 pr-0 text-right">+&nbsp;$<CryptoVal className="numeric" value={usdBPD} currency="USD" /> </td>
                                            </tr>
                                        }
                                        <tr className="text-info">
                                            <td className="col-sm-2">yield</td>
                                            <td className="col-sm-2 pr-0 text-right">+&nbsp;$<CryptoVal className="numeric" value={usdPayout} currency="USD" /> </td>
                                        </tr>
                                        <tr className="text-danger">
                                            <td className="col-sm-2">penalty</td>
                                            <td className="col-sm-2 pr-0 text-right">-&nbsp;$<CryptoVal className="numeric" value={usdPenalty} currency="USD" /></td>
                                        </tr>
                                        <tr className="text-success" style={{ fontWeight: "bold"}}>
                                            <td className="col-sm-2 text-uppercase">payout</td>
                                            <td className="col-sm-2 pr-0 text-right" style={{ borderTop: "double grey" }}>
                                                <span className="text-success">$<CryptoVal 
                                                    className="numeric text-success" value={usdNetValue} 
                                                    currency="USD" />
                                                </span>
                                            </td>
                                        </tr>
                                        </tbody>
                                    </table>
                                    <div className="text-center text-muted small">tap to toggle units</div>
                                </Col>
                            </Row>
                            <div className="float-right text-muted small numeric">{stake.stakeId}</div>
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}
