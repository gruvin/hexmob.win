import { encodeFunctionData, keccak256, encodePacked, decodeAbiParameters } from 'viem'
import HEX from './hex_contract'
import { StakeEndSimulation } from './lib/Simulate'
import _debug from 'debug'
const debug = _debug('simulate')

export const DEFAULT_TRACE_RPC_URLS: Record<number, string> = {
  1: 'https://eth.drpc.org',
  369: 'https://rpc.pulsechain.com',
  943: 'https://rpc.v4.testnet.pulsechain.com',
}

/* ── Helpers ─────────────────────────────────────────────────── */

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  debug('RPC → %s %s', method, rpcUrl)
  const start = Date.now()
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}: ${response.statusText}`)
  const data = await response.json()
  debug('RPC ← %s (%dms)', method, Date.now() - start)
  if (data.error) throw new Error(`RPC error ${data.error.code}: ${data.error.message}`)
  return data.result
}

/** Storage slot for _balances[address] (mapping at slot 0). */
function balanceOfSlot(addr: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(['address', 'uint256'], [addr, 0n]))
}

/** Find an address entry in a prestateTracer result across multiple key formats. */
function findAddressState(stateObj: Record<string, unknown>, address: `0x${string}`) {
  for (const key of [address.toLowerCase(), address, '0x' + address.slice(2).toLowerCase()]) {
    const entry = stateObj[key]
    if (entry) return entry as { storage?: Record<string, string> }
  }
  const addrNoPrefix = address.toLowerCase().replace('0x', '')
  for (const key of Object.keys(stateObj)) {
    if (key.toLowerCase().replace(/^0x/i, '') === addrNoPrefix) {
      return stateObj[key] as { storage?: Record<string, string> }
    }
  }
  return undefined
}

/** Find a slot value in a storage object across multiple key formats. */
function findStorageValue(storage: Record<string, string>, slot: `0x${string}`): string | undefined {
  const lo = slot.toLowerCase()
  if (storage[lo]) return storage[lo]
  if (storage[slot]) return storage[slot]
  const np = lo.replace('0x', '')
  if (storage[np]) return storage[np]
  if (storage['0x' + np]) return storage['0x' + np]
  const p64 = np.padStart(64, '0')
  if (storage['0x' + p64]) return storage['0x' + p64]
  if (storage[p64]) return storage[p64]
  for (const key of Object.keys(storage)) {
    if (key.toLowerCase().replace(/^0x/, '') === np) return storage[key]
  }
  return undefined
}

function parseHex(raw: string): bigint {
  if (!raw || raw === '0x' || raw === '0x0') return 0n
  return BigInt(raw.startsWith('0x') ? raw : '0x' + raw)
}

function parseSV(raw: string): bigint {
  if (!raw) return 0n
  return BigInt(raw.startsWith('0x') ? raw : '0x' + raw)
}

/* ── Main ────────────────────────────────────────────────────── */

export async function simulateStakeEnd(
  rpcUrl: string,
  stakerAddress: `0x${string}`,
  stakeIndex: number,
  chainId: number = 1,
): Promise<StakeEndSimulation> {
  const hexAddress = HEX.CHAIN_ADDRESSES[chainId] as `0x${string}`
  if (!hexAddress) return fail(`Unsupported chain ID: ${chainId}`)

  // ——— Step 1: Query stake details, currentDay, and balanceOf ———
  // Pin all queries to the same block for consistency.
  debug('Step 1: querying block number and stake data')
  const blockTag = 'latest'

  let blockNumberHex: unknown
  try {
    blockNumberHex = await rpcCall(rpcUrl, 'eth_blockNumber', [])
  } catch {
    // If blockNumber not available, use 'latest' tag directly
  }
  const blockParam = blockNumberHex ? (blockNumberHex as string) : blockTag
  debug('using block %s', blockParam)

  let stakeListsResult: unknown, currentDayHex: unknown, balanceOfHex: unknown
  try {
    [stakeListsResult, currentDayHex, balanceOfHex] = await Promise.all([
      rpcCall(rpcUrl, 'eth_call', [
        { to: hexAddress, data: encodeFunctionData({ abi: HEX.ABI, functionName: 'stakeLists', args: [stakerAddress, BigInt(stakeIndex)] }) },
        blockParam,
      ]),
      rpcCall(rpcUrl, 'eth_call', [
        { to: hexAddress, data: encodeFunctionData({ abi: HEX.ABI, functionName: 'currentDay' }) },
        blockParam,
      ]),
      rpcCall(rpcUrl, 'eth_call', [
        { to: hexAddress, data: encodeFunctionData({ abi: HEX.ABI, functionName: 'balanceOf', args: [stakerAddress] }) },
        blockParam,
      ]),
    ])
  } catch (err) {
    return fail(`eth_call failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const decoded = decodeStakeLists(stakeListsResult as string)
  const { stakeId, stakedHearts, stakeShares, lockedDay, stakedDays, unlockedDay } = decoded

  if (unlockedDay > 0) return fail('Stake has already been ended (unlockedDay > 0)')

  const currentDay = BigInt(currentDayHex as string)
  const currentDayNum = Number(currentDay)
  const balanceBefore = BigInt(balanceOfHex as string)

  if (currentDay < lockedDay) return fail('Stake has not started yet (currentDay < lockedDay)')

  // ——— Step 2: Run debug_traceCall ———
  debug('Step 2: debug_traceCall stakeEnd(%d, %s)', stakeIndex, stakeId)

  const callData = encodeFunctionData({
    abi: HEX.ABI,
    functionName: 'stakeEnd',
    args: [BigInt(stakeIndex), Number(stakeId)],
  })
  const traceParams = { from: stakerAddress, to: hexAddress, data: callData }

  // Step 2a: First, use callTracer to check if the call would revert.
  // Erigon's callTracer clearly reports error/revertReason but has no logs.
  let callTracerResult: Record<string, unknown>
  try {
    callTracerResult = await rpcCall(rpcUrl, 'debug_traceCall', [
      traceParams, blockParam,
      { tracer: 'callTracer' },
    ]) as Record<string, unknown>
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('not available') || msg.includes('does not exist') || msg.includes('not found') || msg.includes('-32601')) {
      return fail('This RPC endpoint does not support debug_traceCall. Try a Geth/Erigon node (e.g. eth.drpc.org for Ethereum mainnet).')
    }
    if (msg.includes('revert') || msg.includes('execution reverted')) {
      return fail(`Contract would revert: ${msg}`)
    }
    return fail(`debug_traceCall error: ${msg}`)
  }

  if (callTracerResult.error || callTracerResult.revertReason) {
    const reason = String(callTracerResult.revertReason || callTracerResult.error)
    debug('Call would revert: %s', reason)
    debug('callTracer keys: %O', Object.keys(callTracerResult))
    return fail(`Contract would revert: ${reason}`)
  }

  // Step 2b: Call didn't revert — now use prestateTracer with diffMode
  // to get both pre and post storage. Only changed slots appear in the diff.
  let tracerOutput: { pre: Record<string, unknown>; post: Record<string, unknown> }
  try {
    tracerOutput = await rpcCall(rpcUrl, 'debug_traceCall', [
      traceParams, blockParam,
      { tracer: 'prestateTracer', tracerConfig: { diffMode: true } },
    ]) as { pre: Record<string, unknown>; post: Record<string, unknown> }
    debug('prestateTracer diffMode: pre keys=%O post keys=%O',
      Object.keys(tracerOutput.pre ?? {}), Object.keys(tracerOutput.post ?? {}))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // diffMode might not be supported — fall back to plain prestateTracer
    debug('diffMode failed (%s), trying plain prestateTracer', msg)
    try {
      const plain = await rpcCall(rpcUrl, 'debug_traceCall', [
        traceParams, blockParam,
        { tracer: 'prestateTracer' },
      ]) as Record<string, unknown>
      debug('prestateTracer keys: %O', Object.keys(plain))
      // Use balanceBefore from eth_call as pre, extract post from plain tracer
      const hexPost = findAddressState(plain, hexAddress)
      if (!hexPost?.storage) {
        return fail('Could not parse prestateTracer output — contract storage missing.')
      }
      const balSlot = balanceOfSlot(stakerAddress)
      const postVal = findStorageValue(hexPost.storage, balSlot)
      debug('balanceOf slot %s: pre=%s (eth_call) post=%s', balSlot, balanceBefore, postVal)
      if (postVal == null) return fail('Could not find balanceOf slot in prestateTracer storage.')
      const balanceAfter = parseSV(postVal)
      return buildResult(stakeId, stakedHearts, stakeShares, lockedDay, stakedDays,
        currentDayNum, balanceBefore, balanceAfter)
    } catch (e2) {
      return fail(`prestateTracer failed: ${e2 instanceof Error ? e2.message : String(e2)}`)
    }
  }

  // ——— Step 3: Extract payout from diffMode — follow prompt's step 4a ———
  // Scan pre state storage for the slot whose value matches balanceBefore (from eth_call).
  // That slot is the balanceOf mapping entry for the staker. Pre→post delta = payout.
  debug('Step 3: scanning diff for balanceOf slot matching pre=%s', balanceBefore)

  const hexPre = findAddressState(tracerOutput.pre, hexAddress)
  const hexPost = findAddressState(tracerOutput.post, hexAddress)

  if (!hexPre?.storage || !hexPost?.storage) {
    debug('diff pre addresses: %O', Object.keys(tracerOutput.pre))
    debug('diff post addresses: %O', Object.keys(tracerOutput.post))
    return fail('Contract storage not found in prestateTracer diff.')
  }

  // Scan for the balanceOf slot. When balanceBefore is 0, the slot may only
  // appear in the post state (tracers often omit zero-valued pre-state slots).
  let preBalance = 0n
  let postBalance = 0n
  let found = false

  // Pass 1: find slot in pre+post where preV === balanceBefore and value changed
  for (const key of Object.keys(hexPre.storage)) {
    const preV = parseHex(hexPre.storage[key])
    if (preV !== balanceBefore) continue
    const postV = hexPost.storage[key] != null ? parseHex(hexPost.storage[key]) : preV
    if (preV === postV) continue
    preBalance = preV
    postBalance = postV
    debug('balanceOf slot %s: %s → %s (Δ=%s)', key, preBalance, postBalance, postBalance - preBalance)
    found = true
    break
  }

  // Pass 2: when balanceBefore=0, the slot only exists in post state
  if (!found && balanceBefore === 0n) {
    for (const key of Object.keys(hexPost.storage)) {
      if (hexPre.storage[key] != null) continue
      const postV = parseHex(hexPost.storage[key])
      if (postV === 0n) continue
      preBalance = 0n
      postBalance = postV
      debug('balanceOf slot %s (post-only): 0 → %s', key, postBalance)
      found = true
      break
    }
  }

  if (!found) {
    debug('pre storage keys: %O', Object.keys(hexPre.storage))
    debug('post storage keys: %O', Object.keys(hexPost.storage))
    return fail(`Could not find balanceOf slot in state diff (balanceBefore=${balanceBefore}).`)
  }

  return buildResult(stakeId, stakedHearts, stakeShares, lockedDay, stakedDays,
    currentDayNum, preBalance, postBalance)
}

