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
import StakeDetail from './StakeDetail.js'
import { BigNumber } from 'bignumber.js'

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            address: props.myAddress,
            currentDay: null,
            stakeCount: null,
            stakeList:  [],
            stakedTotal: 0,
            sharesTotal: 0,
            poolShareTotal: 0,
            stakeContext: { }, // active UI stake context
            showExitModal: false,
            showDetailModal: false
        }
    }

    componentDidMount() {
        Promise.all([
              this.contract.methods.currentDay().call()
            , this.contract.methods.stakeCount(this.state.address).call()
        ])
        .then((results) => {
            this.setState({
                currentDay: Number(results[0]),
                stakeCount: Number(results[1])
            })
            this.setState({ 
                stakedTotal: 0,
                sharesTotal: 0
            })
            for (let index = 0; index < this.state.stakeCount; index++) {
                this.setState({ stakeList: this.state.stakeList.concat(index) })
                this.contract.methods.stakeLists(this.state.address, index).call()
                .then((stakeNumbers) => {
                    stakeNumbers.poolShare = new BigNumber(stakeNumbers.stakeShares).dividedBy(this.contract.globals.stakeSharesTotal).toString()

                    // update stake record at correct index in (a copy of) state.stakeList (async data can arrive in any order)
                    const stakeList = this.state.stakeList.slice()
                    stakeList.splice(index, 1, stakeNumbers);
                
                    // update this.state
                    this.setState({ 
                        stakeList,
                        stakedTotal: new BigNumber(this.state.stakedTotal).plus(stakeNumbers.stakedHearts).toString(),
                        sharesTotal: new BigNumber(this.state.sharesTotal).plus(stakeNumbers.stakeShares).toString(),
                        poolShareTotal: new BigNumber(this.state.sharesTotal).plus(stakeNumbers.stakeShares).dividedBy(this.contract.globals.stakeSharesTotal).toString()
                    })
                })
            }
        })
        .catch(e => console.log('ERROR: Contract query error: ',e))
    }

    render() {

        const handleCloseDetail = () => this.setState({ showDetailModal: false })
        const handleShowDetail = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showDetailModal: true
            })
        }
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
                                <th>Start</th>
                                <th>End</th>
                                <th>Days</th>
                                <th className="hex-value">HEX</th>
                                <th className="shares-value">Shares</th>
                                <th>Pool %</th> 
                                <th>{' '}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {this.contract.globals &&
                                this.state.stakeList.map((stakeData) => {
                                    
                                    return (typeof stakeData === 'object') ? 
                                    (
                                        <tr key={stakeData.stakeId}>
                                            <td>{Number(stakeData.lockedDay) + 1}</td>
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
                                                <div>{Number(stakeData.lockedDay) + Number(stakeData.stakedDays) + 1}</div>
                                                </OverlayTrigger>
                                            }</td>
                                            <td>{ stakeData.stakedDays }</td>
                                            <td className="hex-value"><FormattedNumber minimumFractionDigits={2} maximumFractionDigits={4} value={stakeData.stakedHearts / 1e8} /></td>
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
                                            <td align="right">
                                                <Button variant="warning" size="sm" onClick={(e) => handleShowDetail(stakeData, e)}>
                                                    Detail
                                                </Button>
                                                <Button variant="outline-primary" size="sm" onClick={(e) => handleShow(stakeData, e)}>
                                                    Exit
                                                </Button>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={stakeData}><td colSpan="5">loading</td></tr>
                                    )
                                })
                            }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="3"></td>
                                <td className="hex-value">
                                    <FormattedNumber 
                                        minimumFractionDigits={2} 
                                        maximumFractionDigits={4} 
                                        value={this.state.stakedTotal / 1e8} 
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

            <Modal show={this.state.showDetailModal} onHide={handleCloseDetail}>
                <StakeDetail contract={this.contract} currentDay={this.state.currentDay} stakeData={this.state.stakeContext} />
            </Modal>

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
