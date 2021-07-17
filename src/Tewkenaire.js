import React from 'react'
import { BigNumber } from 'bignumber.js'
import {
    Accordion,
  //  Container,
    Card,
    Row,
    Col,
    Button,
  //  Badge,
    ProgressBar
} from 'react-bootstrap'
import { BurgerHeading, CryptoVal } from './Widgets'
import './Tewkenaire.scss'
import HEX from './hex_contract'
import HEX2 from './hex2_contract'
import HEX4 from './hex4_contract'
import HEX5 from './hex5_contract'
import Stakes from './Stakes' // for collecting payout data
const debug = require('debug')('Tewk')

class TewkStakeList extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            uiStakeList: [],
            progressVariant: "secondary",
            progressBar: 0,
            progressLabel: ""
        }
    }

    async componentDidMount() {
        const { contractObject, usdhex } = this.props

        if (!contractObject) throw new Error('TewkStakeList: No contractObject provided')
        this.setState({
            progressVariant: "secondary",
            progressLabel: "fetching data",
            pregressBar: 1
        })
        const tewkStakes = await this.getTewkenaireStakes(contractObject)
        // debug(contractObject.SYMBOL+"'s tewkStakes: ", tewkStakes)
        const _uiStakeList = tewkStakes.map(stake => {
            const { stakedHearts, payout, bigPayDay } = stake
            stake.interest = payout.plus(bigPayDay)
            stake.value = stakedHearts.plus(stake.interest)
            return stake
        })
        debug(this.props.contractObject.SYMBOL+" uiStakeList[]: ", _uiStakeList)

        let totalUSD = 0
        const uiStakeList = _uiStakeList.map((stake, index) => {
            const { stakedHearts, stakeShares, bigPayDay, interest, value } = stake
            const usd = stake.value.div(1e8).times(usdhex)
            totalUSD += usd.toNumber()
            return (
                <Row key={index} className="text-right pr-3">
                    <Col className="numeric d-none d-md-inline"><CryptoVal value={stakedHearts} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={stakeShares} currency="SHARES" /></Col>
                    <Col className="numeric d-none d-md-inline"><CryptoVal value={bigPayDay} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={interest} currency="HEX" /></Col>
                    <Col className="numeric"><CryptoVal value={value} currency="HEX" /></Col>
                    <Col className="numeric text-success">$
                        <CryptoVal className="d-none d-md-inline" value={usd} currency="USD" />
                        <CryptoVal className="d-md-none d-inline" value={usd} wholeNumber currency="USD" />
                    </Col>
                </Row>
            )
        })
        this.setState({ uiStakeList, totalUSD })
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

        return (<>
        <Card className="bg-dark mt-3">
            <Card.Header className="pl-1">
                <Row>
                    <Col>{this.props.heading()}</Col>
                    <Col className="text-right text-success">
                        <span className="text-muted small mr-1">USD</span>
                        <span className="numeric h2">
                            $<strong><CryptoVal value={this.state.totalUSD} currency="USD" /></strong>
                        </span>
                    </Col>
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
                {this.state.uiStakeList.length
                    ? this.state.uiStakeList
                    : <ProgressBar
                    variant={this.state.progressVariant}
                    animated
                    now={this.state.progressBar}
                    label={this.state.progressLabel}
                />
                }
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
        }
    }

    async componentDidMount() {
        if (localStorage.getItem('debug')) window._TEWK = this
    }

    render() {


        return (<>
            <Accordion 
                id='tewk_accordion'
                className="text-left mt-3"
                defaultActiveKey="tewkenaire"
            >
                <Card bg="secondary" text="light" className="p-0">
                    <Accordion.Toggle as={Card.Header} eventKey="tewkenaire">
                        <BurgerHeading>Tewkenaire</BurgerHeading>
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
