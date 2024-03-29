import React, { useContext, useEffect, useState } from 'react'
import { useTranslation } from "react-i18next"
import { useNetwork, usePublicClient, useQuery } from 'wagmi'
import HEX from './hex_contract'
import { EventStakeHistory } from './lib/Stakes'
import { HexContext } from './Context'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Spinner from 'react-bootstrap/Spinner'
import { CryptoVal } from './Widgets'
import { getAbiItem } from 'viem'
import { UriAccount } from './lib/App'
import _debug from 'debug'
const debug = _debug("StakeHistory")
debug("loaded")

const StakesHistory = (props: { account?: UriAccount }) => {
    const { t } = useTranslation()
    const hexData = useContext(HexContext)
    const walletAddress = props.account?.address || hexData?.walletAddress
    if (!walletAddress) return <>{t("internal error")}</>

    const [sortKey, setSortKey] = useState({ keyField: "timestamp", dir: -1 } as { keyField: string, dir: number })
    const [pastStakes, setPastStakes] = useState(null as EventStakeHistory[] | null)

    const { chain } = useNetwork()
    const chainId = chain?.id || 0
    const publicClient = usePublicClient()

    const sortPastStakesStateByField = (keyField: string, _dir?: number) => {
        const oldKey = sortKey.keyField
        const oldDir = sortKey.dir
        const dir = _dir !== undefined ? _dir : (oldKey === keyField) ? -oldDir : -1
        setSortKey({ keyField, dir })
        pastStakes && setPastStakes(
            pastStakes.sort((b, a): -1 | 0 | 1 => {
                if (a == null || b == null) return 0
                const A = a[keyField as keyof EventStakeHistory]
                const B = b[keyField as keyof EventStakeHistory]
                return dir < 0
                    ? (A > B ? 1 : A < B ? -1 : 0)
                    : (A > B ? -1 : A < B ? 1 : 0)
            })
        )
    }

    useQuery(
        ["StartEvents", `${chainId}`, walletAddress],
        async () => (
            await publicClient.getLogs({
                address: HEX.CHAIN_ADDRESSES[chainId],
                event: getAbiItem({ abi: HEX.ABI, name: "StakeEnd" }),
                args: { stakerAddr: walletAddress },
                fromBlock: HEX.GENESIS_BLOCK,
                toBlock: 'latest',
            })
        ), {
        onSuccess: (data) => {
            /*
            emit StakeEnd( // (auto-generated event)
                uint256(uint40(block.timestamp)) // data0
                    | (uint256(uint72(stakedHearts)) << 40)
                    | (uint256(uint72(stakeShares)) << 112)
                    | (uint256(uint72(payout)) << 184),
                uint256(uint72(penalty)) // data1
                    | (uint256(uint16(servedDays)) << 72)
                    | (prevUnlocked ? (1 << 88) : 0),
                msg.sender,
                stakeId
            );
            */
            const decodedHistory: EventStakeHistory[] = data.map(result => {
                if (result.args === undefined) return null
                const d0 = result.args?.data0
                const d1 = result.args?.data1
                if (d0 === undefined) return null
                if (d1 == undefined) return null
                const mask72 = (1n << 72n) -1n
                const mask40 = (1n << 40n) -1n
                const mask16 = (1n << 16n) -1n
                const decoded = {
                    stakerAddr: result.args.stakerAddr,
                    stakeId: BigInt(result.args?.stakeId || 0),
                    timestamp: d0 & mask40,
                    stakedHearts: (d0 >> 40n) & mask72,
                    stakeShares: (d0 >> 112n) & mask72,
                    payout: (d0 >> 184n) & mask72,
                    penalty: d1 & mask72,
                    servedDays: (d1 >> 72n) & mask16,
                    prevUnlocked: (d1 >> 88n) & 1n ? true : false,
                }
                debug("DXX: %O", decoded)
                const _stakeReturn = decoded.stakedHearts + decoded.payout - decoded.penalty
                const stakeReturn = _stakeReturn > 0n ? _stakeReturn : 0n
                return {
                    ...decoded,
                    stakeReturn,
                }
            })
            setPastStakes(decodedHistory)
        }
    })

    useEffect(() => {
        setPastStakes(null)
    }, [chainId, walletAddress])

    useEffect(() => {
        sortPastStakesStateByField(sortKey.keyField, sortKey.dir)
    }, [pastStakes])

    const handleSortSelection = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (!(e.target instanceof HTMLAnchorElement)) return
        e.preventDefault()
        e.stopPropagation()
        const hash = e.target.closest('a')?.hash
        if (hash) {
            const _keyField = hash.match(/sort_(.+)$/)
            _keyField && sortPastStakesStateByField(_keyField[1])
        }
    }

    return (
        <Container className="row-highlight-even">
            <h3 className="text-center">{t("HEX Units")}</h3>
            <Row className="my-2 xs-small text-end text-bold" key="hist_head">
                <Col className="col-2 px-0 text-center"><a href="#sort_timestamp" onClick={handleSortSelection}>{t("Ended")}</a></Col>
                <Col className="col-1 ps-0 pe-0"><a href="#sort_servedDays" onClick={handleSortSelection}>{t("Days")}</a></Col>
                <Col className="ps-2 pe-0"><a href="#sort_stakedHearts" onClick={handleSortSelection}>{t("Staked")}</a></Col>
                <Col className="ps-2 pe-0"><a href="#sort_stakeShares" onClick={handleSortSelection}>{t("Shares")}</a></Col>
                <Col className="ps-2 pe-0"><a href="#sort_payout" onClick={handleSortSelection}>{t("Yield")}</a></Col>
                <Col className="ps-2 pe-0"><a href="#sort_penalty" onClick={handleSortSelection}>{t("Penalties")}</a></Col>
                <Col className="ps-2 pe-0"><a href="#sort_stakeReturn" onClick={handleSortSelection}>{t("Return")}</a></Col>
            </Row>
            {pastStakes === null
                ? <div className="text-center"><Spinner animation="grow" variant="info" size="sm"/>&nbsp;&nbsp;{t("retrieving data")}</div>
                : pastStakes.length === 0
                ? <>no history found</>
                : pastStakes.map((stake, index: number) => {
                    if (stake === null) return <>{t("internal error")}</>
                    const { timestamp, servedDays, stakedHearts, stakeShares, payout, penalty, stakeReturn } = stake
                    const endDate = new Date(Number(timestamp) * 1000).toLocaleDateString()
                    return (
                        <Row className="my-2 xs-small text-end" key={index}>
                            <Col className="col-2 px-0 numeric">{endDate}</Col>
                            <Col className="col-1 ps-0 pe-2 numeric">{servedDays.toString()}</Col>
                            <Col className="ps-2 pe-0"><CryptoVal value={stakedHearts} currency="HEX" /></Col>
                            <Col className="ps-2 pe-0"><CryptoVal value={stakeShares} currency="SHARES" /></Col>
                            <Col className="ps-2 pe-0"><CryptoVal value={payout} currency="HEX" /></Col>
                            <Col className="ps-2 pe-0"><CryptoVal value={penalty} currency="HEX" /></Col>
                            <Col className="ps-2 pe-0"><CryptoVal value={stakeReturn} currency="HEX" /></Col>
                        </Row>
                    )
                })
            }
        </Container>
    )
}
export default StakesHistory