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

        const tewkStakes = await new Promise((resolve, reject) => {
            const tewkStakes = []
            let count = activeStakes;
            for (let index = 0; index < stakeCount; index++) {
                //debug('tmaxAddress: %s index: %d', tmaxAddress, index) 
                const hexStake = this.hexContract.methods.stakeLists(tmaxAddress, index).call()
                .then(async hexStake => {
                    const { 
                        stakeId,
                        stakeShares
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
                            stakeID,
                            uniqueStakeId 
                        }
                        console.log('pushing ourStake: %j', ourStake)
                        tewkStakes.push(ourStake)
                        if (!count) return resolve(tewkStakes)
                    }
                })
            }
        })
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
