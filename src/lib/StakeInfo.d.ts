export interface State {
    esShow: boolean
    eesStatsHEX: boolean
}

export interface Props {
    contract: HEXContract
    stake: StakeData
    usdhex: number
    readOnly: boolean
    reloadStakes?: Function
}
