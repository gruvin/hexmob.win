import React from 'react'
import { BigNumber } from 'bignumber.js'
import {
    Container,
    Card,
    Row,
    Col,
    Button,
    Badge,
    ProgressBar
} from 'react-bootstrap'
import HEX from './hex_contract'
import TMAX from './tmax_contract'
import Web3 from 'web3';
const debug = require('debug')('TMax')

class Tewkenaire extends React.Component {
    constructor(props) {
        super(props)
        this.provider = window.web3.currentProvider || null
        this.state = {
            tewkStakes: []
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
            console.log(batchStart, batchEnd)
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
                            if (!count) return resolve(tewkStakes)
                        }
                    })
                }
            })
        } // for batches
        debug('tewkStakes: ', tewkStakes)
        this.setState({ tewkStakes })
    }

    render() {
        return (
            <div>TEWKENAIRE</div>
        )
    }
}

export default Tewkenaire
