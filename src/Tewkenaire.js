import React from 'react'
import { BigNumber } from 'bignumber.js'
import {
    Accordion,
    Container,
    Card,
    Row,
    Col,
    Button,
    Badge,
    ProgressBar
} from 'react-bootstrap'
import { BurgerHeading } from './Widgets'
import HEX from './hex_contract'
import TMAX from './tmax_contract'
import Web3 from 'web3';
const debug = require('debug')('TMax')

class Tewkenaire extends React.Component {
    constructor(props) {
        super(props)
        this.provider = window.web3.currentProvider || null
        this.state = {
            tewkStakes: null,
            progress: 10
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
        const { contract, hexContract } = this
        const { chainId, wallet } = this.props.context.state
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
        let count = activeStakes;

        // Run through HEXMAX's HEX stakeList, searching for stakes that match our wallet.address (see stakeID+stakeShares sha3 hash, below).
        // stop either at the end of the list or when we have found activeStakes no. of stakes
        for ( // batches of 300
            let batchStart = 0, batchEnd = 300; 
            batchStart < stakeCount && batchEnd < stakeCount && count; 
            batchStart=batchEnd+1, batchEnd=Math.min(batchEnd+301, stakeCount-1)
        ) {
            debug(batchStart, batchEnd)
            const tewkStakesBatch = await new Promise((resolve, reject) => {
                if (!count) return resolve(tewkStakes)
                for (let index = batchStart; index < batchEnd; index++) {
                    //debug('tmaxAddress: %s index: %d', tmaxAddress, index) 
                    const hexStake = this.hexContract.methods.stakeLists(tmaxAddress, index).call()
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
                        if (stakeID != "0") {
                            count--
                            const ourStake = {
                                hex: {
                                    stakeOwner: tmaxAddress,
                                    stakeIndex: index,
                                    ...Object.fromEntries(Object.entries(hexStake).filter((key, val) => isNaN(parseInt(key)))), // strips out numberic keys
                                },
                                hexmax: {
                                    stakeOwner: wallet.address,
                                    stakeIndex: index,
                                    stakeIdParam: stakeID,
                                    uniqueID: uniqueStakeId,
                                }
                            }
                            debug('pushing ourStake: %j', ourStake)
                            tewkStakes.push(ourStake)
                            this.setState({ progress: 90 / stakeCount * (stakeCount - count)   })
                            if (!count) return resolve(tewkStakes)
                        }
                    })
                }
            })
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
                                <Card.Header style={{ fontFamily: "Arial" }}><em><strong>HEX<span className="text-success">TEW</span></strong></em></Card.Header>
                                <Card.Body>
                                    placeholder
                                </Card.Body>
                            </Card>
                            <Card className="bg-dark mt-3">
                                <Card.Header style={{ fontFamily: "Arial" }}><em><strong>HEX<span className="text-success">MAX</span></strong></em></Card.Header>
                                <Card.Body>
                            {
                                this.state.tewkStakes.map(stake => {
                                    return ( <div>{stake.hex.stakeId}</div> )
                                })
                            }
                                </Card.Body>
                            </Card>
                            <Card className="bg-dark mt-3">
                                <Card.Header style={{ fontFamily: "Arial" }}><em><strong><span className="text-success">INFINI</span>HEX</strong></em></Card.Header>
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
