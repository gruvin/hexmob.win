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
            uiStakeList: null,
            progressVariant: "secondary",
            progressBar: 0,
            progressLabel: ""
        }
    }

    async componentDidMount() {
        if (!this.props.contractObject) return
        this.scanTewk()
    }

    scanTewk = async () => {
        if (!this.props.contractObject) return false
        this.setState({
            progressVariant: "secondary",
            progressLabel: "fetching data",
            pregressBar: 1
        })
        const { parent, contractObject, usdhex } = this.props
        let totalUSD = 0.0
        const tewkStakes = await this.getTewkenaireStakes(contractObject)
        const uiStakeList = tewkStakes.map((stake, index) => {
            const { stakedHearts, stakeShares, payout, bigPayDay } = stake.hex
            const interest = payout.plus(bigPayDay)
            const value = stakedHearts.plus(interest)
            const usd = value.div(1e8).times(usdhex)
            totalUSD += usd.toNumber()
            return { stakedHearts, stakeShares, payout, bigPayDay, interest, value, usd }
        })
        this.setState({ uiStakeList })
        parent.setState({ [this.props.contractObject.SYMBOL+'_totalUSD']: totalUSD })
    }

    async getTewkenaireStakes(contractObject) {
        const { chainId, wallet, currentDay } = this.props.parent.props.parent.state
        const { web3 } = this.props.parent
        const hexContract = await new web3.eth.Contract(HEX.ABI, HEX.CHAINS[chainId].address)
        const tewkContract = await new web3.eth.Contract(contractObject.ABI, contractObject.CHAINS[chainId].address)
        const tewkAddress = contractObject.CHAINS[chainId].address

        debug(contractObject.SYMBOL+' address: ', tewkAddress)

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
        const startedStakes = stakeStartEvents.map(s => s.returnValues.uniqueID)
        const endedStakes = stakeEndEvents.map(s => s.returnValues.uniqueID)
        const activeStakeIds = startedStakes.filter(s => endedStakes.indexOf(s) < 0)
        
        const tewkStakes = await Promise.all(
            activeStakeIds.map(uid => tewkContract.methods.stakeLists(wallet.address, uid).call())
        )
        debug(contractObject.SYMBOL+"'s tewk stakes: ", tewkStakes)
        debug(contractObject.SYMBOL+"'s stakeIDs: ", tewkStakes.map(s => s.stakeID))

        const hexStakes = await Promise.all(
            tewkStakes
                .map(s => s.stakeID)
                .map(sid => hexContract.methods.stakeLists(wallet.address, sid).call())
        )
        debug(contractObject.SYMBOL+"'s HEX STAKES: ", hexStakes)


        const tewkStakeCount = await hexContract.methods.tewkStakeCount(tewkAddress).call()
        for (let i = 0; i < tewkStakeCount; i++ )
        return []
        // const progrssChunkSize = 100 / activeStakes.length
        // debug("HEX:ID: ", uniqueStakeId)

        // const progress = (currentDay < hexStake.lockedDay) ? 0
        // : Math.trunc(Math.min((currentDay - hexStake.lockedDay) / hexStake.stakedDays * 100000, 100000))
        
        // const stakeData = {
        //     stakeOwner: tewkAddress,
        //     stakeIndex: index,
        //     stakeId: hexStake.stakeId,
        //     lockedDay: Number(hexStake.lockedDay),
        //     stakedDays: Number(hexStake.stakedDays),
        //     stakedHearts: new BigNumber(hexStake.stakedHearts),
        //     stakeShares: new BigNumber(hexStake.stakeShares),
        //     unlockedDay: Number(hexStake.unlockedDay),
        //     isAutoStake: Boolean(hexStake.isAutoStakte),
        //     progress,
        //     bigPayDay: new BigNumber(0),
        //     payout: new BigNumber(0),
        // }
        // // get payout data
        // const App = this.props.parent.props.parent
        // const {
        //     bigPayDay,
        //     payout
        // } = await Stakes.getStakePayoutData({ contract: App.contract }, stakeData) 
        // stakeData.bigPayDay = bigPayDay
        // stakeData.payout = payout

        // const ourStake = {
        //     hex: stakeData,
        //     tewk: {
        //         stakeOwner: wallet.address,
        //         stakeIndex: index,
        //         stakeIdParam: stakeID,
        //         uniqueID: uniqueStakeId,
        //     }
        // }
    }

    render() {
        if (this.state.uiStakeList) return (<>
            <Row className="text-right text-muted small pr-3">
                <Col className="d-none d-md-inline">PRINCIPAL</Col>
                <Col>SHARES</Col>
                <Col className="d-none d-md-inline">BigPayDay</Col>
                <Col>INTEREST</Col>
                <Col>VALUE</Col>
                <Col className="text-right">USD<span className="d-none d-md-inline"> VALUE</span></Col>
            </Row>
            {
                this.state.uiStakeList && this.state.uiStakeList.map((stake, index) => {
                    const { stakedHearts, stakeShares, bigPayDay, interest, value, usd } = stake
                    return (
                        <Row key={'hexmax_'+index} className="text-right pr-3">
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
            }
        </>)
        else return (<>
            <ProgressBar variant={this.state.progressVariant} animated now={this.state.progressBar} label={this.state.progressLabel} />
            {this.state.progressBar <= 100 && 
                <Button 
                    className="mt-3"
                    variant="outline-info"
                    size="sm" 
                    block
                    onClick={this.scanTewk}>{this.state.progressBar === 0 ? "Scan for Tewkenaire Stakes" : "Restart Tewkenaire Stakes Scan"}
                </Button>
            }
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
            HEX2_totalUSD: 0.0,
            HEX3_totalUSD: 0.0,
            HEX4_totalUSD: 0.0,
            HEX5_totalUSD: 0.0,
        }
    }

    async componentDidMount() {
        if (localStorage.getItem('debug')) window._TEWK = this
        const { chainId } = this.props.parent.state
        this.hexContract = await new this.web3.eth.Contract(HEX.ABI, HEX.CHAINS[chainId].address)
    }

    render() {
        const handleAccordionSelect = (selectedCard) => {
        }

        return (<>
            <Accordion 
                id='tewk_accordion'
                className="text-left mt-3"
                onSelect={handleAccordionSelect}
            >
                <Card bg="secondary" text="light" className="p-0">
                    <Accordion.Toggle as={Card.Header} eventKey="tewkenaire">
                        <BurgerHeading>Tewkenaire</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="tewkenaire">
                        <Card.Body className="tewkenaire-body">
                            <Card className="bg-dark mt-3">
                                <Card.Header className="pl-1">
                                    <Row>
                                        <Col><em><strong>HEX<span className="text-success">TEW</span></strong></em></Col>
                                        <Col className="text-right text-success">
                                            <span className="text-muted small mr-1">USD</span>
                                            <span className="numeric h2">
                                                $<strong><CryptoVal value={this.state.HEX2_totalUSD} currency="USD" /></strong>
                                            </span>
                                        </Col>
                                    </Row>
                                </Card.Header>    
                                <Card.Body>
                                    {this.hexContract && <TewkStakeList parent={this} contractObject={HEX2} usdhex={this.props.usdhex} />}
                                </Card.Body>
                            </Card>
                            <Card className="bg-dark mt-3">
                                <Card.Header className="pl-1">
                                    <Row>
                                        <Col><em><strong>HEX<span className="text-success">MAX</span></strong></em></Col>
                                        <Col className="text-right text-success">
                                            <span className="text-muted small mr-1">USD</span>
                                            <span className="numeric h2">
                                                $<strong><CryptoVal value={this.state.HEX4_totalUSD} currency="USD" /></strong>
                                            </span>
                                        </Col>
                                    </Row>
                                </Card.Header>
                                <Card.Body>
                                    {this.hexContract && <TewkStakeList parent={this} contractObject={HEX4} usdhex={this.props.usdhex} />}
                                </Card.Body>
                            </Card>
                            <Card className="bg-dark mt-3">
                                <Card.Header className="pl-1">
                                <Row>
                                        <Col><em><strong>INFINI<span className="text-success">HEX</span></strong></em></Col>
                                        <Col className="text-right text-success">
                                            <span className="text-muted small mr-1">USD</span>
                                            <span className="numeric h2">
                                                $<strong><CryptoVal value={this.state.HEX5_totalUSD} currency="USD" /></strong>
                                            </span>
                                        </Col>
                                    </Row>
                                </Card.Header>
                                <Card.Body>
                                    {this.hexContract && <TewkStakeList parent={this} contractObject={HEX5} usdhex={this.props.usdhex} />}
                                </Card.Body>
                            </Card>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
            </Accordion>
        </>)
    }
}

export default Tewkenaire
