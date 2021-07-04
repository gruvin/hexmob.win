import React from 'react'
import { 
    Container,
    Row,
    Col,
    Image
} from 'react-bootstrap'

const Blurb = () => {
    return (
        <Container fluid id="mobile_devices" className="bg-light text-dark rounded p-3 my-3 overflow-hidden text-left">
            <Container fluid className="my-3" id="mobile_trust_wallet">
                <Row>
                    <Col className="text-center">
                        {
                            window.hostIsTSA
                            ? <h3 className="text-muted">go.TShare.app</h3>
                            : <h3 className="text-muted">HEX<sup>mob.win</sup></h3>
                        }
                        <h3>“a mobile friendly HEX staking interface”</h3>
                        <p className="text-muted">independent community project</p>
                    </Col>
                </Row>
                <Row className="h-100">
                    <Col xs={12} sm={5} className="text-right">
                        <Image className="d-none d-sm-inline-block"
                            style={{ maxWidth: "90%", maxHeight: "320px" }}
                            alt="MetaMask browser screenshot on iPhone 11"
                            src={(window.hostIsTSA ? "/tsa" : "/hexmob") + "/mm-iphone11.png"}
                        />
                        <Image className="d-block d-sm-none m-auto"
                            style={{ maxWidth: "100%" }}
                            alt="MetaMask browser screenshot on  iPhone 11"
                            src={(window.hostIsTSA ? "/tsa" : "/hexmob") + "/mm-iphone11-cropped.png"}
                        />
                    </Col>
                    <Col xs={12} sm={7} className="py-3 text-center m-auto allign-middle">
                        <p className="m-0"><small>compatible wallets include ...</small></p>
                        <p>
                            <Image src="/mm-wordmark.svg" alt="Metamask" height={96} /><br />
                            <strong>iOS, Android, MacOS, Linux, Windows</strong><br/>
                            Safari, Chrome, Firefox, Brave, more
                        </p>
                        <p className="m-3">
                            Trust, Coinbase, Crypto.com, imToken, Portis, Rainbow and any wallet implementing ...
                        </p>
                        <h3>
                            <img width={100} src="/walletconnect.svg" alt="" /> WalletConnect
                        </h3>
                    </Col>
                </Row>
            </Container>
        </Container>
    )
}

export default Blurb
