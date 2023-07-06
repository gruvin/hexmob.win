import React, { useState, useContext } from 'react'
import Container from "react-bootstrap/Container"
import Form from "react-bootstrap/Form"
import FormControl from "react-bootstrap/FormControl"
import InputGroup from "react-bootstrap/InputGroup"
import Dropdown from "react-bootstrap/Dropdown"
import DropdownButton from "react-bootstrap/DropdownButton"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Image from "react-bootstrap/Image"
import './NewStakeForm.scss'
import HEX from './hex_contract'
import { HexContext } from './Context'
import { calcBigPayDaySlice, calcAdoptionBonus } from './util'
import { CryptoVal, WhatIsThis, StakeStartButton } from './Widgets'
import { formatUnits, parseUnits } from 'viem'
import { ResponsiveContainer, Bar, BarChart, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { SelectCallback } from '@restart/ui/types'
import imgGameLogo from './assets/game-logo.png'
import { Trans, useTranslation } from "react-i18next"

import _axios from 'axios'
const axios = _axios.create({
    baseURL: '/',
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json" },
})

const uriQuery = new URLSearchParams(window.location.search)

import _debug from 'debug'
const debug = _debug('NewStake')
debug('loading')

// extends React.Component<NSFT.Props, NSFT.State> {
export const NewStakeForm = () => {
    const { t } = useTranslation()

    const hexData = useContext(HexContext)
    if (!hexData) return <>internal error</>
    const { currentDay, globals } = hexData

    const initialUiStakeAmount = Math.trunc(Number(formatUnits(hexData?.hexBalance || 0n, 8))).toString()
    const [uiStakeAmount, setUiStakeAmount] = useState(initialUiStakeAmount as `${number}`)
    const [uiStakeDays, setUiStakeDays] = useState("5555" as `${number}`)

    let data: { uiEndDay: number, stakedHex: number } | [] = []

    let graphIconClass = "" // .icon-wait-bg || .icon-error-b
    let lastStakeDays = 0
    let daysTimer: ReturnType<typeof setInterval>

    let { shareRate } = hexData?.globals || { shareRate: 10000n }

    const stakedHearts = parseUnits(uiStakeAmount || "0.0", HEX.DECIMALS) || 0n
    const stakedDays = parseUnits(uiStakeDays || "0", 0) || 0n

    const startDay = currentDay + 1n
    const endDay = startDay + stakedDays

    const cappedExtraDays = BigInt(uiStakeDays) <= HEX.LPB_MAX_DAYS ? BigInt(uiStakeDays) : HEX.LPB_MAX_DAYS
    const cappedStakedHearts = stakedHearts <= HEX.BPB_MAX_HEARTS ? stakedHearts : HEX.BPB_MAX_HEARTS

    const biggerPaysBetter = stakedHearts * cappedStakedHearts / HEX.BPB
    const longerPaysBetter = stakedHearts * cappedExtraDays / HEX.LPB
    // sanity check from .sol
    const bonusTotal = longerPaysBetter + biggerPaysBetter
    const effectiveHEX = stakedHearts + bonusTotal

    shareRate = globals?.shareRate ? globals.shareRate / 10n : 10000n
    const stakeShares = effectiveHEX * 10000n / shareRate

    // Big Pay Day bonuses
    let bigPayDay = 0n
    let percentGain = 0n
    let percentAPY = 0n

    const uiStartDay = startDay.toString() as `${number}`
    const uiEndDay = endDay.toString() as `${number}`
    const _startDate = new Date(HEX.START_DATE.getTime() + Number(currentDay + 1n) * 24 * 3600 * 1000)
    const _endDate = new Date(HEX.START_DATE.getTime() + Number(uiEndDay) * 24 * 3600 * 1000)
    const uiStartDate = _startDate.toLocaleDateString()
    const uiStartTime = _startDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    const uiEndDate = _endDate.toLocaleDateString()
    const uiEndTime = _endDate.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    const uiShareRate = <CryptoVal value={shareRate} currency="TSHARE_PRICE" showUnit />
    const uiBigPayDay = <CryptoVal value={bigPayDay} />
    const uiBiggerPaysBetter = <CryptoVal value={biggerPaysBetter} showUnit />
    const uiLongerPaysBetter = <CryptoVal value={longerPaysBetter} showUnit />
    const uiEffectiveHEX = <CryptoVal value={effectiveHEX} currency="HEX" showUnit />
    const uiStakeShares = <CryptoVal value={stakeShares} currency="SHARES" showUnit />
    const uiPercentGain = <><CryptoVal value={percentGain} currency="%" />%</>
    const uiPercentAPY = <><CryptoVal value={percentAPY} currency="%" />%</>

    if (!!globals && BigInt(Number(uiEndDay)) > HEX.BIG_PAY_DAY) {
        const BPD_sharePool = globals.stakeSharesTotal + stakeShares
        const bigPaySlice = calcBigPayDaySlice(stakeShares, BPD_sharePool, globals)
        const adoptionBonus = calcAdoptionBonus(bigPaySlice, globals)
        bigPayDay = bigPaySlice + adoptionBonus

        if (stakedHearts > 0n) percentGain = bigPayDay * 1000000n / stakedHearts // 100,000 = 1.0000%
        const startDay = currentDay + 1n
        percentAPY = 365n * percentGain / HEX.BIG_PAY_DAY + 1n - startDay
    }

    const resetForm = () => {
        setUiStakeAmount(initialUiStakeAmount as `${number}`)
        setUiStakeDays("5555")
    }

     const updateBarGraph = async () => {
        if (!uriQuery.has('future')) return // dissabled due to data availability

        if (isNaN(Number(uiStartDay) + Number(uiEndDay))) return // shouldn't happen but well, you know, right?

        const numDataPoints = 121
        const graphStartDay = Math.max(Number(uiStartDay), Number(uiEndDay) - Math.floor(numDataPoints / 2))

        data = [],
        graphIconClass = "icon-wait-bg"

        let response
        try {
            response = await axios.get(`https://futureus.win/hexmob/fs/${graphStartDay}/${numDataPoints}`, { timeout: 5000 })
        } catch (e: any) {
            debug("updateBarGraph: ", e.message)
            graphIconClass = "icon-error-bg"
            return false
        }
        debug('fs response:', response)

        data = response.data.data.map((d: { uiEndDay: number; totalHearts: string }) => {
            return ({
                uiEndDay: d.uiEndDay,
                stakedHex: Number(formatUnits(BigInt(d.totalHearts), 14))
            })
        })
        debug("graph data: ", data)
    }

    const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        clearTimeout(daysTimer)
        const el = e.target
        if (isNaN(Number(el.value))) return

        const value = parseInt(el.value) || 0
        setUiStakeDays((value > 5555 ? 5555 : value < 1 ? 1 : value).toString() as `${number}`)

        const immediate = Boolean(el.dataset.immediate)
        immediate && delete el.dataset.immediate

        if (!parseInt(uiStakeDays)) {
            data = []
            graphIconClass = ""
        } else if (Number(uiStakeDays) > 0 && Number(uiStakeDays) !== lastStakeDays) {
            // process only if >= 1.2 seconds since last uiStakeDays change
            daysTimer = setTimeout(() => {
                lastStakeDays = Number(uiStakeDays)
                updateBarGraph()
            }, immediate ? 0 : 1200)
        }
    }

    const handleDaysBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const stakeDays = parseInt(e.target.value) || 0
        if (!stakeDays) {
            data = []
            graphIconClass = ""
        } else if (stakeDays > 0 && lastStakeDays !== stakeDays) {
            clearTimeout(daysTimer)
            updateBarGraph()
        }
    }

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault()
        const value = parseFloat(e.target.value) || 0.0
        setUiStakeAmount(value ? value.toString() as `${number}`: "0")
    }

    const handleAmountSelector = (_: string | number, e: React.SyntheticEvent<unknown, Event>): void => {
        if (!(e.target instanceof HTMLElement)) return
        e.preventDefault()
        const hexBalance = hexData.hexBalance
        if (!hexBalance) return
        const portion = Number(e?.target?.dataset?.portion || 1.0)
        setUiStakeAmount((Number(formatUnits(hexBalance, 8)) * portion).toFixed(8) as `${number}`)
    }

    const handleDaysSelector = (_: string | number, e: React.SyntheticEvent<unknown, Event>) => {
        if (!(e.target instanceof HTMLElement)) return
        e.preventDefault()
        function plusYears(years: number): number {
            const n = new Date(Date.now())
            const d = new Date()
            d.setFullYear(n.getFullYear() + years)
            return Math.floor(Number((d.valueOf() - n.valueOf()) / 1000 / 3600 / 24))
        }
        function plusMonths(months: number): number {
            const n = new Date(Date.now())
            const d = new Date()
            d.setMonth(n.getMonth() + months)
            return Math.floor(Number((d.valueOf() - n.valueOf()) / 1000 / 3600 / 24))
        }

        let days: number
        switch (e.target.dataset.days) {
            case 'max': days = 5555; break;
            case '10y': days = plusYears(10); break;
            case '5y': days = plusYears(5); break;
            case '3y': days = plusYears(3); break;
            case '2y': days = plusYears(2); break;
            case '1y': days = plusYears(1); break;
            case '6m': days = plusMonths(6); break;
            case '3m': days = plusMonths(3); break;
            case '1m': days = plusMonths(1); break;
            case '1w': days = 7; break;
            default: days = 1;
        }

        setUiStakeDays(days.toString() as `${number}`)
    }

    const GraphCustomCursor = (props: { x?: number, y?: number, width?: number, height?: number, payload?: unknown[] }) => {
        const { x, y, width, height } = props
        const currentDay = hexData?.currentDay || 0
        if (!currentDay) return <></>

        let uiEndDay: string
        if (props.payload) {
            uiEndDay = (props.payload[0] as { payload: { endDay: string } }).payload.endDay
        } else {
            debug("WARN: GraphCustomCursor: no payload given")
            return <></>
        }

        const handleSelection = (e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
            e.preventDefault()
            setUiStakeDays((Number(uiEndDay) - Number(currentDay) - 2).toString() as `${number}`)
            updateBarGraph()
        }

        return (
            <Rectangle
                fill="rgba(255,255,255,0.3)"
                stroke="none"
                x={x} y={y}
                width={width}
                height={height}
                onClick={handleSelection}
            />
        )
    }

    return (
        <Form className="px-3">
            <Row className="overflow-auto">
                <Col xs={12} sm={5}>
                    <Container className="p-0 ps-2 pe-2">
                        <Row>
                            <Col xs={10} sm={12} className="">
                                <Form.Group controlId="stake_amount" className="">
                                    <Form.Label className="w-100 mb-0">
                                        {t("Stake Amount")}
                                    </Form.Label>
                                    <InputGroup className="p-0">
                                        <Form.Control
                                            className="p-1"
                                            type="number"
                                            value={uiStakeAmount}
                                            placeholder="0"
                                            aria-label={t("amount to stake in HEX")}
                                            aria-describedby="basic-addon1"
                                            onChange={handleAmountChange}
                                        />
                                        <DropdownButton
                                            align="end"
                                            variant="secondary"
                                            key="percent_balance_selector"
                                            title="HEX"
                                            className="numeric"
                                            onSelect={handleAmountSelector as SelectCallback}
                                        >
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={1.00}>100%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.75}>75%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.50}>50%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.25}>25%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.10}>10%</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-portion={0.05}>5%</Dropdown.Item>
                                        </DropdownButton>
                                    </InputGroup>
                                </Form.Group>
                            </Col>
                            <Col xs={9} sm={10} className="mt-2">
                                <Form.Group controlId="stake_days" className="">
                                    <Form.Label className="mb-0">{t("Stake Length (Days)")}</Form.Label>
                                    <InputGroup className="p-0">
                                        <FormControl
                                            className="p-1"
                                            type="number"
                                            placeholder="5555"
                                            value={Number(uiStakeDays) <= 0 ? "" : uiStakeDays}
                                            aria-label="number of days to stake min one day"
                                            onChange={handleDaysChange}
                                            onBlur={handleDaysBlur}
                                        />
                                        <DropdownButton
                                            align="end"
                                            variant="secondary"
                                            key="days_selector"
                                            title="DAYS"
                                            onSelect={handleDaysSelector as SelectCallback}
                                            className="numeric"
                                        >
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="max">{t("5555 days (~15yrs, 11wks)")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="10y">{t("Ten Years")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="5y">{t("Five Years")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="3y">{t("Three Years")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="2y">{t("Two Years")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="1y">{t("One Year")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="6m">{t("Six Months")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="3m">{t("Three Months")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="1m">{t("One Month")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="1w">{t("One Week")}</Dropdown.Item>
                                            <Dropdown.Item as="button" eventKey="new_stake" data-days="min">{t("MIN (one day)")}</Dropdown.Item>
                                        </DropdownButton>
                                    </InputGroup>
                                </Form.Group>
                            </Col>
                        </Row>
                    </Container>
                </Col>
                <Col xs={12} sm={7}>
                    <Container className="px-0 py-3 ps-md-2 ms-0" style={{ maxWidth: "23rem" }}>
                        <Row>
                            <Col className="col-3 m-0 ps-2 pe-0 text-info h3">{t("Start Day")}</Col>
                            <Col className="col-3 text-end numeric">{uiStartDay}</Col>
                            <Col className="col-6 numeric">{uiStartDate}<span className="text-muted d-none d-md-inline"> {uiStartTime}</span></Col>
                        </Row>
                        <Row>
                            <Col className="col-3 m-0 ps-2 pe-0 text-info h3">{t("End Day")}</Col>
                            <Col className="col-3 text-end numeric">{uiEndDay}</Col>
                            <Col className="col-6 numeric">{uiEndDate}<span className="text-muted d-none d-md-inline"> {uiEndTime}</span></Col>
                        </Row>
                        <Row>
                            <Col className="col-12 mt-3 mb-1 ps-2 text-center bg-warning text-uppercase bonus-heading">
                                {t("Incentive Bonuses")}</Col>
                        </Row>
                        <Row>
                            <Col className="col-7 pe-2 text-end text-info h4">{t("Bigger Pays More!")}</Col>
                            <Col className="col-5 px-0 text-end">{uiBiggerPaysBetter}</Col>
                        </Row>
                        <Row>
                            <Col className="col-7 pe-2 text-end text-info h4">{t("Longer Pays Better!")}</Col>
                            <Col className="col-5 px-0 text-end">{uiLongerPaysBetter}</Col>
                        </Row>
                        <Row className="pt-2">
                            <Col className="col-7 pe-2 text-end text-success">
                                <WhatIsThis showPill tooltip={
                                    <Trans
                                        i18nKey="whatIsEffectiveHEX"
                                        components={{ b: <span className="text-success" />, i: <em /> }}
                                    />
                                }>
                                    <span className="h3">{t("Effective HEX")}</span>
                                </WhatIsThis>
                            </Col>
                            <Col className="col-5 px-0 text-end text-success bg-success-darkened"><strong>{uiEffectiveHEX}</strong></Col>
                        </Row>
                        <Row className="my-2 text-danger mt-3">
                            <Col className="col-2 p-0">
                                {window.hostIsTSA && <Image
                                    className="pt-3"
                                    src={imgGameLogo} title="Play the Heart Game! :-)"
                                    style={{ width: "90%" }}
                                    onClick={() => window.location.href = "https://tshare.app?step=1"}
                                />}
                            </Col>
                            <Col className="col-10 ps-0 text-end">
                                <Row>
                                    <Col className="col-7 pe-3 text-end h3">{t("TShare Rate")}</Col>
                                    <Col className="col-5 px-0 text-end">{uiShareRate}</Col>
                                </Row>
                                <Row>
                                    <Col className="col-7 pe-1">
                                        <WhatIsThis showPill tooltip={
                                            <Trans
                                                i18nKey="whatIsTShares"
                                                components={{ b: <span className="text-success" />, i: <em /> }}
                                            />
                                        }>
                                            <span className="text-success h2">{t("Stake Shares")}</span>
                                        </WhatIsThis>
                                    </Col>
                                    <Col className="col-5 text-success text-start h2">
                                        {uiStakeShares}
                                    </Col>
                                </Row>
                            </Col>
                        </Row>
                        <Container className="w-100 text-end mt-3">
                            <StakeStartButton
                                className="stake btn-start"
                                stakedHearts={stakedHearts}
                                stakedDays={BigInt(uiStakeDays)}
                                rejectionCallback={() => resetForm}
                                confirmationCallback={() => resetForm}
                            >{t("START STAKE")}</StakeStartButton>
                        </Container>
                    </Container>

                    {currentDay < (HEX.BIG_PAY_DAY - 1n) && (
                        <Container className="bg-secondary rounded mt-2 pt-2 pb-2">
                            <Row>
                                <Col>
                                    <WhatIsThis showPill tooltip={
                                        <>
                                            {t("Reduces as others start new stakes.<br />Increases as others end their stakes.")}
                                        </>
                                    }>
                                        <strong>
                                            <span className="text-info">Big</span>
                                            <span className="text-warning">Pay</span>
                                            <span className="text-danger">Day</span>
                                        </strong>
                                    </WhatIsThis>
                                </Col>
                                <Col className="text-end">{uiBigPayDay} HEX</Col>
                            </Row>
                            <Row>
                                <Col>{t("% Gain")}<span className="text-info">*</span> </Col>
                                <Col className="text-end">{uiPercentGain}</Col>
                            </Row>
                            <Row>
                                <Col>{t("% APY")}<span className="text-info">*</span></Col>
                                <Col className="text-end">{uiPercentAPY}</Col>
                            </Row>
                            <Row>
                                <Col className="pt-2"><span className="text-info">*</span> <em>{t("If stake was active on BigPayDay")}</em></Col>
                            </Row>
                        </Container>
                    )}
                </Col>

                {!!data && uriQuery.has("future") && // disabled due to data availability
                    <Container className="p-3 pt-0">
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart
                                className={graphIconClass}
                                data={data as any[]}
                            >
                                <XAxis dataKey="uiEndDay" label={{ value: "day", offset: -10, position: "insideLeft" }} />
                                <YAxis type="number" width={40} label={{ value: "M HEX", position: "insideBottomLeft", offset: 5, angle: -90 }} />
                                <ReferenceLine x={uiEndDay} strokeDasharray="3 3" />
                                <Bar dataKey="stakedHex" isAnimationActive={true} />
                                <Tooltip
                                    filterNull={true}
                                    labelFormatter={(label) => <>{"day " + { label }}</>}
                                    formatter={(value: string) => ([parseFloat(value).toFixed(3) + " MHEX", ""])}
                                    wrapperStyle={{ padding: "0" }}
                                    contentStyle={{ padding: "3px", backgroundColor: "rgba(0,0,0,0.3)", border: "none", borderRadius: "3px" }}
                                    labelStyle={{ lineHeight: "1em", padding: "2px 5px", color: "#ffdd00", fontWeight: "bold" }}
                                    itemStyle={{ lineHeight: "1em", padding: "2px 5px", color: "#ddd", backgroundColor: "rgba(0,0,0,0.5)" }}
                                    cursor={<GraphCustomCursor />}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="text-center">
                            <h6 className="text-info m-0">{t("Future Market Supply by HEX Day")}</h6>
                            <div className="text-muted small">{t("assumes all stakes end on time")}</div>
                        </div>
                    </Container>
                }
            </Row>
        </Form>

    )
}
