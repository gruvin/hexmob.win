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
import Web3 from 'web3';
import Stakes from './Stakes' // for collecting payout data
const debug = require('debug')('Tewk')

class TewkStakeList extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            uiStakeList: null,
            progressBar: 0,
        }
    }

    async componentDidMount() {
        if (!this.props.contractObject) return
        window['_'+this.props.contractObject.SYMBOL] = this
    }

    scanTewk = async () => {
        if (!this.props.contractObject) return false
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

        let stakeCount = null
        let playerStats = null
        let activeStakes = null
        await Promise.all([
            hexContract.methods.stakeCount(tewkAddress).call(),
            tewkContract.methods.playerStats(wallet.address).call()
        ]).then(results => {
            [ stakeCount, playerStats ] = results
            activeStakes = playerStats.activeStakes
        })

        debug(contractObject.SYMBOL+' stakeCount: ', stakeCount)
        debug(contractObject.SYMBOL+' activeStakes: ', activeStakes)

        // Run through HEXMAX's HEX stakeList, searching for stakes that match our wallet.address 
        // (see stakeID+stakeShares sha3 hash, below).
        // Stop either at the end of the list (ouch!) or when we have found <activeStakes> no. of stakes.
        // Time to brush up on loops of async functions and atomic array management in JS! :p

        const tewkStakes = []
        const batchSize = 100
        let count = activeStakes
        for ( // retrieve HEX stakes in batches of up to <batchSize> ...
            let batchStart = 0, batchEnd = batchSize-1; 
            batchStart < stakeCount && batchEnd < stakeCount && count; 
            batchStart=batchEnd+1, batchEnd=Math.min(batchEnd+batchSize, stakeCount-1)
        ) { // get one batch ...
            debug(contractObject.SYMBOL+': ', batchStart, batchEnd)
            
            // eslint-disable-next-line
            await new Promise((resolve, reject) => {
                let c = 0
                for (let index = batchStart; index <= batchEnd; index++) {
                    hexContract.methods.stakeLists(tewkAddress, index).call()
                    // eslint-disable-next-line
                    .then(async hexStake => {
                        this.setState({ progressBar: (activeStakes - count) / stakeCount * 100})

                        c++
                        //if (contractObject.SYMBOL === "HEX4") debug("index: %d \tc:%d", index, c)
                        if (c === batchSize) return resolve()
                        const { 
                            stakeId,
                            stakeShares,
                        } = hexStake
                        // 'index' available by closure
                        const uniqueStakeId = web3.utils.hexToNumberString(web3.utils.soliditySha3(
                            {
                                'type': "uint40",
                                'value': stakeId
                            }, {
                                'type': "uint72",
                                'value': stakeShares
                            })
                        );
                        // if (contractObject.SYMBOL === "HEX4") debug('uniqueStakeId: ', wallet.address, uniqueStakeId)
                        // is this stake one of ours?
                        tewkContract.methods.stakeLists(wallet.address, uniqueStakeId).call()
                        .then(async tewkStake => {
                            const { stakeID } = tewkStake
                            if (stakeID !== "0") { // found one of ours                                
                                const progress = (currentDay < hexStake.lockedDay) ? 0
                                : Math.trunc(Math.min((currentDay - hexStake.lockedDay) / hexStake.stakedDays * 100000, 100000))
                                const stakeData = {
                                    stakeOwner: tewkAddress,
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
                                const App = this.props.parent.props.parent
                                const {
                                    bigPayDay,
                                    interest
                                } = await Stakes.getStakePayoutData({ contract: App.contract }, stakeData) 
                                stakeData.bigPayDay = bigPayDay
                                stakeData.payout = interest

                                const ourStake = {
                                    hex: stakeData,
                                    tewk: {
                                        stakeOwner: wallet.address,
                                        stakeIndex: index,
                                        stakeIdParam: stakeID,
                                        uniqueID: uniqueStakeId,
                                    }
                                }
                                debug(contractObject.SYMBOL+' ourStake %d: %o', index, ourStake)
                                tewkStakes.push(ourStake)
                                count--
                                //debug("COUNT: ", count)
                                if (!count) return resolve()
                            }
                        })
                    })
                    .catch(e => {
                        debug("ERROR getTewkStakes: ", e.message)
                        return resolve([]) 
                    })
                } // for (batch)
            }) // await Promise
            // debug(contractObject.SYMBOL+" BATCH DONE! tewkSakes: ", tewkStakes)
            if (!count) return tewkStakes
        } // for (batches)
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
            <ProgressBar variant="secondary" animated now={this.state.progressBar} />
            <Button onClick={this.scanTewk}>SCAN</Button>
        </>)
    }
}

class Tewkenaire extends React.Component {
    constructor(props) {
        super(props)
        this.provider = props.parent.walletProvider
        this.web3 = null
        this.hexContract = null
        this.state = {
            HEX2_totalUSD: 0.0,
            HEX3_totalUSD: 0.0,
            HEX4_totalUSD: 0.0,
            HEX5_totalUSD: 0.0,
        }
    }

    async componentDidMount() {
        window._TEWK = this
        const { chainId } = this.props.parent.state
        this.web3 = new Web3(this.props.parent.wssProvider) // Infura using own api key
        this.web3 = new Web3(window.ethereum) // Metamask (Infura)
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
                defaultActiveKey="tewkenaire"
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