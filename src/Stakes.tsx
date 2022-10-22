import React from 'react'
import Container from 'react-bootstrap/Container';
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ProgressBar from 'react-bootstrap/ProgressBar';
import HEX, { type StakeEnd } from './hex_contract'
import { ethers, BigNumber } from 'ethers'
import BN from 'bn.js' // fully fledged bn.js
import {
    bnCalcPayoutBpdPenalty,
    bnCalcInterest,
    bnCalcApy,
    bnPrefixObject,
    type CalcPayoutBpdPenalty,
} from './util'
import { NewStakeForm } from './NewStakeForm'
import { CryptoVal, BurgerHeading } from './Widgets'
import { StakeInfo } from './StakeInfo'
import ReactGA from 'react-ga'
import { format } from 'd3-format'
import './Stakes.scss'
import * as StakesT from './lib/Stakes'
import _debug from 'debug'
const debug = _debug('Stakes')

class Stakes extends React.Component<StakesT.Props, StakesT.State> {
    constructor(props: StakesT.Props) {
        super(props)
        this.state = {
            selectedCard: "current_stakes",
            stakeCount: 0,
            stakeList: [ ],
            loadingStakes: true,
            stakeContext: { }, // active UI stake context
            showExitModal: false,
            currentDay: '---',
            pastStakesSortKey: { keyField: '', dir: -1 },
            bnTotalValue: ethers.constants.Zero,
        }
    }

    unsubscribeEvents = () => {
        try { this.props.contract.removeAllListeners()} catch(e) { }
    }

    subscribeEvents = () => {
        const { contract } = this.props
        try {
            contract.on(contract.filters.StakeStart(null, this.props.wallet.address), () => this.loadAllStakes())
            contract.on(contract.filters.StakeEnd(null, null, this.props.wallet.address), () => this.loadAllStakes())
        } catch (e) { debug(e) }
    }

    static async getStakePayoutData(context: StakesT.Context, stakeData: StakesT.StakeData): Promise<CalcPayoutBpdPenalty> {
        const { contract } = context
        const { currentDay, globals } = contract.Data
        const startDay = stakeData.lockedDay
        const stakedDays = stakeData.stakedDays
        const endDay = startDay + stakedDays

        // TODO: day min/max cache dailyData instead of repeatedly retrieving overlapping data for each stake (probably)
        const { dailyDataCount } = globals
        const dailyData = (startDay > currentDay)
            ? []
            : await contract.dailyDataRange(startDay, Math.min(dailyDataCount, endDay))
        return bnCalcPayoutBpdPenalty(context, stakeData, dailyData)
    }

    static async loadStakes(context: StakesT.Context) {
        const { contract, address } = context
        const { currentDay } = contract.Data

        debug('Loading stakes for address: ', address)
        const stakeCount = await contract.functions.stakeCount(address)

        let stakeList: Promise<StakesT.StakeData>[] = []
        for (let stakeIndex = 0; stakeIndex < stakeCount; stakeIndex++) {
            stakeList[stakeIndex] = new Promise(async (resolve) => {
                try {
                    contract.stakeLists(address, stakeIndex).then(async (data: any) => {
                        const progress: number = (currentDay < data.lockedDay)
                            ? 0
                            : Math.trunc(Math.min((currentDay - data.lockedDay) / data.stakedDays * 100000, 100000))
                        // hex_contract.sol:825
                        // struct StakeStore {
                            //     uint40 stakeId;
                            //     uint72 stakedHearts;
                            //     uint72 stakeShares;
                            //     uint16 lockedDay;
                            //     uint16 stakedDays;
                            //     uint16 unlockedDay;
                            //     bool isAutoStake;
                            // }
                        const _stakeData: StakesT.StakeData = {
                            ...bnPrefixObject(data) as StakesT.StakeData,
                            stakeIndex,
                            progress
                        }
                        // debug(`stakeData [resolved]: %O`, _stakeData)
                        const _payouts = (currentDay >= _stakeData.lockedDay + 1) // no payouts when pending or until day 2 of term
                        ? await Stakes.getStakePayoutData(context, _stakeData)
                        : {
                            bnBigPayDay: ethers.constants.Zero,
                            bnPayout: ethers.constants.Zero,
                            bnPenalty: ethers.constants.Zero,
                        }
                        // debug(`stake payouts: %O`, _payouts)
                        const stakeData = {
                            ..._stakeData,
                            ..._payouts
                        }
                        return resolve(stakeData)
                    }) // as Promise<StakesT.StakeData>
                } catch(e: any) {
                    // It can happen that stakeCount increments before the our data source actually has the new stake recorded.
                    // Fail silently, assuming what we asked simply "doesn't exist" yet
                    debug(`WARNING: loadStakes() : stakeLists(address, index): ${e.message}`)
                    resolve([] as unknown as StakesT.StakeData)
                }
            })
        }
        return await Promise.all(stakeList)
    }

