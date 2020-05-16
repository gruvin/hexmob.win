import React from 'react'
import { 
    Container,
    Card
} from 'react-bootstrap'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'
import HEX from './hex_contract.js'
import './App.scss'

const debug = require('debug')('Monitor')
debug('loading')

export class Monitor extends React.Component {
    constructor(props) {
        super(props)
        this.web3 = props.web3
        this.state = {
            ...props.context,
            contract: props.contract,
            eventList: [ ]
        }
    }

    componentDidMount() {
        this.subscribeEvents()
    }

    componentWillUnmount() {
        this.web3.eth.clearSubscriptions()
    }

    subscribeEvents = () => {
        this.wssSubscription = this.web3.eth.subscribe('logs', {
            address: HEX.ContractAddress,
//            topics: [
//              this.state.contractData.TOPIC_HASH_TRANSFER,
//                null,
//                '0x' + this.state.walletAddress.slice(2).toLowerCase().padStart(64, '0')
//            ]
        }, (error, result) => {
            if (error) return
            debug('%o', result)
            const {id, logIndex, blockHash, transactionHash} = result
            const eventList = this.state.eventList.concat(
                <Card key={id+logIndex+blockHash.slice(-8)+transactionHash.slice(-8)}>
                    <Card.Title>{result.id}</Card.Title>
                    <Card.Subtitle>{result.transactionHash}</Card.Subtitle>
                    <Card.Body>
                    {
                        result.topics.map((t) => { 
                            return ( 
                                <div>{t}</div> 
                            )
                        })
                    }
                    </Card.Body>
                </Card>
            )

            this.setState({
                eventList: this.state.eventList.length >= 3 ? eventList.slice(-3) : eventList
            })
        });
    }

    render() {
        
        return (
            <Card>
                <Card.Title>Monitor</Card.Title>
                <Card.Body>{ 
                    this.state.eventList.map((Event) => Event)
                }</Card.Body>
            </Card>
        )
    }
}

