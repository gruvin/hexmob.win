import React, { useContext, useState } from 'react'
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Spinner from 'react-bootstrap/Spinner'
import { BurgerHeading, CryptoVal } from './Widgets'

import { useNetwork, usePublicClient, useContractReads, useQuery } from 'wagmi'
import { getEthersProvider } from './ethers'
import { ethers } from 'ethers'

import { formatUnits } from 'viem'
import HEX, { DailyData } from './hex_contract'
import HEX2, { HEX2T } from './hex2_contract'
import HEX4, { HEX4T } from './hex4_contract'
import HEX5, { HEX5T } from './hex5_contract'
import { HexContext } from './Context'
import { findEarliestDay, calcStakeEnd } from './util'
import { StakeData, StakeList } from './lib/Stakes'
import ReactGA from 'react-ga'
import './Tewkenaire.scss'
import { TewkStakeData } from './lib/Tewkenaire'

import _debug from 'debug'
const debug = _debug('Tewk')

const TewkStakeList = (props: {
    tewkContract: HEX2T | HEX4T | HEX5T,
    heading: React.ReactNode,
    usdhex: number
    setReturnTotal: React.Dispatch<React.SetStateAction<bigint>>
}): JSX.Element => {
    const hexData = useContext(HexContext)
    const walletAddress = hexData?.walletAddress
    if (walletAddress === undefined) return <>internal error</>

    const currentDay = hexData?.currentDay || 0n
    if (!currentDay) return <>internal error</>
    const { tewkContract } = props
    if (!tewkContract) return <>internal error</>

    const { chain } = useNetwork()
    const chainId = chain?.id || 0
    if (!chainId) return <>internal error</>

    const [ tewkStakeList, setTewkStakeList ] = useState([] as StakeList)
    const [ totalHexValue, setTotalHexValue ] = useState(0n)
    const [ loading, setLoading ] = useState(true)

    const publicClient = usePublicClient()

    type EventTypeHack = { customerAddress: string, uniqueID: bigint, b?: bigint, c?: bigint, d?: bigint }
    const { data: stakeStartEvents } = useQuery(
        [tewkContract.SYMBOL + "StartEvents"],
        async () => (
            await publicClient.getLogs({
                address: tewkContract.CHAINS[chainId],
                event: tewkContract.EventStakeStartAbi,
                args: [walletAddress],
                fromBlock: tewkContract.GENESIS_BLOCK,
                toBlock: 'latest',
            })
        ), {
    })
    const { data: stakeEndEvents } = useQuery(
        [tewkContract.SYMBOL + "EndEvents"],
        async () => (
            await publicClient.getLogs({
                address: tewkContract.CHAINS[chainId],
                event: tewkContract.EventStakeEndAbi,
                args: [walletAddress],
                fromBlock: tewkContract.GENESIS_BLOCK,
                toBlock: 'latest'
            })
        ), {
    })

    const startedStakes = !!stakeStartEvents && stakeStartEvents.map(event => (event.args as EventTypeHack).uniqueID)
    const endedStakes = !!stakeEndEvents && stakeEndEvents.map(event => (event.args as EventTypeHack).uniqueID)
    const activeUids = (!!startedStakes && !!endedStakes)
        ? startedStakes.filter(uid => endedStakes.indexOf(uid) === -1)
        : []

    // Fetch Stakes (no daily payout data)
    useContractReads({
        enabled: activeUids.length > 0,
        scopeKey: `tewkStakes:${chainId}:${tewkContract.SYMBOL}`,
        contracts: Array.from(Array(activeUids.length),
            (_, i) => ({
                address: tewkContract.CHAINS[chainId],
                abi: tewkContract.ABI,
                functionName: "stakeLists", // tewk version
                args: [walletAddress, activeUids[i]]
            })
        ),
        onSuccess: results => {
            debug(`${tewkContract.SYMBOL} [ stakeStartEvents, stakeEndEvents ]: `, [stakeStartEvents, stakeEndEvents])
            debug(`${tewkContract.SYMBOL} activeUids: `, activeUids)
            debug(`${tewkContract.SYMBOL} stakeLists[] result: `, results)
            if (!results) return results
            let totalHexValue = 0n
            const tewkStakes = results.map((data, stakeIndex: number): StakeData => {
                const r = data.result as [number, bigint, bigint, number, number, number, boolean, boolean]
                const _tewkStakeData: TewkStakeData = {
                    stakeID: r[0],
                    hexAmount: r[1],
                    stakeShares: r[2],
                    lockedDay: r[3],
                    stakedDays: r[4],
                    unlockedDay: r[5],
                    started: r[6],
                    ended: r[7],
                    stakeOwner: walletAddress,
                    payout: 0n,
                    bigPayDay: 0n,
                    interest: 0n,
                    value: 0n,
                }
                // convert the above to StakeData format
                const lockedDay = BigInt(_tewkStakeData.lockedDay || 0)
                const stakedDays = BigInt(_tewkStakeData.stakedDays || 0)
                const stakeData: StakeData = {
                    stakeIndex: BigInt(stakeIndex),
                    stakeId: BigInt(_tewkStakeData.stakeID),
                    lockedDay,
                    stakedDays,
                    endDay: lockedDay + stakedDays + 1n,
                    stakedHearts: _tewkStakeData.hexAmount,
                    stakeShares: _tewkStakeData.stakeShares,
                    unlockedDay: 0n,
                    payout: 0n,
                    bigPayDay: 0n,
                    penalty: 0n,
                    stakeReturn: 0n,
                    cappedPenalty: 0n,
                    isAutoStake: false,
                    isTewkStake: true,
                }
                totalHexValue += stakeData.stakedHearts + stakeData.payout + stakeData.bigPayDay
                return stakeData
            })
            // return tewkStakes
            setTewkStakeList(tewkStakes)
            setTotalHexValue(totalHexValue)
            props.setReturnTotal(totalHexValue)
        }
    })

    const provider = getEthersProvider() // NOTE: ethers v5 uses BigNumber
    const hex = new ethers.Contract(HEX.CHAIN_ADDRESSES[chainId], HEX.ABI, provider)

    // dailyData for payout/bigPayDay/etc
    const dailyDataCount = hexData?.globals?.dailyDataCount || hexData?.currentDay || 0n
    const earliestDay = findEarliestDay(tewkStakeList, dailyDataCount)
    const rangeStart = earliestDay > 0 ? earliestDay - 1n : 0n
    const rangeEnd = dailyDataCount - 1n

    /*
     * Viem's multicall appears to be broken regards HEX's dailyDataRange() :/ So,
     * we fall back to using ethers directly
    */

    // Fetch daily payout data
    useQuery( // NOTE: this is Wagmi's own useQuery, built from tanstack's version, not react-query
        ["tewkStakes", `${chainId}`, tewkContract.SYMBOL],
        async () => await hex.dailyDataRange(rangeStart, rangeEnd),
        {
            enabled: !!dailyDataCount && !!tewkStakeList && tewkStakeList.length > 0,
            onSuccess: result => {
                if (!result) return result
                if (!!tewkStakeList && tewkStakeList.length > 0) {
                    const indexedDailyData: DailyData[] = []
                    result.forEach((_day: object | bigint, index: number) => {
                        const day = (typeof _day === 'object') ? BigInt(_day.toString()) : _day as bigint
                        indexedDailyData[Number(earliestDay) + index] = {
                            payoutTotal: day & HEX.HEART_UINT_MASK,                             // .sol:807 uint72 dayPayoutTotal
                            stakeSharesTotal: day >> HEX.HEART_UINT_SIZE & HEX.HEART_UINT_MASK, // .sol:808 uint72 dayStakeSharesTotal
                            unclaimedSatoshisTotal: day >> HEX.HEART_UINT_SIZE * 2n,            // .sol:809 uint56 dayUnclaimedSatoshisTotal;
                        } as DailyData
                    })
                    if (!hexData) return Promise.reject("internal error [0]")
                    if (!indexedDailyData) return Promise.reject("internal error [1]")
                    let totalHexValue = 0n
                    const newStakeData: StakeList = tewkStakeList.map((oldStakeData: StakeData) => {
                        const payoutData = calcStakeEnd(hexData, indexedDailyData, oldStakeData)
                        totalHexValue += oldStakeData.stakedHearts + payoutData.payout + payoutData.bigPayDay
                        return {
                            ...oldStakeData,
                            ...payoutData
                        }
                    })
                    setTewkStakeList(newStakeData)
                    setTotalHexValue(totalHexValue)
                    setLoading(false)
                    props.setReturnTotal(totalHexValue)
                }
            },
            onError: error => debug(error)
        }
    )

    const uiStakeList = tewkStakeList.map((stake, index): JSX.Element => {
        const { stakedHearts, stakeShares, bigPayDay, payout, stakeReturn } = stake as StakeData
        const usd = (Number(formatUnits(stakeReturn, 8)) * props.usdhex).toFixed(4)

        return (
            <Row key={index} className="text-end">
                <Col className="numeric d-none d-md-inline"><CryptoVal value={stakedHearts} currency="HEX" /></Col>
                <Col className="numeric"><CryptoVal value={stakeShares} currency="SHARES" /></Col>
                <Col className="numeric d-none d-md-inline"><CryptoVal value={bigPayDay} currency="HEX" /></Col>
                <Col className="numeric"><CryptoVal value={payout} currency="HEX" /></Col>
                <Col className="numeric"><CryptoVal value={stakeReturn} currency="HEX" /></Col>
                <Col className="numeric text-success mx-2">
                    <CryptoVal className="d-none d-md-inline" value={usd} currency="USD" />
                    <CryptoVal className="d-md-none d-inline" value={usd} wholeNumber currency="USD" />
                </Col>
            </Row>
        )
    })

    const totalUsd = Number(formatUnits(totalHexValue, HEX.DECIMALS)) * props.usdhex

    return (<>
        <Card className="bg-dark my-3 py-2">
            <Card.Header className="ps-2 py-0">{props.heading}</Card.Header>
            <Card.Body className="py-1">
                <Row className="text-end text-muted small" key='detail'>
                    <Col className="d-none d-md-inline">COST</Col>
                    <Col>SHARES</Col>
                    <Col className="d-none d-md-inline">BigPayDay</Col>
                    <Col>YIELD</Col>
                    <Col>VALUE</Col>
                    <Col className="text-end mx-2">USD<span className="d-none d-md-inline"> VALUE</span></Col>
                </Row>
                {loading
                    ? <div className="text-center"><Spinner animation="grow" variant="info" size="sm"/>&nbsp;&nbsp;retrieving data</div>
                    : uiStakeList
                }
                {(uiStakeList.length > 1) &&
                    <Row className="text-end" key='summary'>
                        <Col>
                            <span className="text-muted small">TOTAL $</span>
                        </Col>
                        <Col xs={3} sm={2} className="text-end mx-2 text-success nemeric"
                            style={{ borderTop: "1px solid #99999980" }}>
                            <CryptoVal className="d-none d-md-inline" value={totalUsd} currency="USD" />
                            <CryptoVal className="d-md-none d-inline" value={totalUsd} wholeNumber currency="USD" />
                        </Col>
                    </Row>}
            </Card.Body>
        </Card>
    </>)
}