function buildResult(
  stakeId: bigint, stakedHearts: bigint, stakeShares: bigint,
  lockedDay: bigint, stakedDays: bigint, currentDayNum: number,
  preBalance: bigint, postBalance: bigint,
): StakeEndSimulation {
  const payout = postBalance - preBalance
  if (payout < 0n) {
    return { ...EMPTY_SIM, error: `Unexpected negative payout (${payout}). Internal revert?` }
  }

  const servedDays = currentDayNum - Number(lockedDay)
  const isMature = servedDays >= Number(stakedDays)

  let penaltyPaid = 0n
  if (!isMature && payout < stakedHearts) {
    penaltyPaid = stakedHearts - payout
  }
  const principalReturned = isMature ? stakedHearts : (payout < stakedHearts ? payout : stakedHearts)
  const dailyInterest = payout > principalReturned ? payout - principalReturned : 0n

  return {
    success: true,
    stakeId: Number(stakeId),
    stakedHearts,
    stakeShares,
    lockedDay: Number(lockedDay),
    stakedDays: Number(stakedDays),
    currentDay: currentDayNum,
    servedDays,
    isMature,
    payout,
    principalReturned,
    penaltyPaid,
    dailyInterest,
    balanceBefore: preBalance,
    balanceAfter: postBalance,
  }
}

