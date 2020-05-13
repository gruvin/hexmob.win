import React from 'react'
import { 
    Container,
    Card,
    Table,
    Button,
    Modal,
    Badge,
    Alert,
    OverlayTrigger,
    Tooltip,
    ProgressBar,
    Accordion,
    Form,
    InputGroup,
    FormControl,
    Dropdown,
    DropdownButton,
    Row,
    Col
} from 'react-bootstrap'
import './Stakes.css'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'

/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
 */
function HexNum(props) {
    const v = props.value
    const s = format(v < 1e6 ? (v < 1e3 ? ",.3f" : ",.0f") : ",.5s")(v)
    const r = s.match(/^(.*)(\.\d+)(.*)$/) 

    if (r && r.length > 1)
        return ( 
            <>
                { r[1] } 
                <span style={{ opacity: "0.5" }}>
                    { r[2] }
                </span>
                { r[3] && r[3] }
            </>
        ) 
        else 
            return ( <>{s}</> )
}

class NewStakeForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            availableBalance: new BigNumber(props.context.availableBalance),
            contractData: props.context.contractData,
            stakeAmount: new BigNumber(0),
            stakeDays: 0,
            lastFullDay: '',
            endDay: '',
            longerPaysBetter: new BigNumber(0), // Hearts
            biggerPaysBetter: new BigNumber(0),
            total: new BigNumber(0),
            effectiveHEX: new BigNumber(0),
            shareRate: new BigNumber(0),
            stakeShares: new BigNumber(0),
            bigPayDay: new BigNumber(0),
            percentGain: 0.0,
            percentAPY: 0.0
        }
    }

    static getDerivedStateFromProps(newProps, prevState) {
        return { 
            availableBalance: new BigNumber(newProps.context.availableBalance),
            contractData: newProps.context.contractData,
        }
    }
    
    render() {

        const currentDay = this.state.contractData.currentDay + 1

        const updateFigures = () => {
            const { stakeAmount, stakeDays } = this.state

            this.setState({ 
                longerPaysBetter: stakeAmount.div(1e8),
                biggerPaysBetter: stakeDays
            })
        }

        const handleAmountChange = (e) => {
            e.preventDefault()
            const tv = e.target.value
            const m = tv.match(/^[.0-9]+$/)
            const v = m ? m[0] : 0
            this.setState({
                stakeAmount: new BigNumber(1).times(v).times(1E8) 
            }, updateFigures)
        }

        const handleDaysChange = (e) => {
            e.preventDefault()
            const stakeDays = Number(parseInt(e.target.value) || 0)
            this.setState({
                stakeDays,
                lastFullDay: stakeDays > 0 ? currentDay + stakeDays : '',
                endDay: stakeDays > 0 ? currentDay + stakeDays + 1 : '',
            }, updateFigures)
        }
        
        const handleAmountSelector = (key, e) => {
            e.preventDefault()
            e.stopPropagation() // doesn't seem to work :( So, I set eventKey to 'current_stakes' to prevent Accordion from acting on the event. :/
            const portion = parseFloat(e.target.dataset.portion)
            this.setState({ 
                stakeAmount: new BigNumber(this.state.availableBalance.idiv(1e8).times(portion).times(1e8)) 
            }, updateFigures)
        }

        return (
            <Row>
                <Col md={5}>
                    <Form>
                        <Form.Group controlId="stakeAmount">
                            <Form.Label>Stake Amount in HEX</Form.Label> 
                            <InputGroup>
                                <FormControl
                                    type="number"
                                    placeholder="amount of HEX to stake"
                                    value={this.state.stakeAmount.eq(0) ? 'amount of HEX to stake' : this.state.stakeAmount.div(1e8).toString()}
                                    aria-label="amount to stake"
                                    aria-describedby="basic-addon1"
                                    onChange={handleAmountChange}
                                />
                                <DropdownButton
                                    as={InputGroup.Append}
                                    variant="secondary"
                                    key="percent_balance_selector"
                                    title="HEX"
                                    id="input-group-dropdown-1"
                                    onSelect={handleAmountSelector}
                                >
                                    <Dropdown.Item as="button" eventKey="current_stakes" data-portion={1.00}>MAX</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="current_stakes" data-portion={0.75}>75%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="current_stakes" data-portion={0.50}>50%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="current_stakes" data-portion={0.25}>25%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="current_stakes" data-portion={0.10}>10%</Dropdown.Item>
                                    <Dropdown.Item as="button" eventKey="current_stakes" data-portion={0.05}>5%</Dropdown.Item>
                                </DropdownButton>
                            </InputGroup>
                            <Form.Text>
                                <span className="text-muted">Bigger pays better</span>
                                <div className="float-right" variant="info" >
                                    <HexNum value={this.state.availableBalance.div(1e8).toString()} /> HEX available
                                </div>
                            </Form.Text>
                        </Form.Group>
                        <Form.Group controlId="stakeDays">
                            <Form.Label>Stake Length in Days</Form.Label>
                            <InputGroup>
                                <Form.Control
                                    type="number" 
                                    placeholder="minimum one day" 
                                    value={this.state.stakeDays <= 0 ? 'stake term in days' : this.state.stakeDays}
                                    aria-label="number of days to stake"
                                    onChange={handleDaysChange} 
                                />
                                <InputGroup.Append>
                                    <InputGroup.Text id="basic-addon3">DAYS</InputGroup.Text>
                                </InputGroup.Append>
                            </InputGroup>
                            <Form.Text className="text-muted">
                                Longer pays better (max 5555)
                            </Form.Text>
                        </Form.Group>
                        <Row>
                            <Col>
                                <Row>
                                    <Col>Start Day:</Col>
                                    <Col md={4} className="text-right">{ currentDay + 1 }</Col>
                                </Row>
                                <Row>
                                    <Col>Last Full Day:</Col>
                                    <Col md={4} className="text-right">{ this.state.lastFullDay }</Col>
                                </Row>
                                <Row>
                                    <Col>End Day:</Col>
                                    <Col md={4} className="text-right">{ this.state.endDay }</Col>
                                </Row>
                            </Col>
                            <Col md={4}>
                                <Button variant="primary" className="ml-3" type="submit">
                                    STAKE
                                </Button>
                            </Col>
                        </Row>
                    </Form>
                </Col>
                <Col>
                    <Container>
                        <h5>Bonuses</h5>
                        <Row>
                            <Col className="ml-3">Longer Pays Better:</Col>
                            <Col sm={5} className="text-right">+ <HexNum value={this.state.longerPaysBetter.toString()} /> HEX</Col>
                        </Row>
                        <Row>
                            <Col className="ml-3">Bigger Pays Better:</Col>
                            <Col sm={5} className="text-right">+ <HexNum value={this.state.biggerPaysBetter.toString()} /> HEX</Col>
                        </Row>
                        <Row>
                            <Col className="ml-3"><strong>Total:</strong></Col>
                            <Col sm={5} className="text-right"><HexNum value={this.state.total.toString()} /> HEX</Col>
                        </Row>
                        <Row className="mt-2">
                            <Col><strong>Effective HEX:</strong> <sup><Badge variant="info" pill>?</Badge></sup></Col>
                            <Col sm={5} className="text-right"><HexNum value={this.state.effectiveHEX.toString()} /> HEX</Col>
                        </Row>
                        <Row className="mt-3">
                            <Col><strong>Share Rate:</strong></Col>
                            <Col sm={5} className="text-right"><HexNum value={this.state.shareRate.toString()} /> / HEX</Col>
                        </Row>
                        <Row>
                            <Col><strong>Stake Shares:</strong> <sup><Badge variant="info" pill>?</Badge></sup></Col>
                            <Col sm={5} className="text-right"><HexNum value={this.state.stakeShares.toString()} /></Col>
                        </Row>
                    </Container>

                    <Container className="bg-dark text-orange mt-2 pt-2 pb-2">
                        <Row>
                            <Col><strong>BigPayDay:</strong> <sup><Badge variant="info" pill>?</Badge></sup></Col>
                            <Col className="text-right"><HexNum value={this.state.bigPayDay.toString()} /> HEX</Col>
                        </Row>
                        <Row>
                            <Col>% Gain<span className="text-warning">*</span>: <sup><Badge variant="info" pill>?</Badge></sup></Col>
                            <Col className="text-right"><HexNum value={this.state.percentGain.toString()} />%</Col>
                        </Row>
                        <Row>
                            <Col>% APY<span className="text-warning">*</span>: <sup><Badge variant="info" pill>?</Badge></sup></Col>
                            <Col className="text-right"><HexNum value={this.state.percentAPY.toString()} />%</Col>
                        </Row>
                        <Row>
                            <Col className="pt-2"><span className="text-warning">*</span> <em>If stake still open on BigPayDay</em></Col>
                        </Row>
                    </Container>
                </Col>
            </Row>
        )
    }
}
class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            address: props.context.walletAddress,
            contractData: props.context.contractData,
            availableBalance: props.context.walletHEX,
            stakeCount: null,
            stakeList:  null,
            stakedTotal: new BigNumber(0),
            sharesTotal: new BigNumber(0),
            bpdTotal: new BigNumber(0),
            interestTotal: new BigNumber(0),
            stakeContext: { }, // active UI stake context
            showExitModal: false,
        }
    }
    static getDerivedStateFromProps(nextProps, prevState) {
        return { 
            address: nextProps.context.walletAddress,
            availableBalance: new BigNumber(nextProps.context.walletHEX)
        }
    }

    calcBigPayDaySlice = (shares, pool) => {
        return Object.entries(this.state.contractData.globals).length
            ? new BigNumber(this.state.contractData.globals.claimStats.unclaimedSatoshisTotal).times(10000).times(shares).idiv(pool)
            : new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
    }

    loadStakes() {
        this.contract.methods.stakeCount(this.state.address).call()
        .then((stakeCount) => {
            const { currentDay, globals } = this.state.contractData
            this.setState({
                stakeList: { },
                stakeCount: Number(stakeCount),
                stakedTotal: new BigNumber(0),
                sharesTotal: new BigNumber(0),
                bpdTotal: new BigNumber(0),
                interestTotal: new BigNumber(0)
            })
            for (let index = 0; index < this.state.stakeCount; index++) {
                this.contract.methods.stakeLists(this.state.address, index).call()
                .then((data) => {
                    let stakeData = {
                        stakeId: data.stakeId,
                        lockedDay: Number(data.lockedDay),
                        stakedDays: Number(data.stakedDays),
                        stakedHearts: new BigNumber(data.stakedHearts),
                        stakeShares: new BigNumber(data.stakeShares),
                        unlockedDay: Number(data.unlockedDay),
                        isAutoStake: Boolean(data.isAutoStakte),
                        progress: Math.trunc(Math.min((currentDay - data.lockedDay) / data.stakedDays * 100000, 100000)),
                        bigPayDay: this.calcBigPayDaySlice(data.stakeShares, globals.stakeSharesTotal),
                        payout: new BigNumber(0)
                    }
                    const stakeList = { ...this.state.stakeList }
                    stakeList[data.stakeId] = stakeData

                    // update this.state
                    this.setState({ 
                        stakeList,
                        stakedTotal: this.state.stakedTotal.plus(data.stakedHearts),
                        sharesTotal: this.state.sharesTotal.plus(data.stakeShares),
                    })

                    this.updateStakePayout(stakeData)
                })
                .catch((e) => console.log(`Stakes::loadStakes:contract.methods.stakeLists(${this.state.address}, ${index}).call()`, e))
            }
        })
        .catch((e) => console.log(`Stakes::loadStakes:contract.methods.stakeCount(${this.state.address}).call()`, e))
    }

    updateStakePayout(_stakeData) {
        
        const { 
            CLAIMABLE_BTC_ADDR_COUNT, 
            CLAIMABLE_SATOSHIS_TOTAL, 
            HEARTS_PER_SATOSHI, 
            BIG_PAY_DAY,
            currentDay, 
            allocatedSupply, 
            globals 
        } = this.state.contractData
        const { claimedSatoshisTotal, claimedBtcAddrCount } = globals.claimStats

        const stakeData = { ..._stakeData }
        const startDay = stakeData.lockedDay
        const endDay = startDay + stakeData.stakedDays
        if (currentDay === startDay) return

        this.contract.methods.dailyDataRange(startDay, Math.min(currentDay, endDay)).call()
        .then((dailyData) => {

            const calcAdoptionBonus = (bigPayDaySlice) => {
                const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(CLAIMABLE_BTC_ADDR_COUNT)
                const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(CLAIMABLE_SATOSHIS_TOTAL)
                const bonus = viral.plus(criticalMass)
                return bonus
            }

            const calcDailyBonus = (shares, sharesTotal) => {
                // HEX mints 0.009955% daily interest (3.69%pa) and statkers get adoption bonuses from that each day
                const dailyInterest = allocatedSupply.times(10000).idiv(100448995) // .sol line: 1243 
                const bonus = shares.times(dailyInterest.plus(calcAdoptionBonus(dailyInterest))).idiv(sharesTotal)
                return bonus
            }

            // iterate over daily payouts history
            stakeData.payout = new BigNumber(0)
            stakeData.bigPayDay = new BigNumber(0)

            dailyData.forEach((mapped_dailyData, dayNumber) => {
                // extract dailyData struct from uint256 mapping
                const hex = new BigNumber(mapped_dailyData).toString(16).padStart(64, '0')
                const day = {
                    payoutTotal: new BigNumber(hex.slice(46,64), 16),
                    stakeSharesTotal: new BigNumber(hex.slice(28,46), 16),
                    unclaimedSatoshisTotal: BigNumber(hex.slice(12,28), 16)
                }
                
                stakeData.payout = stakeData.payout.plus(day.payoutTotal.times(stakeData.stakeShares).idiv(day.stakeSharesTotal))

                if (startDay <= BIG_PAY_DAY && endDay > BIG_PAY_DAY) {
                    const bigPaySlice = day.unclaimedSatoshisTotal.times(HEARTS_PER_SATOSHI).times(stakeData.stakeShares).idiv(globals.stakeSharesTotal)
                    const bonuses = calcAdoptionBonus(bigPaySlice)
                    stakeData.bigPayDay = bigPaySlice.plus(bonuses)
                    if (startDay + dayNumber === BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay.plus(bonuses))
                }

            })
            stakeData.payout = stakeData.payout.plus(calcDailyBonus(stakeData.stakeShares, globals.stakeSharesTotal))

            const stakeList = { ...this.state.stakeList }
            stakeList[stakeData.stakeId] = stakeData

            this.setState({ 
                bpdTotal: this.state.bpdTotal.plus(stakeData.bigPayDay),
                interestTotal: this.state.interestTotal.plus(stakeData.payout),
                stakeList
            })
        })
        .catch((e) => console.log(`Stakes::updateStakePayout:contract.methods.dailyDataRange(${startDay}, Math.min(${currentDay}, ${endDay}).call()`, e))
    }

    componentDidMount() {
        if (this.contract) this.loadStakes()
    }
    componentDidUpdate = (prevProps, prevState) => {
        if (prevProps.walletAddress !== this.props.walletAddress) {
            this.setState(
                { address: this.props.walletAddress },
                this.loadStakes
            )
        }
    }

    CurrentStakesTable = () => {
        const { 
            START_DATE,
            currentDay
        } = this.state.contractData

        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }

        return (
            <Table variant="secondary" size="sm" striped borderless>
                <thead>
                    <tr>
                        <th className="day-value">Start</th>
                        <th className="day-value">End</th>
                        <th className="day-value">Days</th>
                        <th className="day-value">Progress</th>
                        <th className="hex-value">Principal</th>
                        <th className="shares-value">Shares</th>
                        <th className="hex-value">BigPayDay</th> 
                        <th className="hex-value">Interest</th>
                        <th className="hex-value">Value</th>
                        <th>{' '}</th>
                    </tr>
                </thead>
                <tbody>
                    { this.state.stakeList &&
                        Object.keys(this.state.stakeList).map((key) => {
                            const stakeData = this.state.stakeList[key]
                            
                            const startDay = stakeData.lockedDay
                            const endDay = startDay + stakeData.stakedDays
                            const startDate = new Date(START_DATE)
                            const endDate = new Date(START_DATE)
                            startDate.setDate(startDate.getDate() + startDay)
                            endDate.setDate(endDate.getDate() + endDay)

                            return (typeof stakeData === 'object') ? 
                            (
                                <tr key={stakeData.stakeId}>
                                    <td className="day-value">
                                        <OverlayTrigger
                                            key={stakeData.stakeId}
                                            placement="top"
                                            overlay={
                                                <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                    { startDate.toLocaleString() }
                                                </Tooltip>
                                            }
                                        >
                                            <div>{ startDay }</div>
                                        </OverlayTrigger>
                                    </td>
                                    <td className="day-value">
                                        <OverlayTrigger
                                            key={stakeData.stakeId}
                                            placement="top"
                                            overlay={
                                                <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                    { endDate.toLocaleString() }
                                                </Tooltip>
                                            }
                                        >
                                            <div>{ endDay }</div>
                                        </OverlayTrigger>
                                    </td>
                                    <td className="day-value">{ stakeData.stakedDays }</td>
                                    <td className="day-value">
                                        <HexNum value={stakeData.progress / 1000} />%
                                    </td>
                                    <td className="hex-value">
                                        <HexNum value={stakeData.stakedHearts / 1e8} /> 
                                    </td>
                                    <td className="shares-value">
                                        <HexNum value={stakeData.stakeShares} /> 
                                    </td>
                                    <td className="hex-value">
                                        <HexNum value={stakeData.bigPayDay / 1e8} />
                                    </td>
                                    <td className="hex-value">
                                        <HexNum value={stakeData.payout / 1e8} />
                                    </td>
                                    <td className="hex-value">
                                        <HexNum value={stakeData.stakedHearts.plus(stakeData.payout) / 1e8} />
                                    </td>
                                    <td align="right">
                                        <Button 
                                            variant="outline-primary" size="sm" 
                                            onClick={(e) => handleShow(stakeData, e)}
                                            className={ 
    currentDay < (stakeData.lockedDay + stakeData.stakedDays / 2) ? "earlyexit"
        : currentDay < (stakeData.lockedDay + stakeData.stakedDays) ? "midexit"
        : currentDay < (stakeData.lockedDay + stakeData.stakedDays + 7) ? "termexit"
        : "lateexit"
                                            }
                                        >
                                            Exit
                                        </Button>
                                    </td>
                                </tr>
                            ) : (
                                <tr key={stakeData}><td colSpan="5">loading</td></tr>
                            )
                        })
                    }
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan="4"></td>
                        <td className="hex-value">
                            <HexNum value={this.state.stakedTotal / 1e8} /> 
                        </td>
                        <td className="shares-value">
                            <HexNum value={this.state.sharesTotal} />
                        </td>
                        <td className="hex-value">
                            <HexNum value={this.state.bpdTotal / 1e8} />
                        </td>
                        <td className="hex-value">
                            <HexNum value={this.state.interestTotal / 1e8} />
                        </td>
                        <td className="hex-value">
                            <HexNum value={this.state.stakedTotal.plus(this.state.interestTotal) / 1e8} />
                        </td>
                        <td>{' '}</td>
                    </tr>
                </tfoot>
            </Table>
        )
    }

    render() { // class Stakes

        const { 
            currentDay
        } = this.state.contractData
        
        const handleClose = () => this.setState({ showExitModal: false })

        const thisStake = this.state.stakeContext // if any
        const IsEarlyExit = (thisStake.stakeId && currentDay <= (thisStake.lockedDay + thisStake.stakedDays)) 

        return (
            !this.state.stakeList
                ? <ProgressBar animated now={90} label="loading contract data" />
                : <> 
            <Accordion defaultActiveKey="current_stakes">
                <Card bg="primary" text="light" className="overflow-auto m-2">
                    <Accordion.Toggle as={Card.Header} eventKey="current_stakes">
                        Current Stakes <Badge variant='info' className="float-right">Day {currentDay+1}</Badge>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="current_stakes">
                        <Card.Body className="p-3 pt-0">
                            <this.CurrentStakesTable />
                            <NewStakeForm context={this.state}/>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
                <Card bg="primary" text="light" className="overflow-auto m-2">
                    <Accordion.Toggle as={Card.Header} eventKey="stake_history">
                        Stake History
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="stake_history">
                        <Card.Body className="p-3">
                            <p>HISTORY TODO</p>
                            <p>HISTORY TODO</p>
                            <p>HISTORY TODO</p>
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>

            <Modal show={this.state.showExitModal} onHide={handleClose} animation={false} variant="primary">
                <Modal.Header closeButton>
                    <Modal.Title>End Stake</Modal.Title>
                </Modal.Header>
               <Modal.Body>
                    {IsEarlyExit 
                        ?  
                            <Alert variant="danger">
                                <Alert.Heading>LOSSES AHEAD</Alert.Heading>
                                <p>
                                    Exiting stakes early can lead to <em>significant</em> losses!
                                </p>
                                <hr />
                                <p>
                                    <Alert.Link href="#">Learn more</Alert.Link>
                                </p>
                            </Alert>
                        :
                            <Alert variant="success">
                                <Alert.Heading>Term Complete</Alert.Heading>
                                <p>
                                    This stake has served its full term and is safe to exit.
                                </p>
                                <p> TODO: add stake stats / yield etc </p>
                            </Alert>
                    }
                </Modal.Body>
                <Modal.Footer>
                    {IsEarlyExit 
                        ? <div>
                            <Button variant="secondary" onClick={handleClose}>
                                Accept Penalty
                            </Button>
                            <Button variant="primary" className="ml-3" onClick={handleClose}>
                                Get me outta here!
                            </Button>
                        </div>
                        : <Button variant="primary" onClick={handleClose}>End Stake</Button>
                    }
                </Modal.Footer>
            </Modal>
            </>
        )
    }
}

export default Stakes;
