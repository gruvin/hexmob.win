import React, { ChangeEventHandler, EventHandler, FormEvent, FormEventHandler, MouseEventHandler } from 'react'
import {
    Container,
    Row, Col,
    Form,
    ProgressBar,
    Accordion
} from 'react-bootstrap'
import './Lobby.scss'
import * as LobbyT from './lib/Lobby'
import HEX, { HEXContract, XfLobbyEnter } from './hex_contract'
import { ethers, BigNumber } from 'ethers'
import BN from 'bn.js'
import { bnE } from './util'
import { CryptoVal, BurgerHeading, VoodooButton } from './Widgets'
import Timer from 'react-compound-timer'

import _debug from 'debug'
import { bnPrefixObject } from './util'
import { BsPrefixRefForwardingComponent } from 'react-bootstrap/esm/helpers'
const debug = _debug('Lobby')

class Lobby extends React.Component<LobbyT.Props, LobbyT.State> {
    contract?: HEXContract

    constructor(props: any) {
        super(props)
        this.state = {
            historyDataReady: false,
            error: "",
            dailyDataCount: 0,
            lobbyData: [],
            lobbyDataUI: [], // sorted for UI display
            pastEntries: [],
            entryETH: "",
            entryHEX: "",
            todayAvailableHEX: "---",
            todayPendingETH: "---",
            HEXperETH: "---",
            todayYourHEXPending: "---",
            todayYourEntriesRawTotal: "---",
            unmintedEntries: {},
            lobbySortKey: { keyField: "", dir: -1 },
            walletETHBalance: ethers.constants.Zero
        }
    }

    unsubscribeEvents = () => {
        try {
            this.props.contract.removeAllListeners()
        } catch {(e: Error) => {} }
    }

    subscribeEvents = () => {
        const provider = this.props.parent.web3 // Infura
        if (!this.contract) return
        provider.on(this.contract.filters.XfLobbyEnter(null, this.props.wallet.address), (_: any) => this.getToday())
    }

    getDayEntries = (day: number, address: string): Promise<LobbyT.Entry[]> => {
        const { contract } = this.props
        const { currentDay } = contract.Data
        return new Promise((resolveEntries, reject) => {
            contract.xfLobbyMembers(day, address).then((headIndex: number, tailIndex: number) => {
                // let's NOT use Promise.all for parallel retrieval (Infura bw)
                let dayEntries = [] as LobbyT.Entry[]
                if (tailIndex === 0) resolveEntries(dayEntries)
                for (let entryIndex: number = 0; entryIndex < tailIndex; entryIndex++) {
                    const entryId = new BN(day).shln(40).or(new BN(entryIndex)).toString()
                    contract.xfEntry(address, entryId).then((entry: LobbyT.Entry) => {
                        dayEntries = dayEntries.concat(bnPrefixObject(entry))
                        if (dayEntries.length === tailIndex) {
                            if (day < currentDay) {
                                if (headIndex <= entryIndex) {
                                    this.setState({
                                        unmintedEntries: { ...this.state.unmintedEntries, ...{ [day]: dayEntries} }
                                    })
                                }
                            }
                            resolveEntries(dayEntries)
                        }
                    }).catch((e: Error) => reject(e))
                }
            })
            .catch((e: Error) => debug('getDayEntries(): Promise<LobbyT.Entry[]>: ', e))
       })
    }

    calcEntryTotals = (dayEntries: LobbyT.Entry[], bnAvailableHEX?: BigNumber, bnTotalETH?: BigNumber): LobbyT.EntryTotals => {
        //debug("dayEntries: LobbyT.Entry[]: ", dayEntries)
        const bnZero = ethers.constants.Zero
        let bnRawEntriesTotal = bnZero
        let bnPotentialHEXTotal = bnZero
        let bnMintedHEXTotal = bnZero
        let dayEntriesTotal = 0
        if (dayEntries && dayEntries.length) {
            dayEntries.forEach((entry: LobbyT.Entry) => {
                // debug("LOBBY ENTRY: ", entry)
                let { referrerAddr, bnRawAmount, bnMintedHEX } = entry
                let amountETH = Number(ethers.utils.formatEther(bnRawAmount || bnZero))
                bnRawEntriesTotal = bnRawEntriesTotal.add(bnRawAmount || bnZero)
                if (referrerAddr && referrerAddr.slice(0, 2) === '0x') {
                    amountETH = amountETH * 1.10
                    if (referrerAddr.toLowerCase() === this.props.wallet.address.toLowerCase())
                        amountETH = amountETH * 1.20 // clever person in da houuuse! :p
                }
                dayEntriesTotal += amountETH
                if (bnMintedHEX && bnMintedHEX.gt(0)) bnMintedHEXTotal = bnMintedHEXTotal.add(bnMintedHEX)
            })
            if (bnAvailableHEX && bnTotalETH) {
                bnPotentialHEXTotal = bnPotentialHEXTotal.add(bnRawEntriesTotal.mul(bnAvailableHEX).div(bnTotalETH))
            }
        }
        return {
            bnPotentialHEXTotal,
            bnMintedHEXTotal,
            bnRawEntriesTotal,
            dayEntriesTotal,
        }
    }

