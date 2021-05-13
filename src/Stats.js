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
import { ResponsiveContainer, Area, AreaChart, CartesianGrid, Label, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'

const { format } = require('d3-format')

const debug = require('debug')('Stats')

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            data: []
        }
    }

    updateUsdTsrGraph = () => {
        const { currentDay } = this.props.contract.Data
        const { usdhex } = this.props
        const tsrDataset = [ ]
        const getTsrChunk = (chunk) => {
            return fetchWithTimeout('https://api.thegraph.com/subgraphs/name/codeakk/hex', 
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
                if (res.errors || res.error) throw new Error(res.errors[0].message)
                return res.json()
            })
            .then(graphJSON => {
                const tsrData = graphJSON.data.shareRateChanges
                return tsrData
            })
        }

        const getUniSwaps = (chunk) => {
            return fetchWithTimeout('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2', 
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        query: 
                        `{
                            swaps (
                                where: {
                                    pair:"0xf6dcdce0ac3001b2f67f750bc64ea5beb37b5824",
                                }
                                orderBy: timestamp
                                orderDirection:desc
                            ) {
                                id
                                amount0Out
                                amount1In
                            }
                        }` 
                    }),
                },
                7369 // timeout ms
            )
            .then(res => {
                if (res.errors || res.error) throw new Error(res.errors[0].message)
                return res.json()
            })
            .then(graphJSON => {
                const swapsData = graphJSON.data.swaps
                //debug('swapsDdata: %o', swapsData)
                const prices = swapsData.filter(e => {
                    const { amount1In, amount0Out } = e
                    return ( amount1In != 0 && amount0Out != 0)
                }).map(e => {
                    const { amount1In, amount0Out } = e
                    return Number(amount1In / amount0Out)
                })
                debug('prices: %o', prices)
                return [] // swapsData
            })
        }
        Promise.all([
            getTsrChunk(0),
            //getUniSwaps(0),
        ]).then(results => {
            const tsrData = results.flat()
            debug('tsrData.length:', tsrData.length)
            debug('tsrData: %o', tsrData)
            const tsrMap = { }
            let tsrPrevious = 0
            tsrData.filter(e => {
                const { shareRate, timestamp } = e
                const tsrDay = Math.floor((timestamp - HEX.START_TIMESTAMP) / (24*3600)) 
                if (tsrDay == tsrPrevious) return false
                tsrPrevious = tsrDay
                tsrMap[tsrDay] = Number(shareRate) / 10
            })
            debug('tsrMap: %o', tsrMap)
            
            const data = [ ]
            for (let day=3; day<=currentDay; day++) {
                const usd = (Math.sin(day/40)+2)/10
                const tsr = tsrMap[day] || tsrPrevious
                tsrPrevious = tsr
                data.push({ day, tsr, usd })
            }
            this.setState({ data })
        })
        .catch(e => {
            debug(`Graph API: ${e.message}`)
            this.setState({ graphIconClass: "icon-error-bg" })
        })
    }

    componentDidMount () {
        this.updateUsdTsrGraph()
    }

    render() {
        const { data } = this.state
        const formatter = (val) => {
            return format(",d")(val)
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
                                <AreaChart width={730} height={250} data={data}
                                    margin={{ top: 10, right: 0, left: 30, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorTsr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="10%" stopColor="#ee00cc" stopOpacity={0.5}/>
                                        <stop offset="60%" stopColor="#ff9900" stopOpacity={0.6}/>
                                        <stop offset="95%" stopColor="#ffee00" stopOpacity={0.5}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="day" />
                                    <YAxis type="number" orientation="right" domain={[10000, 'dataMax']} tickFormatter={formatter} />
                                    <CartesianGrid stroke="#ffffff33" strokeDasharray="3 3" />
                                    <Area type="monotone" dataKey="tsr" stroke="#ffffff33" fillOpacity={1} fill="url(#colorTsr)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Card.Body>
                   </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Stakes
