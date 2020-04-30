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
            currentDay: 0,
            stakeCount: 0,
            stakeList:  [],
            stakeContext: {}, // active UI stake context
            showExitModal: false
        }
    }

    componentDidMount() {
        this.contract.methods.currentDay().call()
        .then((day) => {
            this.setState({currentDay: Number(day)})
            this.contract.methods.stakeCount(this.state.address).call()
            .then((stakeCount) => {
                this.setState({ stakeCount })
                for (let i=0; i<stakeCount; i++) {
                    this.setState({ stakeList: this.state.stakeList.concat(i) })
                    this.contract.methods.stakeLists(this.state.address, i).call()
                        .then((stakeData) => {
                            const stakeList = this.state.stakeList.slice()
                            stakeList.splice(i, 1, {
                                stakeId: Number(stakeData.stakeId),
                                lockedDay: Number(stakeData.lockedDay),
                                stakedDays: Number(stakeData.stakedDays),
                                stakedHEX: Number(stakeData.stakedHearts / 1e8),
                                stakeShares: Number(stakeData.stakeShares),
                                unlockedDay: Number(stakeData.unlockedDay),
                                isAutoStake: Boolean(stakeData.isAutoStake)
                            })
                            this.setState({ stakeList })
                        })
                }
            })
        })
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
                    <Table variant="secondary" size="sm" striped >
                        <thead className="thead-dark">
                            <tr>
                                <th>Start</th>
                                <th>Ends</th>
                                <th className="hex-value">HEX</th>
                                <th className="shares-value">Shares</th>
                                <th>{' '}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {
                                this.state.stakeList.map((stakeData) => {
                                    return (typeof stakeData === 'object') ? (
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
                                            <td align="right"><Button variant="outline-primary" size="sm" onClick={(e) => handleShow(stakeData, e)}>End</Button></td>
                                        </tr>
                                    ) : (
                                        <tr key={stakeData}><td colSpan="5">loading</td></tr>
                                    )
                                })
                            }
                        </tbody>
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
                                    Ending stakes early can lead to <em>significant</em> losses!
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
