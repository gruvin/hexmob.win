import React from 'react'
import { 
    Container,
    Row, Col,
    Card,
    Form,
    ProgressBar,
    Accordion
} from 'react-bootstrap'
import './Stakes.scss'
import HEX from './hex_contract'
import { BigNumber } from 'bignumber.js'
import { CryptoVal, BurgerHeading, VoodooButton } from './Widgets' 
import BitSet from 'bitset'
import Timer from 'react-compound-timer'
import crypto from 'crypto'

const debug = require('debug')('Lobby')
debug('loading')

class Lobby extends React.Component {
    constructor(props) {
        super(props)
        this.loggedEvents = [ ]
        this.state = {
            historyDataReady: false,
            error: null,
            dailyDataCount: 0,
            lobbyData: null,
            entryETH: '', // form input value
            todayAvailableHEX: '---',
            todayPendingETH: '---',
            HEXperETH: '---',
            todayYourHEXPending: '---',
            todayYourEntriesRawTotal: '---',
            unmintedEntries: [ ]
        }
        window._LOBBY = this // DEBUG REMOVE ME
    }
    
    getDayEntries = (day, address) => {
        const { contract } = this.props
        const { currentDay } = this.props.contract.Data
        return new Promise((resolveEntries, reject) => {
            contract.methods.xfLobbyMembers(day, address).call()
            .then(entryIndexes => {
                const { headIndex, tailIndex } = entryIndexes
                debug(`headIndex=${headIndex}, tailIndex=${tailIndex}`)
                const promiseQueue = [ ]
                let unmintedCount = 0
                for (let entryIndex = 0; entryIndex < tailIndex; entryIndex++) {
                    const entryId = BigNumber(day).times(BigNumber(2).pow(40)).plus(entryIndex)
                    if (headIndex <= entryIndex) unmintedCount++
                    promiseQueue.push(
                        contract.methods.xfLobbyEntry(address, entryId.toString()).call()
                    )
                }
                if (day < currentDay && unmintedCount > 0) {
                    this.setState({ 
                        unmintedEntries: this.state.unmintedEntries.concat({ day,  count: unmintedCount })
                    })
                }
                Promise.all(promiseQueue).then(entriesResult => {
                    const entries = entriesResult.map(entry => {
                        return {
                            rawAmount: BigNumber(entry.rawAmount),
                            referrerAddr: entry.referrerAddr
                        }
                    })
                    resolveEntries(entries)
                })
                .catch(e => reject(e))
            })
       })
    }

    getToday = () => {
        const { contract, wallet } = this.props
        const { currentDay } = this.props.contract.Data

        Promise.all([
            contract.methods.xfLobby(currentDay).call(),            // [0] global ETH entered today (total pending)
            this.getDayEntries(currentDay, wallet.address),         // [1] our ETH entries for current day (total no. pending)
        ]).then(results => {
            const todayPendingETH  = BigNumber(results[0])
            const todayYourEntries = results[1]
            const totalUnclaimedSatoshis = contract.Data.globals.claimStats.unclaimedSatoshisTotal
            const todayAvailableHEX = totalUnclaimedSatoshis.div(350).times(HEX.HEARTS_PER_SATOSHI) 

            let todayYourEntriesRawTotal = BigNumber(0)
            let todayYourEntriesTotal = BigNumber(0)
            todayYourEntries && todayYourEntries.forEach(entry => { 
                let amount = entry.rawAmount
                todayYourEntriesRawTotal = todayYourEntriesRawTotal.plus(amount)
                if (entry.referrerAddr.slice(0, 2) === '0x') {
                    amount = amount.times(1.10)
                    if (entry.referrerAddr.toLowerCase() === this.props.wallet.address.toLowerCase())
                        amount = amount.times(1.20) // clever person in the house! :p
                }
                todayYourEntriesTotal = todayYourEntriesTotal.plus(amount)
            })
            const HEXperETH = todayAvailableHEX.div(todayPendingETH)
            const todayYourHEXPending = todayYourEntriesTotal.div(todayPendingETH).times(todayAvailableHEX)
    
            this.setState({
                todayPendingETH,
                todayAvailableHEX,
                HEXperETH: HEXperETH.times(1e8),
                todayYourHEXPending,
                todayYourEntriesRawTotal
            })
        })
    }

