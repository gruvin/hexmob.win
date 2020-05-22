import React from 'react'
import { 
    Row, Col,
    Card,
    Button,
    Modal,
    Alert,
    ProgressBar,
    Accordion,
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import HEX from './hex_contract'
import { HexNum, WhatIsThis, BurgerHeading } from './Widgets' 

const debug = require('debug')('Stakes')
debug('loading')

class Lobby extends React.Component {
    constructor(props) {
        super(props)
        this.subscriptions = [ ]
        this.loggedEvents = [ ]
        this.state = {
            selectedCard: 'current_stakes',
            // selectedCard: 'new_stake',
            stakeCount: null,
            stakeList: null,
            loadingStakes: true,
            stakeContext: { }, // active UI stake context
            showExitModal: false
        }

        window._LOBBY = this // DEBUG REMOVE ME
    }

    render() {
        return (
            <Accordion id="lobby_accordion" className="text.left my-3" >
                <Card bg="secondary" text="light rounded">
                    <Accordion.Toggle bg="dark" as={Card.Header}>
                        <BurgerHeading>ETH => HEX Transform</BurgerHeading>
                    </Accordion.Toggle>
                    <Accordion.Collapse>
                        <Card.Body>
                            TEST
                        </Card.Body>
                    </Accordion.Collapse>
                </Card>
            </Accordion>
        )
    }
}

export default Lobby
