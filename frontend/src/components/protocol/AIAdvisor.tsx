import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { DataTag } from '@/components/system'
import type { PoolState, UserStatus, VrfStatus } from '@/lib/types'

// ════════════════════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════════════════════

interface AIAdvisorProps {
  pools: { micro: PoolState | null; mid: PoolState | null; mega: PoolState | null }
  userStatus: UserStatus | null
  vrfStatus: VrfStatus | null
  readyPools: string[]
  isConnected: boolean
  vrfPending: boolean
}

type PoolKey = 'micro' | 'mid' | 'mega'
type TabKey = 'signals' | 'decision' | 'analysis'
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
type Delta = 'improving' | 'worsening' | 'stable'

interface Signal {
  id: string
  severity: Severity
  title: string
  body: string
  confidence: number
  delta: Delta
  affectedPools: PoolKey[]
  metric?: string
}

interface PoolScore {
  pool: PoolKey
  ev: number
  evPerEntry: number
  crowding: number        // 0-100, higher = more crowded
  entryQuality: number    // 0-100
  risk: number            // 0-100
  winProbPct: number
  costEth: number
  tvlShare: number
  fillRate: number
  readiness: number       // 0-100
  riskReward: number      // ratio
  rank: number
}

interface CompositeScores {
  entryQuality: number
  overcrowdingPressure: number
  triggerProximity: number
  opportunityStability: number
  riskAsymmetry: number
  evMomentum: number
}

interface ActionRecommendation {
  action: string
  pool: PoolKey | null
  confidence: number
  urgency: number         // 0-100
  risk: number            // 0-100
  timeSensitivity: 'immediate' | 'minutes' | 'hours' | 'days' | 'none'
  reasons: string[]
  invalidationConditions: string[]
}

interface Scenario {
  label: string
  description: string
  results: { pool: PoolKey; newEv: number; newRank: number; delta: string }[]
}

// ════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════════════

const POOL_LABELS: Record<PoolKey, string> = { micro: 'MICRO', mid: 'MID', mega: 'MEGA' }
const POOL_TIMERS: Record<PoolKey, number> = { micro: 7200, mid: 21600, mega: 604800 }
const MAX_ENTRIES = 3
const SEVERITY_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-accent',
  high: 'text-mega',
  medium: 'text-mid',
  low: 'text-text-primary',
  info: 'text-text-dim',
}

const SEVERITY_BORDER: Record<Severity, string> = {
  critical: '#e040c0',
  high: '#ff40a0',
  medium: '#7020A0',
  low: '#d0e8ff',
  info: 'rgba(160,64,255,0.3)',
}

const SEVERITY_MARKERS: Record<Severity, string> = {
  critical: '!!',
  high: '!',
  medium: '--',
  low: '  ',
  info: '..',
}

const DELTA_MARKERS: Record<Delta, string> = {
  improving: String.fromCharCode(9650),   // ▲
  worsening: String.fromCharCode(9660),   // ▼
  stable: String.fromCharCode(9679),      // ●
}

const DELTA_COLORS: Record<Delta, string> = {
  improving: 'text-accent',
  worsening: 'text-mega',
  stable: 'text-text-muted',
}

// ════════════════════════════════════════════════════════════════════
//  SCORING ENGINE
// ════════════════════════════════════════════════════════════════════

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v))
}

function calcEv(pool: PoolState): number {
  if (pool.participants === 0 || pool.entryReqEth === 0) return 0
  return pool.balanceEth / pool.participants - pool.entryReqEth
}

function calcEvPerEntry(pool: PoolState): number {
  if (pool.participants === 0) return 0
  return pool.balanceEth / pool.participants
}

function calcWinProb(pool: PoolState): number {
  if (pool.participants === 0) return 0
  return 100 / pool.participants
}

function calcCrowding(pool: PoolState): number {
  // 0 = empty, 100 = heavily crowded
  // Scale: 1 player = 0, 20+ players = 100
  return clamp(pool.participants * 5)
}

function calcFillRate(pool: PoolState): number {
  return pool.thresholdEth > 0 ? clamp((pool.balanceEth / pool.thresholdEth) * 100) : 0
}

function calcTimeUsedPct(pool: PoolState, key: PoolKey): number {
  const dur = POOL_TIMERS[key]
  if (dur === 0) return 0
  return clamp(((dur - pool.timeLeft) / dur) * 100)
}

function calcReadiness(pool: PoolState, key: PoolKey): number {
  if (pool.isReady) return 100
  const fillScore = calcFillRate(pool)
  const timeScore = calcTimeUsedPct(pool, key)
  // Readiness: weighted combination of fill and time progress
  return clamp(fillScore * 0.6 + timeScore * 0.4)
}

function calcEntryQuality(pool: PoolState, key: PoolKey): number {
  const ev = calcEv(pool)
  const evComponent = pool.entryReqEth > 0 ? clamp((ev / pool.entryReqEth + 1) * 50) : 50
  const crowdingInverse = 100 - calcCrowding(pool)
  const readiness = calcReadiness(pool, key)
  const winProb = clamp(calcWinProb(pool))
  return clamp(Math.round(evComponent * 0.35 + crowdingInverse * 0.25 + readiness * 0.2 + winProb * 0.2))
}

function calcRiskScore(pool: PoolState, _key: PoolKey): number {
  const crowding = calcCrowding(pool)
  const negEv = calcEv(pool) < 0 ? 30 : 0
  const lowBalance = pool.balanceEth < 0.01 ? 20 : 0
  const timeRisk = pool.timeLeft < 300 && !pool.isReady ? 15 : 0
  return clamp(crowding * 0.4 + negEv + lowBalance + timeRisk)
}

function calcRiskReward(pool: PoolState): number {
  if (pool.entryReqEth === 0 || pool.participants === 0) return 0
  return pool.balanceEth / pool.participants / pool.entryReqEth
}

function scorePool(pool: PoolState, key: PoolKey, tvl: number): PoolScore {
  return {
    pool: key,
    ev: calcEv(pool),
    evPerEntry: calcEvPerEntry(pool),
    crowding: calcCrowding(pool),
    entryQuality: calcEntryQuality(pool, key),
    risk: calcRiskScore(pool, key),
    winProbPct: calcWinProb(pool),
    costEth: pool.entryReqEth,
    tvlShare: tvl > 0 ? (pool.balanceEth / tvl) * 100 : 0,
    fillRate: calcFillRate(pool),
    readiness: calcReadiness(pool, key),
    riskReward: calcRiskReward(pool),
    rank: 0,
  }
}

function rankPools(scores: PoolScore[]): PoolScore[] {
  const sorted = [...scores].sort((a, b) => {
    // Primary: entry quality descending
    const qualDiff = b.entryQuality - a.entryQuality
    if (Math.abs(qualDiff) > 5) return qualDiff
    // Secondary: EV descending
    return b.ev - a.ev
  })
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }))
}

