import React from 'react'
import { 
    Container,
    Row, Col,
    Card,
    Form,
    ProgressBar,
    Accordion
} from 'react-bootstrap'
import './Lobby.scss'
import HEX from './hex_contract'
import { BigNumber } from 'bignumber.js'
import { CryptoVal, BurgerHeading, VoodooButton } from './Widgets' 
import BitSet from 'bitset'
import Timer from 'react-compound-timer'
import crypto from 'crypto'

const debug = require('debug')('Lobby')

class Lobby extends React.Component {
    constructor(props) {
        super(props)
        this.eventLog = { }
        this.state = {
            historyDataReady: false,
            error: null,
            dailyDataCount: 0,
            lobbyData: null, // no mutations
            lobbyDataUI: null, // sorted for UI display
            pastEntries: { },
            entryETH: '', // form input value
            todayAvailableHEX: '---',
            todayPendingETH: '---',
            HEXperETH: '---',
            todayYourHEXPending: '---',
            todayYourEntriesRawTotal: '---',
            unmintedEntries: [ ],
            lobbySortKey: { keyField: '', dir: -1 },
            walletETHBalance: new BigNumber(0)
        }
    }

    addToEventLog = (entry) => {
        const hash = crypto.createHash('sha1').update(JSON.stringify(entry)).digest('hex')
        if (this.eventLog[hash]) return false
        this.eventLog[hash] = entry
        return true
    }

    unsubscribeEvents = () => {
        try {
            this.web3.eth.clearSubscriptions()
        } catch(e) {}
    }
    
    handleSubscriptionError = (e, r) => {
        debug("subscription error: ", e)
    }
    
    subscribeEvents = () => {
        this.props.contract.events.XfLobbyEnter( {filter:{memberAddr:this.props.wallet.address}}, async (e, r) => {
            if (e) { 
                debug('ERR: events.XfLobbyEnter:', e) 
                return
            }
            if (r && !this.addToEventLog(r)) return
            this.getToday()
        })
        .on('connected', (id) => debug('subbed: XfLobbyEnter:', id))
        .on('error', this.handleSubscriptionError)
    }
    
    getDayEntries = (day, address) => {
        const { contract } = this.props
        return new Promise((resolveEntries, reject) => {
            contract.methods.xfLobbyMembers(day, address).call()
            .then(entryIndexes => {
                const { headIndex, tailIndex } = entryIndexes

                // let's NOT use Promise.all ... (reasons)
                var entries = [ ]
                if (Number(tailIndex) === 0) return resolveEntries(entries)
                for (let entryIndex = 0; entryIndex < tailIndex; entryIndex++) {
                    const entryId = BigNumber(day).times(BigNumber(2).pow(40)).plus(entryIndex).toString()
                    // eslint-disable-next-line
                    contract.methods.xfLobbyEntry(address, entryId).call({from: address}, (err, entry) => {
                        let newEntry = [ ]
                        if (err) {
                            debug('getDayEntries:: WARNING: day %d, entryId:%s : %s', day, entryId, err)
                        } else {
                            newEntry = {
                                rawAmount: BigNumber(entry.rawAmount),
                                referrerAddr: entry.referrerAddr,
                            }
                        }
                        entries = entries.concat(newEntry)
                        if (entries.length === Number(tailIndex)) {
                            if (day < contract.Data.currentDay) {
                                if (headIndex <= entryIndex) {
                                    this.setState({ 
                                        unmintedEntries: this.state.unmintedEntries.concat({ day, entries})
                                    })
                                }
                            }
                            resolveEntries(entries)
                        }
                    })
                }
            })
            .catch(e => debug('getDayEntries:: ERROR: ', e))
       })
    }