    getStaticContext = (publicAddress?: string) => {
        const address = publicAddress || this.props.wallet.address
        const { contract } = this.props
        return { contract, address }
    }

    loadAllStakes = async (publicAddress?: string) => {
        this.setState({ loadingStakes: true })
        const address = publicAddress || undefined
        const stakeList = await Stakes.loadStakes(this.getStaticContext(address))
        debug("stakeList: %O", stakeList)
        if (stakeList) {
            let bnTotalValue = BigNumber.from(0)
            stakeList.forEach(stakeData => {
                const { bnStakedHearts, bnPayout, bnBigPayDay} = stakeData
                const bnInterest = bnPayout.add(bnBigPayDay)
                bnTotalValue = bnTotalValue.add(bnInterest).add(bnStakedHearts)
            })
            this.setState({
                loadingStakes: false,
                stakeList,
                bnTotalValue,
            })
        }
    }

    loadStakeHistory = (publicAddress?: string) => {
        const { contract, address } = this.getStaticContext(publicAddress)
        /*
        emit StakeEnd( // (auto-generated event)
            uint256(uint40(block.timestamp)) // data0
                | (uint256(uint72(stakedHearts)) << 40)
                | (uint256(uint72(stakeShares)) << 112)
                | (uint256(uint72(payout)) << 184),
            uint256(uint72(penalty)) // data1
                | (uint256(uint16(servedDays)) << 72)
                | (prevUnlocked ? (1 << 88) : 0),
            msg.sender,
            stakeId
        );
        */
        contract.queryFilter({ ...contract.filters.StakeEnd(null, null, address), fromBlock: contract.GENESIS_BLOCK })
        .then((results: ethers.utils.Result[]) => {
            const pastStakes = results.map(r => {
                const args = bnPrefixObject(r.args)
                const { bnData0, bnData1, stakerAddr, stakeId } = args as StakeEnd
                // debug("STAKE HISTORY ARGS: %o", { bnData0: bnData0.toString() , bnData1: bnData1.toString(), stakerAddr, stakeId })
                const d0 = new BN(bnData0.toString())
                const d1 = new BN(bnData1.toString())
                const decoded = {
                    timestamp:        d0.maskn(40).toNumber(),
                    bnStakedHearts:   BigNumber.from(d0.shrn(40).maskn(72).toString()),
                    bnStakeShares:    BigNumber.from(d0.shrn(112).maskn(72).toString()),
                    bnPayout:         BigNumber.from(d0.shrn(184).maskn(72).toString()),
                    bnPenalty:        BigNumber.from(d1.maskn(72).toString()),
                    servedDays:       d1.shrn(72).maskn(16).toNumber(),
                    prevUnlocked:     d1.shrn(88).maskn(1).toNumber(),
                    stakerAddr,
                    stakeId,
                }
                // debug("HISTORY ARGS DECODED: %o", decoded)
                return decoded
            })
            debug('PAST_STAKES: %O', pastStakes)
            this.setState({ pastStakes })
        })

    }

    async componentDidMount() {
        if (localStorage.getItem('debug')) window._STAKES = this
        if (window.location.pathname === "/stakes") this.setState({ selectedCard: "current_stakes" })
        await Promise.all([
           this.loadAllStakes(this.props.publicAddress),
           this.loadStakeHistory(this.props.publicAddress),
           this.subscribeEvents(),
        ])

    }