function calcCompositeScores(
  pools: { micro: PoolState; mid: PoolState; mega: PoolState },
  scores: PoolScore[],
): CompositeScores {
  const m = pools.micro, d = pools.mid, g = pools.mega
  const best = scores.reduce((a, b) => a.entryQuality > b.entryQuality ? a : b)

  // Entry Quality: best pool's entry quality
  const entryQuality = best.entryQuality

  // Overcrowding Pressure: average crowding across pools
  const overcrowdingPressure = clamp(Math.round(
    scores.reduce((s, p) => s + p.crowding, 0) / scores.length,
  ))

  // Trigger Proximity: how close any pool is to executing
  const triggerProximity = clamp(Math.max(
    ...scores.map(s => s.readiness),
  ))

  // Opportunity Stability: inverse of variance in entry quality
  const mean = scores.reduce((s, p) => s + p.entryQuality, 0) / scores.length
  const variance = scores.reduce((s, p) => s + (p.entryQuality - mean) ** 2, 0) / scores.length
  const opportunityStability = clamp(100 - Math.sqrt(variance) * 2)

  // Risk Asymmetry: difference between best reward and worst risk
  const bestRR = Math.max(...scores.map(s => s.riskReward))
  const worstRisk = Math.max(...scores.map(s => s.risk))
  const riskAsymmetry = clamp(Math.round(bestRR * 10 + (100 - worstRisk) * 0.3))

  // EV Momentum: based on fill rate trends and readiness
  const avgFill = (m.fillPct + d.fillPct + g.fillPct) / 3
  const readyBoost = [m, d, g].filter(p => p.isReady).length * 25
  const evMomentum = clamp(Math.round(avgFill * 0.6 + readyBoost + triggerProximity * 0.2))

  return { entryQuality, overcrowdingPressure, triggerProximity, opportunityStability, riskAsymmetry, evMomentum }
}

// ════════════════════════════════════════════════════════════════════
//  SIGNAL GENERATOR
// ════════════════════════════════════════════════════════════════════

