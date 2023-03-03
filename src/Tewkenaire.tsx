import React from 'react'
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import ProgressBar from 'react-bootstrap/ProgressBar';
import { BurgerHeading, CryptoVal } from './Widgets'
import { ethers, BigNumber } from 'ethers'
import * as StakesT from './lib/Stakes'
import { type HEXContract } from './hex_contract'
import HEX2, { type HEX2T } from './hex2_contract'
import HEX4, { type HEX4T } from './hex4_contract'
import HEX5, { type HEX5T } from './hex5_contract'
import Stakes from './Stakes' // for collecting payout data
import ReactGA from 'react-ga'
import { format } from 'd3-format'
import { bnPrefixObject } from './util'
import './Tewkenaire.scss'
import * as TewkT from './lib/Tewkenaire'

import _debug from 'debug'
const debug = _debug('Tewk')

// child class
class TewkStakeList extends React.Component<TewkT.ListProps, TewkT.ListState> {
    constructor(props: TewkT.ListProps) {
        super(props)
        this.state = {
            stakeList: [] as StakesT.StakeData[],
            progressBar: 0,
            progressLabel: "",
            bnTotalValue: ethers.constants.Zero
        }
    }

    async getTewkenaireStakes(contractObject: HEX2T | HEX4T | HEX5T): Promise<TewkT.StakeData[]> {
        const { contract } = this.props.parent.props.parent //  HEX main contract
        if (typeof contract === 'undefined') throw new Error("parent contract undefined")

        const currentDay = Number(contract?.Data?.currentDay)

        const { chainId, wallet } = this.props.parent.props.parent.state
        const { web3provider } = this.props.parent.props.parent
        const contractAddress = contractObject.CHAINS[chainId]
        const tewkContract = new ethers.Contract(contractAddress, contractObject.ABI, web3provider)

        const [ stakeStartEvents, stakeEndEvents ] = await Promise.all([
            tewkContract.queryFilter(tewkContract.filters.onStakeStart(wallet.address), contractObject.GENESIS_BLOCK),
            tewkContract.queryFilter(tewkContract.filters.onStakeEnd(wallet.address), contractObject.GENESIS_BLOCK ),
        ])

        this.setState({ progressBar: 30 })
        // debug(contractObject.SYMBOL+" stakeStartEvents: ", stakeStartEvents)
        if (stakeStartEvents.length) {

            const startedStakes = stakeStartEvents.map((e: ethers.Event) => e.args?.uniqueID.toString())
            const endedStakes = stakeEndEvents.map((e: ethers.Event) => e.args?.uniqueID.toString())
            const activeUids = startedStakes.filter(uid => endedStakes.indexOf(uid) < 0)
            const { length } = activeUids

            const _tewkStakes = await Promise.all(
                Array.from({ length },
                    (_, i) => tewkContract.stakeLists(wallet.address, activeUids[i])
                )
            )

            // debug(contractObject.SYMBOL+"'s _tewkStakes: ", _tewkStakes)
            const tewkStakes = await Promise.all(
                _tewkStakes.map(async (data: any, stakeIndex): Promise<TewkT.StakeData> => {
                    const bnZero = ethers.constants.Zero
                    const _tewkStakeData = {
                        ...bnPrefixObject(data), // stakeID, bnHexAmount, bnStakeShares, lockedDay, stakedDays, unlockedDay, started, ended,
                        stakeOwner: wallet.address,
                        bnPayout: bnZero,
                        bnBigPayDay: bnZero,
                        bnInterest: bnZero,
                        bnValue: bnZero,
                    } as TewkT.StakeData
                    const constructedHexStakeData = {
                        stakeId: _tewkStakeData.stakeID,
                        lockedDay: _tewkStakeData.lockedDay,
                        stakedDays: _tewkStakeData.stakedDays,
                        bnStakedHearts: _tewkStakeData.bnHexAmount,
                        bnStakeShares: _tewkStakeData.bnStakeShares,
                        bnPayout: bnZero,
                        bnBigPayDay: bnZero,
                        bnPenalty: bnZero,
                        isTewkStake: true,
                    } as StakesT.StakeData
                    const _payouts = (currentDay >= constructedHexStakeData.lockedDay + 1)
                        ? await Stakes.getStakePayoutData({ contract }, constructedHexStakeData)
                        : {
                            bnBigPayDay: bnZero,
                            bnPayout: bnZero,
                            bnPenalty: bnZero,
                        }
                    // debug(contractObject.SYMBOL+" => stake["+stakeIndex+"] => constructedHexStakeData: %O", constructedHexStakeData)
                    // debug(contractObject.SYMBOL+" => stake["+stakeIndex+"] => payouts: %O", payouts)
                    const tewkStakeData = {
                        ..._tewkStakeData,
                        ..._payouts,
                    }
                    this.setState({ progressBar: 30 + 70 * stakeIndex / (_tewkStakes.length || 1)})
                    return tewkStakeData
                })
            )
            return tewkStakes
        } else {
            this.setState({ progressBar: 100 })
            return []
        }
    }

