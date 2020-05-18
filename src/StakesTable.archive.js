    CurrentStakesTable = () => {
        const { currentDay } = this.props.contract.Data

        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }

        const stakeList = this.state.stakeList.slice() || null
        stakeList && stakeList.sort((a, b) => (a.progress < b.progress ? (a.progress !== b.progress ? 1 : 0) : -1 ))

        let stakedTotal = new BigNumber(0)
        let sharesTotal = new BigNumber(0)
        let bpdTotal = new BigNumber(0)
        let interestTotal = new BigNumber(0)

        return (
            <Table variant="secondary" size="sm" striped borderless>
                <thead>
                    <tr>
                        <th className="text-center">Start</th>
                        <th className="text-center">End</th>
                        <th className="text-center">Days</th>
                        <th className="text-center">Progress</th>
                        <th className="text-right">Principal</th>
                        <th className="text-right">Shares</th>
                        <th className="text-right">BigPayDay</th> 
                        <th className="text-right">Interest</th>
                        <th className="text-right">Value</th>
                        <th>{' '}</th>
                    </tr>
                </thead>
                <tbody>
                    { this.state.loadingStakes
                        ? (
                            <tr key="loading"><td colSpan="9" align="center">loading ...</td></tr>
                        )
                        : !stakeList.length
                        ? (
                            <tr key="loading"><td colSpan="9" align="center">no stake data found for this address</td></tr>
                        )
                        : stakeList.map((stakeData) => {
                            const startDay = stakeData.lockedDay
                            const endDay = startDay + stakeData.stakedDays
                            const startDate = new Date(HEX.START_DATE) // UTC but is converted to local
                            const endDate = new Date(HEX.START_DATE)
                            startDate.setUTCDate(startDate.getUTCDate() + startDay)
                            endDate.setUTCDate(endDate.getUTCDate() + endDay)
                            stakedTotal = stakedTotal.plus(stakeData.stakedHearts)
                            sharesTotal = sharesTotal.plus(stakeData.stakeShares)
                            bpdTotal = bpdTotal.plus(stakeData.bigPayDay)
                            interestTotal = interestTotal.plus(stakeData.payout)

                            return (
                                <tr key={stakeData.stakeId}>
                                    <td className="text-center">
                                        <OverlayTrigger
                                            key={stakeData.stakeId}
                                            placement="top"
                                            overlay={
                                                <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                    { startDate.toLocaleString() }
                                                </Tooltip>
                                            }
                                        >
                                            <div>{ startDay + 1 }</div>
                                        </OverlayTrigger>
                                    </td>
                                    <td className="text-center">
                                        <OverlayTrigger
                                            key={stakeData.stakeId}
                                            placement="top"
                                            overlay={
                                                <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                    { endDate.toLocaleString() }
                                                </Tooltip>
                                            }
                                        >
                                            <div>{ endDay + 1 }</div>
                                        </OverlayTrigger>
                                    </td>
                                    <td className="text-center">{ stakeData.stakedDays }</td>
                                    <td className="text-center">
                                        <HexNum value={stakeData.progress / 1000} />%
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.stakedHearts} /> 
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.stakeShares.times(1e8)} /> 
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.bigPayDay} />
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.payout} />
                                    </td>
                                    <td className="text-right">
                                        <HexNum value={stakeData.stakedHearts.plus(stakeData.payout)} />
                                    </td>
                                    <td align="right">
                                        <Button 
                                            variant="outline-primary" size="sm" 
                                            onClick={(e) => handleShow(stakeData, e)}
                                            className={ 
                                                currentDay < (stakeData.lockedDay + stakeData.stakedDays / 2) ? "exitbtn earlyexit"
                                                    : currentDay < (stakeData.lockedDay + stakeData.stakedDays) ? "exitbtn midexit"
                                                    : currentDay < (stakeData.lockedDay + stakeData.stakedDays + 7) ? "exitbtn termexit"
                                                    : "exitbtn lateexit"
                                            }
                                        >
                                            Exit
                                        </Button>
                                    </td>
                                </tr>
                            )
                        })
                    }

                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan="4"></td>
                        <td className="text-right">
                            <HexNum value={stakedTotal} /> 
                        </td>
                        <td className="text-right">
                            <HexNum value={sharesTotal.times(1e8)} />
                        </td>
                        <td className="text-right">
                            <HexNum value={bpdTotal} />
                        </td>
                        <td className="text-right">
                            <HexNum value={interestTotal} />
                        </td>
                        <td className="text-right">
                            <HexNum value={stakedTotal.plus(interestTotal)} />
                        </td>
                        <td>{' '}</td>
                    </tr>
                </tfoot>
            </Table>
        )
    }