function generateSignals(
  pools: { micro: PoolState; mid: PoolState; mega: PoolState },
  userStatus: UserStatus | null,
  vrfStatus: VrfStatus | null,
  readyPools: string[],
  vrfPending: boolean,
  _scores: PoolScore[],
): Signal[] {
  const sigs: Signal[] = []
  const m = pools.micro, d = pools.mid, g = pools.mega
  const entries: [PoolKey, PoolState][] = [['micro', m], ['mid', d], ['mega', g]]

  // ── CYCLE READY ──
  if (readyPools.length > 0) {
    const keys = readyPools.map(n => n.toLowerCase() as PoolKey)
    const totalPayout = keys.reduce((s, k) => s + (pools[k]?.balanceEth ?? 0), 0)
    sigs.push({
      id: 'cycle-ready',
      severity: 'critical',
      title: `CYCLE LOADED -- ${readyPools.join(' + ')}`,
      body: `${totalPayout.toFixed(4)} ETH pending. Execute now → VRF fires → winner picked.`,
      confidence: 97,
      delta: 'stable',
      affectedPools: keys,
      metric: `${totalPayout.toFixed(4)} ETH`,
    })
  }

  // ── VRF PENDING ──
  if (vrfPending) {
    const pending: PoolKey[] = []
    if (vrfStatus?.microPending) pending.push('micro')
    if (vrfStatus?.midPending) pending.push('mid')
    if (vrfStatus?.megaPending) pending.push('mega')
    sigs.push({
      id: 'vrf-pending',
      severity: 'high',
      title: 'VRF IN FLIGHT',
      body: `Chainlink VRF processing for ${pending.map(k => POOL_LABELS[k]).join(', ') || 'unknown pool'}. Awaiting callback. 24h fallback if no response.`,
      confidence: 92,
      delta: 'stable',
      affectedPools: pending.length > 0 ? pending : ['micro'],
    })
  }

  // ── NEGATIVE EV WARNING ──
  for (const [key, pool] of entries) {
    const ev = calcEv(pool)
    if (ev < 0 && pool.participants >= 3) {
      const evPct = pool.entryReqEth > 0 ? (ev / pool.entryReqEth * 100) : 0
      sigs.push({
        id: `neg-ev-${key}`,
        severity: pool.participants >= 10 ? 'high' : 'medium',
        title: `CROWD THICK -- ${POOL_LABELS[key]}`,
        body: `${pool.participants} in the pool. EV: ${ev.toFixed(4)} ETH (${evPct.toFixed(0)}% of entry). Heavy crowd, weak edge.`,
        confidence: clamp(60 + pool.participants * 3),
        delta: 'worsening',
        affectedPools: [key],
        metric: `${ev.toFixed(4)} ETH`,
      })
    }
  }

  // ── LOW COMPETITION OPPORTUNITY ──
  for (const [key, pool] of entries) {
    if (pool.participants > 0 && pool.participants <= 3 && pool.balanceEth > 0.001) {
      const rr = calcRiskReward(pool)
      sigs.push({
        id: `low-comp-${key}`,
        severity: 'medium',
        title: `STILL CLEAN -- ${POOL_LABELS[key]}`,
        body: `Only ${pool.participants} in. Win odds ${calcWinProb(pool).toFixed(1)}% per entry. Risk/reward: ${rr.toFixed(1)}x. Lane not crowded yet.`,
        confidence: 78,
        delta: pool.participants === 1 ? 'improving' : 'stable',
        affectedPools: [key],
        metric: `${rr.toFixed(1)}x`,
      })
    }
  }

  // ── TIMER SNIPER WINDOW ──
  for (const [key, pool] of entries) {
    if (pool.timeLeft > 0 && pool.timeLeft < 600 && !pool.isReady && pool.balanceEth > 0.001) {
      const mins = Math.floor(pool.timeLeft / 60)
      const secs = pool.timeLeft % 60
      sigs.push({
        id: `sniper-${key}`,
        severity: 'medium',
        title: `WINDOW CLOSING -- ${POOL_LABELS[key]}`,
        body: `${mins}m${secs.toFixed(0)}s left. Late entry — less time exposed to new crowd. Pool at ${pool.balanceEth.toFixed(4)} ETH.`,
        confidence: 83,
        delta: 'worsening',
        affectedPools: [key],
        metric: `${mins}m${secs.toFixed(0)}s`,
      })
    }
  }

  // ── THRESHOLD PREDICTION ──
  for (const [key, pool] of entries) {
    if (key === 'mega') continue
    const dur = POOL_TIMERS[key]
    if (pool.thresholdEth <= 0) continue
    const fillPct = pool.balanceEth / pool.thresholdEth
    const timeUsed = dur > 0 ? (dur - pool.timeLeft) / dur : 0
    if (fillPct >= 0.85 && fillPct < 1) {
      sigs.push({
        id: `near-threshold-${key}`,
        severity: 'medium',
        title: `THRESHOLD CLOSE -- ${POOL_LABELS[key]}`,
        body: `${(fillPct * 100).toFixed(1)}% filled. Target: ${pool.thresholdEth.toFixed(4)} ETH. Trigger doubles threshold next cycle.`,
        confidence: 75,
        delta: 'improving',
        affectedPools: [key],
        metric: `${(fillPct * 100).toFixed(1)}%`,
      })
    } else if (timeUsed > 0.6 && fillPct < 0.4) {
      sigs.push({
        id: `timeout-predict-${key}`,
        severity: 'low',
        title: `COOLING OFF -- ${POOL_LABELS[key]}`,
        body: `${(fillPct * 100).toFixed(0)}% fill at ${(timeUsed * 100).toFixed(0)}% time. Threshold cuts to ${(pool.thresholdEth / 2).toFixed(4)} ETH next cycle. Patience edge remains.`,
        confidence: 62,
        delta: 'stable',
        affectedPools: [key],
      })
    }
  }

  // ── SELL WARNING ──
  if (userStatus) {
    const total = userStatus.microEntries + userStatus.midEntries + userStatus.megaEntries
    if (total > 0) {
      const atRisk: PoolKey[] = []
      if (userStatus.microEntries > 0) atRisk.push('micro')
      if (userStatus.midEntries > 0) atRisk.push('mid')
      if (userStatus.megaEntries > 0) atRisk.push('mega')
      sigs.push({
        id: 'sell-revoke',
        severity: 'high',
        title: 'SELL REVOKES ALL ENTRIES',
        body: `${total} active entries across ${atRisk.map(k => POOL_LABELS[k]).join(', ')}. Any token sale revokes every entry immediately.`,
        confidence: 100,
        delta: 'stable',
        affectedPools: atRisk,
        metric: `${total} entries`,
      })
    }
  }

  // ── ELIGIBILITY GAP ──
  if (userStatus && (
    !userStatus.microEligible || !userStatus.midEligible || !userStatus.megaEligible
  )) {
    const ineligible: PoolKey[] = []
    if (!userStatus.microEligible) ineligible.push('micro')
    if (!userStatus.midEligible) ineligible.push('mid')
    if (!userStatus.megaEligible) ineligible.push('mega')
    sigs.push({
      id: 'eligibility-gap',
      severity: 'low',
      title: 'ELIGIBILITY RESTRICTED',
      body: `Ineligible for ${ineligible.map(k => POOL_LABELS[k]).join(', ')}. Requires 10,000+ tokens and pool-specific conditions.`,
      confidence: 95,
      delta: 'stable',
      affectedPools: ineligible,
    })
  }

  // ── VRF BUFFER LOW ──
  if (vrfStatus && vrfStatus.bufferEth < 0.05 && vrfStatus.bufferEth > 0) {
    sigs.push({
      id: 'vrf-buffer-low',
      severity: 'low',
      title: 'VRF BUFFER DEPLETING',
      body: `${vrfStatus.bufferEth.toFixed(4)} ETH remaining in VRF buffer. Below 0.05 ETH threshold. 7-day stale reroute may activate.`,
      confidence: 70,
      delta: 'worsening',
      affectedPools: ['micro', 'mid', 'mega'],
    })
  }

  // ── EMPTY POOLS ──
  const emptyPools = entries.filter(([, p]) => p.participants === 0 && p.balanceEth > 0.001)
  if (emptyPools.length > 0) {
    sigs.push({
      id: 'empty-pools',
      severity: 'medium',
      title: `EMPTY LANE -- ${emptyPools.map(([k]) => POOL_LABELS[k]).join(' + ')}`,
      body: `Nobody in. First entry owns the entire pool this cycle. TVL: ${emptyPools.map(([, p]) => p.balanceEth.toFixed(4)).join(' / ')} ETH.`,
      confidence: 90,
      delta: 'improving',
      affectedPools: emptyPools.map(([k]) => k),
    })
  }

  // ── MAX ENTRIES USED ──
  if (userStatus) {
    const maxedPools: PoolKey[] = []
    if (userStatus.microEntries >= MAX_ENTRIES) maxedPools.push('micro')
    if (userStatus.midEntries >= MAX_ENTRIES) maxedPools.push('mid')
    if (userStatus.megaEntries >= MAX_ENTRIES) maxedPools.push('mega')
    if (maxedPools.length > 0) {
      sigs.push({
        id: 'max-entries',
        severity: 'info',
        title: `MAX ENTRIES -- ${maxedPools.map(k => POOL_LABELS[k]).join(' + ')}`,
        body: `${MAX_ENTRIES}/${MAX_ENTRIES} entries used this cycle. No additional entries possible until cycle resets.`,
        confidence: 100,
        delta: 'stable',
        affectedPools: maxedPools,
      })
    }
  }

  // ── WHALE EXCLUSION — contract: TOTAL_SUPPLY/33 = 3% supply excludes from Micro ──
  if (userStatus && userStatus.tokenBalanceFormatted > 100_000_000 * 0.03) {
    sigs.push({
      id: 'whale-exclusion',
      severity: 'high',
      title: 'WHALE EXCLUSION ACTIVE',
      body: `Balance >3% supply. Micro pool excluded per anti-whale rule.`,
      confidence: 100,
      delta: 'stable',
      affectedPools: ['micro'],
      metric: 'Micro excluded',
    })
  }

  // ── RE-ENROLLMENT AVAILABLE — contract: reEnroll(address) permissionless ──
  if (userStatus && !userStatus.microEligible && !userStatus.midEligible && !userStatus.megaEligible && userStatus.tokenBalanceFormatted >= 10000) {
    sigs.push({
      id: 're-enroll',
      severity: 'medium',
      title: 'RE-ENROLLMENT AVAILABLE',
      body: `${userStatus.tokenBalanceFormatted.toLocaleString()} tokens held but ineligible. Call reEnroll() — permissionless, anyone can trigger.`,
      confidence: 88,
      delta: 'stable',
      affectedPools: ['micro', 'mid', 'mega'],
    })
  }

  // ── EMERGENCY FALLBACK WINDOW — contract: 24h VRF timeout ──
  if (vrfPending && vrfStatus) {
    sigs.push({
      id: 'emergency-fallback',
      severity: 'low',
      title: 'EMERGENCY FALLBACK AVAILABLE',
      body: `24h VRF timeout → emergencyForceAllocation() unlocks. On-chain entropy fallback. Permissionless.`,
      confidence: 65,
      delta: 'stable',
      affectedPools: ['micro', 'mid', 'mega'],
    })
  }

  // ── OPTIMAL ENTRY TIMING — based on fill rate and timer state ──
  for (const [key, pool] of entries) {
    if (key === 'mega') continue
    const dur = POOL_TIMERS[key]
    const timeUsed = dur > 0 ? (dur - pool.timeLeft) / dur : 0
    const fillPct = pool.thresholdEth > 0 ? pool.balanceEth / pool.thresholdEth : 0
    // If timer >80% elapsed and fill <50%, threshold will halve — better to wait
    if (timeUsed > 0.8 && fillPct < 0.5 && !pool.isReady) {
      sigs.push({
        id: `wait-for-halve-${key}`,
        severity: 'low',
        title: `PATIENCE EDGE -- ${POOL_LABELS[key]}`,
        body: `Timer ${(timeUsed * 100).toFixed(0)}% elapsed with only ${(fillPct * 100).toFixed(0)}% fill. Smart Ladder will halve threshold from ${pool.thresholdEth.toFixed(4)} to ${(pool.thresholdEth / 2).toFixed(4)} ETH next cycle. Waiting may yield better entry conditions.`,
        confidence: 70,
        delta: 'improving',
        affectedPools: [key],
      })
    }
  }

  // ── AUTO-SWAP PROXIMITY — contract: 120K token threshold ──
  {
    const swapRatio = m.participants > 0 ? 0 : 0 // placeholder — actual swap buffer from meta
    void swapRatio
  }

  // Sort: severity desc, then confidence desc
  sigs.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
    if (sevDiff !== 0) return sevDiff
    return b.confidence - a.confidence
  })

  if (sigs.length === 0) {
    sigs.push({
      id: 'no-signals',
      severity: 'info',
      title: 'ALL CLEAR',
      body: 'Pools building normally. No triggers, no urgency. Watch fill rates and timer progression.',
      confidence: 50,
      delta: 'stable',
      affectedPools: ['micro', 'mid', 'mega'],
    })
  }

  return sigs
}

