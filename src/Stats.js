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
import './Stats.scss'
import { BigNumber } from 'bignumber.js'
import HEX from './hex_contract'
import { CryptoVal, WhatIsThis, BurgerHeading } from './Widgets' 
import { fetchWithTimeout } from './util'
import { ResponsiveContainer, Area, AreaChart, Line, LineChart, CartesianGrid, Label, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

const { format } = require('d3-format')

const debug = require('debug')('Stats')

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            TShareRates: [],
            UNIv2usdhex: []
        }
    }

    updateUsdTsrGraph() {
        const { currentDay } = this.props.contract.Data
        const { usdhex } = this.props
        const tsrDataset = [ ]
        const getTsrChunk = (chunk) => {
            return new Promise((resolve, reject) => { 
                fetchWithTimeout('https://api.thegraph.com/subgraphs/name/codeakk/hex', 
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        query: `{
                            shareRateChanges(
                                first: 1000, skip: ${chunk * 1000}
                                orderBy: timestamp,
                                orderDirection: desc,
                            ) {
                                id
                                timestamp
                                shareRate
                            }
                        }` 
                    }),
                },
                7369 // timeout ms
                )
                .then(res => {
                    if (res.error || res.errors) throw new Error(res.error || res.errors[0].message)
                    return res.json()
                })
                .then(graphJSON => {
                    resolve(graphJSON.data.shareRateChanges)
                })
                .catch(e => {
                    debug('Stats: tsrData error: %o', e)
                })
            })
        }
        Promise.all([
            getTsrChunk(0),
        ]).then(results => {
            const tsrData = results.flat()
            //debug('tsrData.length:', tsrData.length)
            //debug('tsrData: %o', tsrData)
            const tsrMap = { }
            let tsrPrevious = 0
            tsrData.forEach(e => {
                const { shareRate, timestamp } = e
                const tsrDay = Math.floor((timestamp - HEX.START_TIMESTAMP) / (24*3600)) 
                if (tsrDay !== tsrPrevious) {
                    tsrPrevious = tsrDay
                    tsrMap[tsrDay] = Number(shareRate) / 10
                }
            })
            //debug('tsrMap: %o', tsrMap)
            
            const TShareRates = [ ]
            for (let day=3; day<=currentDay; day++) {
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
        const { currentDay } = this.props.contract.Data
        const pastNinety = Math.floor(Number(new Date()/1000))-90*24*3600
        const getUniPriceData = (chunk) => {
            return new Promise((resolve, reject) => {
                fetchWithTimeout('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2', 
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
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
                        }),
                    },
                    7369 // timeout ms
                )
                .then(res => {
                    if (res.error || res.errors) throw new Error(res.error || res.errors[0].message)
                    return res.json()
                })
                .then(graphJSON => {
                    const priceData = graphJSON.data.tokenDayDatas
                    //debug('priceData: %o', priceData)
                    const UNIv2usdhex = priceData.map(e => {
                        const { priceUSD, date } = e
                        const usd = Number(priceUSD) 
                        const day = Math.floor((date - HEX.START_TIMESTAMP) / (24*3600)) 
                        return { day, usd }
                    })
                    resolve(UNIv2usdhex)
                })
                .catch(e => {
                    //debug('Stats: UNIv2usdhex error: %o', e)
                })
            })
        }
        Promise.all([
            getUniPriceData(0),
        ]).then(results => {
            const UNIv2usdhex = results.flat()
            this.setState({ UNIv2usdhex })
        })
    }

    componentDidMount() {
        this.updateUsdTsrGraph()
        this.updateUNIv2Graph()
    }

    render() {
        const { TShareRates, UNIv2usdhex } = this.state
        const formatter = (val) => {
            return format(",d")(val)
        }
        const usdFormatter = (val) => {
            return format(",.2f")(val)
        }

        return (
            <Accordion 
                id='stats_accordion'
                className="text-left mt-3"
                defaultActiveKey="0"
            >
                <Card className="bg-stats" text="light py-0">
                    <Accordion.Toggle as={Card.Header} eventKey="0">
                        <BurgerHeading className="float-left">Stats</BurgerHeading>
                        <div className="float-right pr-1 text-danger">
                             <span className="text-muted small mr-1">T-Share Price USD</span>
                             <span className="numeric">{ "$"+format(",.0f")(this.props.usdhex * this.props.contract.Data.globals.shareRate.div(10)) }</span>
                        </div>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="0">
                        <Card.Body>
                            <h4 className="text-center mt-2">T-Share HEX Price by Day</h4>
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart width={730} height={250} data={TShareRates}
                                    margin={{ top: 10, right: 0, left: 30, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorTsr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="10%" stopColor="#ee00cc" stopOpacity={0.5}/>
                                        <stop offset="60%" stopColor="#ff9900" stopOpacity={0.6}/>
                                        <stop offset="95%" stopColor="#ffee00" stopOpacity={0.5}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="day" />
                                    <YAxis type="number" orientation="right" domain={[ 10000, dataMax => ((Math.round(dataMax / 2000)+1) * 2000) ]} tickFormatter={formatter} />
                                    <CartesianGrid stroke="#ffffff33" strokeDasharray="3 3" />
                                    <Area type="monotone" dataKey="tsr" stroke="#ffffff33" fillOpacity={1} fill="url(#colorTsr)" />
                                </AreaChart>
                            </ResponsiveContainer>
                            <h4 className="text-center mt-2">USD/HEX by Day</h4>
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart width={730} height={250} data={UNIv2usdhex}
                                    margin={{ top: 10, right: 0, left: 30, bottom: 0 }}>
                                    <XAxis dataKey="day" />
                                    <YAxis type="number" orientation="right" domain={[ 0, dataMax => (dataMax * 1.5) ]} tickFormatter={usdFormatter} />
                                    <CartesianGrid stroke="#ffffff33" strokeDasharray="3 3" />
                                    <Line type="linear" dataKey="usd" strokeWidth={2} dot={false} stroke="#ffffff99" />
                                </LineChart>
                            </ResponsiveContainer>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Stakes
