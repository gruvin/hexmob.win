import React, { useContext, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Container from "react-bootstrap/Container";
import ProgressBar from "react-bootstrap/ProgressBar";
import Accordion from "react-bootstrap/Accordion";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Overlay from "react-bootstrap/Overlay";
import Popover from "react-bootstrap/Popover";
import { StakeData } from "./lib/Stakes";
import "./Stakes.scss";
import HEX from "./hex_contract";
import { HexContext } from "./Context";
import { format } from "d3-format";
import { formatUnits } from "viem";
import { CryptoVal, StakeEndButton } from "./Widgets";
import { calcPercentGain, calcPercentAPY } from "./util";
import ReactGA from "react-ga";

import _debug from "debug";
const debug = _debug("StakeInfo");
debug("loading");

export const StakeInfo = (props: {
  stake: StakeData;
  usdhex: number;
  readOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const hexData = useContext(HexContext);
  const currentDay = hexData?.currentDay || 0n;
  if (!currentDay) return <>{t("internal error")}</>;

  const esRef = React.useRef(null);

  const [esShow, setEsShow] = useState(false);
  const [eesStatsHEX, setEesStatsHEX] = useState(
    (hexData?.chainId || 0) in [1, 369]
  );

  const { stake, usdhex } = props;
  const { lockedDay: startDay, endDay, stakedDays, progress } = stake;
  const stakeDay = currentDay - startDay; // day number into active stake
  const exitClass =
    currentDay < startDay
      ? "pendingexit"
      : stakeDay < stakedDays / 2n
      ? "earlyexit"
      : stakeDay < stakedDays
      ? "midexit"
      : stakeDay < stakedDays + 14n
      ? "termexit"
      : "lateexit";

  const progressVariant =
    exitClass === "pendingexit"
      ? "secondary"
      : exitClass === "earlyexit"
      ? "danger"
      : exitClass === "midexit"
      ? "warning"
      : exitClass === "termexit"
      ? "success"
      : "info"; // lateexit

  const isEarly = stakeDay < stakedDays;

  // format values for display
  const _startDate = new Date(
    HEX.START_DATE.getTime() + Number(startDay * 24n * 3600n * 1000n)
  );
  const startDate =
    _startDate.toLocaleDateString() +
    " " +
    _startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const _endDate = new Date(
    HEX.START_DATE.getTime() + Number(endDay * 24n * 3600n * 1000n)
  );
  const endDate =
    _endDate.toLocaleDateString() +
    " " +
    _endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const { stakedHearts, stakeShares, payout, bigPayDay, penalty, stakeReturn } =
    stake;

  //////////////////////////////////////////////////////////////
  // SUMMARY TOTALS
  // @dev Summary totals assume no early end stakes hence no penalties
  const summaryTotal = stake.stakedHearts + stake.payout + stake.bigPayDay;
  const usdSummaryTotal = format(",.2f")(
    Number(formatUnits(summaryTotal, HEX.DECIMALS)) * usdhex
  );
  const percentSummaryGain = format(".3f")(calcPercentGain(stake));
  const percentSummaryAPY = format(".3f")(calcPercentAPY(currentDay, stake));
  //////////////////////////////////////////////////////////////

  //////////////////////////////////////////////////////////////
  /// PREDICTED (EARLY) END STAKE FIGURES ...
  const hexStaked = Math.trunc(Number(formatUnits(stakedHearts, HEX.DECIMALS)));
  const hexPayout = Math.trunc(Number(formatUnits(payout, HEX.DECIMALS)));
  const hexBPD = Math.trunc(Number(formatUnits(bigPayDay, HEX.DECIMALS)));
  const hexPenalty = Math.trunc(Number(formatUnits(penalty, HEX.DECIMALS)));
  const hexNetValue = Math.trunc(
    Number(formatUnits(stakeReturn, HEX.DECIMALS))
  );
  const usdStaked = Number((hexStaked * usdhex).toFixed(2));
  const usdPayout = Number((hexPayout * usdhex).toFixed(2));
  const usdBPD = Number((hexBPD * usdhex).toFixed(2));
  const usdPenalty = Number((hexPenalty * usdhex).toFixed(2));
  const usdNetValue = Number((hexNetValue * usdhex).toFixed(2));
  //////////////////////////////////////////////////////////////

  return (
    <Accordion
      className="my-2"
      defaultActiveKey="0"
      onSelect={(eventKey) => {
        if (eventKey) ReactGA.pageview("/current_stakes/" + eventKey);
      }}
    >
      <Accordion.Item className="bg-dark" eventKey={stake.stakeId.toString()}>
        <Accordion.Header>
          <Container className="p-2">
            <Row>
              <Col xs={6} className="text-start pe-0">
                <CryptoVal
                  className="numeric font-weight-bold text-info h2"
                  value={stakeShares}
                  currency="SHARES"
                />
                <span className="text-muted small"> {t("SHARES")}</span>
              </Col>
              <Col xs={6} className="text-end pl-0">
                <span className="text-muted small">{t("FULL TERM ATP")} </span>
                <span className="numeric h3 text-success">
                  {"$" + usdSummaryTotal}
                </span>
              </Col>
            </Row>
            <Row>
              <Col xs={7} className="pe-0">
                <span className="text-muted small">{t("ENDS")} </span>
                <span className="small">{endDate}</span>
              </Col>
              <Col xs={5} className="text-end pl-0">
                {exitClass === "pendingexit" ? (
                  <Badge className="bg-primary">{t("PENDING")}</Badge>
                ) : (
                  <>
                    <span className="text-muted small">{t("PROGRESS")} </span>
                    <span className="numeric">
                      {Number(progress).toFixed(1) + "%"}
                    </span>
                  </>
                )}
              </Col>
            </Row>
            <div className="pb-1">
              {exitClass === "pendingexit" ? (
                <ProgressBar variant={progressVariant} now={100} striped />
              ) : (
                <ProgressBar
                  variant={progressVariant}
                  now={Math.ceil(Number(progress))}
                />
              )}
            </div>
          </Container>
        </Accordion.Header>
        <Accordion.Collapse eventKey={stake.stakeId.toString()}>
          <Container>
            <Row className="mt-2">
              <Col className="text-end">
                <span className="numeric">{Number(stake.stakedDays)}</span>
                &nbsp;
                <strong>{t("Days")}</strong>
              </Col>
              <Col className="numeric">
                {Number(stake.lockedDay) + 1}&nbsp;{t("to")}&nbsp;
                {Number(stake.endDay) + 1}
              </Col>
            </Row>
            <Row>
              <Col className="text-end">
                <strong>{t("Start Date")}</strong>
              </Col>
              <Col className="numeric">{startDate}</Col>
            </Row>
            <Row>
              <Col className="text-end">
                <strong>{t("End Date")}</strong>
              </Col>
              <Col className="numeric">{endDate}</Col>
            </Row>
            <Row>
              <Col className="text-end">
                <strong>{t("Net Gain")}</strong>
              </Col>
              <Col className="numeric">{percentSummaryGain}%</Col>
            </Row>
            <Row>
              <Col className="text-end">
                <strong>{t("APY")}</strong>
                <span className="text-muted">
                  <sup>TD</sup>
                </span>
              </Col>
              <Col className="numeric">{percentSummaryAPY}%</Col>
            </Row>
            <Row className="mt-3">
              <Col className="text-center" ref={esRef}>
                <Overlay
                  target={esRef.current}
                  container={esRef}
                  placement={"top"}
                  show={esShow}
                >
                  <Popover>
                    <Popover.Body className="p-0">
                      <div id="early-end-stake-alert">
                        <div className="bg-dark text-light p-3">
                          <h2 className="text-danger text-uppercase text-center">
                            {t("EARLY END STAKE")}
                          </h2>
                          <div>
                            <Trans
                              i18nKey="rememberComittment"
                              components={{
                                b: <strong />,
                                i: <em />,
                                u: <u />,
                              }}
                            />
                            <div className="text-light text-uppercase text-center bg-danger mt-2 px-2 py-1">
                              <strong>
                                {t("lose your entire investment!")}
                              </strong>
                            </div>
                          </div>
                          <Button
                            className="mt-3"
                            onClick={() => setEsShow(false)}
                          >
                            {t("CANCEL")}
                          </Button>
                        </div>
                      </div>
                    </Popover.Body>
                  </Popover>
                </Overlay>
                {!props.readOnly && (
                  <>
                    {(!isEarly || esShow) && stake.stakeIndex !== undefined && (
                      <>
                        <StakeEndButton
                          stakeIndex={stake.stakeIndex}
                          stakeId={stake.stakeId}
                          variant={progressVariant}
                          confirmationCallback={() => setEsShow(false)}
                          rejectionCallback={() => setEsShow(false)}
                        >
                          {isEarly ? (
                            <>{t("I UNDERSTAND")}</>
                          ) : (
                            <>{t("END STAKE")}</>
                          )}
                        </StakeEndButton>
                      </>
                    )}
                    {isEarly && !esShow && (
                      <>
                        <Button
                          variant="danger"
                          className={"exitbtn"}
                          onClick={() => setEsShow(true)}
                        >
                          <>{t("EARLY END STAKE")}</>
                        </Button>
                      </>
                    )}
                  </>
                )}
              </Col>
            </Row>
            {/* PREDICTED MINER TERMINATION FIGURES */}
            <Container className="text-light" style={{ marginTop: "2em" }}>
              <h1 className="text-center">FIGURES BELOW ARE INACCURATE</h1>
              <h2 className="text-danger text-center">
                Actual payout / "net value" may be as much as 40%
                <br />
                <strong>LOWER</strong> than the figures shown below!
              </h2>
              <h3>
                WARNING: Excuses, opinions, anger and generally unabashed
                ranting follows! Proceed for comedic or educational purposes
                only.
              </h3>
              <p>
                Richard Heart never released a public testnet version of the HEX
                contract, making testing these things difficult. Evidently,
                despite many hours trying, this developer failed to translate
                the contract's internal math and logic correctly. (Others have
                apparently succeeded.)
              </p>
              <p>
                Also, because Richard Heart did not want people to know how much
                they would be penalized for early terminating stakes — "breaking
                their promise" — (his own words) he chose not to include any
                function in the contract to query this information ahead of
                time. We asked him about this, and he doubled down on his
                decision not to tell people how badly penalized they would be if
                they early terminated a stake. The official go.hex.com user
                interface for the contract doesn't not make any attempt to show
                these figures, to this day. In fact, by my recollection, Mati
                had to apply significant pressure just to get a cryptic warning
                shown. Users used to just get hit with penalties without any
                warning at time of transaction. I <em>tried</em> to mitigate
                this here but evidently just made it worse! :/
              </p>
              <p className="text-info">
                Since everyone in HEX that believed in staking has been royally{" "}
                <a href="https://medium.com/@influencio/decoding-rekt-an-internet-slang-phenomenon-c45e6e5e297d">
                  #rekt
                </a>{" "}
                by everything Richard Heart has done (and not done) since he
                first announced his, "World's Largest Airdrop" Pulsechain
                mistake, I no longer have ANY MONEY or motivation to do anything
                about it.{" "}
                <span className="text-warning">
                  It is my sole opinion that Richard Heart is an unapologetic,
                  self-serving, glory seeking, deceptive psychopath, who should
                  not be trusted for anything, ever.
                </span>
              </p>
              <p>
                Like all psychopaths, he appears to justify his modus operandi
                solely according to his own ends. When he causes harm, he
                cherry-picks and bends facts into narratives to paint himself as
                a good person, no matter what. It's disgusting.
              </p>
              <p>
                I do not buy his cowardly excuses about being gagged by the SEC.
                How bloody convenient! In truth, I am quite certain he realized
                his mistake and found a way to justify leaving it behind for the
                sake of some imagined higher glory.
              </p>
              <p>
                I wrote this app a full year before Mati and I ever met and gave
                it to the community, for free. Sadly, I guess y'all get what you
                pay for. In any case, this is not Mati's fault or
                responsibility. As with everything in this crypto dystopia, you
                have no choice but to proceed — or not — at your own risk.
              </p>
            </Container>{" "}
            <Container
              className="ees-estimate mt-3"
              onClick={() => setEesStatsHEX(!eesStatsHEX)}
            >
              <Row className="text-light">
                <Col style={{ whiteSpace: "nowrap" }}>{t("Staked Amount")}</Col>
                <Col className="ms-3 pe-1 text-end text-info">
                  {eesStatsHEX ? (
                    <span>
                      <CryptoVal value={stakedHearts} currency="HEX" showUnit />
                    </span>
                  ) : (
                    <span>
                      <CryptoVal
                        value={usdStaked}
                        currency="USD"
                        symbol={<>&nbsp;$&nbsp;</>}
                      />
                    </span>
                  )}
                </Col>
              </Row>
              <Row>
                <Col>{t("Yield")}</Col>
                <Col className="ms-3 pe-1 text-end">
                  {eesStatsHEX ? (
                    <span>
                      <CryptoVal value={payout} currency="HEX" showUnit />
                    </span>
                  ) : (
                    <span>
                      <CryptoVal
                        value={usdPayout}
                        currency="USD"
                        symbol={<>&nbsp;$&nbsp;</>}
                      />
                    </span>
                  )}
                </Col>
              </Row>
              {hexBPD > 0 && (
                <Row>
                  <Col>
                    <span className="text-info">Big</span>
                    <span className="text-warning">Pay</span>
                    <span className="text-danger">Day</span>
                  </Col>
                  <Col className="ms-3 pe-1 text-end">
                    {eesStatsHEX ? (
                      <span>
                        <CryptoVal value={bigPayDay} currency="HEX" showUnit />
                      </span>
                    ) : (
                      <span>
                        <CryptoVal
                          value={usdBPD}
                          currency="USD"
                          symbol={<>&nbsp;$&nbsp;</>}
                        />
                      </span>
                    )}
                  </Col>
                </Row>
              )}
              <Row>
                <Col>
                  {t("Penalties")}
                  <sup className="text-danger">&nbsp;*</sup>
                </Col>
                <Col className="ms-3 pe-1 text-end">
                  <span className={penalty > 0n ? "text-danger" : ""}>
                    {eesStatsHEX ? (
                      <span>
                        <CryptoVal
                          value={penalty}
                          currency="HEX"
                          symbol={<>&nbsp;</>}
                          showUnit
                        />
                      </span>
                    ) : (
                      <span>
                        <CryptoVal
                          value={usdPenalty}
                          currency="USD"
                          symbol={<>&nbsp;$&nbsp;</>}
                        />
                      </span>
                    )}
                  </span>
                </Col>
              </Row>
              <Row className="text-success">
                <Col className="text-uppercase">{t("Net Value")}</Col>
                <Col className="ms-3 pe-1 text-end numeric-total">
                  {eesStatsHEX ? (
                    <span>
                      <CryptoVal value={stakeReturn} currency="HEX" showUnit />
                    </span>
                  ) : (
                    <span>
                      <CryptoVal
                        value={usdNetValue}
                        currency="USD"
                        symbol={<>&nbsp;$&nbsp;</>}
                      />
                    </span>
                  )}
                </Col>
              </Row>
              <Row>
                <Col className="text-center text-muted small">
                  {t("tap for")} {!eesStatsHEX ? "HEX" : "dollar"} {t("units")}
                </Col>
              </Row>
            </Container>
            <Container>
              <Row>
                <Col>
                  <ul className="no-bullets text-center">
                    <li>
                      <sup className="text-danger">*&nbsp;</sup>
                      {t("penaltiesApplyWhen")}
                    </li>
                    <li>
                      {t(
                        "All figures are approximate and may change without notice."
                      )}
                    </li>
                  </ul>
                </Col>
              </Row>
            </Container>
            <Row>
              <Col className="text-end text-muted small numeric">
                {stake.stakeId.toString()}
              </Col>
            </Row>
          </Container>
        </Accordion.Collapse>
      </Accordion.Item>
    </Accordion>
  );
};