// ════════════════════════════════════════════════════════════════════
//  DECISION ENGINE
// ════════════════════════════════════════════════════════════════════

function generateDecision(
  pools: { micro: PoolState; mid: PoolState; mega: PoolState },
  scores: PoolScore[],
  readyPools: string[],
  userStatus: UserStatus | null,
  vrfPending: boolean,
): ActionRecommendation {
  const ranked = rankPools(scores)
  const best = ranked[0]

  // Priority 1: Execute ready cycle
  if (readyPools.length > 0 && !vrfPending) {
    const keys = readyPools.map(n => n.toLowerCase() as PoolKey)
    const totalPayout = keys.reduce((s, k) => s + pools[k].balanceEth, 0)
    return {
      action: `EXECUTE CYCLE -- ${readyPools.join(' + ')}`,
      pool: keys[0],
      confidence: 95,
      urgency: 95,
      risk: 5,
      timeSensitivity: 'immediate',
      reasons: [
        `${totalPayout.toFixed(4)} ETH pending distribution`,
        'VRF call initiates winner selection',
        'Delay allows competitor entries to dilute odds',
        readyPools.length > 1 ? 'Multiple pools executable in single transaction' : 'Single pool ready',
      ],
      invalidationConditions: [
        'VRF already pending (another caller executed first)',
        'Pool balance drained to 0',
        'Cycle ID incremented (already executed)',
      ],
    }
  }

  // Priority 2: VRF pending -- wait
  if (vrfPending) {
    return {
      action: 'HOLD -- AWAIT VRF CALLBACK',
      pool: null,
      confidence: 90,
      urgency: 10,
      risk: 5,
      timeSensitivity: 'minutes',
      reasons: [
        'Chainlink VRF request in flight',
        'Winner selection depends on random callback',
        '24h emergency fallback if VRF fails',
        'No entry action changes outcome of pending draw',
      ],
      invalidationConditions: [
        'VRF callback received (new cycle begins)',
        '24h timeout triggers emergency draw',
        'VRF buffer depleted (stale reroute)',
      ],
    }
  }

  // Priority 3: Strong entry opportunity
  if (best.entryQuality >= 70 && best.ev > 0) {
    const pool = pools[best.pool]
    const canEnter = userStatus
      ? (best.pool === 'micro' ? userStatus.microEntries < MAX_ENTRIES && userStatus.microEligible
        : best.pool === 'mid' ? userStatus.midEntries < MAX_ENTRIES && userStatus.midEligible
        : userStatus.megaEntries < MAX_ENTRIES && userStatus.megaEligible)
      : true
    return {
      action: canEnter ? `ENTER ${POOL_LABELS[best.pool]}` : `TARGET ${POOL_LABELS[best.pool]} (INELIGIBLE)`,
      pool: best.pool,
      confidence: clamp(Math.round(best.entryQuality * 0.8 + (best.ev > 0 ? 20 : 0))),
      urgency: clamp(Math.round(best.readiness * 0.6 + (100 - best.crowding) * 0.4)),
      risk: best.risk,
      timeSensitivity: pool.timeLeft < 600 ? 'minutes' : pool.timeLeft < 3600 ? 'hours' : 'days',
      reasons: [
        `Entry quality: ${best.entryQuality}/100`,
        `+EV: ${best.ev.toFixed(4)} ETH per entry`,
        `Win probability: ${best.winProbPct.toFixed(1)}%`,
        `Risk/reward ratio: ${best.riskReward.toFixed(1)}x`,
        best.crowding < 30 ? 'Low crowding advantage' : `Crowding: ${best.crowding}/100`,
      ],
      invalidationConditions: [
        `${Math.ceil((100 - best.crowding) / 20)} more entrants would shift EV negative`,
        'Cycle execution resets participant count',
        'Token sale revokes all entries',
        `Entry cost changes: currently ${best.costEth.toFixed(4)} ETH`,
      ],
    }
  }

  // Priority 4: Wait for better conditions
  const bestReady = ranked.find(s => pools[s.pool].isNearThreshold)
  return {
    action: bestReady ? `MONITOR ${POOL_LABELS[bestReady.pool]} -- NEAR TRIGGER` : 'WAIT -- NO STRONG EDGE',
    pool: bestReady?.pool ?? null,
    confidence: 55,
    urgency: bestReady ? 40 : 15,
    risk: 10,
    timeSensitivity: bestReady ? 'hours' : 'none',
    reasons: [
      `Best entry quality: ${best.entryQuality}/100 (below 70 threshold)`,
      best.ev <= 0 ? 'No pool has positive EV' : `Marginal EV: ${best.ev.toFixed(4)} ETH`,
      `Average crowding: ${Math.round(scores.reduce((s, p) => s + p.crowding, 0) / 3)}/100`,
      bestReady ? `${POOL_LABELS[bestReady.pool]} approaching threshold trigger` : 'No pools near threshold',
    ],
    invalidationConditions: [
      'New cycle resets conditions',
      'Large buy increases pool balances',
      'Participant exits improve odds',
      'Threshold trigger changes pool dynamics',
    ],
  }
}

// ════════════════════════════════════════════════════════════════════
//  SCENARIO ENGINE
// ════════════════════════════════════════════════════════════════════