    getToday = async () => {
        const { contract, wallet } = this.props
        const { currentDay } = contract.Data

        try {
            const [
                bnTodayPendingETH,
                objTodayYourEntries
            ] = await Promise.all([
                contract.xfLobby(currentDay),                       // [0] global ETH entered today (total pending)
                this.getDayEntries(currentDay, wallet.address),     // [1] our ETH entries for current day (total no. pending)
            ])

            const { bnUnclaimedSatoshisTotal } = contract.Data.globals.claimStats
            const bnTodayAvailableHEX = bnUnclaimedSatoshisTotal.mul(HEX.HEARTS_PER_SATOSHI).div(350)
            const {
                bnRawEntriesTotal: bnTodayYourEntriesRawTotal,
                dayEntriesTotal: todayYourEntriesTotal,
                bnPotentialHEXTotal,
                bnMintedHEXTotal,
            }: LobbyT.EntryTotals = this.calcEntryTotals(objTodayYourEntries)
            const HEXperETH = bnE("1E10").mul(bnTodayAvailableHEX).div(bnTodayPendingETH).toString()
            const bnTodayYourHEXPending = bnTodayAvailableHEX.mul(todayYourEntriesTotal).div(bnTodayPendingETH)

            this.setState({
                todayPendingETH: bnTodayPendingETH.toString(),
                todayAvailableHEX: bnTodayAvailableHEX.toString(),
                HEXperETH,
                todayYourHEXPending: bnTodayYourHEXPending.toString(),
                todayYourEntriesRawTotal: bnTodayYourEntriesRawTotal.toString(),
            })
        } catch { (e: Error) => debug('getToday:: ERROR: ', e) }
    }

    getPastLobbyEntries = (): Promise<Array<LobbyT.Entry[]>> => {
        return new Promise((resolvePastEntries, reject) => {
            const { contract, wallet } = this.props

            let entries = Array(Array()) as LobbyT.Entries
            try {
                const newEntry: LobbyT.Entry = {
                    bnRawAmount: ethers.constants.Zero,
                    bnMintedHEX: ethers.constants.Zero,
                }
                contract.queryFilter(contract.filters.XfLobbyEnter(null, wallet.address), 'earliest')
                .then((results: ethers.Event[]) => {
                    results.forEach((event: ethers.Event) => {
                        const { entryId, referrerAddr, data0 }: LobbyT.Entry = event.args as unknown as XfLobbyEnter
                        const _entryId = new BN(entryId!.toString()) // utilise BN's bit shift and mask features
                        const _data0 = new BN(data0!.toString())
                        const day = BigNumber.from(_entryId.shrn(40).toString()).toNumber()
                        const entryNum = BigNumber.from(_entryId.maskn(40).toString()).toNumber()
                        const bnRawAmount = BigNumber.from(_data0.shrn(40).toString())
                        if (!entries[day]) entries[day] = []
                        entries[day][entryNum] = { ...newEntry, bnRawAmount, referrerAddr }
                    })
                    contract.queryFilter(contract.filters.XfLobbyExit(null, wallet.address), 'earliest')
                    .then((results: ethers.Event[]) => {
                        results.forEach(event => {
                            const { entryId, data0 }: LobbyT.Entry = event.args as unknown as XfLobbyEnter
                            const _entryId = new BN(entryId!.toString())
                            const _data0 = new BN(data0!.toString())
                            const day = BigNumber.from(_entryId.shrn(40).toString()).toNumber()
                            const entryNum = BigNumber.from(_entryId.maskn(40).toString()).toNumber()
                            const bnMintedHEX = BigNumber.from(_data0.shrn(40).toString())
                            if (!entries[day]) {
                                entries[day] = []
                                entries[day][entryNum] = { ...newEntry }
                            }
                            entries[day][entryNum] = { ...entries[day][entryNum], bnMintedHEX }
                        })
                        // debug("pastEntries: ", entries)
                        resolvePastEntries(entries)
                    })
                })
            } catch { (e: Error) => reject(e) }
        })
    }