    calcEntryTotals = (entries, availableHEX=null, totalETH=null) => {
        let rawEntriesTotal = BigNumber(0)
        let entriesTotal = BigNumber(0)
        let mintedHEXTotal = BigNumber(0)
        let potentialHEXTotal = BigNumber(0)
        entries && entries.forEach(entry => { 
            let amountETH = entry.rawAmount
            rawEntriesTotal = rawEntriesTotal.plus(amountETH)
            if (entry.referrerAddr.slice(0, 2) === '0x') {
                amountETH = amountETH.times(1.10)
                if (entry.referrerAddr.toLowerCase() === this.props.wallet.address.toLowerCase())
                    amountETH = amountETH.times(1.20) // clever person in the house! :p
            }
            entriesTotal = entriesTotal.plus(amountETH)
            if (entry.mintedHEX) mintedHEXTotal = mintedHEXTotal.plus(entry.mintedHEX)
        })
        if (availableHEX !== null && totalETH !== null) {
            potentialHEXTotal = entriesTotal.times(availableHEX).idiv(totalETH)
        }
        return {
            potentialHEXTotal,
            mintedHEXTotal,
            rawEntriesTotal,
            entriesTotal
        }
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
            const { 
                rawEntriesTotal:todayYourEntriesRawTotal, 
                entriesTotal:todayYourEntriesTotal
            } = this.calcEntryTotals(todayYourEntries)
            const HEXperETH = todayAvailableHEX.div(todayPendingETH.div(1e18))
            const todayYourHEXPending = todayYourEntriesTotal.div(todayPendingETH).times(todayAvailableHEX)
    
            this.setState({
                todayPendingETH,
                todayAvailableHEX,
                HEXperETH: HEXperETH,
                todayYourHEXPending,
                todayYourEntriesRawTotal
            })
        })
        .catch(e => debug('getToday:: ERROR: ', e))
    }

    getPastLobbyEntries = () => {
        /*  returns array of objects <= [ 
                { 
                    <day>: [ 
                        {
                            rawAmount<BigNumber>,
                            referrerAddr<BigNumber>,
                            mintedHEX<BigNumber>
                        }
                    ]
                } 
            ]
        */
        return new Promise((resolvePastEntries, reject) => {
            const { contract, wallet } = this.props
            let entries = { }
            contract.getPastEvents('XfLobbyEnter',{ 
                fromBlock: 'earliest', 
                filter: { memberAddr: wallet.address }
            }).then(results => {
                results.forEach(d => {
                    const r = d.returnValues
                    const day = BigNumber(r.entryId).idiv(BigNumber(2).pow(40)).toString()
                    const entryNum = BigNumber(r.entryId).mod(BigNumber(2).pow(40)).toNumber()
                    const entriesCopy = { ...entries }
                    const dayEntriesCopy = entriesCopy[day] ? [ ...entriesCopy[day] ] : [ ]
                    dayEntriesCopy[entryNum] = { 
                        rawAmount: BigNumber(r.data0).idiv(BigNumber(2).pow(40)),
                        referrerAddr: r.referrerAddr 
                    }
                    entriesCopy[day] = dayEntriesCopy
                    entries = entriesCopy 
                })
                contract.getPastEvents('XfLobbyExit',{ 
                    fromBlock: 'earliest', 
                    filter: { memberAddr: wallet.address }
                }).then(results => {
                    results.forEach(d => {
                        const r = d.returnValues
                        const day = BigNumber(r.entryId).idiv(BigNumber(2).pow(40)).toString()
                        const entryNum = BigNumber(r.entryId).mod(BigNumber(2).pow(40)).toNumber()
                        const entriesCopy = { ...entries }
                        let dayEntriesCopy = entriesCopy[day] ? [ ...entriesCopy[day] ] : [ ]
                        dayEntriesCopy[entryNum].mintedHEX = BigNumber(r.data0).idiv(BigNumber(2).pow(40))
                        entriesCopy[day] = dayEntriesCopy
                        entries = entriesCopy
                    })
                    resolvePastEntries(entries)
                })
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
            this.getPastLobbyEntries(),                                 // [2] lobby entries history from XfLobbyEnter/Exit event log
            contract.methods.xfLobbyPendingDays(wallet.address).call(), // [3] bit vector of days; 1 == we have entires that day
        ]).then(results => {
            const lobbyDailyData        = results[0]
            const lobbyDailyETH         = results[1]
            const pastEntries           = results[2]
            const hasPendingEntryThisDay = new BitSet(
                BigNumber(results[3][1]).toString(2) +
                BigNumber(results[3][0]).toString(2)
            )

            new Promise((resolveLobby, reject) => {
                Promise.all(lobbyDailyData.map((mappedDayData, day) => { // returns array of lobby day promises
                    return new Promise(async (resolveDay, reject) => {
                        const hexa = BigNumber(mappedDayData).toString(16).padStart(64, '0')
                        const unclaimedSatoshisTotal = BigNumber(hexa.slice(12,28), 16)
                        const availableHEX = (day === 0) ? BigNumber(1e13) : unclaimedSatoshisTotal.div(350).times(HEX.HEARTS_PER_SATOSHI)
                        const totalETH = BigNumber(lobbyDailyETH[day])
                        const HEXperETH = availableHEX.div(totalETH.div(1e18))

                        let entries = null
                        if (hasPendingEntryThisDay.get(day))
                            entries = await this.getDayEntries(day, wallet.address)
                        else
                            entries = pastEntries[day]
                        const {
                            mintedHEXTotal,
                            rawEntriesTotal
                        } = this.calcEntryTotals(entries)

                        resolveDay({
                            day,
                            availableHEX,
                            totalETH,
                            entries,
                            HEXperETH,
                            mintedHEXTotal,
                            rawEntriesTotal
                        })
                    })
                }))
                .then(days => resolveLobby(days))
                .catch(e => reject(e))
            })
            .then(lobbyData => {
                this.setState({
                    dailyDataCount,
                    lobbyData,
                    lobbyDataUI: lobbyData,
                    pastEntries,
                    historyDataReady: true
                }, () => this.sortLobbyDataStateByField('day'))
            })
            .catch(e => debug('Lobby::getHistory ERR: ', e))
        })
    }

    componentDidMount = () => {
        if (localStorage.getItem('debug')) window._LOBBY = this
        this.getToday()
        this.getHistory() // state.lobbyData
        this.subscribeEvents()
    }

    componentWillUnmount = () => {
        this.unsubscribeEvents()
    }

    resetFormAndReload = async () => {
        await this.setState({ 
            unmintedEntries: [ ],
            entryHEX: '' 
        })
        this.getToday()
    }

    sortLobbyDataStateByField = (keyField) => {
        const { keyField:oldKey, dir:oldDir } = this.state.lobbySortKey
        const dir = (oldKey === keyField) ? -oldDir : -1
        const lobbySortKey = { keyField, dir }
        this.setState({
            lobbySortKey,
            lobbyDataUI: [ ...this.state.lobbyData ].sort((a, b) => {
                const bn_a = BigNumber(a[keyField])
                const bn_b = BigNumber(b[keyField])
                return dir * (bn_a.lt(bn_b) ? -1 : bn_a.gt(bn_b) ? 1 : 0)
            })
        })
    }

    render() {
        const { currentDay } = this.props.contract.Data

        const handleSortSelection = (e) => {
            e.preventDefault()
            e.stopPropagation()
            const hash = e.target.closest('a').hash
            const keyField = hash.match(/sort_(.+)$/)[1] || null
            keyField && this.sortLobbyDataStateByField(keyField)
        }

        const LobbyDays = () => {
            if (!this.state.historyDataReady) {
                if (this.state.error) {
                    debug('ERROR: ', this.state.error)
                    return ( <div className="text-center">error :/</div> )
                } else 
                    return ( <div className="text-center">loading ...</div> )
            }

            const lobbyData = this.state.lobbyDataUI
            return (
                <Container className="pl-0 pr-3 row-highlight-even">
                    <p className="text-center"><b>Transform History</b></p>
                    <Row key="header" className="py-0 mx-0 xs-small align-items-end">
                        <Col xs={1} sm={1} className="p-0"><a href="#sort_day" onClick={handleSortSelection}>Day</a></Col>
                        <Col xs={3} sm={2} className="p-0"><a href="#sort_availableHEX" onClick={handleSortSelection}>Available</a></Col>

                        <Col        sm={2} className="px-0 d-none d-sm-inline"><a href="#sort_totalETH" onClick={handleSortSelection}>ETH</a></Col>
                        <Col        sm={2} className="px-0 d-none d-sm-inline">
                            <a href="#sort_HEXperETH" onClick={handleSortSelection}>
                                <span className="d-sm-inline d-md-none"><sup>HEX</sup>/<sub>ETH</sub></span>
                                <span className="d-sm-none d-md-inline">HEX/ETH</span>
                            </a>
                        </Col>

                        <Col xs={4} sm={2} className="px-2">
                            <a href="#sort_mintedHEXTotal" onClick={handleSortSelection}>
                                <span className="d-inline d-sm-inline d-md-none">Ur HEX</span>
                                <span className="d-none d-md-inline">Your HEX</span>
                            </a>
                        </Col>        
                        <Col xs={4} sm={3} className="p-0"><a href="#sort_rawEntriesTotal" onClick={handleSortSelection}>Your ETH</a></Col>
                    </Row>
                    { lobbyData.map(dayData => { 
                        const { day, availableHEX, totalETH, HEXperETH, mintedHEXTotal, rawEntriesTotal } = dayData

                        return (
                            <Row key={day} className={"py-0 mx-0 xs-small"+(rawEntriesTotal.gt(0) ? " text-success" : "")}>
                                <Col xs={1} sm={1} className="px-0">{day+1}</Col>
                                <Col xs={3} sm={2} className="px-0"><CryptoVal value={availableHEX} /></Col>

                                <Col        sm={2} className="px-0 d-none d-sm-inline"><CryptoVal value={totalETH} currency="ETH" /></Col>
                                <Col        sm={2} className="px-0 d-none d-sm-inline"><CryptoVal value={HEXperETH} /></Col>

                                <Col xs={4} sm={2} className="px-2"><CryptoVal value={mintedHEXTotal} /></Col>
                                <Col xs={4} sm={3} className="px-0"><CryptoVal value={rawEntriesTotal} currency="ETH" showUnit /></Col>
                            </Row>
                        )
                    }) }
                </Container>
            )
        }

        const HeaderDetail = () => {
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
                                        <small>closing</small>{' '}
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
            <Accordion id="lobby_accordion" className="my-3" >
                <Card bg="secondary" text="light rounded pb-0">
                    <Accordion.Toggle as={Card.Header} eventKey="0">
                        <BurgerHeading>Transform<span className="d-none d-sm-inline"> (AA Lobby)</span></BurgerHeading>
                        <div className="float-right pr-1 text-success">
                        { HEX.lobbyIsActive() ? 
                            <> 
                                <span className="text-muted small">AVAILABLE </span>
                                <strong><CryptoVal value={this.props.wallet.balanceETH} currency="ETH" showUnit /></strong>
                            </> : <> 
                                <span className="text-muted small">CLOSED</span> 
                            </>
                        }
                        </div>
                        <Container>
                            <ProgressBar id="lobby" 
                                min="0" max="350" 
                                now={currentDay+1}
                                className="mb-1"
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
                                        contract={ window.contract }
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
                        {this.state.historyDataReady === true && this.state.unmintedEntries.length > 0 && 
                        <Container className="p-3 text-center">
                            <h4>Exit Previous Days</h4>
                            <p>Tap each <span className="text-success"><b>MINT</b></span> below to get your HEX...</p>
                            {this.state.unmintedEntries.map(data => {
                                const { day, entries } = data
                                const { availableHEX, totalETH } = this.state.lobbyData[day]
                                
                                const {
                                    potentialHEXTotal
                                } = this.calcEntryTotals(
                                    this.state.pastEntries[day],
                                    availableHEX,
                                    totalETH
                                )

                                return (
                                    <div className="text-center m-2" key={day}>
                                        <VoodooButton 
                                            contract={window.contract}
                                            method="xfLobbyExit" 
                                            params={[day, 0]}
                                            options={{ from: this.props.wallet.address }}
                                            confirmationCallback={this.resetFormAndReload}
                                            variant="lobby btn-mint"
                                            className="text-center"
                                        >
                                            <span className="text-info text-normal">
                                                <small>day {day+1}{entries.length > 1 && <sup>({entries.length} entries)</sup>}</small>
                                            </span>{' '}
                                            MINT&nbsp;<CryptoVal value={potentialHEXTotal}showUnit />
                                        </VoodooButton>
                                    </div>
                                )
                            })}
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