function generateScenarios(
  pools: { micro: PoolState; mid: PoolState; mega: PoolState },
  _scores: PoolScore[],
): Scenario[] {
  const scenarios: Scenario[] = []
  const poolEntries: [PoolKey, PoolState][] = [['micro', pools.micro], ['mid', pools.mid], ['mega', pools.mega]]

  // Scenario: +1 player enters each pool
  const addPlayerResults = poolEntries.map(([key, pool]) => {
    const newParts = pool.participants + 1
    const newEv = newParts > 0 ? pool.balanceEth / newParts - pool.entryReqEth : 0
    const currentEv = calcEv(pool)
    const delta = newEv - currentEv
    return { pool: key, newEv, newRank: 0, delta: `${delta >= 0 ? '+' : ''}${delta.toFixed(4)} ETH` }
  })
  // Rank by new EV
  addPlayerResults.sort((a, b) => b.newEv - a.newEv)
  addPlayerResults.forEach((r, i) => { r.newRank = i + 1 })
  scenarios.push({
    label: '+1 PLAYER PER POOL',
    description: 'If one additional participant enters each pool',
    results: addPlayerResults,
  })

  // Scenario: Cycle executes now on highest-fill pool
  const bestFill = poolEntries.reduce((a, b) => a[1].fillPct > b[1].fillPct ? a : b)
  const postCycleResults = poolEntries.map(([key, pool]) => {
    if (key === bestFill[0]) {
      // Pool resets
      return { pool: key, newEv: 0, newRank: 3, delta: 'RESET' }
    }
    // Others unaffected
    const ev = calcEv(pool)
    return { pool: key, newEv: ev, newRank: 0, delta: `${ev >= 0 ? '+' : ''}${ev.toFixed(4)} ETH` }
  })
  const activePostCycle = postCycleResults.filter(r => r.delta !== 'RESET').sort((a, b) => b.newEv - a.newEv)
  activePostCycle.forEach((r, i) => { r.newRank = i + 1 })
  const resetItem = postCycleResults.find(r => r.delta === 'RESET')
  if (resetItem) resetItem.newRank = 3
  scenarios.push({
    label: `${POOL_LABELS[bestFill[0]]} EXECUTES`,
    description: `If ${POOL_LABELS[bestFill[0]]} cycle triggers now (highest fill)`,
    results: postCycleResults,
  })

  // Scenario: Threshold halves on ladder pools
  const ladderResults = poolEntries.map(([key, pool]) => {
    if (key === 'mega') {
      return { pool: key, newEv: calcEv(pool), newRank: 0, delta: 'UNCHANGED' }
    }
    const newThreshold = pool.thresholdEth / 2
    const newFill = newThreshold > 0 ? pool.balanceEth / newThreshold : 0
    const ev = calcEv(pool)
    return {
      pool: key,
      newEv: ev,
      newRank: 0,
      delta: newFill >= 1 ? 'TRIGGERS IMMEDIATELY' : `Fill ${(newFill * 100).toFixed(0)}%`,
    }
  })
  ladderResults.sort((a, b) => b.newEv - a.newEv)
  ladderResults.forEach((r, i) => { r.newRank = i + 1 })
  scenarios.push({
    label: 'THRESHOLD HALVES',
    description: 'If Micro/Mid timeout and Smart Ladder halves thresholds',
    results: ladderResults,
  })

  return scenarios
}

// ════════════════════════════════════════════════════════════════════
//  DYNAMIC QUESTIONS
// ════════════════════════════════════════════════════════════════════

function generateQuestions(
  pools: { micro: PoolState; mid: PoolState; mega: PoolState },
  scores: PoolScore[],
  userStatus: UserStatus | null,
  readyPools: string[],
): string[] {
  const qs: string[] = []
  const ranked = rankPools(scores)
  const best = ranked[0]

  if (readyPools.length > 0) {
    qs.push(`Why is ${readyPools[0]} ready but not yet executed?`)
    qs.push('Should I execute the cycle or let someone else pay the gas?')
  }

  if (best.ev > 0 && best.crowding < 40) {
    qs.push(`Is the low crowding in ${POOL_LABELS[best.pool]} sustainable or will it spike?`)
  }

  if (best.ev < 0) {
    qs.push('All pools have negative EV -- when does the math improve?')
  }

  if (userStatus) {
    const total = userStatus.microEntries + userStatus.midEntries + userStatus.megaEntries
    if (total > 0) {
      qs.push(`My ${total} entries are at risk if I sell -- what is my effective lockup?`)
    }
    if (total === 0) {
      qs.push(`I have zero entries -- which pool should I target first?`)
    }
  }

  const nearThreshold = (['micro', 'mid'] as PoolKey[]).filter(k => pools[k].isNearThreshold)
  if (nearThreshold.length > 0) {
    qs.push(`${nearThreshold.map(k => POOL_LABELS[k]).join(' and ')} near threshold -- enter before or after trigger?`)
  }

  if (pools.mega.timeLeft < 86400) {
    qs.push('Mega cycle ending within 24h -- is late entry optimal?')
  }

  // Always have at least 2
  if (qs.length < 2) {
    qs.push('What changes would shift the current recommendation?')
    qs.push('How does the Smart Ladder affect my entry timing?')
  }

  return qs.slice(0, 4)
}

// ════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════

function SignalLane({ value, label, thresholds }: { value: number; label: string; color?: string; thresholds?: number[] }) {
  const v = clamp(value)
  const zones = thresholds ?? [30, 70]
  const isLow = v < zones[0]
  const isHigh = v > zones[1]
  const fillColor = isHigh ? '#7020A0' : isLow ? '#5C516D' : '#1868A0'
  const glowColor = isHigh ? 'rgba(155,107,255,0.3)' : 'none'
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-sm text-text-muted w-[110px] shrink-0 text-right">{label}</span>
      <div className="flex-1 h-[6px] relative" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {/* Threshold ticks */}
        {zones.map((t, i) => (
          <div key={i} className="absolute top-0 h-full w-px" style={{ left: `${t}%`, background: 'rgba(255,255,255,0.12)' }} />
        ))}
        {/* Active fill */}
        <motion.div
          className="absolute top-0 h-full"
          initial={{ width: 0 }}
          animate={{ width: `${v}%` }}
          transition={{ duration: 0.6, ease: [0.22, 0.68, 0.36, 1] }}
          style={{ background: fillColor, boxShadow: glowColor !== 'none' ? `0 0 6px ${glowColor}` : undefined }}
        />
        {/* Marker */}
        <motion.div
          className="absolute top-[-2px] w-[3px] h-[10px] rounded-sm"
          initial={{ left: 0 }}
          animate={{ left: `${v}%` }}
          transition={{ duration: 0.6, ease: [0.22, 0.68, 0.36, 1] }}
          style={{ background: isHigh ? '#B01828' : fillColor, marginLeft: -1 }}
        />
      </div>
      <span className={cn(
        'text-sm font-black font-mono w-8 text-right tabular-nums',
        isHigh ? 'text-mega' : isLow ? 'text-text-muted' : 'text-text-primary'
      )}>{Math.round(v)}</span>
    </div>
  )
}

