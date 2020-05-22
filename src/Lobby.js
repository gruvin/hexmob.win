import React from 'react'
import { 
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
import { HexNum, WhatIsThis, BurgerHeading } from './Widgets' 

const debug = require('debug')('Lobby')
debug('loading')

class Lobby extends React.Component {
    constructor(props) {
        super(props)
        this.subscriptions = [ ]
        this.loggedEvents = [ ]
        this.state = {
            dataReady: false,
            lobbyPending: null,
            lobbyData: [ ],
            dailyData: [ ],
            memberPendingDays: [ ]
        }

        window._LOBBY = this // DEBUG REMOVE ME
    }
    
    componentDidMount = () => {
        const { contract, wallet } = this.props
        const dailyDataCount  = contract.Data.globals.dailyDataCount.toNumber()
        if (!wallet.address || wallet.address == '') return debug('Lobby::address invalid')
        Promise.all([
            contract.methods.xfLobby(dailyDataCount).call(),
            contract.methods.xfLobbyRange(0, dailyDataCount).call(),
            contract.methods.xfLobbyPendingDays(wallet.address).call(),
            contract.methods.dailyDataRange(0, dailyDataCount).call()
        ]).then(async results => {
            const pendingDaysBin = BigNumber(results[2][0]).toString(2) + BigNumber(results[2][1]).toString(2)
            let memberPendingDays = [ ]

            for (let i = 0; i < dailyDataCount; i++) {
                const inDay = Boolean(pendingDaysBin[i] === '1')
                if (inDay) {
                    const day = dailyDataCount - i
                    debug('In day ', day)
                    contract.methods.xfLobbyMembers(day, wallet.address).call().then(result => {
                        const { headIndex, tailIndex } = result
                        for (let entryIndex=headIndex; entryIndex < tailIndex; entryIndex++) {
                            const entryId = BigNumber(day).times(BigNumber(2).pow(40)).plus(entryIndex)
                            debug(`Queuing: xfLobbyEntry(${wallet.address}, ${entryId.toString()})`)
                            contract.methods.xfLobbyEntry(wallet.address, entryId.toString()).call().then(entryData => {
                                let memberPendingDays = [ ...this.state.memberPendingDays ]
                                memberPendingDays[day] = entryData
                                this.setState({
                                    memberPendingDays
                                })
                            })
                        }
                    })
                }
            }
            this.setState({ 
                lobbyPending: results[0],
                lobbyData: results[1],
                dailyData: results[3],
                dataReady: true 
            })
        })
    }

    render() {
        const { globals } = this.props.contract.Data
        const dailyDataCount  = globals.dailyDataCount.toNumber()
        const { dataReady, lobbyPending, lobbyData, memberPendingDays } = this.state
        const currentDayHEX = globals.claimStats.unclaimedSatoshisTotal.idiv(350).times(1e4)
        const memberPendingDay = memberPendingDays[dailyDataCount] || { rawAmount:0, referrerAddr: 0 }

        const LobbyDays = () => {
            const dailyData = [ ...this.state.dailyData].reverse()
            return (
                <>
                    <Row key={dailyDataCount}>
                        <Col>Day {dailyDataCount+1}/351</Col>
                        <Col><HexNum value={currentDayHEX} showUnit /></Col>
                        <Col><HexNum value={BigNumber(lobbyPending).idiv(1e10)} /> ETH</Col>
                        <Col><HexNum value={BigNumber(memberPendingDay.rawAmount).div(1e18)} /> ETH</Col>
                    </Row>
                 { [...lobbyData].reverse().map((dayTotal, index) => { 
                    const hex = BigNumber(dailyData[index]).toString(16).padStart(64, '0')
                    const dayData = {
                        payoutTotal: BigNumber(hex.slice(46,64), 16),
                        stakeSharesTotal: BigNumber(hex.slice(28,46), 16),
                        unclaimedSatoshisTotal: BigNumber(hex.slice(12,28), 16)
                    }
                    const day = dailyDataCount - index
                    const dailyHEX = dayData.unclaimedSatoshisTotal.idiv(350).times(1e4)
                    const memberPendingDay = memberPendingDays[day-1] || { rawAmount:0, referrerAddr: 0 }
                    return (
                        <Row key={dailyDataCount - index}>
                            <Col>Day {day}/351</Col>
                            <Col><HexNum value={BigNumber(dailyHEX)} showUnit /></Col>
                            <Col><HexNum value={BigNumber(dayTotal).idiv(1e10)} /> ETH</Col>
                            <Col><HexNum value={BigNumber(memberPendingDay.rawAmount).idiv(1e18)} /> ETH</Col>
                        </Row>
                    )
                }) }
                </>
            )
        }

        return (
            <Accordion id="lobby_accordion" className="text.left my-3" >
                <Card bg="secondary" text="light rounded">
                    <Accordion.Toggle bg="dark" as={Card.Header}>
                        <BurgerHeading>ETH => HEX Transform</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse>
                        <Card.Body>{ 
                            !this.state.dataReady
                            ?  ( <div className="text-center">loading data</div> )
                            : <LobbyDays />
                        }       
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Lobby
