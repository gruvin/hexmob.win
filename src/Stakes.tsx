import { lazy, Suspense, useContext, useState } from 'react'
import { Trans, useTranslation } from "react-i18next"
import HEX, { DailyData } from './hex_contract'
import { useNetwork, useContractRead, useContractReads } from 'wagmi'
import { formatUnits, Address } from 'viem'

import { HexContext } from './Context'
// import Container from 'react-bootstrap/Container'
import Accordion from 'react-bootstrap/Accordion'
import Card from 'react-bootstrap/Card'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
// import ProgressBar from 'react-bootstrap/ProgressBar'

import { CryptoVal, BurgerHeading } from './Widgets'
import { NewStakeForm } from './NewStakeForm'
import { StakeInfo } from './StakeInfo'
const StakeHistory = lazy(() => import('./StakeHistory'));

import ReactGA from 'react-ga'

import './Stakes.scss'
import {
    findEarliestDay,
    calcStakeEnd,
    calcPercentGain,
    calcPercentAPY,
    estimatePayoutRewardsDay
} from './util'

import { UriAccount } from './lib/App'
import { StakeData, StakeList } from './lib/Stakes'
import _debug from 'debug'
const debug = _debug('Stakes')
debug("loaded") // to shut typescript up when we're not using debug anywhere else

const StakesList = (props: {
    stakeList: StakeList,
    publicAddress?: boolean,
    walletAddress?: Address,
    usdhex: number,
    account?: UriAccount
}) => {
    const { t } = useTranslation()
    const hexData = useContext(HexContext)
    const currentDay = hexData?.currentDay || 0n
    if (!currentDay) return <>internal error</>

    const stakeList = props.stakeList?.sort((a: StakeData, b: StakeData) => {
        return (a.progress && b.progress && (
            a.progress === b.progress ? 0 : b.progress > a.progress ? 1 : -1
        )) || 0
    })

    let stakedTotal = 0n
    let totalUsdValue = 0
    let sharesTotal = 0n
    let payoutTotal = 0n
    let bigPayDayTotal = 0n
    let percentGainTotal = 0.0
    let percentAPYTotal = 0.0
    let averagePercentGain = 0.0
    let averagePercentAPY = 0.0
    let activeCount = 0

    const stakeListOutput = stakeList.map(stakeList => {
        const startDay = stakeList.lockedDay
        const endDay = startDay + stakeList.stakedDays

        const _startDate = new Date(HEX.START_DATE)
        const _endDate = new Date(HEX.START_DATE.getTime() + Number(endDay * 24n * 3600n * 1000n))
        const startDate = _startDate.toLocaleDateString()
        const endDate = _endDate.toLocaleDateString()

        const { stakedHearts, stakeShares, payout, bigPayDay, penalty } = stakeList

        stakedTotal += stakedHearts
        sharesTotal += stakeShares
        payoutTotal += payout
        bigPayDayTotal += bigPayDay
        totalUsdValue += Number(formatUnits(stakedHearts + payout + bigPayDay, HEX.DECIMALS)) * props.usdhex

        const stake = {
            ...stakeList,
            startDay,
            endDay,
            startDate,
            endDate,
            payout,
            bigPayDay,
            penalty
        }

        const percentGain = calcPercentGain(stake)
        const percentAPY = calcPercentAPY(currentDay, stake)
        percentGainTotal = percentGainTotal + percentGain // "+=" confuses linter
        percentAPYTotal = percentAPYTotal + percentAPY // "+=" confuses linter

        if (!!currentDay && currentDay > stake.startDay) activeCount++

        return stake
    })

    if (activeCount) {
        averagePercentGain /= activeCount
        averagePercentAPY /= activeCount
    }

    const numStakes = stakeList?.length || 0
    return (numStakes === 0
        ? <>{t("no stakes found for this address")}</>
        : <>
            <Card className="mt-1 bg-info-darkened rounded">
                <Card.Body className="p-1 rounded text-light">
                    <h2 className="text-center text-bold">{t("Summary To Date")}</h2>
                    <Row>
                        <Col className="text-end text-bold">{t("Total Staking")}</Col>
                        <Col><CryptoVal value={stakedTotal} showUnit /><span className="text-muted small"> {t("BURNED")}</span></Col>
                    </Row>
                    <Row>
                        <Col className="text-end">{t("Shares")}</Col>
                        <Col><CryptoVal value={sharesTotal} currency="SHARES" /></Col>
                    </Row>
                    <Row>
                        <Col className="text-end text-bold">{t("Yield")}</Col>
                        <Col><CryptoVal value={payoutTotal} showUnit /></Col>
                    </Row>
                    {bigPayDayTotal > 0n &&
                        <Row>
                            <Col className="text-end text-bold">
                                <span className="text-info">Big</span>
                                <span className="text-warning">Pay</span>
                                <span className="text-danger">Day</span>
                            </Col>
                            <Col><CryptoVal value={bigPayDayTotal} showUnit /></Col>
                        </Row>
                    }
                    <Row>
                        <Col className="text-end text-bold">{t("Total Value")}</Col>
                        <Col>
                            <CryptoVal className="text-bold" value={stakedTotal + payoutTotal + bigPayDayTotal} showUnit />
                        </Col>
                    </Row>
                    <Row className="text-success">
                        <Col className="text-success text-end text-bold">{t("USD Value")}</Col>
                        <Col className="text-success text-bold">$<CryptoVal value={totalUsdValue} currency="USD" /></Col>
                    </Row>
                    <Row className="mt-2">
                        <Col className="text-end text-bold">{t("Mean Net Yield")}</Col>
                        <Col><CryptoVal value={averagePercentGain} currency="%" />%</Col>
                    </Row>
                    <Row>
                        <Col className="text-end text-bold">{t("Average APY")}</Col>
                        <Col><CryptoVal value={averagePercentAPY} currency="%" />%</Col>
                    </Row>
                </Card.Body>
            </Card>
            <Card className="active-stakes m-0 text-light bg-success-darkened rounded">
                <Card.Body className="px-2">
                    <h2 className="text-center mb-0">{numStakes ? <span className="numeric">{numStakes}</span> : "No"} {t("Active ")}{numStakes > 1 ? t("Stakes") : t("Stake")}</h2>
                    <div className="text-center text-info small">{t("tap each for details")}</div>
                    {!!hexData && stakeListOutput?.map((stakeList) => {
                        return (
                            <StakeInfo
                                key={stakeList.stakeId.toString()}
                                stake={stakeList}
                                usdhex={props.usdhex}
                                readOnly={!!props.account}
                            />
                        )
                    })}
                    <div className="text-center">{t("dollarValuesATP")}</div>
                </Card.Body>
            </Card>
        </>)
}