    componentDidUpdate = async (prevProps: StakesT.Props, prevState: StakesT.State) => {
        if (prevProps.wallet.address !== this.props.wallet.address) {
            await this.loadAllStakes(this.props.publicAddress)
        } else return null
    }

    componentWillUnmount() {
        this.unsubscribeEvents()
    }

    StakesList = () => {
        const { currentDay } = this.props.contract.Data
        const stakeList = this.state.stakeList.slice() || []
        stakeList && stakeList.sort((a: StakesT.StakeData, b: StakesT.StakeData) => {
            return (a.progress && b.progress && (
                a.progress === b.progress ? 0 : b.progress > a.progress ? 1 : -1
            )) || 0
        })
        const bnZero = ethers.constants.Zero
        let bnStakedTotal = bnZero
        let bnSharesTotal = bnZero
        let bnInterestTotal = bnZero
        let bnBigPayDayTotal = bnZero
        let bnPercentGainTotal = bnZero
        let bnPercentAPYTotal = bnZero
        let bnAveragePercentGain = bnZero
        let bnAveragePercentAPY = bnZero

        if (this.state.loadingStakes)
            return ( <p>loading ...</p> )
        else if (!stakeList.length)
            return ( <p>no stake data found for this address</p> )

        let activeCount = 0
        const stakeListOutput = stakeList.map((stakeData) => {
            // debug('stakeData: %o', stakeData)
            const startDay = Number(stakeData.lockedDay)
            const endDay = startDay + Number(stakeData.stakedDays)

            const _startDate = new Date(HEX.START_DATE)
            const _endDate = new Date(HEX.START_DATE.getTime() + endDay * 24 * 3600 * 1000)
            const startDate = _startDate.toLocaleDateString()
            const endDate = _endDate.toLocaleDateString()

            const { bnStakedHearts, bnStakeShares, bnPayout: bnInterest, bnBigPayDay, bnPenalty } = stakeData

            bnStakedTotal = bnStakedTotal.add(bnStakedHearts)
            bnSharesTotal = bnSharesTotal.add(bnStakeShares)
            bnBigPayDayTotal = bnBigPayDayTotal.add(bnBigPayDay)
            bnInterestTotal = bnInterestTotal.add(bnInterest)

            const stake = {
                startDay,
                endDay,
                startDate,
                endDate,
                ...stakeData,
                bnInterest,
                bnBigPayDay,
                bnPenalty
            }

            const bnPercentGain = bnCalcInterest(stake) // 1 == 1%
            const bnPercentAPY = bnCalcApy(currentDay, stake)
            bnPercentGainTotal = bnPercentGainTotal.add(bnPercentGain)
            bnPercentAPYTotal = bnPercentAPYTotal.add(bnPercentAPY)

            if (currentDay > stake.startDay) activeCount++

            return stake
        })

        if (activeCount) {
            bnAveragePercentGain = bnPercentGainTotal.div(activeCount)
            bnAveragePercentAPY = bnPercentAPYTotal.div(activeCount)
        }

        const numStakes = stakeList.length
        const usdValue =  Number(ethers.utils.formatUnits(this.state.bnTotalValue, HEX.DECIMALS + 4)) * this.props.usdhex * 10000

        return (<>
            <Card className="mt-2 bg-info-darkened rounded">
                <Card.Body className="p-1 rounded text-light">
                    <h2 className="text-center">Stake Totals Summary</h2>
                    <Row>
                        <Col className="text-end font-weight-bold">Staked</Col>
                        <Col><CryptoVal className="numeric" value={bnStakedTotal} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-end font-weight-bold">Shares</Col>
                        <Col><CryptoVal className="numeric" value={bnSharesTotal} currency="SHARES" /></Col>
                    </Row>
                    { bnBigPayDayTotal.gt(0) &&
                    <Row>
                        <Col className="text-end font-weight-bold">
                            <span className="text-info">Big</span>
                            <span className="text-warning">Pay</span>
                            <span className="text-danger">Day</span>
                        </Col>
                        <Col><CryptoVal className="numeric" value={bnBigPayDayTotal} showUnit /></Col>
                    </Row>
                    }
                    <Row>
                        <Col className="text-end font-weight-bold">Yield</Col>
                        <Col><CryptoVal className="numeric" value={bnInterestTotal} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-end font-weight-bold">Total Value</Col>
                        <Col>
                            <CryptoVal
                                className="numeric font-weight-bold"
                                value={bnStakedTotal.add(bnBigPayDayTotal).add(bnInterestTotal)} showUnit
                            />
                        </Col>
                    </Row>
                    <Row className="text-success">
                        <Col className="text-success text-end font-weight-bold">USD Value</Col>
                        <Col className="text-success numeric font-weight-bold"><CryptoVal value={usdValue} currency="USD"/></Col>
                    </Row>
                    <Row className="mt-2">
                        <Col className="text-end font-weight-bold">Average Gain</Col>
                        <Col className="numeric">{format(",.2f")(bnAveragePercentGain.toNumber())}%</Col>
                    </Row>
                    <Row>
                        <Col className="text-end font-weight-bold">Average APY</Col>
                        <Col>{format(",.2f")(bnAveragePercentAPY.toNumber())}%</Col>
                    </Row>
                </Card.Body>
            </Card>
            <Card className="mt-2 text-light bg-success-darkened rounded">
                <Card.Body className="px-2">
                    <h2 className="text-center mb-0">{numStakes ? <span className="numeric">{numStakes}</span> : "No"} Active Stake{numStakes > 1 && "s"}</h2>
                    <div className="text-center text-info small">tap each for details</div>
                    {stakeListOutput.map((stakeData) => {
                        return (
                            <StakeInfo
                                key={stakeData.stakeId}
                                contract={window.contract}
                                stake={stakeData}
                                reloadStakes={this.loadAllStakes}
                                usdhex={this.props.usdhex}
                                readOnly={typeof this.props.publicAddress !== 'undefined'}
                            />
                        )
                    })}
                </Card.Body>
            </Card>
        </>)
    }

