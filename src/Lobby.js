import React from 'react'
import { 
    Container,
    Row, Col,
    Card,
    Button,
    Modal,
    Alert,
    ProgressBar,
    Accordion,
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import HEX from './hex_contract'
import { CryptoVal, WhatIsThis, BurgerHeading } from './Widgets' 
import BitSet from 'bitset'

const debug = require('debug')('Lobby')
debug('loading')

class Lobby extends React.Component {
    constructor(props) {
        super(props)
        this.subscriptions = [ ]
        this.loggedEvents = [ ]
        this.state = {
            dataReady: false,
            dailyDataCount: 0,
            lobbyData: null,
        }

        window._LOBBY = this // DEBUG REMOVE ME
    }
    
    componentDidMount = () => {
        const { contract, wallet } = this.props
        const dailyDataCount  = contract.Data.globals.dailyDataCount.toNumber()
        if (!wallet.address || wallet.address == '') return debug('Lobby::address invalid')
        Promise.all([
            contract.methods.xfLobby(dailyDataCount).call(),            // [0]
            contract.methods.dailyDataRange(0, dailyDataCount).call(), // [1]
            contract.methods.xfLobbyRange(0, dailyDataCount).call(),    // [2]
            contract.methods.xfLobbyPendingDays(wallet.address).call()  // [3]
        ]).then(results => {
            const lobbyPendingDayETH = results[0]
            const lobbyDaysHEX = results[1]
            const lobbyDaysETH = results[2]
            const hasEntryThisDay = new BitSet(
                BigNumber(results[3][1]).toString(2) +
                BigNumber(results[3][0]).toString(2)
            )

            new Promise((resolveLobby, reject) => {
                Promise.all(lobbyDaysHEX.map((mappedDayData, day) => { // returns array of lobby day promises
                    return new Promise((resolveDay, reject) => {
                        const hexa = BigNumber(mappedDayData).toString(16).padStart(64, '0')
                        const unclaimedSatoshisTotal = BigNumber(hexa.slice(12,28), 16)
                        const availableHEX = (day === 0) ? BigNumber(1e13) : unclaimedSatoshisTotal.div(350)
                        const totalETH = lobbyDaysETH[day]

                        if (hasEntryThisDay.get(day)) {

                            contract.methods.xfLobbyMembers(day, wallet.address).call()
                            .then(entryIndexes => {
                                const { headIndex, tailIndex } = entryIndexes
                                debug('HT: ', day, headIndex, tailIndex)
                                const promiseQueue = [ ]
                                for (let entryIndex = 0; entryIndex < tailIndex; entryIndex++) {
                                    const entryId = BigNumber(day).times(BigNumber(2).pow(40)).plus(entryIndex)
                                    promiseQueue.push(
                                        contract.methods.xfLobbyEntry(wallet.address, entryId.toString()).call()
                                    )
                                }
                                Promise.all(promiseQueue)
                                .then(entriesResult => {
                                    const entries = entriesResult.map(entry => {
                                        return {
                                            rawAmount: BigNumber(entry.rawAmount),
                                            referralAddr: entry.referralAddr
                                        }
                                    })
                debug('zzzzzzzzzzzzzzzz: ', entries)
                                    resolveDay({
                                        day,
                                        availableHEX,
                                        totalETH,
                                        entries
                                    })
                                })
                            })
                        } else {
                            resolveDay({
                                day,
                                availableHEX,
                                totalETH,
                                entries: null
                            })
                        }
                    })
                }))
                .then(days => resolveLobby(days))
            })
            .then(lobbyData => {
                debug('lobbyData: %O', lobbyData)
                this.setState({
                    dailyDataCount,
                    lobbyData,
                    dataReady: true
                })
            })
        })
    }

    render() {

        const LobbyDays = (props) => {
            if (!this.state.dataReady)
                return ( <div className="text-center">loading ...</div> )

            const lobbyData = [...this.state.lobbyData].reverse()
            return (
                <>
                    <Row key="header" className="py-0">
                        <Col xs={2} className="pl-1 pr-1">Day</Col>
                        <Col xs={3} className="pr-1">Available</Col>
                        <Col xs={3} className="pr-1">ETH</Col>
                        <Col xs={3} className="pr-1">Your ETH</Col>
                    </Row>
                    { lobbyData.map(dayData => { 
                        const { day, availableHEX, totalETH, entries } = dayData
                        let entriesTotal = BigNumber(0)
                        entries && entries.forEach(entry => { entriesTotal = entriesTotal.plus(entry.rawAmount) })
                        return (
                            <Row key={day} className="py-0">
                                <Col xs={2} className="pl-1 pr-1">{day}</Col>
                                <Col xs={3} className="pr-1"><CryptoVal value={BigNumber(availableHEX)} /></Col>
                                <Col xs={3} className="pr-1"><CryptoVal value={BigNumber(totalETH)} currency="ETH" /></Col>
                                <Col xs={3} className="pr-1"><CryptoVal value={BigNumber(entriesTotal)} currency="ETH" /></Col>
                            </Row>
                        )
                    }) }
                </>
            )
        }

        const HeaderDetail = () => {
            if (!this.state.dataReady)
                return ( <div className="text-center">loading ...</div> )
            const { dailyDataCount, lobbyData } = this.state
            const { day, availableHEX:currentHEXTotal, totalETH:currentETHTotal, entries } = lobbyData[dailyDataCount-1]
            let currentEntryTotal = BigNumber(0)
            entries && entries.forEach(entry => { 
                currentEntryTotal = currentEntryTotal.plus(entry.rawAmount)
            })
            const currentHEXPending = BigNumber(currentEntryTotal)
            return (
                <>
                    <Row key={dailyDataCount}>
                        <Col>
                            <strong>Day</strong>
                        </Col>
                        <Col>
                            {dailyDataCount+1}/351
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            <strong>Available HEX</strong>
                        </Col>
                        <Col>
                            <CryptoVal value={currentHEXTotal} showUnit />
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            <strong>Your HEX</strong>
                        </Col>
                        <Col>
                            <CryptoVal value={BigNumber(currentHEXPending)} showUnit />
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            <strong>Your ETH</strong>
                        </Col>
                        <Col>
                            <CryptoVal value={BigNumber(currentEntryTotal)} currency="ETH" showUnit />
                        </Col>
                    </Row>
                </>
            )
        }
        const { currentDay } = this.props.contract.Data
        return (
            <Accordion id="lobby_accordion" className="text.left my-3" >
                <Card bg="secondary" text="light rounded">
                    <Accordion.Toggle bg="dark" as={Card.Header}>
                        <BurgerHeading>ETH => HEX Transform</BurgerHeading>
                        <ProgressBar id="lobby" 
                            min="0" max="350" 
                            now={currentDay+1}
                            label={`Day ${currentDay+1} of 351`}
                            className="mb-3"
                            style={{ color: "black" }}
                            variant="info"
                        />
                        <HeaderDetail />
                    </Accordion.Toggle>
                    <Accordion.Collapse>
                        <Card.Body className="text-right"> 
                            <LobbyDays />
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Lobby