const Tewkenaire = (props: { usdhex: number }): JSX.Element => {
    const hexData = useContext(HexContext)
    const currentDay = hexData?.currentDay || 0n
    if (!currentDay) return <>internal error</>

    const [activeKey, setActiveKey] = useState("")
    const [totalHex2Value, setTotalHex2Value] = useState(0n)
    const [totalHex4Value, setTotalHex4Value] = useState(0n)
    const [totalHex5Value, setTotalHex5Value] = useState(0n)

    const totalUsdValue = Number(formatUnits(totalHex2Value + totalHex4Value + totalHex5Value, HEX.DECIMALS)) * props.usdhex

    const uriQuery = new URLSearchParams(window.location.search)

    return (<>
        <Accordion
            id="tewk_accordion"
            activeKey={uriQuery.get("tewkens") == "open" ? "tewkenaire" : activeKey}
            onSelect={eventKey => {
                setActiveKey(eventKey as string)
                if (eventKey) ReactGA.pageview("/" + eventKey)
            }}
        >
            <Accordion.Item className="bg-secondary text-light" eventKey="tewkenaire">
                <Accordion.Header>
                    <Row className="w-100">
                        <Col className="pe-0"><BurgerHeading>Tewkenaire</BurgerHeading></Col>
                        <Col className="col-5 lh-lg px-0 text-end text-success">
                            <span className="text-muted small align-baseline me-1">USD</span>
                            <CryptoVal
                                className="fw-bold"
                                value={totalUsdValue}
                                currency="USD"
                                symbol={<>$</>}
                                wholeNumber={totalUsdValue >= 10000.0}
                            />
                        </Col>
                    </Row>
                </Accordion.Header>
                <Accordion.Collapse eventKey="tewkenaire">
                    <>
                        {activeKey === "tewkenaire" &&
                            <TewkStakeList
                                heading={<em><strong>HEX<span className="text-success">TEW</span></strong></em>}
                                tewkContract={HEX2}
                                usdhex={props.usdhex}
                                setReturnTotal={setTotalHex2Value}
                            />
                        }
                        {activeKey === "tewkenaire" &&
                            <TewkStakeList
                                heading={<em><strong>HEX<span className="text-success">MAX</span></strong></em>}
                                tewkContract={HEX4}
                                usdhex={props.usdhex}
                                setReturnTotal={setTotalHex4Value}
                            />
                        }
                        {activeKey === "tewkenaire" &&
                            <TewkStakeList
                                heading={<em><strong>INFINI<span className="text-success">HEX</span></strong></em>}
                                tewkContract={HEX5}
                                usdhex={props.usdhex}
                                setReturnTotal={setTotalHex5Value}
                            />
                        }
                    </>
                </Accordion.Collapse>
            </Accordion.Item>
        </Accordion>
    </>)
}
export default Tewkenaire