    getHistory = () => {
        const { contract, wallet } = this.props
        const dailyDataCount  = Math.min(HEX.CLAIM_PHASE_END_DAY, contract.Data.globals.dailyDataCount.toNumber())

        if (!wallet.address || wallet.address === '') return debug('Lobby::address invalid')
        Promise.all([
            contract.methods.dailyDataRange(0, dailyDataCount).call(),  // [0] for unclaimedSatoshisTotal from each day in range
            contract.methods.xfLobbyRange(0, dailyDataCount).call(),    // [1] total ETH from each day in range
            contract.methods.xfLobbyPendingDays(wallet.address).call(), // [2] bit vector of days; 1 == we have entires that day
        ]).then(results => {
            const lobbyDailyData        = results[0]
            const lobbyDailyETH         = results[1]
            const totalUnclaimedSatoshis = contract.Data.globals.claimStats.unclaimedSatoshisTotal
            const lobbyTodayAvailableHEX = totalUnclaimedSatoshis.div(350).times(HEX.HEARTS_PER_SATOSHI) 

            const hasEntryThisDay = new BitSet(
                BigNumber(results[2][1]).toString(2) +
                BigNumber(results[2][0]).toString(2)
            )

            new Promise((resolveLobby, reject) => {
                Promise.all(lobbyDailyData.map((mappedDayData, day) => { // returns array of lobby day promises
                    return new Promise((resolveDay, reject) => {
                        const hexa = BigNumber(mappedDayData).toString(16).padStart(64, '0')
                        const unclaimedSatoshisTotal = BigNumber(hexa.slice(12,28), 16)
                        const availableHEX = (day === 0) ? BigNumber(1e13) : unclaimedSatoshisTotal.div(350).times(HEX.HEARTS_PER_SATOSHI)
                        const totalETH = lobbyDailyETH[day]

                        if (hasEntryThisDay.get(day)) {
                            this.getDayEntries(day, wallet.address).then(entries => {
                                resolveDay({
                                    day,
                                    availableHEX,
                                    totalETH,
                                    entries
                                })
                            })
                            .catch(e => reject(e))
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
                .catch(e => reject(e))
            })
            .then(lobbyData => {
                debug('lobbyData: %O', lobbyData)
                this.setState({
                    dailyDataCount,
                    lobbyData,
                    historyDataReady: true
                })
            })
            .catch(e => { this.setState({ error: e }) })
        })
    }

    addToEventLog = (s) => {
        this.loggedEvents = this.loggedEvents.concat(crypto.createHash('sha1').update(s).digest('hex'))
    }
    existsInEventLog = (s) => {
        return this.loggedEvents.includes(crypto.createHash('sha1').update(s).digest('hex'))
    }

    subscribEvents = async () => {
        await this.props.contract.events.XfLobbyEnter( {filter:{memberAddr:this.props.wallet.address}}, async (e, r) => {
            if (e) { 
                debug('ERR: events.XfLobbyEnter:', e) 
                return
            }
            debug('events.XfLobbyEnter[e, r]: ', e, r)

            const { id, blockHash, removed, stakeId } = r.returnValues
            if (this.existsInEventLog(id+blockHash+removed+stakeId)) return
            this.addToEventLog(id+blockHash+removed+stakeId)

            debug('CALLING getToday()')
            this.getToday()
        })
    }

    componentDidMount = () => {
        this.getToday()
        this.getHistory()
        this.subscribEvents()
    }

    componentWillUnmount = () => {
        /* TODO -- clear subscriptions */
    }

    resetFormAndReload = async () => {
        await this.setState({ 
            unmintedEntries: [ ],
            entryHEX: '' 
        })
        this.getToday()
    }

    render() {
        const { currentDay } = this.props.contract.Data

        const LobbyDays = () => {
            if (!this.state.historyDataReady) {
                if (this.state.error)
                    return ( <div className="text-center">error :/</div> )
                else
                    return ( <div className="text-center">loading ...</div> )
            }

            const lobbyData = [...this.state.lobbyData].reverse()
            return (
                <>
                    <Row key="header" className="py-0 mx-0 xs-small xxs-small align-items-end">
                        <Col xs={2} sm={1} className="pl-1 pr-1"><a href="#sort_day">Day</a></Col>
                        <Col xs={3} sm={2} className="pr-1"><a href="#sort_available">Available</a></Col>

                        <Col        sm={2} className="pr-1 d-none d-sm-inline"><a href="#sort_eth">ETH</a></Col>
                        <Col        sm={2} className="pr-1 d-none d-sm-inline"><a href="#sort_available">HEX/ETH</a></Col>

                        <Col xs={3} sm={2} className="pr-1"><a href="#sort_available">Your HEX</a></Col>        
                        <Col xs={3} sm={2} className="pr-1"><a href="#sort_youreth">Your ETH</a></Col>
                    </Row>
                    { lobbyData.map(dayData => { 
                        const { day, availableHEX, totalETH, entries } = dayData
                        let entriesRawTotal = BigNumber(0)
                        let entriesTotal = BigNumber(0)
                        entries && entries.forEach(entry => { 
                            let amount = entry.rawAmount
                            entriesRawTotal = entriesTotal.plus(amount)
                            if (entry.referrerAddr.slice(0,2) === '0x') {
                                amount = amount.times(1.10)
                                if (entry.referrerAddr.toLowerCase() === this.props.wallet.address.toLowerCase())
                                    amount = amount.times(1.20)
                            }
                            entriesTotal = entriesTotal.plus(amount)
                        })
                        const HEXperETH = 0
                        const yourHEX = 0 
                        return (
                            <Row key={day} className="py-0 mx-0 xs-small xxs-small">
                                <Col xs={2} sm={1} className="pl-1 pr-1">{day+1}</Col>
                                <Col xs={3} sm={2} className="pr-1"><CryptoVal value={BigNumber(availableHEX)} /></Col>

                                <Col        sm={2} className="pr-1 d-none d-sm-inline"><CryptoVal value={BigNumber(totalETH)} currency="ETH" /></Col>
                                <Col        sm={2} className="pr-1 d-none d-sm-inline"><CryptoVal value={BigNumber(HEXperETH)} /></Col>

                                <Col xs={3} sm={2} className="pr-1"><CryptoVal value={BigNumber(yourHEX)} /></Col>
                                <Col xs={3} sm={2} className="pr-1"><CryptoVal value={BigNumber(entriesRawTotal)} currency="ETH" /></Col>
                            </Row>
                        )
                    }) }
                </>
            )
        }

        const HeaderDetail = () => {
            const { 
                lobbyTodayAvailableHEX,
                lobbyTodayPendingETH,
                lobbyTodayYourEntries
            } = this.state
            const epocHour = new Date(HEX.START_DATE).getUTCHours() // should convert to local time
            const now = new Date(Date.now())
            const nextEpoc = new Date(now)
            nextEpoc.setUTCHours(epocHour)
            nextEpoc.setMinutes(0)
            nextEpoc.setSeconds(0)
            if (nextEpoc < now) nextEpoc.setUTCDate(nextEpoc.getUTCDate()+1) // NOTE: "Date" meqns "day of month", here
            const timerStart = nextEpoc - now

            return (
                <Container>
                    <Row>
                        <Col className="text-right"> 
                            <strong>Day</strong>{' '}
                            <span className="text-info">{currentDay+1}</span>
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
                        <Col className="text-right"><strong>Available </strong></Col>
                        <Col> <CryptoVal value={this.state.todayAvailableHEX} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-right"><strong>Total Entries</strong></Col>
                        <Col> <CryptoVal value={this.state.todayPendingETH} currency="ETH" showUnit /> </Col>
                    </Row>
                    <Row>
                        <Col className="text-right"><strong>HEX/ETH</strong></Col>
                        <Col> <CryptoVal value={this.state.HEXperETH} showUnit /> </Col>
                    </Row>
                    <Row>
                        <Col className="text-right"><strong>Your HEX</strong></Col>
                        <Col> <CryptoVal value={this.state.todayYourHEXPending} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-right"><strong>Your ETH</strong></Col>
                        <Col> <CryptoVal value={this.state.todayYourEntriesRawTotal} currency="ETH" showUnit /></Col>
                    </Row>
                </Container>

            )
        }

        const handleAmountChange = (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.setState({
                entryETH: e.target.value
            })
        }

        return (
            <Accordion id="lobby_accordion" className="text.left my-3" >
                <Card bg="secondary" text="light rounded">
                    <Accordion.Toggle as={Card.Header} eventKey="0">
                        <BurgerHeading>Transform (AA Lobby)</BurgerHeading>
                        <Container>
                            <ProgressBar id="lobby" 
                                min="0" max="350" 
                                now={currentDay+1}
                                className="mb-1"
                                style={{ height: "6px" }}
                                variant={currentDay > 263 ? "danger" : currentDay > 125 ? "warning" : currentDay > 88 ? "info" : "success"}
                            />
                { HEX.lobbyIsActive() && <>
                            <HeaderDetail />
                            <Form>
                                <Row className="my-2">
                                <Col xs={{ span:5, offset:1 }} sm={{ span:4, offset: 2 }} md={{ span:3, offset: 3 }} className="text-right">
                                    <Form.Control
                                        type="number"
                                        placeholder="ETH amount"
                                        value={this.state.entryETH}
                                        aria-label="amount of ETH forthis lobby entry"
                                        aria-describedby="basic-addon1"
                                        onChange={ handleAmountChange }
                                        onClick={(e) => e.stopPropagation()} 
                                    />
                                </Col>
                                <Col xs={6}>
                                    <VoodooButton
                                        contract={ this.props.contract }
                                        method="xfLobbyEnter" 
                                        params={['0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2'.toLowerCase()/*referrerAddr*/ ]}
                                        options={{ 
                                            from:this.props.wallet.address, 
                                            value: BigNumber(this.state.entryETH/*string*/).times(1e18) 
                                        }}
                                        inputValid={ BigNumber(this.state.entryETH).gt(0) }
                                        confirmationCallback={ this.resetFormAndReload }
                                        variant="lobby btn-enter"
                                    >
                                        ENTER
                                    </VoodooButton>
                                </Col>
                            </Row>
                        </Form>
                        { this.state.unmintedEntries.length && 
                        <Container className="bg-dark text-center rounded p-3" style={{ width: "340px" }}>
                            <p>Previous entries awaiting minting</p>
                            {this.state.unmintedEntries.map(entry => {
                                return (
                                    <div className="text-center m-2">
                                        <VoodooButton 
                                            contract={this.props.contract}
                                            method="xfLobbyExit" 
                                            params={[entry.day, 0]}
                                            options={{ from: this.props.wallet.address }}
                                            confirmationCallback={this.resetFormAndReload}
                                            variant="lobby btn-mint"
                                            className="text-right"
                                            style={{ minWidth: "7em"}}
                                        >
                                            <span className="text-info text-normal">
                                                <small>day {entry.day+1}<sup>({entry.count})</sup></small>
                                            </span>{' '}
                                            MINT
                                        </VoodooButton>
                                    </div>
                                )
                            })
                        }
                        </Container>
                        }
                </> }
                        </Container>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="0">
                        <Card.Body className="bg-dark text-right"> 
                            <LobbyDays />
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Lobby