    sortPastStakesStateByField = (keyField: string) => {
        const { keyField: oldKey, dir: oldDir } = this.state.pastStakesSortKey
        const dir = (oldKey === keyField) ? -oldDir : -1
        const pastStakesSortKey = { keyField, dir }
        this.setState({
            pastStakesSortKey,
            pastStakes: this.state.pastStakes?.sort((a, b): -1 | 0 | 1 => { // typeof keyField = { BigNumber | number | string } ref: ./lib/Stakes.d.ts
                const bnA = new BN(a[keyField].toString()) // must use BN not BigNumber so a BigNumber input values work
                const bnB = new BN(b[keyField].toString())
                return dir < 0
                    ? (bnA.eq(bnB) ? 0 : bnB.gt(bnA) ? 1 : -1)
                    : (bnA.eq(bnB) ? 0 : bnB.gt(bnA) ? -1 : 1)
            })
        })
    }

    StakesHistory = () => {
        const { pastStakes } = this.state || null
        if (!pastStakes) return ( <>loading</> )

        const handleSortSelection = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (!(e.target instanceof HTMLAnchorElement)) return
            e.preventDefault()
            e.stopPropagation()
            const hash = e.target.closest('a')?.hash
            if (hash) {
                const _keyField = hash.match(/sort_(.+)$/)
                _keyField && this.sortPastStakesStateByField(_keyField[1])
            }
        }
        return (
            <Container className="p-0 row-highlight-even">
                <Row key="history" className="p-0 my-2 mx-0 xs-small text-end font-weight-bold">
                    <Col xs={2} sm={2} className="p-0 text-center">
                        <a href="#sort_servedDays" onClick={handleSortSelection}>
                            Days<span className="d-none d-md-inline"> Served</span>
                        </a>
                    </Col>
                    <Col xs={3} sm={3} className="p-0">
                        <a href="#sort_bnStakedHearts" onClick={handleSortSelection}>
                            Stake<span className="d-none d-sm-inline">d Amount</span>
                        </a>
                    </Col>
                    <Col xs={3} sm={3} className="p-0"><a href="#sort_bnStakeShares" onClick={handleSortSelection}>Shares</a></Col>
                    <Col xs={3} sm={3} className="p-0"><a href="#sort_bnPenalty" onClick={handleSortSelection}>Penalty</a></Col>
                </Row>
            {pastStakes && pastStakes.map(stake => {
                const { servedDays, bnStakedHearts, bnStakeShares, bnPenalty } = stake
                return (
                    <Row key={stake.stakeId} className="p-0 m-0 xs-small text-end">
                        <Col xs={2} sm={2} className="p-0 text-center">{servedDays}</Col>
                        <Col xs={3} sm={3} className="p-0"><CryptoVal className="numeric" value={bnStakedHearts} currency="HEX" showUnit /></Col>
                        <Col xs={3} sm={3} className="p-0"><CryptoVal className="numeric" value={bnStakeShares} currency="SHARES" /></Col>
                        <Col xs={3} sm={3} className="p-0"><CryptoVal className="numeric" value={bnPenalty} currency="HEX" showUnit /></Col>
                    </Row>
                )
            })
            }
            </Container>
        )
    }

    render() { // class Stakes
        const a = this.props.publicAddress || ""
        const publicAddress = <span className="numeric">{a.slice(0, 6)+"...."+a.slice(-4)}</span>
        const usdValue =  Number(ethers.utils.formatUnits(this.state.bnTotalValue, HEX.DECIMALS + 4)) * this.props.usdhex * 10000

        return (!this.state.stakeList
        ? <ProgressBar variant="secondary" animated now={90} label="loading contract data" className="mt-3" />
        : <>
            <Accordion
                id="stakes_accordion"
                className="text-start"
                defaultActiveKey={this.props.openActive ? this.state.selectedCard : ""}
                onSelect={eventKey => {
                    if (eventKey) ReactGA.pageview("/"+eventKey)
                }}
            >
            {!this.props.publicAddress && // NewStakeForm not shown for read only ?address=
                <Accordion.Item className="new-stake text-light" eventKey="new_stake">
                    <Accordion.Header>
                        <Row className="w-100">
                        <Col className="pe-0"><BurgerHeading>Stake HEX<span className="d-none d-sm-inline"> to Mint Shares</span>
                        </BurgerHeading></Col>
                        <Col className="col-5 lh-lg px-0 text-end text-success">
                             <span className="text-muted small align-baseline me-1"><span className="d-none d-sm-inline">LIQUID </span>HEX</span>
                             <CryptoVal className="numeric h2" value={this.props.wallet.bnBalance} />
                        </Col>
                        </Row>
                    </Accordion.Header>
                    <Accordion.Body>
                        <NewStakeForm
                            contract={window.contract}
                            wallet={this.props.wallet}
                            reloadStakes={this.loadAllStakes}
                        />
                   </Accordion.Body>
                </Accordion.Item>
            }
                <Accordion.Item className={"active-stakes text-light "+(this.props.className || "")}  eventKey="current_stakes">
                    {this.props.publicAddress &&
                        <div className="px-1 text-light text-center small">
                            <span className="text-muted small align-baseline me-2">{this.props.publicName || "address"} </span>{publicAddress}
                        </div>
                    }
                    <Accordion.Header className="w-100">
                        <Row className="w-100">
                            <Col className="pe-0"><BurgerHeading>Active Stakes</BurgerHeading></Col>
                            <Col className="col-5 lh-lg px-0 text-end text-success">
                                <small className="text-muted small align-baseline me-1">USD</small>
                                <span className="numeric h2 fw-bold"><CryptoVal value={usdValue} currency="USD" /></span>
                            </Col>
                        </Row>
                    </Accordion.Header>
                    <Accordion.Body>
                        <this.StakesList/>
                    </Accordion.Body>
                </Accordion.Item>
                <Accordion.Item className="stake-history text-light pb-0" eventKey="stake_history">
                    <Accordion.Header>
                        <BurgerHeading>Stake History</BurgerHeading>
                    </Accordion.Header>
                    <Accordion.Collapse eventKey="stake_history">
                        <>
                        {this.props.parent.state.chainId !== 1
                            ? <Col className="col-12 text-center">chain event log data not currently available</Col>
                            : <this.StakesHistory />
                        }</>
                    </Accordion.Collapse>
                </Accordion.Item>
            </Accordion>
            </>
        )
    }
}

export default Stakes