    async loadTewkStakes() {
        const { contractObject } = this.props

        if (!contractObject) throw new Error('TewkStakeList: No contractObject provided')
        const hexTewkStakes = await this.getTewkenaireStakes(contractObject)

        let bnTotalValue = ethers.constants.Zero
        if (hexTewkStakes) {
            // debug(contractObject.SYMBOL+"'s hexTewkStakes: ", hexTewkStakes)
            const stakeList = hexTewkStakes.map((tewkStake: TewkT.StakeData) => {
                const { bnHexAmount, bnPayout, bnBigPayDay } = tewkStake
                tewkStake.bnInterest = bnPayout.add(bnBigPayDay)
                tewkStake.bnValue = bnHexAmount.add(tewkStake.bnInterest)
                bnTotalValue = bnTotalValue.add(tewkStake.bnValue)
                return tewkStake
            }) as TewkT.StakeData[]
            const { SYMBOL } = contractObject
            return { SYMBOL, stakeList, bnTotalValue}
        } else {
            return { stakeList: [], bnTotalValue }
        }
    }

    componentDidMount() {
        this.setState({
            progressLabel: "fetching data",
            progressBar: 1
        })

        const { parent } = this.props
        this.setState({ bnTotalValue: ethers.constants.Zero }, () => {
            this.loadTewkStakes().then(results => {
                const { SYMBOL, stakeList, bnTotalValue } = results
                debug(SYMBOL+"'s stakeList[]: ", stakeList, bnTotalValue.toString())
                this.setState({ stakeList, bnTotalValue })
                const bnTotalValues = { ...parent.state.bnTotalValues, [SYMBOL]: bnTotalValue }
                parent.setState({ bnTotalValues })
            })
        })
    }

    render() {
        const totalUsd = Number(ethers.utils.formatUnits(this.state.bnTotalValue.mul(this.props.usdhex), 12))
        const { stakeList } = this.state

        const uiStakeList = stakeList.map((stake, index) => {
            const { bnHexAmount, bnStakeShares, bnBigPayDay, bnInterest, bnValue } = stake as TewkT.StakeData
            const usd = Number(ethers.utils.formatUnits(bnValue.mul(this.props.usdhex), 12))
            return (
                <Row key={index} className="text-end">
                    <Col className="numeric d-none d-md-inline"><CryptoVal value={bnHexAmount} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={bnStakeShares} currency="SHARES" /></Col>
                    <Col className="numeric d-none d-md-inline"><CryptoVal value={bnBigPayDay} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={bnInterest} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={bnValue} currency="HEX" /></Col>
                    <Col className="numeric text-success mx-2">
                        <CryptoVal className="d-none d-md-inline" value={usd} currency="USD" />
                        <CryptoVal className="d-md-none d-inline" value={usd} wholeNumber currency="USD" />
                    </Col>
                </Row>
            )
        })

        return (<>
        <Card className="bg-dark my-3 py-2">
            <Card.Header className="py-0">
                <Row>
                    <Col>{this.props.heading()}</Col>
                    <Col> </Col>
                </Row>
            </Card.Header>
            <Card.Body className="py-1">
                <Row className="text-end text-muted small" key='detail'>
                    <Col className="d-none d-md-inline">COST</Col>
                    <Col>SHARES</Col>
                    <Col className="d-none d-md-inline">BigPayDay</Col>
                    <Col>YIELD</Col>
                    <Col>VALUE</Col>
                    <Col className="text-end mx-2">USD<span className="d-none d-md-inline"> VALUE</span></Col>
                </Row>
                {uiStakeList
                    ? uiStakeList
                    : <ProgressBar
                    variant="secondary"
                    animated
                    now={this.state.progressBar}
                    label={this.state.progressLabel}
                />
                }
                {(uiStakeList.length > 1) &&
                <Row className="text-end" key='summary'>
                    <Col>
                        <span className="text-muted small">TOTAL $</span>
                    </Col>
                    <Col xs={3} sm={2} className="text-end mx-2 text-success nemeric"
                        style={{ borderTop: "1px solid #99999980" }}>
                        <CryptoVal className="d-none d-md-inline" value={totalUsd} currency="USD" />
                        <CryptoVal className="d-md-none d-inline" value={totalUsd} wholeNumber currency="USD" />
                    </Col>
                </Row>}
            </Card.Body>
        </Card>
    </>)
    }
}