const Stakes = (props: {
    usdhex: number,
    className?: string,
    openActive?: boolean,
    account?: UriAccount,
}) => {
    const { t } = useTranslation()
    const hexData = useContext(HexContext)
    if (!hexData) return <>internal error</>

    const currentDay = hexData?.currentDay
    const walletAddress = props.account?.address || hexData?.walletAddress || ""
    const accountName = props.account?.name || "address"
    const hexBalance = hexData?.hexBalance || 0n

    const { chain } = useNetwork()
    const chainId = chain?.id || 0

    const [stakeList, setStakeList] = useState([] as StakeList)
    const [selectedCard, setSelectedCard] = useState(props.openActive ? "current_stakes" : "")
    const [totalHexValue, setTotalHexValue] = useState(0n)

    // const [ loadingProgress, setLoadingProgress ] = useState(20)

    // stakeCount
    const { data: stakeCount } = useContractRead({
        enabled: !!walletAddress,
        watch: true,
        address: HEX.CHAIN_ADDRESSES[chainId],
        abi: HEX.ABI,
        functionName: 'stakeCount',
        args: [walletAddress || "0x0"],
    })
    // stakeLists[]
    useContractReads({
        enabled: !!hexData && !!walletAddress && stakeList.length != Number(stakeCount),
        scopeKey: `stakes:${chainId}:${walletAddress}`,
        contracts: (() => {
            if (!stakeCount) return []
            const stakeListsContracts = []
            for (let i = 0; i < stakeCount; i++) stakeListsContracts.push({
                address: HEX.CHAIN_ADDRESSES[chainId] as `0x${string}`,
                abi: HEX.ABI,
                functionName: 'stakeLists',
                args: [walletAddress as `0x${string}`, i],
            })
            return stakeListsContracts
        })(),
        onSuccess: data => {
            if (data === undefined) return
            // data cotnains the entire fetched data array
            // setLoadingProgress(prev => prev < 90 ? prev+20 : prev)
            let totalHexValue = 0n
            const _stakeList = data.map((stake, index: number): StakeData => {
                const [
                    stakeId,
                    stakedHearts,
                    stakeShares,
                    lockedDay,
                    stakedDays,
                    unlockedDay,
                    isAutoStake,
                ] = (stake.result as [bigint, bigint, bigint, number, number, number, boolean])
                const endDay = lockedDay + stakedDays + 1
                const progress = (Number(currentDay) - Number(lockedDay)) / Number(stakedDays) * 100
                totalHexValue += stakedHearts
                    
                // add payout (so far) from current partial day
                let payout = 0n
                if (currentDay < lockedDay + stakedDays) {
                    const partDayPayout = estimatePayoutRewardsDay(hexData, stakeShares, currentDay)
                    payout += partDayPayout
                }

                return {
                    stakeIndex: BigInt(index),
                    stakeId: BigInt(stakeId),
                    stakedHearts: BigInt(stakedHearts),
                    stakeShares: BigInt(stakeShares),
                    bigPayDay: 0n,
                    payout,
                    penalty: 0n,
                    stakeReturn: 0n,
                    cappedPenalty: 0n,
                    lockedDay: BigInt(lockedDay),
                    stakedDays: BigInt(stakedDays),
                    unlockedDay: BigInt(unlockedDay),
                    endDay: BigInt(endDay),
                    progress,
                    isAutoStake: !!isAutoStake,
                }
            })
            setStakeList(_stakeList)
            setTotalHexValue(totalHexValue)
        }
    })

    // "dailyDataRange"
    const dailyDataCount = hexData?.globals?.dailyDataCount || hexData?.currentDay || 0n
    const earliestDay = findEarliestDay(stakeList, dailyDataCount)
    const rangeStart = earliestDay > 0 ? earliestDay -1n : 0n
    const rangeEnd = dailyDataCount - 1n
    useContractRead({
        enabled: rangeEnd > rangeStart && stakeList.length > 0,
        scopeKey: `dailyData:${chainId}:${walletAddress}:${rangeStart}:${rangeEnd}`,
        address: HEX.CHAIN_ADDRESSES[chainId],
        abi: HEX.ABI,
        functionName: 'dailyDataRange',
        args: [rangeStart, rangeEnd],
        onSuccess: result => {
            if (!!stakeList && stakeList.length > 0) {
                const indexedDailyData: DailyData[] = []
                result.forEach((day, index) => {
                    indexedDailyData[Number(findEarliestDay(stakeList, dailyDataCount)) + index] = {
                        payoutTotal: day & HEX.HEART_UINT_MASK,                             // .sol:807 uint72 dayPayoutTotal
                        stakeSharesTotal: day >> HEX.HEART_UINT_SIZE & HEX.HEART_UINT_MASK, // .sol:808 uint72 dayStakeSharesTotal
                        unclaimedSatoshisTotal: day >> HEX.HEART_UINT_SIZE * 2n,            // .sol:809 uint56 dayUnclaimedSatoshisTotal;
                    } as DailyData
                })
                if (!indexedDailyData) return Promise.reject("internal error [1]")
                let totalHexValue = 0n
                const newStakeData: StakeData[] = stakeList.map((oldStakeData: StakeData) => {
                    const stakeReturnData = calcStakeEnd(hexData, indexedDailyData, oldStakeData)
                    const { payout, bigPayDay } = stakeReturnData
                    const partDayPayout = oldStakeData.payout // calculated from HEX globals, before dailyData retrieval
                    totalHexValue += oldStakeData.stakedHearts + payout + bigPayDay
                    const result = {
                        ...oldStakeData,
                        ...stakeReturnData,
                        payout: payout + partDayPayout,
                    }
                    return result
                })
                setStakeList(newStakeData)
                setTotalHexValue(totalHexValue)
            }
        }
    })

    const totalUsdValue = Number(formatUnits(totalHexValue, HEX.DECIMALS)) * props.usdhex

    return (
        <>
            <Accordion
                id="stakes_accordion"
                className="text-start"
                defaultActiveKey={selectedCard}
                onSelect={eventKey => {
                    !!eventKey && setSelectedCard(eventKey as string)
                    if (eventKey) ReactGA.pageview("/" + eventKey)
                }}
            >
                {!props.account && // NewStakeForm not shown for read only ?address=
                    <Accordion.Item
                        className="new-stake text-light"
                        eventKey="new_stake"
                    >
                        <Accordion.Header>
                            <Row className="w-100">
                                <Col className="pe-0">
                                    <BurgerHeading>
                                    <Trans i18nKey='hdgNewStake' >
                                        New <span className="d-none d-sm-inline">HEX</span> Stake
                                    </Trans>
                                    </BurgerHeading></Col>
                                <Col className="col-5 lh-lg px-0 text-end text-success">
                                    <span className="text-muted small align-baseline me-1"><span className="d-none d-sm-inline">{t("Available")} </span>HEX</span>
                                    <CryptoVal className="fw-bold" value={hexBalance} />
                                </Col>
                            </Row>
                        </Accordion.Header>
                        <Accordion.Body>
                            <NewStakeForm />
                        </Accordion.Body>
                    </Accordion.Item>
                }
                <Accordion.Item className={"text-light " + (props.className || "")} eventKey="current_stakes">
                    {props.account &&
                        <div className="bg-secondary px-1 text-light text-center small">
                            <span className="text-info small align-baseline me-2">{accountName}</span>
                            {walletAddress}
                        </div>
                    }
                    <Accordion.Header className="w-100">
                        <Row className="w-100">
                            <Col className="pe-0"><BurgerHeading>{t("Active Stakes")}</BurgerHeading></Col>
                            <Col className="col-5 lh-lg px-0 text-end text-success">
                                <small className="text-muted small align-baseline me-1">USD ATP</small>
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
                    <Accordion.Body>
                        <StakesList stakeList={stakeList} usdhex={props.usdhex} />
                    </Accordion.Body>
                </Accordion.Item>
                <Accordion.Item className="stake-history text-light pb-0" eventKey="stake_history">
                    <Accordion.Header>
                        <BurgerHeading>{t("Stake History")}</BurgerHeading>
                    </Accordion.Header>
                    <Accordion.Collapse eventKey="stake_history">
                        <Suspense fallback={<>{t("loading")}</>}>
                            {selectedCard === "stake_history" && <StakeHistory />}
                        </Suspense>
                    </Accordion.Collapse>
                </Accordion.Item>
            </Accordion>
        </>
    )
}
export default Stakes
