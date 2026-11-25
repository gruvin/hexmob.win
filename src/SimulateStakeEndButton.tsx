import React, { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from 'react-bootstrap/Button'
import Spinner from 'react-bootstrap/Spinner'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFlask, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'

import { HexContext } from './Context'
import { StakeData } from './lib/Stakes'
import { StakeEndSimulation } from './lib/Simulate'
import { simulateStakeEnd, DEFAULT_TRACE_RPC_URLS } from './simulateStakeEnd'
import { CryptoVal } from './Widgets'
import _debug from 'debug'
const debug = _debug('SimBtn')

const uriQuery = new URLSearchParams(window.location.search)
const simEnabled = uriQuery.get('sim') === '1'

interface Props {
  stake: StakeData
}

export const SimulateStakeEndButton: React.FC<Props> = ({ stake }) => {
  const { t } = useTranslation()
  const hexData = useContext(HexContext)
  const chainId = hexData?.chainId || 0
  const walletAddress = hexData?.walletAddress

  const [simState, setSimState] = useState<'idle' | 'loading' | 'result' | 'error'>('idle')
  const [result, setResult] = useState<StakeEndSimulation | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!walletAddress || !chainId || stake.stakeIndex === undefined) return null
  if (!simEnabled) return null

  const rpcUrl = DEFAULT_TRACE_RPC_URLS[chainId]
  if (!rpcUrl) return null

  const handleSimulate = async () => {
    setSimState('loading')
    setResult(null)
    setErrorMsg('')

    try {
      debug('simulating stakeEnd for stake %s idx %s', stake.stakeId, stake.stakeIndex)
      const res = await simulateStakeEnd(
        rpcUrl,
        walletAddress as `0x${string}`,
        Number(stake.stakeIndex),
        chainId,
      )
      if (res.success) {
        setResult(res)
        setSimState('result')
      } else {
        setErrorMsg(res.error || 'Unknown error')
        setSimState('error')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
      setSimState('error')
    }
  }

  const handleReset = () => {
    setSimState('idle')
    setResult(null)
    setErrorMsg('')
  }

  return (
    <div className="simulate-stake-end mt-2">
      {simState === 'idle' && (
        <Button
          variant="outline-info"
          size="sm"
          className="simulatebtn w-100"
          onClick={handleSimulate}
        >
          <FontAwesomeIcon icon={faFlask} className="me-1" />
          {t('simulate')}
        </Button>
      )}

      {simState === 'loading' && (
        <Button variant="outline-info" size="sm" className="simulatebtn w-100" disabled>
          <Spinner animation="border" size="sm" className="me-2" />
          {t('simulating')}
        </Button>
      )}

      {simState === 'error' && (
        <div className="simulate-result text-center">
          <div className="text-warning small mt-1">
            <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
            {errorMsg}
          </div>
          <Button
            variant="outline-secondary"
            size="sm"
            className="mt-1"
            onClick={handleReset}
          >
            {t('tryAgain')}
          </Button>
        </div>
      )}

      {simState === 'result' && result && (
        <div className="simulate-result mt-2 p-2 bg-dark rounded small">
          <div className="text-info text-center fw-bold mb-1">
            <FontAwesomeIcon icon={faFlask} className="me-1" />
            {t('simulationResult')}
          </div>
          <Row>
            <Col className="text-end pe-0">{t('payout')}:</Col>
            <Col>
              <CryptoVal value={result.payout} currency="HEX" showUnit />
            </Col>
          </Row>
          <Row>
            <Col className="text-end pe-0">{t('balanceChange')}:</Col>
            <Col>
              <span className="text-muted small">
                <CryptoVal value={result.balanceBefore} currency="HEX" showUnit />
                {' → '}
              </span>
              <CryptoVal value={result.balanceAfter} currency="HEX" showUnit />
            </Col>
          </Row>
          {result.penaltyPaid > 0n && (
            <Row>
              <Col className="text-end pe-0 text-danger">{t('penaltyEstimate')}:</Col>
              <Col className="text-danger">
                <CryptoVal value={result.penaltyPaid} currency="HEX" showUnit />
              </Col>
            </Row>
          )}
          <Row>
            <Col className="text-end pe-0 text-muted">{t('served')}:</Col>
            <Col className="text-muted">
              {result.servedDays} / {result.stakedDays} {t('days')}
            </Col>
          </Row>
          <div className="text-center text-muted small mt-1">
            {t('simulationDisclaimer')}
          </div>
          <div className="text-center mt-1">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleReset}
            >
              {t('simulateAgain')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
