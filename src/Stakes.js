import React, { useState } from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { 
    Container,
    Card,
    Table,
    Row,
    Col,
    Button,
    Modal,
    Badge,
    Alert,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap'
import { FormattedDate, FormattedNumber} from 'react-intl';
import styles from './Stakes.css'

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            address: props.myAddress,
            contractGlobals: null,
            currentDay: null,
            stakeCount: null,
            stakeList:  [],
            stakedTotal: 0,
            sharesTotal: 0,
            poolShareTotal: 0,
            stakeContext: { }, // active UI stake context
            showExitModal: false
        }
    }

    componentDidMount() {
        Promise.all([
            new Promise((resolve, reject) => {
                this.contract.methods.globals().call().then((globals) => {
                    let stateGlobals = { }
                    for (const key in globals) {
                        // filter numeric keys and convert string values to numbers
                        if (isNaN(parseInt(key))) stateGlobals[key] = Number(globals[key])
                    }
                    resolve(stateGlobals)
                })
            })
            , this.contract.methods.currentDay().call()
            , this.contract.methods.stakeCount(this.state.address).call()
        ])
        .then((results) => {
            this.setState({
                contractGlobals: results[0],
                currentDay: results[1],
                stakeCount: results[2]
            })
            let stakedTotal = 0
            let sharesTotal = 0
            for (let i=0; i<this.state.stakeCount; i++) {
                this.setState({ stakeList: this.state.stakeList.concat(i) })
                this.contract.methods.stakeLists(this.state.address, i).call()
                .then((stakeData) => {
                    let poolShare = (Number(stakeData.stakeShares) / this.state.contractGlobals.stakeSharesTotal) 
                    const stakeList = this.state.stakeList.slice() // is const **reference** to **slice (copy)** of thus **unmutated** original array
                    stakeList.splice(i, 1, { // data retrieval is async and can arrive in any order
                        stakeId: Number(stakeData.stakeId),
                        lockedDay: Number(stakeData.lockedDay),
                        stakedDays: Number(stakeData.stakedDays),
                        stakedHEX: Number(stakeData.stakedHearts / 1e8),
                        stakeShares: Number(stakeData.stakeShares),
                        poolShare: poolShare,
                        unlockedDay: Number(stakeData.unlockedDay),
                        isAutoStake: Boolean(stakeData.isAutoStake)
                    })
                    stakedTotal += Number(stakeData.stakedHearts / 1e8)
                    sharesTotal += Number(stakeData.stakeShares)
                    this.setState({ 
                        stakeList,
                        stakedTotal,
                        sharesTotal,
                        poolShareTotal: sharesTotal / this.state.contractGlobals.stakeSharesTotal
                    })
                })
            }
        })
        .catch(e => console.log('Contract query error: ',e))
    }

    render() {

        const handleClose = () => this.setState({ showExitModal: false })
        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }
        const thisStake = this.state.stakeContext
        const IsEarlyExit = (thisStake.stakeId && this.state.currentDay <= (thisStake.lockedDay + thisStake.stakedDays)) 

        return (
            <div>
            <Card bg="primary" text="light" className="overflow-auto m-2">
                <Card.Body className="p-2">
                    <Card.Title>Stakes <Badge variant='warning' className="float-right">Day {this.state.currentDay+1}</Badge></Card.Title>
                    <Table variant="secondary" size="sm" striped borderless>
                        <thead>
                            <tr>
                                <th>Started</th>
                                <th>Ends</th>
                                <th className="hex-value">HEX</th>
                                <th className="shares-value">Shares</th>
                                <th>Pool %</th> 
                                <th>{' '}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {this.state.contractGlobals &&
                                this.state.stakeList.map((stakeData) => {
                                    
                                    return (typeof stakeData === 'object') ? 
                                    (
                                        <tr key={stakeData.stakeId}>
                                            <td>{stakeData.lockedDay + 1}</td>
                                            <td>{
                                                <OverlayTrigger
                                                    key={stakeData.stakeId}
                                                    placement="top"
                                                    overlay={
                                                      <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                        Full term is
                                                      </Tooltip>
                                                    }
                                                >
                                                <div>{stakeData.lockedDay + stakeData.stakedDays + 1}</div>
                                                </OverlayTrigger>
                                            }</td>
                                            <td className="hex-value"><FormattedNumber minimumFractionDigits={2} maximumFractionDigits={4} value={stakeData.stakedHEX} /></td>
                                            <td className="shares-value">
                                                <FormattedNumber 
                                                    maximumPrecision={6}
                                                    value={(stakeData.stakeShares / 1e12)}
                                                />T
                                            </td>
                                            <td>
                                                <FormattedNumber 
                                                    maximumFractionDigits={5}
                                                    maximumPrecision={5}
                                                    value = { stakeData.poolShare * 100 }
                                                />%
                                            </td>
                                            <td align="right"><Button variant="outline-primary" size="sm" onClick={(e) => handleShow(stakeData, e)}>Exit</Button></td>
                                        </tr>
                                    ) : (
                                        <tr key={stakeData}><td colSpan="5">loading</td></tr>
                                    )
                                })
                            }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="2"></td>
                                <td className="hex-value">
                                    <FormattedNumber 
                                        minimumFractionDigits={2} 
                                        maximumFractionDigits={4} 
                                        value={this.state.stakedTotal} 
                                    />
                                </td>
                                <td className="shares-value">
                                    <FormattedNumber
                                        maximumPrecision={6}
                                        value={(this.state.sharesTotal / 1e12)}
                                    />T
                                </td>
                                <td>
                                    <FormattedNumber 
                                        maximumFractionDigits={5}
                                        maximumPrecision={5}
                                        value = { this.state.poolShareTotal * 100 }
                                    />%
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </Table>
                </Card.Body>
            </Card>
            <Modal show={this.state.showExitModal} onHide={handleClose} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>End Stake</Modal.Title>
                </Modal.Header>
               <Modal.Body>
                    {IsEarlyExit 
                        ?  
                            <Alert variant="danger">
                                <Alert.Heading>LOSSES AHEAD</Alert.Heading>
                                <p>
                                    Exiting stakes early can lead to <em>significant</em> losses!
                                </p>
                                <hr />
                                <p>
                                    <Alert.Link href="#">Learn more</Alert.Link>
                                </p>
                            </Alert>
                        :
                            <Alert variant="success">
                                <Alert.Heading>Term Complete</Alert.Heading>
                                <p>
                                    This stake has served its full term and is safe to exit.
                                </p>
                                <p> TODO: add stake stats / yield etc </p>
                            </Alert>
                    }
                </Modal.Body>
                <Modal.Footer>
                    {IsEarlyExit 
                        ? <div>
                            <Button variant="secondary" onClick={handleClose}>
                                Accept Penalty
                            </Button>
                            <Button variant="primary" className="ml-3" onClick={handleClose}>
                                Get me outta here!
                            </Button>
                        </div>
                        : <Button variant="primary" onClick={handleClose}>End Stake</Button>
                    }
                </Modal.Footer>
            </Modal>
            </div>
        )
    }
}

export default Stakes;