    getHistory = async () => {
        const { contract, wallet } = this.props
        const { dailyDataCount: _ddc } = contract.Data.globals
        const dailyDataCount = Math.min(HEX.CLAIM_PHASE_END_DAY, _ddc)
        if (!wallet.address || wallet.address === '') return debug('Lobby::address invalid')

        const [
            lobbyDailyData,
            lobbyDailyETH,
            pastEntries,
            pendingEntryThisDay
        ] = await Promise.all([
            contract.dailyDataRange(0, dailyDataCount).catch((e: Error) => debug("ERR: dailyDataRange: ", e)),    // for unclaimedSatoshisTotal from each day in range
            contract.xfLobbyRange(0, dailyDataCount).catch((e: Error) => debug("ERR: xfLobbyRange", e)),          // total ETH from each day in range
            this.getPastLobbyEntries(), // lobby history from XfLobbyEnter/Exit log events
            contract.xfLobbyPendingDays(wallet.address).catch((e: Error) => debug("ERR: xfLobbyPendingDays", e)), // bit vector: (2^day == 1) => we have entries that day
        ])
        // debug("LOBBY lobbyDailyETH: ", lobbyDailyETH)
        // debug("LOBBY pendingEntryThisDay: ", pendingEntryThisDay)
        // cache day bitfield data (slightly faster at cost of mem shrug)
        let boolHasEntryDays: boolean[] = []
        for (let d = 0; d < 256; d++) boolHasEntryDays[d] = pendingEntryThisDay[1].and(BigNumber.from(2).pow(d)).gt(0)
        for (let d = 256; d < 350; d++) boolHasEntryDays[d] = pendingEntryThisDay[0].and(BigNumber.from(2).pow(d-256)).gt(0)
        // debug("BOOLDAYS: ", boolHasEntryDays)

        const lobbyData = await Promise.all(lobbyDailyData.map(async (dayData: any, day: number) => {
            return new Promise(async resolveDay => {
                const hexa = dayData.toHexString().slice(2).padStart(64, '0') // XXX
                const bnUnclaimedSatoshisTotal = BigNumber.from("0x"+hexa.slice(12,28))
                const bnAvailableHEX = (day === 0) ? BigNumber.from(10).pow(13) : bnUnclaimedSatoshisTotal.mul(HEX.HEARTS_PER_SATOSHI).div(350)
                const bnTotalETH = lobbyDailyETH[day]
                const HEXperETH = bnE("1E10").mul(bnAvailableHEX).div(bnTotalETH).toNumber()

                const dayEntries = (boolHasEntryDays[day])
                    ? await this.getDayEntries(day, wallet.address)
                    : pastEntries[day]

                const {
                    bnMintedHEXTotal,
                    bnRawEntriesTotal,
                } = this.calcEntryTotals(dayEntries)

                return resolveDay({
                    day,
                    bnAvailableHEX,
                    bnTotalETH,
                    dayEntries,
                    HEXperETH,
                    bnMintedHEXTotal,
                    bnRawEntriesTotal,
                })
            })
        }))

        // debug("LOBBY DATA: ", lobbyData)
        this.setState({
            dailyDataCount,
            lobbyData,
            lobbyDataUI: lobbyData,
            pastEntries,
            historyDataReady: true
        }, () => this.sortLobbyDataStateByField('day'))
    }

    componentDidMount = () => {
        if (localStorage.getItem('debug')) window._LOBBY = this
        this.getToday()
        this.getHistory() // => state.lobbyData
        this.subscribeEvents()
    }

    componentWillUnmount = () => {
        this.unsubscribeEvents()
    }

    resetFormAndReload = async () => {
        this.setState({
            unmintedEntries: {},
            entryHEX: ""
        }, this.getToday)
    }