export default class Tewkenaire extends React.Component<TewkT.Props, TewkT.State> {
    provider: any
    web3: any
    hexContract?: HEXContract
    state: TewkT.State

    constructor(props: TewkT.Props) {
        super(props)
        this.provider = props.parent.walletProvider
        this.web3 = props.parent.web3
        this.state = {
            contract: this.props.parent.contract,
            bnTotalValues: []
        }
    }

    async componentDidMount() {
        if (localStorage.getItem('debug')) window._TEWK = this
    }

    render() {

        const usdhex = Math.trunc((this.props.usdhex || 0.0000) * 10000) // limit dollar decimals to 0.0000 (4)
        const uriQuery = new URLSearchParams(window.location.search)

        let bnTotalValue = ethers.constants.Zero
        Object.values(this.state.bnTotalValues).map((v: BigNumber) => bnTotalValue = bnTotalValue.add(v))
        const totalUsd = Number(ethers.utils.formatUnits(bnTotalValue.mul(usdhex), 12)) // 12 = 8 HEX decimals plus 4 dollar decimals

        return (<>
            <Accordion
                id="tewk_accordion"
                defaultActiveKey={uriQuery.get("tewkens") == "open" ? "tewkenaire" : ""}
                onSelect={eventKey => {
                    if (eventKey) ReactGA.pageview("/"+eventKey)
                }}
            >
                <Accordion.Item className="bg-secondary text-light" eventKey="tewkenaire">
                    <Accordion.Header>
                        <Row className="w-100">
                        <Col className="pe-0"><BurgerHeading>Tewkenaire</BurgerHeading></Col>
                        <Col className="col-5 lh-lg px-0 text-end text-success">
                            <span className="text-muted small align-baseline me-1">USD</span>
                            <span className="numeric h2 fw-bold">
                                { "$"+format(",.2f")(totalUsd)}
                            </span>
                        </Col>
                        </Row>
                    </Accordion.Header>
                    <Accordion.Collapse eventKey="tewkenaire">
                        <>
                            <TewkStakeList
                                parent={this}
                                heading={() => <em><strong>HEX<span className="text-success">TEW</span></strong></em>}
                                contractObject={HEX2}
                                usdhex={usdhex}
                            />
                            <TewkStakeList
                                parent={this}
                                heading={() => <em><strong>HEX<span className="text-success">MAX</span></strong></em>}
                                contractObject={HEX4}
                                usdhex={usdhex}
                            />
                            <TewkStakeList
                                parent={this}
                                heading={() => <em><strong>INFINI<span className="text-success">HEX</span></strong></em>}
                                contractObject={HEX5}
                                usdhex={usdhex}
                            />
                        </>
                   </Accordion.Collapse>
                </Accordion.Item>
            </Accordion>
        </>)
    }
}