// ScoreGauge available for future use
void function _ScoreGauge({ value, label }: { value: number; label: string }) {
  const color = value >= 70 ? 'text-accent' : value >= 40 ? 'text-accent' : 'text-mega'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn('text-lg font-black font-mono tabular-nums', color)}>{Math.round(value)}</span>
      <span className="text-sm text-text-muted uppercase tracking-wide">{label}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════

// State change tracking for "What Changed" feature
interface StateSnapshot {
  timestamp: number
  tvl: number
  players: Record<PoolKey, number>
  fills: Record<PoolKey, number>
  evs: Record<PoolKey, number>
  readyPools: string[]
}

interface StateChange {
  label: string
  delta: Delta
  pool?: PoolKey
}

export function AIAdvisor(props: AIAdvisorProps) {
  const { pools, userStatus, vrfStatus, readyPools, vrfPending } = props
  const [activeTab, setActiveTab] = useState<TabKey>('signals')
  const prevStateRef = useRef<StateSnapshot | null>(null)
  const [stateChanges, setStateChanges] = useState<StateChange[]>([])

  const hasPools = pools.micro && pools.mid && pools.mega

  // ── Session-based state change detection ──
  useEffect(() => {
    if (!hasPools) return
    const m = pools.micro!, d = pools.mid!, g = pools.mega!
    const current: StateSnapshot = {
      timestamp: Date.now(),
      tvl: m.balanceEth + d.balanceEth + g.balanceEth,
      players: { micro: m.participants, mid: d.participants, mega: g.participants },
      fills: { micro: m.fillPct, mid: d.fillPct, mega: g.fillPct },
      evs: { micro: calcEv(m), mid: calcEv(d), mega: calcEv(g) },
      readyPools: [...readyPools],
    }

    const prev = prevStateRef.current
    if (prev) {
      const changes: StateChange[] = []
      // TVL change
      const tvlDelta = current.tvl - prev.tvl
      if (Math.abs(tvlDelta) > 0.0001) {
        changes.push({ label: `TVL ${tvlDelta > 0 ? '+' : ''}${tvlDelta.toFixed(4)} ETH`, delta: tvlDelta > 0 ? 'improving' : 'worsening' })
      }
      // Player changes per pool
      for (const k of ['micro', 'mid', 'mega'] as PoolKey[]) {
        const pDelta = current.players[k] - prev.players[k]
        if (pDelta !== 0) {
          changes.push({ label: `${POOL_LABELS[k]} players ${pDelta > 0 ? '+' : ''}${pDelta}`, delta: pDelta > 0 ? 'worsening' : 'improving', pool: k })
        }
      }
      // EV changes
      for (const k of ['micro', 'mid', 'mega'] as PoolKey[]) {
        const evDelta = current.evs[k] - prev.evs[k]
        if (Math.abs(evDelta) > 0.0001) {
          changes.push({ label: `${POOL_LABELS[k]} EV ${evDelta > 0 ? '+' : ''}${evDelta.toFixed(4)}`, delta: evDelta > 0 ? 'improving' : 'worsening', pool: k })
        }
      }
      // Ready pool changes
      const newReady = current.readyPools.filter(p => !prev.readyPools.includes(p))
      const lostReady = prev.readyPools.filter(p => !current.readyPools.includes(p))
      newReady.forEach(p => changes.push({ label: `${p} became READY`, delta: 'improving' }))
      lostReady.forEach(p => changes.push({ label: `${p} no longer ready`, delta: 'worsening' }))

      if (changes.length > 0) setStateChanges(changes.slice(0, 8))
    }

    prevStateRef.current = current
  }, [pools, readyPools, hasPools])

  // ── Pool Scores ──
  const poolScores = useMemo<PoolScore[]>(() => {
    if (!hasPools) return []
    const m = pools.micro!, d = pools.mid!, g = pools.mega!
    const tvl = m.balanceEth + d.balanceEth + g.balanceEth
    return rankPools([
      scorePool(m, 'micro', tvl),
      scorePool(d, 'mid', tvl),
      scorePool(g, 'mega', tvl),
    ])
  }, [pools, hasPools])

  // ── Signals ──
  const signals = useMemo<Signal[]>(() => {
    if (!hasPools) return []
    return generateSignals(
      { micro: pools.micro!, mid: pools.mid!, mega: pools.mega! },
      userStatus, vrfStatus, readyPools, vrfPending, poolScores,
    )
  }, [pools, hasPools, userStatus, vrfStatus, readyPools, vrfPending, poolScores])

  // ── Decision ──
  const decision = useMemo<ActionRecommendation | null>(() => {
    if (!hasPools || poolScores.length === 0) return null
    return generateDecision(
      { micro: pools.micro!, mid: pools.mid!, mega: pools.mega! },
      poolScores, readyPools, userStatus, vrfPending,
    )
  }, [pools, hasPools, poolScores, readyPools, userStatus, vrfPending])

  // ── Composite Scores ──
  const composite = useMemo<CompositeScores | null>(() => {
    if (!hasPools || poolScores.length === 0) return null
    return calcCompositeScores(
      { micro: pools.micro!, mid: pools.mid!, mega: pools.mega! },
      poolScores,
    )
  }, [pools, hasPools, poolScores])

  // ── Scenarios ──
  const scenarios = useMemo<Scenario[]>(() => {
    if (!hasPools) return []
    return generateScenarios(
      { micro: pools.micro!, mid: pools.mid!, mega: pools.mega! },
      poolScores,
    )
  }, [pools, hasPools, poolScores])

  // ── Dynamic Questions ──
  const questions = useMemo<string[]>(() => {
    if (!hasPools) return []
    return generateQuestions(
      { micro: pools.micro!, mid: pools.mid!, mega: pools.mega! },
      poolScores, userStatus, readyPools,
    )
  }, [pools, hasPools, poolScores, userStatus, readyPools])

  // ── TVL ──
  const tvl = useMemo(() => {
    if (!hasPools) return 0
    return pools.micro!.balanceEth + pools.mid!.balanceEth + pools.mega!.balanceEth
  }, [pools, hasPools])

  const tabDefs: [TabKey, string][] = [['signals', 'LIVE'], ['decision', 'ACTION'], ['analysis', 'DEEP']]

  return (
    <div className="rounded-2xl bg-black/30 p-5" style={{ boxShadow: '0 0 40px rgba(208,64,224,0.08)' }}>
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2.5 h-2.5 rounded-full bg-accent"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-lg font-black uppercase tracking-[0.15em] text-accent font-display">Tactical Engine</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono">
          <DataTag source="derived" label="on-chain scoring" />
          <span className="text-text-muted">{signals.length} sig</span>
          {decision && (
            <span className={cn(
              'font-bold',
              decision.urgency >= 70 ? 'text-mega' : decision.urgency >= 40 ? 'text-accent' : 'text-text-dim',
            )}>
              URG:{decision.urgency}
            </span>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0.5 mb-4 rounded-lg bg-white/[0.03] p-0.5">
        {tabDefs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-1 py-1.5 text-base font-bold tracking-[0.15em] rounded-md transition-all cursor-pointer font-mono',
              activeTab === key
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-primary hover:bg-white/[0.03]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ══════════════════════════════════════════════════════ */}
        {/*  TAB 1: SIGNALS                                       */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'signals' && (
          <motion.div
            key="signals"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {!hasPools ? (
              <div className="py-6 text-center text-sm text-text-muted font-mono">AWAITING POOL DATA...</div>
            ) : (
              <>
                {/* Top action — what to do RIGHT NOW */}
                {decision && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(168,120,240,0.06)', borderLeft: '3px solid rgba(168,120,240,0.3)' }}>
                    <div className="text-base font-bold text-accent mb-1">{decision.action}</div>
                    <div className="text-sm text-text-label">{decision.reasons[0]}</div>
                  </div>
                )}

                {/* Only actionable signals — filter out status-only */}
                {signals
                  .filter(s => s.severity === 'critical' || s.severity === 'high' || (s.severity === 'medium' && s.confidence >= 70))
                  .slice(0, 3)
                  .map((s) => (
                  <div key={s.id} className="rounded-lg px-3 py-2 bg-white/[0.02]" style={{ borderLeft: `2px solid ${SEVERITY_BORDER[s.severity]}30` }}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={cn('text-sm font-bold', SEVERITY_COLORS[s.severity])}>
                        {SEVERITY_MARKERS[s.severity]} {s.title}
                      </span>
                      <span className="text-sm text-text-ghost font-mono">{s.confidence}%</span>
                    </div>
                    <div className="text-sm text-text-muted leading-snug">{s.body}</div>
                    {s.metric && (
                      <div className="text-sm font-mono font-bold text-accent mt-1">{s.metric}</div>
                    )}
                  </div>
                ))}

                {/* Compact status line for info-level signals */}
                {(() => {
                  const infoSignals = signals.filter(s => s.severity === 'info' || s.severity === 'low' || (s.severity === 'medium' && s.confidence < 70))
                  return infoSignals.length > 0 ? (
                    <div className="text-sm text-text-ghost font-mono pt-1">
                      {infoSignals.length} additional {infoSignals.length === 1 ? 'signal' : 'signals'}: {infoSignals.map(s => s.title.split(' -- ')[0]).join(' · ')}
                    </div>
                  ) : null
                })()}
              </>
            )}
            {/* State Changes — session tracking */}
            {stateChanges.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-white/[0.02]">
                <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-2">STATE CHANGES THIS SESSION</div>
                <div className="space-y-1">
                  {stateChanges.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm font-mono">
                      <span className={cn(DELTA_COLORS[c.delta])}>{DELTA_MARKERS[c.delta]}</span>
                      <span className="text-text-dim">{c.label}</span>
                      {c.pool && <span className="text-accent text-sm">{POOL_LABELS[c.pool]}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/*  TAB 2: DECISION                                      */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'decision' && (
          <motion.div
            key="decision"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {!decision ? (
              <div className="py-8 text-center text-sm text-text-muted font-mono">AWAITING POOL DATA...</div>
            ) : (
              <>
                {/* ── BEST ACTION ── */}
                <div className="rounded-lg bg-accent/[0.06] border border-accent/20 p-3">
                  <div className="text-xs font-heading text-text-muted uppercase tracking-wider mb-1">Best Current Action</div>
                  <div className="text-sm font-black font-mono text-accent leading-snug mb-2">{decision.action}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: 'CONF', value: `${decision.confidence}%`, color: decision.confidence >= 70 ? 'text-accent' : 'text-text-primary' },
                      { label: 'URG', value: `${decision.urgency}`, color: decision.urgency >= 70 ? 'text-mega' : 'text-text-primary' },
                      { label: 'RISK', value: `${decision.risk}`, color: decision.risk >= 50 ? 'text-mega' : 'text-accent' },
                      { label: 'TIME', value: decision.timeSensitivity, color: 'text-text-primary' },
                    ].map(m => (
                      <div key={m.label} className="text-center py-1 rounded" style={{ background: 'rgba(4,2,14,0.3)' }}>
                        <div className={cn('text-xs font-bold font-mono', m.color)}>{m.value}</div>
                        <div className="text-xs text-text-ghost" style={{ fontSize: 9 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── WHY ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-1.5">WHY</div>
                  <div className="space-y-1">
                    {decision.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-base text-explain">
                        <span className="text-accent shrink-0 mt-0.5">--</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── RANKED OPTIONS ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-2">RANKED OPTIONS</div>
                  <div className="space-y-2">
                    {poolScores.map(s => (
                      <div key={s.pool} className="rounded-lg px-3 py-2.5" style={{ background: s.rank === 1 ? 'rgba(139,108,224,0.06)' : 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn('text-lg font-black font-mono', s.rank === 1 ? 'text-accent' : 'text-text-muted')}>
                            #{s.rank}
                          </span>
                          <span className="text-base font-bold text-text-primary">{POOL_LABELS[s.pool]}</span>
                          <span className={cn('ml-auto text-base font-bold font-mono', s.ev >= 0 ? 'text-accent' : 'text-mega')}>
                            EV: {s.ev >= 0 ? '+' : ''}{s.ev.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm font-mono">
                          <span><span className="text-text-muted">Crowding</span> <span className="text-text-primary font-bold">{s.crowding}/100</span></span>
                          <span><span className="text-text-muted">Entry Q.</span> <span className={cn('font-bold', s.entryQuality >= 60 ? 'text-accent' : 'text-text-primary')}>{s.entryQuality}/100</span></span>
                          <span><span className="text-text-muted">Risk</span> <span className={cn('font-bold', s.risk >= 50 ? 'text-mega' : 'text-accent')}>{s.risk}/100</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── INVALIDATION ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-1.5">WHAT WOULD CHANGE</div>
                  <div className="space-y-0.5">
                    {decision.invalidationConditions.map((c, i) => (
                      <div key={i} className="text-sm text-text-dim flex items-start gap-1.5">
                        <span className="text-mega shrink-0">x</span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── DYNAMIC QUESTIONS ── */}
                {questions.length > 0 && (
                  <div>
                    <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-1.5">QUESTIONS FROM STATE</div>
                    <div className="space-y-0.5">
                      {questions.map((q, i) => (
                        <div key={i} className="text-sm text-text-dim flex items-start gap-1.5">
                          <span className="text-accent shrink-0">?</span>
                          <span>{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/*  TAB 3: ANALYSIS                                      */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'analysis' && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {!hasPools || !composite ? (
              <div className="py-8 text-center text-sm text-text-muted font-mono">AWAITING POOL DATA...</div>
            ) : (
              <>
                {/* ── POOL COMPARISON MATRIX ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-2">POOL COMPARISON</div>
                  <div className="overflow-x-auto" style={{ maxWidth: '100%' }}>
                    <table className="w-full text-sm font-mono" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr className="text-text-muted">
                          <th className="text-left py-1 pr-2">METRIC</th>
                          {poolScores.map(s => (
                            <th key={s.pool} className={cn('text-right py-1 px-1.5', s.rank === 1 ? 'text-accent' : 'text-text-dim')}>
                              {POOL_LABELS[s.pool]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-text-primary">
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">EV (ETH)</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className={cn('text-right py-1 px-1.5', s.ev >= 0 ? 'text-accent' : 'text-mega')}>
                              {s.ev >= 0 ? '+' : ''}{s.ev.toFixed(4)}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">Players</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className="text-right py-1 px-1.5">{pools[s.pool]!.participants}</td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">Crowding</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className={cn('text-right py-1 px-1.5', s.crowding >= 60 ? 'text-mega' : 'text-text-primary')}>
                              {s.crowding}/100
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">Entry Cost</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className="text-right py-1 px-1.5">{s.costEth.toFixed(4)}</td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">TVL Share</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className="text-right py-1 px-1.5">{s.tvlShare.toFixed(1)}%</td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">Fill Rate</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className="text-right py-1 px-1.5">{s.fillRate.toFixed(1)}%</td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">Readiness</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className={cn('text-right py-1 px-1.5', s.readiness >= 80 ? 'text-accent' : 'text-text-primary')}>
                              {s.readiness}/100
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5">
                          <td className="py-1 pr-2 text-text-muted">Risk/Reward</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className={cn('text-right py-1 px-1.5', s.riskReward >= 2 ? 'text-accent' : 'text-text-primary')}>
                              {s.riskReward.toFixed(1)}x
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5 font-bold">
                          <td className="py-1 pr-2 text-accent">Entry Quality</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className={cn(
                              'text-right py-1 px-1.5',
                              s.entryQuality >= 70 ? 'text-accent' : s.entryQuality >= 40 ? 'text-accent' : 'text-mega',
                            )}>
                              {s.entryQuality}/100
                            </td>
                          ))}
                        </tr>
                        <tr className="border-t border-white/5 font-bold">
                          <td className="py-1 pr-2 text-accent">Risk</td>
                          {poolScores.map(s => (
                            <td key={s.pool} className={cn(
                              'text-right py-1 px-1.5',
                              s.risk >= 50 ? 'text-mega' : s.risk >= 25 ? 'text-micro' : 'text-accent',
                            )}>
                              {s.risk}/100
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── TVL ALLOCATION TRACK ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-1.5">TVL ALLOCATION -- {tvl.toFixed(4)} ETH</div>
                  <div className="relative h-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {poolScores.reduce((acc, s, i) => {
                      const left = acc.offset
                      acc.items.push(
                        <motion.div
                          key={s.pool}
                          className="absolute top-0 h-full"
                          initial={{ width: 0, left: `${left}%` }}
                          animate={{ width: `${s.tvlShare}%`, left: `${left}%` }}
                          transition={{ duration: 0.8, ease: [0.22, 0.68, 0.36, 1] }}
                          style={{
                            background: s.pool === 'micro' ? '#1868A0' : s.pool === 'mid' ? '#7020A0' : '#B01828',
                            borderRight: i < poolScores.length - 1 ? '2px solid rgba(5,3,11,0.8)' : undefined,
                          }}
                        />
                      )
                      acc.offset += s.tvlShare
                      return acc
                    }, { offset: 0, items: [] as React.ReactNode[] }).items}
                  </div>
                  <div className="flex justify-between mt-1">
                    {poolScores.map(s => (
                      <div key={s.pool} className="text-xs font-mono">
                        <span className="text-text-muted">{POOL_LABELS[s.pool]}</span>
                        <span className="text-text-primary ml-1">{s.tvlShare.toFixed(1)}%</span>
                        <span className="text-text-muted ml-1">({pools[s.pool]!.balanceEth.toFixed(4)})</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── DERIVED METRICS ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-2">DERIVED METRICS</div>
                  <div className="space-y-0.5">
                    <SignalLane value={composite.entryQuality} label="Entry Quality" thresholds={[25, 65]} />
                    <SignalLane value={composite.overcrowdingPressure} label="Overcrowding" thresholds={[40, 75]} />
                    <SignalLane value={composite.triggerProximity} label="Trigger Prox." thresholds={[50, 90]} />
                    <SignalLane value={composite.opportunityStability} label="Opp. Stability" thresholds={[30, 70]} />
                    <SignalLane value={composite.riskAsymmetry} label="Risk Asymmetry" thresholds={[20, 60]} />
                    <SignalLane value={composite.evMomentum} label="EV Momentum" thresholds={[30, 70]} />
                  </div>
                </div>

                {/* ── SCENARIO ENGINE ── */}
                <div>
                  <div className="text-sm font-heading text-text-muted uppercase tracking-wide mb-2">SCENARIO ENGINE</div>
                  <div className="space-y-2">
                    {scenarios.map((sc, si) => (
                      <div key={si} className="py-2 px-3 rounded-lg" style={{ background: 'rgba(155,107,255,0.03)', borderTop: si > 0 ? '1px solid rgba(155,107,255,0.06)' : undefined }}>
                        <div className="mb-2">
                          <div className="text-sm font-bold text-accent">{sc.label}</div>
                          <div className="text-sm text-text-muted leading-snug">{sc.description}</div>
                        </div>
                        <div className="space-y-1">
                          {sc.results.map(r => {
                            const isPositive = typeof r.newEv === 'number' && r.newEv >= 0
                            const isSpecial = r.delta === 'RESET' || r.delta === 'UNCHANGED' || r.delta.startsWith('TRIGGERS') || r.delta.startsWith('Fill')
                            return (
                              <div key={r.pool} className="flex items-center justify-between gap-2 py-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono text-text-muted w-5">#{r.newRank}</span>
                                  <span className="text-sm font-mono font-bold text-text-primary">{POOL_LABELS[r.pool]}</span>
                                </div>
                                <span className={cn(
                                  'text-sm font-mono tabular-nums font-bold',
                                  isSpecial ? 'text-text-muted' : isPositive ? 'text-accent' : 'text-mega',
                                )}>
                                  {isSpecial ? r.delta : `EV: ${r.newEv >= 0 ? '+' : ''}${r.newEv.toFixed(4)}`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-sm text-text-muted font-mono text-center pt-1">
                  <DataTag source="derived" label="deterministic scoring" /> All values computed from live contract state
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
