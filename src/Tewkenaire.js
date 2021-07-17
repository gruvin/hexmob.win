import React from 'react'
import { BigNumber } from 'bignumber.js'
import {
    Accordion,
    Card,
    Row,
    Col,
    ProgressBar
} from 'react-bootstrap'
import { BurgerHeading, CryptoVal } from './Widgets'
import './Tewkenaire.scss'
import HEX2 from './hex2_contract'
import HEX4 from './hex4_contract'
import HEX5 from './hex5_contract'
import Stakes from './Stakes' // for collecting payout data
const { format } = require('d3-format')
const debug = require('debug')('Tewk')

class TewkStakeList extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            stakeList: [],
            progressVariant: "secondary",
            progressBar: 0,
            progressLabel: "",
            totalValue: BigNumber(0)
        }
    }

    async componentDidMount() {
        const { contractObject, parent } = this.props

        if (!contractObject) throw new Error('TewkStakeList: No contractObject provided')
        this.setState({
            progressVariant: "secondary",
            progressLabel: "fetching data",
            pregressBar: 1
        })
        const tewkStakes = await this.getTewkenaireStakes(contractObject)
        // debug(contractObject.SYMBOL+"'s tewkStakes: ", tewkStakes)
        let totalValue = BigNumber(0)
        const stakeList = tewkStakes.map(stake => {
            const { stakedHearts, payout, bigPayDay } = stake
            stake.interest = payout.plus(bigPayDay)
            stake.value = stakedHearts.plus(stake.interest)
            totalValue = totalValue.plus(stake.value)
            return stake
        })
        debug(this.props.contractObject.SYMBOL+" stakeList[]: ", stakeList)
        this.setState({ stakeList, totalValue })
        parent.setState({ totalValue: parent.state.totalValue.plus(totalValue) })
    }

    async getTewkenaireStakes(contractObject) {
        const { chainId, wallet } = this.props.parent.props.parent.state
        const { web3 } = this.props.parent
        const tewkContract = await new web3.eth.Contract(contractObject.ABI, contractObject.CHAINS[chainId].address)
        const [ stakeStartEvents, stakeEndEvents ] = await Promise.all([
            tewkContract.getPastEvents('onStakeStart', { 
                filter: { customerAddress: wallet.address },
                fromBlock: 0, 
                toBlock: 'latest'
            }),
            tewkContract.getPastEvents('onStakeEnd', {
                filter: { customerAddress: wallet.address},
                fromBlock: 0, 
                toBlock: 'latest'
            })
        ])
        this.setState({ progressBar: 30 })
        const startedStakes = stakeStartEvents.map(s => s.returnValues.uniqueID)
        const endedStakes = stakeEndEvents.map(s => s.returnValues.uniqueID)
        const activeUids = startedStakes.filter(s => endedStakes.indexOf(s) < 0)
        const _tewkStakes = await Promise.all(
            Array.from({ length: activeUids.length }, 
                (_, i) => tewkContract.methods.stakeLists(wallet.address, activeUids[i]).call()
            )
        )
        debug(contractObject.SYMBOL+"'s ### _tewkStakes: ", _tewkStakes)
        const tewkStakes = await Promise.all(
            _tewkStakes.map(async (s, i) => {
                let stakeData = {
                    stakeId: Number(s.stakeID),
                    lockedDay: Number(s.lockedDay),
                    stakedDays: Number(s.stakedDays),
                    stakedHearts: BigNumber(s.hexAmount),
                    stakeShares: BigNumber(s.stakeShares),
                    unlockedDay: Number(s.unlockedDay),
                    isAutoStake: false,
                    bigPayDay: BigNumber(0),
                    payout: BigNumber(0),
                }
                // get payout data
                const App = this.props.parent.props.parent
                const {
                    bigPayDay,
                    payout
                } = await Stakes.getStakePayoutData({ contract: App.contract }, stakeData)
                this.setState({ progressBar: 30 + 70 * i / _tewkStakes.length })
                return { ...stakeData, payout, bigPayDay }
            })
        )
        return tewkStakes
    }

    render() {
        const totalUsd = this.state.totalValue.div(1e8).times(this.props.usdhex)
        const uiStakeList = this.state.stakeList.map((stake, index) => {
            const { stakedHearts, stakeShares, bigPayDay, interest, value } = stake
            const usd = value.div(1E8).times(this.props.usdhex)
            return (
                <Row key={index} className="text-right pr-3">
                    <Col className="numeric d-none d-md-inline"><CryptoVal value={stakedHearts} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={stakeShares} currency="SHARES" /></Col>
                    <Col className="numeric d-none d-md-inline"><CryptoVal value={bigPayDay} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={interest} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={value} currency="HEX" /></Col>
                    <Col className="numeric text-success">
                        <CryptoVal className="d-none d-md-inline" value={usd} currency="USD" />
                        <CryptoVal className="d-md-none d-inline" value={usd} wholeNumber currency="USD" />
                    </Col>
                </Row>
            )
        })

        return (<>
        <Card className="bg-dark mt-3">
            <Card.Header className="pl-1">
                <Row>
                    <Col>{this.props.heading()}</Col>
                    <Col> </Col>
                </Row>
            </Card.Header>
            <Card.Body>
                <Row className="text-right text-muted small pr-3">
                    <Col className="d-none d-md-inline">PRINCIPAL</Col>
                    <Col>SHARES</Col>
                    <Col className="d-none d-md-inline">BigPayDay</Col>
                    <Col>INTEREST</Col>
                    <Col>VALUE</Col>
                    <Col className="text-right">USD<span className="d-none d-md-inline"> VALUE</span></Col>
                </Row>
                {uiStakeList.length
                    ? uiStakeList
                    : <ProgressBar
                    variant={this.state.progressVariant}
                    animated
                    now={this.state.progressBar}
                    label={this.state.progressLabel}
                />
                }
                {uiStakeList.length > 1 &&
                <Row className="text-right pr-3">
                    <Col>
                        <span className="text-muted small mr-1">TOTAL $</span>
                    </Col>
                    <Col xs={3} sm={2} className="text-right text-success nemeric" 
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

class Tewkenaire extends React.Component {
    constructor(props) {
        super(props)
        this.provider = props.parent.walletProvider
        this.web3 = props.parent.web3 
        this.hexContract = null
        this.state = {
            totalValue: BigNumber(0)
        }
    }

    async componentDidMount() {
        if (localStorage.getItem('debug')) window._TEWK = this
    }

    render() {
        const totalUsd = this.state.totalValue.div(1E8).times(this.props.usdhex).toNumber()
        return (<>
            <Accordion 
                id='tewk_accordion'
                className="text-left mt-3"
                // defaultActiveKey="tewkenaire"
            >
                <Card bg="secondary" text="light" className="p-0">
                    <Accordion.Toggle as={Card.Header} eventKey="tewkenaire">
                        <BurgerHeading>Tewkenaire</BurgerHeading>
                        <div className="float-right pr-1 text-success">
                            <span className="text-muted small mr-1">USD</span>
                            <span className="numeric h2 font-weight-bold">
                                { "$"+format(",.2f")(totalUsd)}
                            </span>
                        </div>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="tewkenaire">
                        <>
                            <TewkStakeList
                                parent={this}
                                heading={() => <em><strong>HEX<span className="text-success">TEW</span></strong></em>}
                                contractObject={HEX2}
                                usdhex={this.props.usdhex}
                            />
                            <TewkStakeList
                                parent={this}
                                heading={() => <em><strong>HEX<span className="text-success">MAX</span></strong></em>}
                                contractObject={HEX4}
                                usdhex={this.props.usdhex}
                            />
                            <TewkStakeList
                                parent={this}
                                heading={() => <em><strong>INFINI<span className="text-success">HEX</span></strong></em>}
                                contractObject={HEX5}
                                usdhex={this.props.usdhex}
                            />
                        </>
                   </Accordion.Collapse>
                </Card>
            </Accordion>
        </>)
    }
}

export default Tewkenaire
