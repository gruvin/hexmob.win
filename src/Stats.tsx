import React from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Accordion from 'react-bootstrap/Accordion'
import { BurgerHeading } from './Widgets'
import './Stats.scss'
import HEX, { type HEXContract } from './hex_contract'
import App from './App'
import { type Wallet } from './lib/App'
import { ResponsiveContainer, Area, AreaChart, Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import ReactGA from 'react-ga'
import { format } from 'd3-format'
import _debug from 'debug'
import _axios from 'axios'

const debug = _debug('Stats')

const axios = _axios.create({
    baseURL: '/',
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json"},
});

interface StatsProps {
    parent: App
    contract?: HEXContract
    usdhex: number
    wallet: Wallet
}
interface StatsState {
    TShareRates: { day: number; tsr: number; }[]
    UNIv2usdhex: number[]
    graphIconClass: "icon-error-bg" | ""
}
class Stats extends React.Component<StatsProps, StatsState> {

    constructor(props: StatsProps) {
        super(props)
        this.state = {
            TShareRates: [],
            UNIv2usdhex: [],
            graphIconClass: ""
        }
    }

    updateUsdTsrGraph() {
        if (typeof this.props.contract === 'undefined') return
        const { currentDay } = this.props.contract.Data
        const pastYear = Math.floor(new Date().valueOf() / 1000) - 365*24*3600
        const getTsrChunk = (chunk: number = 0) => {
            return new Promise((resolve, reject) => {
                axios.post('https://api.thegraph.com/subgraphs/name/codeakk/hex',
                    JSON.stringify({
                        query: `{
                            shareRateChanges(
                                first: 1000, skip: ${chunk * 1000}
                                orderBy: timestamp,
                                orderDirection: desc,
                                where: { timestamp_gt: ${pastYear} }
                            ) {
                                id
                                timestamp
                                shareRate
                            }
                        }`
                    }),
                )
                .then(response => {
                    debug("response: ", response)
                    resolve(response.data.data.shareRateChanges)
                })
                .catch(e => {
                    debug('Stats: tsrData error: ', e)
                })
            })
        }
        Promise.all([
            getTsrChunk(0),
            getTsrChunk(1),
        ]).then(results => {
            const tsrData = results.flat()
            //debug('tsrData.length:', tsrData.length)
            //debug('tsrData: %o', tsrData)
            const tsrMap = { } as { [index: number]: number }
            let tsrPrevious = 0
            tsrData.forEach((data: any) => {
                const { shareRate, timestamp } = data as { id: number, shareRate: number, timestamp: number  }
                const tsrDay: number = Math.floor((timestamp - HEX.START_TIMESTAMP) / (24*3600))
                if (tsrDay !== tsrPrevious) {
                    tsrPrevious = tsrDay
                    tsrMap[tsrDay] = Number(shareRate) / 10
                }
            })
            //debug('tsrMap: %o', tsrMap)

            const TShareRates = [ ]
            for (let day=currentDay-365; day<=currentDay; day++) {
                const tsr = tsrMap[day] || tsrPrevious
                tsrPrevious = tsr
                TShareRates.push({ day, tsr})
            }
            this.setState({ TShareRates })
        })
        .catch(e => {
            debug(`Graph API: ${e.message}`)
            this.setState({ graphIconClass: "icon-error-bg" })
        })
    }

    updateUNIv2Graph() {
        const pastNinety = Math.floor(new Date().valueOf() / 1000) - 90*24*3600
        const getUniPriceData = (chunk: number = 0) => {
            return new Promise((resolve, reject) => {
                axios.post('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
                    JSON.stringify({
                        query:
                        `{
                            tokenDayDatas (
                                first: 1000, skip: ${chunk * 1000}
                                where: {
                                    token:"0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
                                    date_gt: ${pastNinety}
                                }
                                orderBy: date
                                orderDirection: asc
                            ) {
                                id
                                date
                                priceUSD
                            }
                        }`
                    })
                )
                .then(response => {
                    const priceData = response.data.data.tokenDayDatas
                    //debug('priceData: %o', priceData)
                    const UNIv2usdhex = priceData.map((data: { priceUSD: number, date: number }) => {
                        const { priceUSD, date } = data
                        const usd = Number(priceUSD)
                        const day = Math.floor((date - HEX.START_TIMESTAMP) / (24*3600))
                        return { day, usd }
                    })
                    resolve(UNIv2usdhex)
                })
                .catch(e => {
                    debug('Stats: UNIv2usdhex error: %O', e)
                })
            })
        }
        getUniPriceData(0).then((results: any) => {
            const UNIv2usdhex = results.flat()
            this.setState({ UNIv2usdhex })
        })
    }

    componentDidMount() {
        if (localStorage.getItem('debug')) window._STATS = this
        if (this.props.parent.state.chainId !== 1) return
        this.updateUsdTsrGraph()
        this.updateUNIv2Graph()
    }

    render() {
        const { TShareRates, UNIv2usdhex } = this.state as any
        const formatter = (val: number) => {
            return format(",d")(val)
        }
        const usdFormatter = (val: number) => {
            return format(",.2f")(val)
        }

        const { contract, usdhex } = this.props
        const shareRate = contract?.Data.globals.shareRate || 10000
        const _tshareCost = "$"+format(",.0f")(Math.trunc(shareRate / 10) * usdhex)

        return (
            <Accordion id='stats_accordion' className="text-start mt-3"
                onSelect={eventKey => {
                    if (eventKey) ReactGA.pageview("/"+eventKey)
                }}
            >
                <Accordion.Item id="stats" className="text-light py-0" eventKey="0">
                    <Accordion.Header>
                        <Row className="w-100">
                            <Col className="pe-0"><BurgerHeading>Stats</BurgerHeading></Col>
                            <Col className="px-0 lh-lg col-8 text-end text-danger">
                                <span>TShare Cost <span className="text-muted small align-baseline me-1">USD</span></span>
                                <span className="numeric">{ _tshareCost}</span>
                            </Col>
                        </Row>
                    </Accordion.Header>
                    <Accordion.Collapse eventKey="0">
                        <>
                        {this.props.parent.state.chainId !== 1 
                        ? <Col className="col-12 text-center">Sorry, data not available for this network.</Col>
                        : <>
                            <h4 className="text-center mt-2">HEX/TShare Cost (last 365 days)</h4>
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart id="tsr-chart" width={730} height={250} data={TShareRates}
                                    margin={{ top: 10, right: 0, left: 30, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorTsr" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="10%" stopOpacity={0.9}/>
                                            <stop offset="60%" stopOpacity={0.7}/>
                                            <stop offset="95%" stopOpacity={0.5}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="day" />
                                    <YAxis type="number" orientation="right"
                                        domain={[
                                            10000,
                                            (dataMax: number) => ((Math.trunc(dataMax / 2000)+1) * 2000)
                                        ]}
                                        tickFormatter={formatter}
                                    />
                                    <CartesianGrid stroke="#ffffff22" strokeDasharray="3 3" />
                                    <Area id="area-plot" type="monotone" dataKey="tsr" fillOpacity={1} fill="url(#colorTsr)" />
                                </AreaChart>
                            </ResponsiveContainer>

                            <h4 className="text-center mt-3">90 Day USD/HEX</h4>
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart width={730} height={250} data={UNIv2usdhex}
                                    margin={{ top: 10, right: 0, left: 30, bottom: 0 }}>
                                    <XAxis dataKey="day" />
                                    <YAxis type="number" orientation="right"
                                        domain={[
                                            0,
                                            (dataMax: number) => (dataMax * 1.5)
                                        ]}
                                        tickFormatter={usdFormatter}
                                    />
                                    <CartesianGrid stroke="#ffffff22" strokeDasharray="3 3" />
                                    <Line type="linear" dataKey="usd" strokeWidth={2} dot={false} stroke="#ee00aa" />
                                </LineChart>
                            </ResponsiveContainer>
                        </>}</>
                   </Accordion.Collapse>
                </Accordion.Item>
            </Accordion>
        )
    }
}

export default Stats