    sortLobbyDataStateByField = (keyField: string) => {
        const { keyField: oldKey, dir: oldDir } = this.state.lobbySortKey
        const dir = (oldKey === keyField) ? -oldDir : -1
        const lobbySortKey = { keyField, dir }
        this.setState({
            lobbySortKey,
            lobbyDataUI: this.state.lobbyData.sort((a: {[index: string]: BigNumber | number}, b: {[index: string]: BigNumber | number}): -1 | 0 | 1 => {
                const bnA = new BN(a[keyField].toString())
                const bnB = new BN(b[keyField].toString())
                return dir > 0
                    ? (bnA.eq(bnB) ? 0 : bnB.gt(bnA) ? 1 : -1)
                    : (bnA.eq(bnB) ? 0 : bnB.gt(bnA) ? -1 : 1)
            })
        })
    }

    render() {
        const { currentDay } = this.props.contract.Data

        const handleSortSelection = ((e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const targ = e.target as HTMLAnchorElement
            if (!targ) return
            const hash = targ.closest('a')?.hash
            if (!hash) return
            const _keyField = hash.match(/sort_(.+)$/)
            const keyField = _keyField && _keyField[1]
            keyField && this.sortLobbyDataStateByField(keyField)
        }) as unknown as MouseEventHandler

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
                <Container className="pl-0 pe-3 row-highlight-even">
                    <p className="text-center"><b>Transform History</b></p>
                    <Row key="header" className="py-0 mx-0 xs-small align-items-end">
                        <Col xs={1} sm={1} className="p-0"><a href="#sort_day" onClick={handleSortSelection}>Day</a></Col>
                        <Col xs={3} sm={2} className="p-0"><a href="#sort_bnAvailableHEX" onClick={handleSortSelection}>Available</a></Col>

                        <Col        sm={2} className="px-0 d-none d-sm-inline"><a href="#sort_bnTotalETH" onClick={handleSortSelection}>ETH</a></Col>
                        <Col        sm={2} className="px-0 d-none d-sm-inline">
                            <a href="#sort_HEXperETH" onClick={handleSortSelection}>
                                <span className="d-sm-inline d-md-none"><sup>HEX</sup>/<sub>ETH</sub></span>
                                <span className="d-sm-none d-md-inline">HEX/ETH</span>
                            </a>
                        </Col>

                        <Col xs={4} sm={2} className="px-2">
                            <a href="#sort_bnMintedHEXTotal" onClick={handleSortSelection}>
                                <span className="d-inline d-sm-inline d-md-none">Ur HEX</span>
                                <span className="d-none d-md-inline">Your HEX</span>
                            </a>
                        </Col>
                        <Col xs={4} sm={3} className="p-0"><a href="#sort_bnRawEntriesTotal" onClick={handleSortSelection}>Your ETH</a></Col>
                    </Row>
                    { lobbyData.map(dayData => {
                        const { day, bnAvailableHEX, bnTotalETH, HEXperETH, bnMintedHEXTotal, bnRawEntriesTotal } = dayData

                        return (
                            <Row key={day} className={"py-0 mx-0 xs-small"+(bnRawEntriesTotal.gt(0) ? " text-success" : "")}>
                                <Col xs={1} sm={1} className="px-0">{day+1}</Col>
                                <Col xs={3} sm={2} className="px-0"><CryptoVal value={bnAvailableHEX} /></Col>

                                <Col        sm={2} className="px-0 d-none d-sm-inline"><CryptoVal value={bnTotalETH} currency="ETH" /></Col>
                                <Col        sm={2} className="px-0 d-none d-sm-inline"><CryptoVal value={HEXperETH} /></Col>

                                <Col xs={4} sm={2} className="px-2"><CryptoVal value={bnMintedHEXTotal} /></Col>
                                <Col xs={4} sm={3} className="px-0"><CryptoVal value={bnRawEntriesTotal} currency="ETH" showUnit /></Col>
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
            const timerStart = nextEpoc.getTime() - now.getTime()

            return (
                <Container>
                    <Row>
                        <Col className="text-end">
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
                        <Col className="text-end"><strong>Available </strong></Col>
                        <Col> <CryptoVal value={this.state.todayAvailableHEX} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-end"><strong>Total Entries</strong></Col>
                        <Col> <CryptoVal value={this.state.todayPendingETH} currency="ETH" showUnit /> </Col>
                    </Row>
                    <Row>
                        <Col className="text-end"><strong>HEX/ETH</strong></Col>
                        <Col> <CryptoVal value={this.state.HEXperETH} showUnit /> </Col>
                    </Row>
                    <Row>
                        <Col className="text-end"><strong>Your HEX</strong></Col>
                        <Col> <CryptoVal value={this.state.todayYourHEXPending} showUnit /></Col>
                    </Row>
                    <Row>
                        <Col className="text-end"><strong>Your ETH</strong></Col>
                        <Col> <CryptoVal value={this.state.todayYourEntriesRawTotal} currency="ETH" showUnit /></Col>
                    </Row>
                </Container>

            )
        }

        const handleAmountChange = ((e: FormEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const targ = e.target as unknown as HTMLFormElement
            this.setState({ entryETH: targ.value })
        }) as ChangeEventHandler<HTMLInputElement>

        const entries = Object.keys(this.state.unmintedEntries)

        return (
            <Accordion id="lobby_accordion" className="my-3" >
                <Accordion.Item className="bg-secondary text-light rounded pb-0" eventKey="0">
                    <Accordion.Header>
                        <Container className="px-1">
                            <Row className="col-12">
                                <Col className="pe-0"><BurgerHeading>Transform<span className="d-none d-sm-inline"> (AA Lobby)</span></BurgerHeading></Col>
                                <Col className="col-5 px-0 text-end text-success">
                                { HEX.lobbyIsActive() ?
                                    <>
                                        <span className="text-muted small align-bottom me-1">AVAILABLE</span>
                                        <strong><CryptoVal value={this.props.wallet.balanceETH} currency="ETH" showUnit /></strong>
                                    </> : <>
                                        <span className="text-muted small align-bottom">CLOSED</span>
                                    </>
                                }
                                </Col>
                            </Row>
                            <ProgressBar
                                min={0} max={350}
                                now={currentDay+1}
                                className="mb-1 mx-2"
                                variant={currentDay > 263 ? "danger" : currentDay > 125 ? "warning" : currentDay > 88 ? "info" : "success"}
                            />
                        { HEX.lobbyIsActive() && <>
                            <HeaderDetail />
                            <Form>
                                <Row className="my-2">
                                <Col xs={{ span:5, offset:1 }} sm={{ span:4, offset: 2 }} md={{ span:3, offset: 3 }} className="text-end">
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
                                        contract={ window.contract } // window.contract is our signer (Metamask etc)
                                        method="xfLobbyEnter"
                                        params={['0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2'.toLowerCase()/*referrerAddr*/ ]}
                                        overrides={{
                                            value: ethers.utils.parseUnits(this.state.entryETH)
                                        }}
                                        inputValid={ new BN(this.state.entryETH).gtn(0) }
                                        confirmationCallback={ this.resetFormAndReload }
                                    >
                                        ENTER
                                    </VoodooButton>
                                </Col>
                            </Row>
                        </Form>
                        {this.state.historyDataReady === true && Object.keys(this.state.unmintedEntries).length > 0 &&
                            <Container className="p-3 text-center">
                                <h4>Exit Previous Days</h4>
                                <p>Tap each <span className="text-success"><b>MINT</b></span> below to get your HEX...</p>
                                {entries.map((_day: string) => {
                                    const day = Number(_day)
                                    const entries = this.state.unmintedEntries[day]
                                    const { availableHEX, totalETH } = this.state.lobbyData[Number(day)]

                                    const {
                                        bnPotentialHEXTotal
                                    } = this.calcEntryTotals(
                                        this.state.pastEntries[Number(day)],
                                        availableHEX,
                                        totalETH
                                    )

                                    return (
                                        <div className="text-center m-2" key={day}>
                                            <VoodooButton
                                                contract={window.contract}
                                                method="xfLobbyExit"
                                                params={[day, 0]}
                                                overrides={{ from: this.props.wallet.address }}
                                                confirmationCallback={this.resetFormAndReload}
                                                className="text-center lobby btn-mint"
                                            >
                                                <span className="text-info text-normal">
                                                    <small>day {day+1}{entries.length > 1 && <sup>({entries.length} entries)</sup>}</small>
                                                </span>{' '}
                                                MINT&nbsp;<CryptoVal value={bnPotentialHEXTotal}showUnit />
                                            </VoodooButton>
                                        </div>
                                    )
                                })
                            }
                            </Container>
                        }
                </> }
                        </Container>
                    </Accordion.Header>
                    <Accordion.Collapse className="bg-dark text-end" eventKey="0">
                        <LobbyDays />
                    </Accordion.Collapse>
                </Accordion.Item>
            </Accordion>
        )
    }
}

export default Lobby
