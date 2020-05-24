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
import Timer from 'react-compound-timer'

const debug = require('debug')('Lobby')
debug('loading')

class Lobby extends React.Component {
    constructor(props) {
        super(props)
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
            contract.methods.dailyDataRange(0, dailyDataCount).call(),  // [1]
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
                        const availableHEX = (day === 0) ? BigNumber(1e13) : unclaimedSatoshisTotal.div(350).times(HEX.HEARTS_PER_SATOSHI)
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
                    <Row key="header" className="py-0 xs-small">
                        <Col xs={2} className="pl-1 pr-1"><a href="#sort_day">Day</a></Col>
                        <Col xs={3} className="pr-1"><a href="#sort_available">Available</a></Col>
                        <Col xs={3} className="pr-1"><a href="#sort_eth">ETH</a></Col>
                        <Col xs={3} className="pr-1"><a href="#sort_youreth">Your ETH</a></Col>
                    </Row>
                    { lobbyData.map(dayData => { 
                        const { day, availableHEX, totalETH, entries } = dayData
                        let entriesTotal = BigNumber(0)
                        entries && entries.forEach(entry => { entriesTotal = entriesTotal.plus(entry.rawAmount) })
                        return (
                            <Row key={day} className="py-0 xs-small">
                                <Col xs={2} className="pl-1 pr-1">{day+1}</Col>
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
            const epocHour = new Date(HEX.START_DATE).getUTCHours() // should convert to local time
            const now = new Date(Date.now())
            const nowHour = now.getUTCHours()
            const hourDiff = epocHour - nowHour + 24 * (epocHour < nowHour)
            const nextEpoc = new Date(now)
            nextEpoc.setUTCHours(epocHour)
            nextEpoc.setMinutes(0)
            nextEpoc.setSeconds(0)
            if (nextEpoc < now) nextEpoc.setUTCDate(nextEpoc.getUTCDate()+1) // NOTE: "Date" meqns "day of month", here
            const timerStart = nextEpoc - now

            return (
                <>
                    <Row key="lobby_header">
                        <Col className="text-right"> 
                            <strong>Day</strong>{' '}
                            <span className="text-info">{dailyDataCount+1}</span>
                            <span className="text-muted">/351</span>
                        </Col>
                        <Col>
                            <div className="float:right">
                                <Timer
                                    initialTime={timerStart}
                                    direction="backward"
                                >
                                {() => 
                                    <>
                                        <small>closes</small>{' '}
                                        <Timer.Hours formatValue={value => value.toString().padStart(2, '0') } />:
                                        <Timer.Minutes formatValue={value => value.toString().padStart(2, '0') } />:
                                        <Timer.Seconds formatValue={value => value.toString().padStart(2, '0') } />
                                    </>
                                }
                                </Timer>
                            </div>
                        </Col>
                    </Row>
                    <Row>
                        <Col className="text-right"> <strong>Available HEX</strong> </Col>
                        <Col> <CryptoVal value={currentHEXTotal} /> </Col>
                    </Row>
                    <Row>
                        <Col className="text-right"> <strong>Your HEX</strong> </Col>
                        <Col> <CryptoVal value={BigNumber(currentHEXPending)} /> </Col>
                    </Row>
                    <Row>
                        <Col className="text-right"> <strong>Your ETH</strong> </Col>
                        <Col> <CryptoVal value={BigNumber(currentEntryTotal)} currency="ETH" /> </Col>
                    </Row>
                </>
            )
        }
        const { currentDay } = this.props.contract.Data
        return (
            <Accordion id="lobby_accordion" className="text.left my-3" >
                <Card bg="dark" text="light rounded">
                    <Accordion.Toggle bg="dark" as={Card.Header} eventKey="0" className="p-0">
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
                    <Accordion.Collapse eventKey="0">
                        <Card.Body className="text-right p-0"> 
                            <LobbyDays />
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Lobby
