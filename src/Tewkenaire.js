import React from 'react'
import { BigNumber } from 'bignumber.js'
import {
    Accordion,
  //  Container,
    Card,
    Row,
    Col,
  //  Button,
  //  Badge,
    ProgressBar
} from 'react-bootstrap'
import { BurgerHeading, CryptoVal } from './Widgets'
import './Tewkenaire.scss'
import HEX from './hex_contract'
import TMAX from './tmax_contract'
import Web3 from 'web3';
import Stakes from './Stakes'
const debug = require('debug')('TMax')

class TewkStakeList extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            uiStakeList: null,
            totalUSD: 0.0
        }
    }

    componentDidMount() {
        const { parent, stakeList, usdhex } = this.props
        let totalUSD = 0.0

        const uiStakeList = stakeList.map((stake, index) => {
            const { stakedHearts, stakeShares, payout, bigPayDay } = stake.hex
            const interest = payout.plus(bigPayDay)
            const value = stakedHearts.plus(interest)
            const usd = value.div(1e8).times(usdhex)
            totalUSD += usd.toNumber()
            return { stakedHearts, stakeShares, payout, bigPayDay, interest, value, usd }
        })
        this.setState({uiStakeList })
        parent.setState({ totalUSD })
    }

    render() {

        // TODO: get interest data from HEX contract (XXX should use cached payout data from App.state)
        return (<>
            <Row className="text-right text-muted small pr-3">
                <Col className="d-none d-md-inline">HEX PRINCIPAL</Col>
                <Col>T-SHARES</Col>
                <Col className="d-none d-md-inline"><span className="d-none d-md-inline">HEX </span>BigPayDay</Col>
                <Col><span className="d-none d-md-inline">HEX </span>INTEREST</Col>
                <Col><span className="d-none d-md-inline">HEX </span>VALUE</Col>
                <Col className="text-right">USD<span className="d-none d-md-inline"> VALUE</span></Col>
            </Row>
            {
                this.state.uiStakeList && this.state.uiStakeList.map((stake, index) => {
                    const { stakedHearts, stakeShares, payout, bigPayDay, interest, value, usd } = stake
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
    }
}

class Tewkenaire extends React.Component {
    constructor(props) {
        super(props)
        this.provider = props.context.walletProvider
        this.state = {
            tewkStakes: null,
            progress: 10,
        }
    }

    componentDidMount() {
        window._TEWK = this
        const { chainId } = this.props.context.state
        this.web3 = new Web3(this.provider)
        this.contract = new this.web3.eth.Contract(TMAX.ABI, TMAX.CHAINS[chainId].address)
        this.hexContract = new this.web3.eth.Contract(HEX.ABI, HEX.CHAINS[chainId].address)
        window._TMAX = this.contract
        
        this.loadHEXMAXstakes()
    }

    async loadHEXMAXstakes() {
        const { chainId, wallet, currentDay } = this.props.context.state
        const tmaxAddress = TMAX.CHAINS[chainId].address
        debug('tmaxAddress: ', tmaxAddress)

        let stakeCount = null
        let playerStats = null
        let activeStakes = null
        await Promise.all([
            this.hexContract.methods.stakeCount(tmaxAddress).call(),
            this.contract.methods.playerStats(wallet.address).call()
        ]).then(results => {
            [ stakeCount, playerStats ] = results
            activeStakes = playerStats.activeStakes
        })

        debug('stakeCount: ', stakeCount)
        debug('activeStakes: ', activeStakes)

        const tewkStakes = []
        let count = activeStakes

        // Run through HEXMAX's HEX stakeList, searching for stakes that match our wallet.address 
        // (see stakeID+stakeShares sha3 hash, below).
        // Stop either at the end of the list (ouch!) or when we have found <activeStakes> no. of stakes.
        // Time to brush up on loops of async functions and atomic array management in JS! :p
        for ( // retrieve HEX stakes in batches of up to 100 ...
            let batchStart = 0, batchEnd = 99; 
            batchStart < stakeCount && batchEnd < stakeCount && count; 
            batchStart=batchEnd+1, batchEnd=Math.min(batchEnd+101, stakeCount-1)
        ) { // get one batch ...
            debug(batchStart, batchEnd)

            // eslint-disable-next-line
            await new Promise((resolve, reject) => {
 //               if (!count) return resolve(tewkStakes)
                for (let index = batchStart; index < batchEnd; index++) {
                    //debug('tmaxAddress: %s index: %d', tmaxAddress, index) 
                    this.hexContract.methods.stakeLists(tmaxAddress, index).call()
                    // eslint-disable-next-line
                    .then(async hexStake => {
                        const { 
                            stakeId,
                            stakeShares,
                        } = hexStake
                        const uniqueStakeId = this.web3.utils.hexToNumberString(this.web3.utils.soliditySha3(
                            {
                                'type': "uint40",
                                'value': stakeId
                            }, {
                                'type': "uint72",
                                'value': stakeShares
                            })
                        );
                        // is this stake one of ours?
                        const tmaxStake = await this.contract.methods.stakeLists(wallet.address, uniqueStakeId).call()
                        const { stakeID } = tmaxStake
                        if (stakeID !== "0") { // found one of ours
                            
                            const progress = (currentDay < hexStake.lockedDay) ? 0
                            : Math.trunc(Math.min((currentDay - hexStake.lockedDay) / hexStake.stakedDays * 100000, 100000))
        
                            const stakeData = {
                                stakeOwner: tmaxAddress,
                                stakeIndex: index,
                                stakeId: hexStake.stakeId,
                                lockedDay: Number(hexStake.lockedDay),
                                stakedDays: Number(hexStake.stakedDays),
                                stakedHearts: new BigNumber(hexStake.stakedHearts),
                                stakeShares: new BigNumber(hexStake.stakeShares),
                                unlockedDay: Number(hexStake.unlockedDay),
                                isAutoStake: Boolean(hexStake.isAutoStakte),
                                progress,
                                bigPayDay: new BigNumber(0),
                                payout: new BigNumber(0),
                            }
                            // get payout data
                            const App = this.props.context
                            const {
                                bigPayDay,
                                interest
                            } = await Stakes.getStakePayoutData({ contract: App.contract }, stakeData) 
                            stakeData.bigPayDay = bigPayDay
                            stakeData.payout = interest

                            const ourStake = {
                                hex: stakeData,
                                hexmax: {
                                    stakeOwner: wallet.address,
                                    stakeIndex: index,
                                    stakeIdParam: stakeID,
                                    uniqueID: uniqueStakeId,
                                }
                            }
                            debug('ourStake %d: %o', index, ourStake)
                            tewkStakes.push(ourStake)
                            this.setState({ progress: 90 / stakeCount * (stakeCount - count) })
                            if (!--count) return resolve(tewkStakes)
                        }
                        return resolve(tewkStakes)
                    })
                    .catch(e => { throw new Error(e) })
                }
            }) // await Promise
        } // for batches
        debug('tewkStakes: ', tewkStakes)
        this.setState({ tewkStakes, progress: 100 })
    }

    render() {
        const handleAccordionSelect = (selectedCard) => {
        }

        return (<>
            {!this.state.tewkStakes
                ? <ProgressBar variant="secondary" animated now={this.state.progress} label="loading tewenaire contract data" className="mt-3" />
                :  
            <Accordion 
                id='tewk_accordion'
                className="text-left mt-3"
                onSelect={handleAccordionSelect}
                defaultActiveKey="tewkenaire"
            >
                <Card bg="secondary" text="light">
                    <Accordion.Toggle as={Card.Header} eventKey="tewkenaire">
                        <BurgerHeading>Tewkenaire</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="tewkenaire">
                        <Card.Body className="tewkenaire-body">
                            <Card className="bg-dark mt-3">
                                <Card.Header className="pl-1"><em><strong>HEX<span className="text-success">TEW</span></strong></em></Card.Header>
                                <Card.Body>
                                    placeholder
                                </Card.Body>
                            </Card>
                            <Card className="bg-dark mt-3">
                                <Card.Header>
                                    <Row>
                                        <Col><em><strong>HEX<span className="text-success">MAX</span></strong></em></Col>
                                        <Col className="text-right text-success">
                                            <span class="text-muted small mr-1">USD</span>
                                            <span className="numeric h2">$<strong>
                                                <CryptoVal value={this.state.totalUSD} currency="USD" />
                                            </strong></span>
                                        </Col>
                                    </Row>
                                </Card.Header>
                                <Card.Body>
                                    <TewkStakeList parent={this} stakeList={this.state.tewkStakes} usdhex={this.props.usdhex} />
                                </Card.Body>
                            </Card>
                            <Card className="bg-dark mt-3">
                                <Card.Header><em><strong>INFINI<span className="text-success">HEX</span></strong></em></Card.Header>
                                <Card.Body>
                                    placeholder
                                </Card.Body>
                            </Card>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
            </Accordion>
            }
        </>)
    }
}

export default Tewkenaire