/* ── Decode ──────────────────────────────────────────────────── */

function decodeStakeLists(raw: string) {
  // eth_call returns standard ABI-encoded tuple (each field in its own 32-byte word).
  const vals = decodeAbiParameters(
    [
      { type: 'uint40' },
      { type: 'uint72' },
      { type: 'uint72' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'bool' },
    ],
    raw as `0x${string}`,
  )
  return {
    stakeId:      BigInt(vals[0]),
    stakedHearts: BigInt(vals[1]),
    stakeShares:  BigInt(vals[2]),
    lockedDay:    BigInt(vals[3]),
    stakedDays:   BigInt(vals[4]),
    unlockedDay:  BigInt(vals[5]),
    isAutoStake:  vals[6] as boolean,
  }
}

const EMPTY_SIM = {
  success: false, error: '',
  stakeId: 0, stakedHearts: 0n, stakeShares: 0n,
  lockedDay: 0, stakedDays: 0, currentDay: 0,
  servedDays: 0, isMature: false,
  payout: 0n, principalReturned: 0n, penaltyPaid: 0n,
  dailyInterest: 0n, balanceBefore: 0n, balanceAfter: 0n,
} satisfies StakeEndSimulation

function fail(error: string): StakeEndSimulation {
  return { ...EMPTY_SIM, error }
}
