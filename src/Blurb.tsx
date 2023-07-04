import {
    Container,
    Row,
    Col,
    Image
} from 'react-bootstrap'

const Blurb = () => {
    return (
        <Container id="mobile_devices" className="bg-light text-dark rounded p-3 my-3 overflow-hidden text-start">
            <Row>
                <Col className="text-center">
                    {
                        window.hostIsTSA
                        ? <h3 className="text-muted">go.TShare.app</h3>
                        : <h3 className="text-muted">HEX<sup>mob.win</sup></h3>
                    }
                    <h1 className="text-uppercase">HEX mining interface</h1>
                    <p className="text-muted">independent community project</p>
                </Col>
            </Row>
            <Row className="h-100">
                <Col xs={12} sm={5} className="text-end">
                    <Image className="d-none d-sm-inline-block"
                        style={{ maxWidth: "90%", maxHeight: "320px" }}
                        alt="MetaMask browser screenshot on iPhone 11"
                        src={"/seo/iphone11.png"}
                    />
                    <Image className="d-block d-sm-none m-auto"
                        style={{ maxWidth: "100%" }}
                        alt="MetaMask browser screenshot on iPhone 11"
                        src={"/seo/iphone11-cropped.png"}
                    />
                </Col>
                <Col xs={12} sm={7} className="py-3 text-center m-auto allign-middle">
                    <p className="m-0"><small>compatible wallets include ...</small></p>
                    <p>
                        <Image src="/mm-wordmark.svg" alt="Metamask" height={72} /><br />
                        <strong>iOS, Android, MacOS, Linux, Windows</strong><br/>
                        Safari, Chrome, Firefox, Brave, more
                    </p>
                    <p className="m-3">
                        Trust, Coinbase, Crypto.com, imToken, Portis, Rainbow and any wallet implementing ...
                    </p>
                    <h3>
                        <img height={32} src="/walletconnect.svg" alt="" /> WalletConnect
                    </h3>
                </Col>
            </Row>
        </Container>
    )
}

export default Blurb
