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
                                first: 100, skip: ${chunk * 100}
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
        Promise.all([
            getTsrChunk(0),
            getTsrChunk(1),
            getTsrChunk(2),
            getTsrChunk(3),
            getTsrChunk(4),
            getTsrChunk(5),
            getTsrChunk(6),
            getTsrChunk(7),
            getTsrChunk(8),
            getTsrChunk(9),
        ]).then(results => {
            const tsrData = results.flat()
            debug('graph: %o', tsrData, tsrData.length)
            const tsrMap = { }
            let tsrPrevious = 0
            tsrData.filter(e => {
                const { shareRate, timestamp } = e
                const tsrDay = Math.floor((timestamp - HEX.START_TIMESTAMP) / (24*3600)) 
                if (tsrDay == tsrPrevious) return false
                tsrPrevious = tsrDay
                tsrMap[tsrDay] = Number(shareRate) / 10 - 10000
            })
            debug('tsrMap: %o', tsrMap)
            
            const data = [ ]
            for (let day=0; day<=currentDay; day++) {
                const usd = (Math.sin(day/40)+2)*1
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

        return (
            <Accordion 
                id='stats_accordion'
                className="text-left mt-3"
                defaultActiveKey="0"
            >
                <Card bg="secondary" text="light py-0">
                    <Accordion.Toggle as={Card.Header} eventKey="0">
                        <BurgerHeading className="float-left">Stats</BurgerHeading>
                        <div className="float-right pr-1 text-success">
                             <span className="text-muted small">TS </span>
                             <strong><CryptoVal value={0} showUnit /></strong>
                        </div>
                    </Accordion.Toggle>
                    <Accordion.Collapse eventKey="0">
                        <Card.Body>
                            <ResponsiveContainer width="100%" height={400}>
                                <AreaChart width={730} height={250} data={data}
                                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="day" />
                                    <YAxis />
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="usd" stroke="#8884d8" fillOpacity={1} fill="url(#colorUv)" />
                                    <Area type="monotone" dataKey="tsr" stroke="#82ca9d" fillOpacity={1} fill="url(#colorPv)" />
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
