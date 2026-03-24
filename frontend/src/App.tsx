import React, { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Toaster, toast } from 'sonner'
import { Area, ResponsiveContainer, CartesianGrid, Line, ComposedChart } from 'recharts'
import {
  useProvider, usePoolData, useWallet, useVrfStatus,
  useProtocolMeta, useEvents, useExecution, usePriceFeed, useTimer,
  useTradeHistory,
} from '@/hooks'
import { cn } from '@/lib/utils'
import { DataTag, NeonBar } from '@/components/system'
import { Tooltip } from '@/components/system/Tooltip'
import { ElectricDot, ScanLine } from '@/components/system/ElectricLine'
import { BackgroundCanvas } from '@/components/system/BackgroundCanvas'
import { AIAdvisor } from '@/components/protocol/AIAdvisor'
import { fmtAddr, fmtTimer } from '@/lib/utils'
import { CONTRACTS, chain } from '@/config'
import type { PoolState } from '@/lib/types'

/* ── instrumented signal trace ── */
function TinyTrend({ data, color, energy = 'mid' }: { data: { v: number }[]; color: string; energy?: 'dormant' | 'mid' | 'hot' }) {
  const id = color.replace('#', '')
  const coreWidth = energy === 'hot' ? 3.5 : energy === 'mid' ? 2.8 : 2.2
  const fillOpacity = energy === 'hot' ? 0.4 : energy === 'mid' ? 0.3 : 0.15
  const haloWidth = coreWidth + 5

  return (
    <div className="h-16 w-full min-w-[120px] relative overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(4,2,14,0.4), rgba(8,4,20,0.5))', borderRadius: 6, border: '1px solid rgba(139,108,224,0.08)', boxShadow: 'inset 0 1px 0 rgba(139,108,224,0.04)' }}>
      {/* Horizontal threshold bands — visible grid */}
      {[0.25, 0.5, 0.75].map(t => (
        <div key={t} className="absolute left-0 right-0" style={{ top: `${(1 - t) * 100}%`, height: t === 0.5 ? 1 : 1, background: `rgba(139,108,224,${t === 0.5 ? 0.12 : 0.06})` }} />
      ))}
      {/* Vertical time divisions — visible */}
      {[0.25, 0.5, 0.75].map(t => (
        <div key={t} className="absolute top-0 bottom-0" style={{ left: `${t * 100}%`, width: 1, background: 'rgba(139,108,224,0.06)' }} />
      ))}
      {/* Left edge ticks */}
      {[0.25, 0.5, 0.75].map(t => (
        <div key={`lt${t}`} className="absolute left-0 w-2" style={{ top: `${(1 - t) * 100}%`, height: 1, background: 'rgba(139,108,224,0.15)' }} />
      ))}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 6, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Pressure fill — visible mass */}
          <Area type="monotone" dataKey="v" stroke="none" fill={`url(#fill-${id})`} isAnimationActive={false} />
          {/* Halo glow trace */}
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={haloWidth} strokeOpacity={0.1} dot={false} isAnimationActive={false} />
          {/* Core signal trace — THICK and visible */}
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={coreWidth} dot={false} isAnimationActive={false} />
          {/* Terminal endpoint — large bright node */}
          <Line type="monotone" dataKey="v" stroke="none" dot={(props: Record<string, unknown>) => {
            const idx = props.index as number
            const pcx = props.cx as number, pcy = props.cy as number
            if (idx === data.length - 1) {
              return (
                <g key={idx}>
                  <circle cx={pcx} cy={pcy} r={8} fill={color} opacity={0.08} />
                  <circle cx={pcx} cy={pcy} r={5} fill={color} opacity={0.2} />
                  <circle cx={pcx} cy={pcy} r={3} fill={color} opacity={0.6} />
                  <circle cx={pcx} cy={pcy} r={1.2} fill="#EDE8F8" />
                </g>
              )
            }
            // Visible data point markers — structural
            return (
              <g key={idx}>
                <circle cx={pcx} cy={pcy} r={2} fill={color} opacity={0.15} />
                <circle cx={pcx} cy={pcy} r={0.8} fill={color} opacity={0.4} />
              </g>
            )
          }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── instrumented fill ring — conic gradient + threshold ticks + calibration ── */
function FillRing({ value, color, label }: { value: number; color: string; label?: string }) {
  const deg = Math.max(0, Math.min(100, value)) * 3.6
  const v = Math.min(value, 100)

  // Derive bright version by mixing toward white
  const brightColor = color // the passed color IS the line color (dark pool color)
  // We need a brighter version for text/glow
  const brightMap: Record<string, string> = {
    '#A02068': '#E850A0', '#7020A0': '#A050E0', '#B01828': '#F04848',
  }
  const bright = brightMap[color] || color

  const ticks = [25, 50, 75, 100]

  return (
    <div className="relative h-28 w-28">
      {/* Outer calibration ring */}
      <div className="absolute inset-[-4px] rounded-full" style={{ border: `1px solid ${color}20` }} />

      {/* Conic gradient ring — uses pool color */}
      <div className="absolute inset-0 rounded-full" style={{
        background: `conic-gradient(${color} 0deg, ${bright} ${deg * 0.6}deg, ${color} ${deg}deg, rgba(40,30,60,0.15) ${deg}deg)`,
        boxShadow: v > 50 ? `0 0 ${8 + v * 0.2}px ${color}30` : undefined,
      }} />

      {/* SVG overlay — ticks + notch */}
      <svg viewBox="0 0 112 112" className="absolute inset-[-8px] w-[calc(100%+16px)] h-[calc(100%+16px)]" style={{ transform: 'rotate(-90deg)' }}>
        {Array.from({ length: 10 }, (_, i) => {
          const pct = (i + 1) * 10
          const angle = (pct / 100) * 2 * Math.PI
          const isMajor = ticks.includes(pct)
          const len = isMajor ? 8 : 4
          const outerR = 52
          const x1 = 56 + (outerR - len) * Math.cos(angle)
          const y1 = 56 + (outerR - len) * Math.sin(angle)
          const x2 = 56 + (outerR + 2) * Math.cos(angle)
          const y2 = 56 + (outerR + 2) * Math.sin(angle)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isMajor ? `${bright}60` : `${color}30`} strokeWidth={isMajor ? 2 : 1} />
        })}
        {v > 0 && (() => {
          const angle = (v / 100) * 2 * Math.PI
          const nx = 56 + 50 * Math.cos(angle)
          const ny = 56 + 50 * Math.sin(angle)
          return (
            <g>
              <circle cx={nx} cy={ny} r={5} fill={bright} opacity={0.3} />
              <circle cx={nx} cy={ny} r={3} fill={bright} opacity={0.8} />
              <circle cx={nx} cy={ny} r={1.2} fill="#EDE8F8" />
            </g>
          )
        })()}
        <circle cx={56} cy={56} r={55} fill="none"
          stroke={v >= 80 ? `${bright}40` : `${color}10`}
          strokeWidth={3}
          strokeDasharray={`${(20 / 100) * 2 * Math.PI * 55} ${(80 / 100) * 2 * Math.PI * 55}`}
          strokeDashoffset={`${-(80 / 100) * 2 * Math.PI * 55}`}
        />
      </svg>

      {/* Center text — bright pool color */}
      <div className="absolute inset-[6px] flex items-center justify-center rounded-full" style={{ background: 'rgba(6,2,12,.92)' }}>
        <div className="text-center">
          <div className="text-3xl font-black font-display tabular-nums" style={{
            color: bright,
            textShadow: v > 30 ? `0 0 12px ${bright}40` : undefined,
          }}>
            {v.toFixed(0)}%
          </div>
          <div className="text-sm font-bold uppercase tracking-wider" style={{ color: v > 50 ? bright : `${color}80`, textShadow: v > 50 ? `0 0 8px ${bright}30` : undefined }}>{label ?? 'Fill'}</div>
        </div>
      </div>
    </div>
  )
}

/* ── pool lane ── */
const LANE_CFG = {
  micro: { accent: 'from-pink-400 via-rose-500 to-fuchsia-500', line: '#A02068', bright: '#E850A0', glow: 'rgba(232,80,160,', label: 'MICRO' },
  mid: { accent: 'from-violet-400 via-purple-500 to-indigo-500', line: '#7020A0', bright: '#A050E0', glow: 'rgba(160,80,224,', label: 'MID' },
  mega: { accent: 'from-pink-400 via-fuchsia-500 to-purple-500', line: '#B01828', bright: '#F03848', glow: 'rgba(240,56,72,', label: 'MEGA' },
} as const

function PoolLane({ pool, data, elapsed }: { pool: 'micro' | 'mid' | 'mega'; data: PoolState | null; elapsed: number }) {
  const cfg = LANE_CFG[pool]
  // Stable sparkline — based on balance, no random per render
  const spark = React.useMemo(() => {
    if (!data) return []
    const seed = data.balanceEth * 1000 + data.participants * 7
    return Array.from({ length: 12 }, (_, i) => {
      const noise = Math.sin(seed + i * 2.3) * 0.15 + Math.sin(seed + i * 5.7) * 0.08
      const trend = 0.3 + i * 0.06
      return { v: Math.max(0, data.balanceEth * (trend + noise)) }
    })
  }, [data?.balanceEth, data?.participants])
  const liveTime = data ? Math.max(0, data.timeLeft - elapsed) : 0

  if (!data) {
    return (
      <div className="relative overflow-hidden rounded-2xl px-5 py-5 animate-pulse" style={{ boxShadow: '0 0 50px rgba(139,108,224,0.06)' }}>
        <div className="h-20 bg-white/5 rounded" />
      </div>
    )
  }

  const stateText = data.isReady ? 'READY' : data.isNearThreshold ? `${data.fillPct.toFixed(0)}%` : 'ACCUMULATING'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: pool === 'micro' ? 0 : pool === 'mid' ? 0.1 : 0.2 }}
      id={`pool-${pool}`}
      className={cn('relative overflow-hidden rounded-2xl px-5 py-5', `lane-aura-${pool}`)}
      style={{ boxShadow: '0 0 50px rgba(139,108,224,0.06)' }}
    >
      {/* No border/accent bars — clean surface */}

      <div className="grid gap-2 lg:grid-cols-[1fr_1.1fr_0.7fr_0.85fr_100px] lg:items-center">
        {/* Identity + balance */}
        <div>
          {/* Role 1: Pool name — display heading, spaced, prominent */}
          <div className="flex items-center gap-3 mb-1">
            <div
              className={cn('font-bold tracking-[0.2em] font-display uppercase', pool === 'mega' ? 'text-3xl' : 'text-2xl', `pool-pulse-${pool}`)}
              style={{ color: cfg.bright }}
            >{cfg.label}</div>
            {/* Role 2: State badge — compact chip, much smaller than name */}
            <span className="rounded px-1.5 py-0.5 text-xs font-bold tracking-tight leading-none"
              style={{ color: cfg.bright, opacity: data.isReady ? 1 : 0.6 }}>
              {data.isReady && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="mr-0.5">●</motion.span>}
              {stateText}
            </span>
          </div>
          {/* Role 3: Main numeric — strongest element, densest weight */}
          <div className="flex items-baseline gap-1.5">
            <div
              className={cn('font-black tracking-[-0.02em] font-display leading-none', pool === 'mega' ? 'text-6xl' : pool === 'mid' ? 'text-5xl' : 'text-4xl', `pool-pulse-${pool}`)}
              style={{ color: cfg.bright }}
            >
              {data.balanceEth.toFixed(4)}
            </div>
            <span className={cn('font-medium tracking-tight', pool === 'mega' ? 'text-lg' : 'text-base')} style={{ color: `${cfg.bright}80` }}>ETH</span>
          </div>
          {/* Role 4: Meta support — smallest, quietest, clearly secondary */}
          <div className="mt-1.5 text-sm tracking-tight" style={{ color: cfg.bright, opacity: 0.5 }}>
            Target → {data.thresholdEth.toFixed(4)} · {data.participants} players
          </div>
        </div>

        {/* Trend */}
        <div>
          <TinyTrend data={spark} color={cfg.line} energy={pool === 'mega' ? 'hot' : pool === 'mid' ? 'mid' : 'dormant'} />
        </div>

        {/* Stats — dense 2x3 grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Tooltip content="Unique addresses with at least 1 entry this cycle">
            <div className="cursor-help">
              <div className="text-xs" style={{ color: cfg.bright, opacity: 0.6 }}>Players</div>
              <div className="text-2xl font-bold" style={{ color: cfg.bright }}>{data.participants}</div>
            </div>
          </Tooltip>
          <Tooltip content="Range: worst (all 3×) to best (all 1×). True distribution unknown.">
            <div className="cursor-help">
              <div className="text-xs flex items-center gap-1" style={{ color: cfg.bright, opacity: 0.6 }}>Win % <DataTag source="estimate" label="b" /></div>
              <div className="text-2xl font-bold" style={{ color: cfg.bright }}>
                {data.participants > 0 ? `${(100 / (data.participants * 3)).toFixed(0)}–${(100 / data.participants).toFixed(0)}%` : '--'}
              </div>
            </div>
          </Tooltip>
          <div>
            <div className="text-xs" style={{ color: cfg.bright, opacity: 0.6 }}>Cycle</div>
            <div className="text-lg font-semibold" style={{ color: cfg.bright }}>#{data.cycleId} · {pool === 'micro' ? '2h' : pool === 'mid' ? '6h' : '7d'}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: cfg.bright, opacity: 0.6 }}>Tax</div>
            <div className="text-lg font-semibold" style={{ color: cfg.bright }}>{pool === 'micro' ? '1% buy' : pool === 'mid' ? '1.5% buy' : '1.9% sell'}</div>
          </div>
        </div>

        {/* Entry + timer */}
        <div>
          <Tooltip content="0.7% of pool balance, clamped between floor and cap">
            <div className="cursor-help">
              <div className="mb-3 text-xs" style={{ color: cfg.bright, opacity: 0.6 }}>Entry</div>
              <div className="mb-4 text-3xl font-bold" style={{ color: cfg.bright }}>{data.entryReqEth.toFixed(4)} <span className="text-lg" style={{ opacity: 0.6 }}>ETH</span></div>
            </div>
          </Tooltip>
          <div className="font-mono text-xl font-bold tabular-nums" style={{ color: cfg.bright }}>
            {liveTime <= 0 ? '● READY' : fmtTimer(liveTime)}
          </div>
        </div>

        {/* Fill ring + electrostatic sparks on ALL pools, MEGA ring pulses */}
        <div className="flex justify-end lg:justify-center relative">
          <div className={data.fillPct >= 90 ? 'animate-[mega-ring-pulse_2s_ease-in-out_infinite]' : ''}>
            <FillRing value={data.fillPct} color={cfg.line} label={data.isReady ? 'READY' : 'FILL'} />
          </div>
          {/* Ionized ring shimmer — subtle charge tension */}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * 360 + Math.sin(i * 2.1) * 15
            const rad = 50
            const x = Math.cos(angle * Math.PI / 180) * rad + 48
            const y = Math.sin(angle * Math.PI / 180) * rad + 48
            return (
              <motion.div
                key={i}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: x, top: y, width: 1.5, height: 1.5,
                  background: cfg.line,
                  boxShadow: `0 0 3px ${cfg.line}80`,
                }}
                animate={{ opacity: [0.05, 0.5, 0.1, 0.4, 0.05] }}
                transition={{ duration: 2 + (i % 3) * 0.8, repeat: Infinity, delay: i * 0.6, ease: 'easeInOut' }}
              />
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ── main app ── */
export default function App() {
  const { userAddr, isConnected, connect, disconnect, getContract, getReadOnlyContract } = useProvider()
  const contractGetter = useCallback(() => getContract() || getReadOnlyContract(), [getContract, getReadOnlyContract])
  const { pools, totalEth, lastFetch, refresh: refreshPools } = usePoolData({ getContract: contractGetter })
  const { status: userStatus } = useWallet({ getContract: contractGetter, userAddr })
  const { status: vrfStatus } = useVrfStatus({ getContract: contractGetter })
  const { meta } = useProtocolMeta({ getContract: contractGetter })
  const priceFeed = usePriceFeed({ getContract: contractGetter })
  const { trades, stats: tradeStats, holderStats } = useTradeHistory({ getContract: contractGetter, pairAddress: meta.pairAddress })
  const { elapsed, reset: resetTimer } = useTimer()
  // cmdOpen removed
  const [simAmt, setSimAmt] = useState('')
  const [railTab, setRailTab] = useState<'execute' | 'enter' | 'state'>('execute')

  useEffect(() => { if (lastFetch > 0) resetTimer() }, [lastFetch, resetTimer])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // ⌘K command palette removed
      else if (e.key === '1') document.getElementById('pool-micro')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else if (e.key === '2') document.getElementById('pool-mid')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else if (e.key === '3') document.getElementById('pool-mega')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else if (e.key === 'r' && !e.metaKey && !e.ctrlKey) { refreshPools(); toast('Refreshing…') }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  const { winners } = useEvents({
    getContract: contractGetter,
    signerContract: isConnected ? getContract()! : null,
    onPoolAllocated: (pt, addr, amt) => { toast.success(`${['Micro', 'Mid', 'Mega'][pt]} winner: ${addr.slice(0, 6)}.. +${amt.toFixed(4)} ETH`, { duration: 5000 }); refreshPools() },
    onAllocationRequested: (pt) => { toast(`${['Micro', 'Mid', 'Mega'][pt]} VRF requested`, { icon: '🎲' }); refreshPools() },
  })

  const { state: execState, error: execError, canExecute, readyPools, execute } = useExecution({
    getContract, isConnected, pools,
    onSuccess: () => { toast.success('Cycle executed!'); refreshPools() },
  })

  const nearestTrigger = (() => {
    if (!pools.micro || !pools.mid || !pools.mega) return '--'
    if (pools.micro.isReady || pools.mid.isReady || pools.mega.isReady) return 'READY NOW'
    const times = [pools.micro.timeLeft, pools.mid.timeLeft, pools.mega.timeLeft].filter(t => t > 0)
    if (times.length === 0) return '--'
    const min = Math.min(...times)
    const h = Math.floor(min / 3600), m = Math.floor((min % 3600) / 60)
    return h > 0 ? `~${h}h` : `~${m}m`
  })()

  const vrfPending = vrfStatus && (vrfStatus.microPending || vrfStatus.midPending || vrfStatus.megaPending)
  const isProcessing = execState !== 'idle' && execState !== 'success' && execState !== 'error'
  const ago = lastFetch > 0 ? Math.floor((Date.now() - lastFetch) / 1000) : -1

  // Price sparkline from session history (fake for now until real tracking)
  const priceSpark = [{ v: 18 }, { v: 21 }, { v: 20 }, { v: 25 }, { v: 24 }, { v: 28 }, { v: 31 }, { v: 33 }, { v: 31 }, { v: 34 }, { v: 38 }, { v: 40 }, { v: 39 }, { v: 43 }, { v: 45 }, { v: 47 }]

  // actions array removed — command palette replaced by inline operator controls

  return (
    <div className="relative min-h-screen overflow-x-hidden text-accent">
      {/* ═══ STAGE 1: Still cosmos backdrop ═══ */}
      <BackgroundCanvas />
      {/* Motion now handled inside BackgroundCanvas shader */}

      {/* Scan line effect */}
      <ScanLine />

      {/* ALL UI ABOVE BACKGROUND */}
      <div className="relative z-10">

        {/* Neon top edge — electric animated */}
        <div className="fixed top-0 left-0 right-0 h-[2px] z-50 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 5%, #A02068, #7020A0, #A878F0, #B01828, transparent 95%)', animation: 'electric-flow 4s linear infinite', backgroundSize: '200% 100%' }} />

        <Toaster theme="dark" position="bottom-center" toastOptions={{
          style: { background: '#0a0818', color: '#f8f4ff', fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 600 },
        }} />

        {/* Command palette removed — replaced by inline Operator Console */}

        {/* ═══ ZONE 1: TOP COMMAND STRIP ═══ */}
        <div className="flex items-center justify-between  px-7 py-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black tracking-tight font-display relative inline-flex items-center">
              evm<span className="text-accent relative inline-block" style={{ animation: 'electric-text 2s ease-in-out infinite' }}>
                X
                {/* Many tiny sparks scattered across the X surface */}
                {Array.from({ length: 14 }, (_, i) => {
                  const x = 10 + (i % 4) * 22 + Math.sin(i * 2.7) * 8
                  const y = 8 + Math.floor(i / 4) * 24 + Math.cos(i * 3.1) * 6
                  const size = 1.5 + Math.sin(i * 1.9) * 0.8
                  const delay = (i * 0.35) % 3
                  const dur = 0.3 + (i % 3) * 0.15
                  const colors = ['#7020A0', '#A02068', '#B090FF', '#6B48B8', '#9B7EF0']
                  return (
                    <motion.div
                      key={i}
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        width: size,
                        height: size,
                        background: colors[i % colors.length],
                        boxShadow: `0 0 3px ${colors[i % colors.length]}, 0 0 6px ${colors[i % colors.length]}60`,
                      }}
                      animate={{
                        opacity: [0, 1, 0.3, 0.9, 0],
                        scale: [0.5, 1.5, 0.8, 1.2, 0.5],
                      }}
                      transition={{
                        duration: dur,
                        repeat: Infinity,
                        repeatDelay: 1.5 + delay,
                        delay: delay,
                      }}
                    />
                  )
                })}
                {/* Soft overall glow */}
                <motion.div
                  className="absolute inset-0 rounded pointer-events-none"
                  animate={{ boxShadow: ['0 0 4px rgba(139,108,224,0.2)', '0 0 12px rgba(139,108,224,0.45)', '0 0 4px rgba(139,108,224,0.2)'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </span>
            </div>
            <div className="text-xs uppercase tracking-[0.35em] text-accent/80">Protocol Live</div>
            <div className="ml-4 hidden items-center gap-3 text-sm lg:flex" style={{ opacity: 0.6 }}>
              <Tooltip content={meta.isRenounced ? 'Ownership renounced — no admin' : `Owner: ${meta.owner ?? '?'}`}>
                <span className="cursor-help text-text-label">Owner <span className={cn('font-semibold', meta.isRenounced ? 'text-ok' : 'text-accent')}>{meta.isRenounced ? '✓' : 'Active'}</span></span>
              </Tooltip>
              <span className="text-text-label">LP <span className={cn('font-semibold', meta.lpStatus === 'burned' ? 'text-ok' : 'text-text-label')}>{meta.lpStatus === 'burned' ? '✓' : meta.lpStatus}</span></span>
              <span className="text-text-label">VRF <span className={cn('font-semibold', vrfPending ? 'text-accent' : 'text-text-label')}>{vrfPending ? 'Pending' : 'Idle'}</span></span>
              <span className="text-text-label">Swap <span className="font-semibold text-text-label">{Math.floor(meta.swapBuffer).toLocaleString()}/120K</span></span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="rounded-xl bg-white/5 px-5 py-2.5 text-accent cursor-pointer hover:bg-white/8 transition-colors font-display text-base font-black tracking-wider">Operator</button>
            <button
              onClick={isConnected ? disconnect : () => connect().catch(() => toast.error('Failed'))}
              className="rounded-xl bg-accent/10 px-5 py-2.5 text-accent cursor-pointer hover:bg-accent/15 transition-colors font-display text-base font-black tracking-wider"
            >
              {isConnected && userAddr ? `${userAddr.slice(0, 6)}…${userAddr.slice(-4)}` : 'Connect Wallet'}
            </button>
            <a href={`${chain.scan}/address/${CONTRACTS.evmX}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white/5 px-5 py-2.5 text-accent hover:bg-white/8 transition-colors max-[600px]:hidden font-display text-base font-black tracking-wider">BaseScan ↗</a>
          </div>
        </div>

        {/* ═══ ZONE 2: PRIMARY VIEWPORT + ZONE 3: RIGHT ACTION RAIL ═══ */}
        {/* ═══ TVL + ALLOCATION — full-width above grid ═══ */}
        <div className="px-5 mb-4">
          {/* Hero block — TVL + Price */}
          <div className="grid gap-4 px-6 py-5 lg:grid-cols-[1.3fr_1fr] rounded-2xl" style={{ background: 'rgba(3,1,10,0.18)' }}>
              <div>
                <div className="mb-3 text-sm uppercase tracking-[0.35em] text-text-label font-display">Total value locked</div>
                <div className="flex items-end gap-3">
                  <motion.div key={totalEth.toFixed(4)} initial={{ opacity: 0.7 }} animate={{ opacity: 1 }} className="text-7xl font-black tracking-tight font-display num-hero">{totalEth.toFixed(4)}</motion.div>
                  <div className="pb-3 text-3xl font-semibold text-accent">ETH</div>
                </div>
                <div className="mt-3 text-lg text-text-dim">
                  {priceFeed.status === 'live' && priceFeed.price > 0
                    ? `$${(totalEth * priceFeed.price).toFixed(2)}`
                    : <span className="text-text-ghost">USD N/A <DataTag source="unavailable" label="testnet" /></span>
                  }
                  <span className="mx-2 text-text-ghost">·</span>
                  Updated {ago >= 0 ? `${ago}s ago` : '…'}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="rounded-2xl p-3 relative overflow-hidden" style={{ boxShadow: '0 0 40px rgba(155,107,255,0.12)' }}>
                  <div className="h-28 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={priceSpark} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#7020A0" stopOpacity={0.4} />
                            <stop offset="40%" stopColor="#7020A0" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#7020A0" stopOpacity={0} />
                          </linearGradient>
                          <filter id="heroHalo">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                        </defs>
                        <CartesianGrid vertical={false} stroke="rgba(155,107,255,0.06)" />
                        {/* Pressure fill */}
                        <Area type="monotone" dataKey="v" stroke="none" fill="url(#heroFill)" isAnimationActive={false} />
                        {/* Halo trace */}
                        <Line type="monotone" dataKey="v" stroke="#7020A0" strokeWidth={7} strokeOpacity={0.15} dot={false} isAnimationActive={false} filter="url(#heroHalo)" />
                        {/* Core trace */}
                        <Line type="monotone" dataKey="v" stroke="#7020A0" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        {/* Terminal node */}
                        <Line type="monotone" dataKey="v" stroke="none" dot={(props: Record<string, unknown>) => {
                          const idx = props.index as number
                          if (idx !== priceSpark.length - 1) return <React.Fragment key={idx} />
                          const cx = props.cx as number, cy = props.cy as number
                          return (
                            <g key={idx}>
                              <circle cx={cx} cy={cy} r={6} fill="#7020A0" opacity={0.2} />
                              <circle cx={cx} cy={cy} r={3.5} fill="#7020A0" opacity={0.7} />
                              <circle cx={cx} cy={cy} r={1.5} fill="#fff" opacity={0.9} />
                            </g>
                          )
                        }} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Sweep shimmer */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(139,108,224,0.04) 50%, transparent 100%)' }}
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
                <div className="pt-4 text-right">
                  {priceFeed.status === 'live' && priceFeed.price > 0 ? (
                    <>
                      <div className="text-5xl font-black tracking-tight">${priceFeed.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                      <div className="mt-2 flex items-center justify-end gap-3 text-lg">
                        <span className="font-semibold text-accent">ETH/USD <DataTag source="on-chain" label="chainlink" /></span>
                      </div>
                    </>
                  ) : (
                    <div className="text-2xl text-text-ghost">Price N/A <DataTag source="unavailable" label="testnet" /></div>
                  )}
                </div>
              </div>
            </div>

            {/* Winners tape — animated, clickable */}
            <div className="px-7 py-3">
              <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(90deg, rgba(139,108,224,.08), rgba(139,108,224,.04), rgba(139,108,224,.08))', boxShadow: '0 0 40px rgba(139,108,224,0.08)' }}>
                {/* Top glow line */}
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 10%, rgba(139,108,224,.4) 30%, rgba(139,108,224,.5) 50%, rgba(139,108,224,.4) 70%, transparent 90%)' }} />
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <motion.span
                      animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      className="text-2xl"
                    >🏆</motion.span>
                    <span className="text-base font-black uppercase tracking-[0.25em] text-accent font-display">Allocation Feed</span>
                  </div>
                  <div className="relative overflow-hidden flex-1" style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
                    <div className="flex gap-4 animate-[tape_20s_linear_infinite] whitespace-nowrap w-max">
                      {winners.length > 0 ? (
                        [...winners, ...winners, ...winners].map((w, i) => {
                          const poolColors = ['#A02068', '#7020A0', '#B01828']
                          const poolNames = ['MICRO', 'MID', 'MEGA']
                          const poolEmojis = ['⚡', '🔮', '🏆']
                          return (
                            <motion.a
                              key={i}
                              href={w.txHash ? `${chain.scan}/tx/${w.txHash}` : `${chain.scan}/address/${w.recipient}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group whitespace-nowrap rounded-xl px-4 py-2 flex items-center gap-2.5 cursor-pointer transition-all duration-300"
                              style={{
                                background: `linear-gradient(135deg, ${poolColors[w.poolType]}12, rgba(255,255,255,.03))`,
                                border: `1px solid ${poolColors[w.poolType]}25`,
                              }}
                              whileHover={{ scale: 1.04, y: -1 }}
                            >
                              <span className="text-lg">{poolEmojis[w.poolType]}</span>
                              <span className="text-sm font-black" style={{ color: poolColors[w.poolType] }}>{poolNames[w.poolType]}</span>
                              <span className="text-sm text-text-dim font-mono group-hover:text-accent transition-colors">
                                {w.recipient.slice(0, 6)}…{w.recipient.slice(-4)}
                              </span>
                              <span className="text-base font-black text-accent">{w.amount.toFixed(4)}</span>
                              <span className="text-sm text-accent font-bold">ETH</span>
                              <span className="text-text-ghost group-hover:text-accent transition-colors text-xs">↗</span>
                            </motion.a>
                          )
                        })
                      ) : (
                        <motion.div
                          className="flex items-center gap-3 text-base text-accent/70 font-mono px-4"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <motion.span
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                          >⏳</motion.span>
                          <span>Awaiting first payout — buy evmX to enter pools and win ETH rewards</span>
                        </motion.div>
                      )}
                    </div>
                  </div>
                  {winners.length > 0 && (
                    <div className="whitespace-nowrap text-sm text-text-label font-mono">
                      {winners.length} win{winners.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {/* Bottom glow line */}
                <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 10%, rgba(139,108,224,.3) 30%, rgba(139,108,224,.4) 50%, rgba(139,108,224,.3) 70%, transparent 90%)' }} />
              </div>
            </div>

        </div>{/* end TVL+Allocation wrapper */}

        {/* ═══ MAIN GRID: Pool lanes + Operator Rail ═══ */}
        <div className="grid gap-4 px-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            {/* Pool lanes — full-width horizontal — CENTER of the experience */}
            <div className="space-y-2 rounded-2xl p-3" style={{ background: 'rgba(3,1,10,0.12)' }}>
              <PoolLane pool="micro" data={pools.micro} elapsed={elapsed} />
              <PoolLane pool="mid" data={pools.mid} elapsed={elapsed} />
              <PoolLane pool="mega" data={pools.mega} elapsed={elapsed} />
            </div>

          </div>

          {/* ═══ ZONE 3: OPERATOR COMMAND RAIL ═══ */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl op-spine" />
          <div className="py-1 sticky top-16 flex flex-col relative z-10" style={{ minWidth: 0, height: 'calc(100vh - 3.5rem)' }}>
            <div className="op-device flex flex-col flex-1 min-h-0">
              {/* Projection layers — AI living system under glass */}
              <div className="op-projection">
                <div className="op-projection-grid" />
                <div className="op-projection-scan" />
              </div>
              <div className="op-side-channel-l" />
              <div className="op-side-channel-r" />

            {/* ═══ COMMAND BAY ═══ */}
            <div className="shrink-0 relative z-10 px-3 pt-3 pb-2" style={{ borderBottom: '2px solid rgba(0,220,255,0.12)', boxShadow: '0 2px 15px rgba(0,200,255,0.05)' }}>
              {/* HUD Header with decorative lines */}
              <div className="hud-section-header mb-2">
                <span className="text-xs font-black uppercase tracking-[0.3em] font-mono" style={{ color: '#00D8FF', textShadow: '0 0 12px rgba(0,220,255,0.4)' }}>OPERATOR</span>
                <span className={cn('hud-label', (canExecute ?? false) ? 'hud-label-cyan' : !isConnected ? 'hud-label-magenta' : 'hud-label-cyan')} style={{ opacity: (canExecute ?? false) ? 1 : 0.5 }}>
                  {(canExecute ?? false) ? `${readyPools.length} READY` : !isConnected ? 'OFFLINE' : 'STANDBY'}
                </span>
              </div>

              {/* CTA — HUD frame with cut corners */}
              {/* CTA — 3D sci-fi button with SVG frame */}
              <motion.button
                onClick={execute}
                disabled={!(canExecute ?? false) || isProcessing}
                whileHover={(canExecute ?? false) && execState === 'idle' ? { scale: 1.03 } : {}}
                whileTap={(canExecute ?? false) && execState === 'idle' ? { scale: 0.97 } : {}}
                className={cn('relative w-full transition-all overflow-visible', !(canExecute ?? false) && 'cursor-not-allowed')}
                style={{ padding: 0, background: 'none', border: 'none' }}
              >
                {/* SVG sci-fi frame — beveled hexagonal shape */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 340 74" preserveAspectRatio="none" style={{ filter: 'drop-shadow(0 0 12px rgba(255,40,120,0.2)) drop-shadow(0 0 25px rgba(200,0,180,0.08))' }}>
                  <defs>
                    <linearGradient id="ctaFill" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="rgba(80,0,60,0.45)"><animate attributeName="stop-color" values="rgba(80,0,60,0.45);rgba(40,0,80,0.45);rgba(80,0,60,0.45)" dur="6s" repeatCount="indefinite" /></stop>
                      <stop offset="50%" stopColor="rgba(50,0,80,0.4)" />
                      <stop offset="100%" stopColor="rgba(90,0,70,0.4)"><animate attributeName="stop-color" values="rgba(90,0,70,0.4);rgba(60,0,100,0.4);rgba(90,0,70,0.4)" dur="6s" repeatCount="indefinite" /></stop>
                    </linearGradient>
                    <linearGradient id="ctaStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(255,30,100,0.4)"><animate attributeName="stop-color" values="rgba(255,30,100,0.4);rgba(180,0,180,0.35);rgba(255,30,100,0.4)" dur="4s" repeatCount="indefinite" /></stop>
                      <stop offset="50%" stopColor="rgba(255,50,140,0.8)"><animate attributeName="stop-color" values="rgba(255,50,140,0.8);rgba(200,0,255,0.7);rgba(255,50,140,0.8)" dur="4s" repeatCount="indefinite" /></stop>
                      <stop offset="100%" stopColor="rgba(255,30,100,0.4)"><animate attributeName="stop-color" values="rgba(255,30,100,0.4);rgba(180,0,180,0.35);rgba(255,30,100,0.4)" dur="4s" repeatCount="indefinite" /></stop>
                    </linearGradient>
                  </defs>
                  {/* Main shape — thick uneven border */}
                  <path d="M 12 2 Q 2 2 2 12 L 2 62 Q 2 72 12 72 L 328 72 Q 338 72 338 62 L 338 12 Q 338 2 328 2 Z"
                    fill="url(#ctaFill)" stroke="url(#ctaStroke)" strokeWidth="4" strokeLinejoin="round" />
                  {/* Outer glow border — thicker on top/bottom, thinner on sides (uneven feel) */}
                  <line x1="20" y1="1" x2="320" y2="1" stroke="rgba(255,60,150,0.4)" strokeWidth="3" strokeLinecap="round">
                    <animate attributeName="opacity" values="0.3;0.65;0.3" dur="4s" repeatCount="indefinite" />
                  </line>
                  <line x1="40" y1="73" x2="300" y2="73" stroke="rgba(200,0,200,0.25)" strokeWidth="2.5" strokeLinecap="round">
                    <animate attributeName="opacity" values="0.2;0.5;0.2" dur="4s" repeatCount="indefinite" />
                  </line>
                  {/* Left side — thinner */}
                  <line x1="1" y1="15" x2="1" y2="59" stroke="rgba(255,40,120,0.2)" strokeWidth="2" strokeLinecap="round">
                    <animate attributeName="opacity" values="0.2;0.4;0.2" dur="5s" repeatCount="indefinite" />
                  </line>
                  {/* Right side — thinner */}
                  <line x1="339" y1="15" x2="339" y2="59" stroke="rgba(200,0,200,0.18)" strokeWidth="2" strokeLinecap="round">
                    <animate attributeName="opacity" values="0.15;0.35;0.15" dur="5s" repeatCount="indefinite" />
                  </line>
                  {/* Whole shape slow pulse glow */}
                  <path d="M 12 2 Q 2 2 2 12 L 2 62 Q 2 72 12 72 L 328 72 Q 338 72 338 62 L 338 12 Q 338 2 328 2 Z"
                    fill="none" stroke="rgba(255,60,150,0.12)" strokeWidth="8" strokeLinejoin="round">
                    <animate attributeName="opacity" values="0.1;0.3;0.1" dur="4s" repeatCount="indefinite" />
                  </path>
                </svg>

                {/* Sweep light */}
                {/* No sweep — clean surface */}

                {/* Text content */}
                <div className="relative z-10 py-4 px-4">
                  <AnimatePresence mode="wait">
                    <motion.div key={execState} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                      <motion.div
                        animate={{
                          textShadow: [
                            '0 0 6px rgba(255,60,150,0.25), 0 0 15px rgba(255,40,120,0.1)',
                            '0 0 15px rgba(255,80,180,0.5), 0 0 30px rgba(255,60,150,0.25), 0 0 50px rgba(200,0,200,0.12)',
                            '0 0 6px rgba(255,60,150,0.25), 0 0 15px rgba(255,40,120,0.1)',
                          ],
                          color: ['#FF60A8', '#FF90D0', '#FF60A8'],
                          opacity: [0.85, 1, 0.85],
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="text-2xl font-display font-black tracking-[0.25em] text-center"
                        style={{ WebkitTextStroke: '0.5px rgba(255,120,200,0.3)' }}
                      >
                        {execState === 'idle' && 'EXECUTE CYCLE'}
                        {execState === 'preflight' && 'SIMULATING...'}
                        {execState === 'sending' && 'SENDING TX...'}
                        {execState === 'confirming' && 'CONFIRMING...'}
                        {execState === 'success' && 'EXECUTED'}
                        {execState === 'error' && 'FAILED'}
                      </motion.div>
                      {(canExecute ?? false) && execState === 'idle' && (
                        <div className="text-xs font-mono font-normal mt-1.5 text-center" style={{ color: 'rgba(255,120,180,0.45)' }}>
                          {readyPools.join(' + ')} · {totalEth.toFixed(4)} ETH · VRF {vrfPending ? 'busy' : 'clear'}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.button>
              {execError && <div className="text-xs font-mono mt-1" style={{ color: '#FF4080' }}>{execError}</div>}

              {/* Mode tabs — HUD strip */}
              <div className="flex mt-2.5" style={{ borderTop: '1px solid rgba(0,200,255,0.06)' }}>
                {([
                  { key: 'execute' as const, label: 'EXECUTE', color: '#00D8FF' },
                  { key: 'enter' as const, label: 'ENTER', color: '#C060FF' },
                  { key: 'state' as const, label: 'STATE', color: '#00C0E0' },
                ]).map(tab => {
                  const active = railTab === tab.key
                  return (
                    <button key={tab.key} onClick={() => setRailTab(tab.key)}
                      className="flex-1 py-2.5 text-xs font-black tracking-[0.15em] transition-all cursor-pointer font-mono relative"
                      style={{ color: active ? tab.color : '#1A2035', textShadow: active ? `0 0 12px ${tab.color}60` : undefined }}>
                      {tab.label}
                      {active && <motion.div layoutId="modeBar" className="absolute bottom-0 left-[10%] right-[10%] h-[2px]" style={{ background: tab.color, boxShadow: `0 0 12px ${tab.color}80, 0 0 25px ${tab.color}40` }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ═══ SCROLLABLE MODE CONTENT ═══ */}
            <div className="op-scroll overflow-y-auto min-h-0 flex-1 relative z-10">
              <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">

              {/* ════════ EXECUTE MODE ════════ */}
              <div className={cn('px-4 py-3 transition-opacity duration-150', railTab === 'execute' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none invisible z-0')}>

                {/* Position — reactor-style visual display */}
                {isConnected && userStatus && (
                  <div className="mb-3">
                    {/* Token balance — electric hero display */}
                    <div className="relative text-center mb-3 py-4 rounded-xl overflow-hidden" style={{
                      background: 'linear-gradient(180deg, rgba(10,8,25,0.5), rgba(6,4,18,0.4))',
                      border: '1px solid rgba(60,140,255,0.1)',
                      boxShadow: '0 0 20px rgba(60,140,255,0.05), inset 0 0 30px rgba(60,140,255,0.02)',
                    }}>
                      {/* Top neon edge — blue */}
                      <div className="absolute top-0 left-[5%] right-[5%] h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(60,150,255,0.3), rgba(100,180,255,0.4), rgba(60,150,255,0.3), transparent)' }} />

                      <div className="text-xs uppercase tracking-[0.25em] mb-2 font-bold" style={{ color: '#4878B0', letterSpacing: '0.3em' }}>Your Position</div>

                      {/* Token number with electric aura */}
                      <div className="relative inline-block">
                        {/* Electric discharge SVG — mini lightning bolts */}
                        <svg className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)]" viewBox="0 0 200 50" preserveAspectRatio="none" style={{ opacity: 0.4 }}>
                          <motion.path d="M 10 25 L 18 18 L 22 25 L 30 15" fill="none" stroke="rgba(100,180,255,0.5)" strokeWidth="0.8" strokeLinecap="round"
                            animate={{ opacity: [0, 0.8, 0], pathLength: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5 }} />
                          <motion.path d="M 170 25 L 178 32 L 182 25 L 190 35" fill="none" stroke="rgba(100,180,255,0.5)" strokeWidth="0.8" strokeLinecap="round"
                            animate={{ opacity: [0, 0.8, 0], pathLength: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 2, delay: 0.8 }} />
                          <motion.path d="M 50 8 L 55 15 L 52 18" fill="none" stroke="rgba(140,160,255,0.4)" strokeWidth="0.6" strokeLinecap="round"
                            animate={{ opacity: [0, 0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3, delay: 0.3 }} />
                          <motion.path d="M 150 42 L 145 35 L 148 32" fill="none" stroke="rgba(140,160,255,0.4)" strokeWidth="0.6" strokeLinecap="round"
                            animate={{ opacity: [0, 0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2.5, delay: 1.2 }} />
                        </svg>
                        {/* Glow aura behind number */}
                        <motion.div
                          className="absolute inset-0 rounded-lg"
                          animate={{ opacity: [0.3, 0.6, 0.3] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ background: 'radial-gradient(ellipse at center, rgba(60,150,255,0.08), transparent 70%)', filter: 'blur(8px)' }}
                        />
                        <div className="relative text-5xl font-black font-display" style={{
                          color: '#D0E4FF',
                          textShadow: '0 0 10px rgba(60,150,255,0.4), 0 0 30px rgba(60,150,255,0.15), 0 0 60px rgba(60,150,255,0.05)',
                          letterSpacing: '-0.02em',
                        }}>
                          {userStatus.tokenBalanceFormatted.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div className="text-xs font-bold mt-1" style={{ color: '#4870A0', letterSpacing: '0.15em' }}>evmX tokens</div>

                      {/* Bottom neon edge — blue */}
                      <div className="absolute bottom-0 left-[8%] right-[8%] h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(60,150,255,0.15), transparent)' }} />
                    </div>

                    {/* Pool entry gauges — 3 inline mini reactors */}
                    <div className="grid grid-cols-3 gap-2 p-2 rounded-xl" style={{
                      background: 'rgba(6,4,16,0.3)',
                      border: '1px solid rgba(100,60,200,0.08)',
                      boxShadow: 'inset 0 0 20px rgba(100,60,200,0.02)',
                    }}>
                      {/* Top violet neon edge */}
                      <div className="col-span-3 -mt-2 -mx-2 mb-1 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(140,80,240,0.2), rgba(180,100,255,0.25), rgba(140,80,240,0.2), transparent)', borderRadius: '8px 8px 0 0' }} />
                      {[
                        { name: 'Micro', entries: userStatus.microEntries, eligible: userStatus.microEligible, color: '#A02068', fill: pools.micro?.fillPct ?? 0, ready: pools.micro?.isReady },
                        { name: 'Mid', entries: userStatus.midEntries, eligible: userStatus.midEligible, color: '#7020A0', fill: pools.mid?.fillPct ?? 0, ready: pools.mid?.isReady },
                        { name: 'Mega', entries: userStatus.megaEntries, eligible: userStatus.megaEligible, color: '#B01828', fill: pools.mega?.fillPct ?? 0, ready: pools.mega?.isReady },
                      ].map(p => {
                        const entryPct = (p.entries / 3) * 100
                        const cx = 40, cy = 40, r = 32
                        const circumference = 2 * Math.PI * r
                        const entryDash = (entryPct / 100) * circumference
                        const fillDash = (p.fill / 100) * circumference
                        return (
                          <div key={p.name} className="flex flex-col items-center py-2 rounded-xl" style={{
                            background: `linear-gradient(180deg, ${p.color}08, rgba(4,2,14,0.3))`,
                            border: `1px solid ${p.color}${p.entries > 0 ? '20' : '08'}`,
                            boxShadow: p.entries > 0 ? `0 0 15px ${p.color}10, inset 0 0 15px ${p.color}04` : undefined,
                          }}>
                            {/* Mini gauge ring */}
                            <svg width="80" height="80" viewBox="0 0 80 80">
                              {/* Background track */}
                              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="5" />
                              {/* Fill ring (outer) */}
                              <circle cx={cx} cy={cy} r={r} fill="none" stroke={p.color} strokeWidth="5"
                                strokeDasharray={`${fillDash} ${circumference}`} strokeDashoffset={circumference * 0.25}
                                strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
                                style={{ filter: `drop-shadow(0 0 4px ${p.color}40)`, opacity: 0.3 }} />
                              {/* Entry ring (inner, brighter) */}
                              <circle cx={cx} cy={cy} r={r - 8} fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="4" />
                              <circle cx={cx} cy={cy} r={r - 8} fill="none" stroke={p.entries > 0 ? p.color : 'transparent'} strokeWidth="4"
                                strokeDasharray={`${entryDash > 0 ? (p.entries / 3) * 2 * Math.PI * (r - 8) : 0} ${2 * Math.PI * (r - 8)}`}
                                strokeDashoffset={2 * Math.PI * (r - 8) * 0.25}
                                strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
                                style={{ filter: p.entries > 0 ? `drop-shadow(0 0 6px ${p.color}60)` : undefined }} />
                              {/* Center number */}
                              <text x={cx} y={cy - 2} textAnchor="middle" fill={p.entries > 0 ? p.color : '#383850'} fontSize="20" fontFamily="var(--font-display)" fontWeight="900"
                                style={{ textShadow: p.entries > 0 ? `0 0 10px ${p.color}50` : undefined } as React.CSSProperties}>{p.entries}</text>
                              <text x={cx} y={cy + 10} textAnchor="middle" fill={p.entries > 0 ? 'rgba(255,255,255,0.4)' : '#2A2A3A'} fontSize="7" fontFamily="var(--font-display)" letterSpacing="1.5">/3 ENTRY</text>
                            </svg>

                            {/* Pool name */}
                            <span className="text-xs font-black font-display tracking-wider" style={{ color: p.color, textShadow: p.entries > 0 ? `0 0 8px ${p.color}40` : undefined }}>{p.name}</span>

                            {/* Status */}
                            <span className="text-xs font-bold font-mono mt-0.5" style={{
                              color: !p.eligible ? '#C83878' : p.ready ? '#4BA0FF' : '#4A5070',
                              textShadow: p.ready ? '0 0 8px rgba(75,160,255,0.4)' : undefined,
                              fontSize: 9,
                            }}>
                              {!p.eligible ? 'LOCKED' : p.ready ? 'READY' : 'ELIGIBLE'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {(userStatus.microEntries + userStatus.midEntries + userStatus.megaEntries) > 0 && (
                      <div className="mt-2 text-xs font-bold font-mono text-center" style={{ color: '#C83878' }}>Selling will revoke {userStatus.microEntries + userStatus.midEntries + userStatus.megaEntries} active entries</div>
                    )}
                  </div>
                )}

                {/* Execution Pipeline — procedural visualization */}
                <div className="op-divider" />
                <div className="op-module mb-3 px-3 py-2.5">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#6898D0', textShadow: '0 0 10px rgba(60,150,255,0.15)' }}>Execution Pipeline</div>
                  <div className="flex items-center">
                    {['LOAD', 'CALL', 'VRF', 'PICK', 'PAYOUT'].map((step, i) => {
                      const armed = (canExecute ?? false)
                      const stepColor = armed ? (i === 0 ? '#5888C0' : '#656F95') : '#404060'
                      return (
                        <React.Fragment key={step}>
                          {i > 0 && (
                            <div className={cn('flex-1 mx-0.5 rounded-full', armed ? 'op-pipe-connector-live' : 'op-pipe-connector-idle')} />
                          )}
                          <div className="flex flex-col items-center gap-0.5">
                            <div className={cn('op-pipe-step font-mono', armed && i === 0 ? 'op-pipe-armed' : armed ? 'op-pipe-idle' : 'op-pipe-idle')}>
                              {i + 1}
                            </div>
                            <span className="font-bold font-mono" style={{ color: stepColor, fontSize: 8, letterSpacing: '0.05em', textShadow: armed && i === 0 ? `0 0 8px ${stepColor}40` : undefined }}>{step}</span>
                          </div>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>

                {/* Execution parameters */}
                <div className="mb-3 space-y-1 p-2.5 rounded-lg relative" style={{ background: 'rgba(6,4,16,0.25)', border: '1px solid rgba(60,140,255,0.05)' }}>
                  {/* Blue top neon */}
                  <div className="absolute top-0 left-[8%] right-[8%] h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(60,150,255,0.15), rgba(80,160,255,0.2), rgba(60,150,255,0.15), transparent)' }} />
                  {[
                    { label: 'Window', value: nearestTrigger, color: (canExecute ?? false) ? '#B090FF' : undefined },
                    { label: 'Distribution', value: `${totalEth.toFixed(4)} ETH`, color: (canExecute ?? false) ? '#B090FF' : undefined },
                    { label: 'Gas', value: '~0.0006 ETH' },
                    { label: 'VRF', value: vrfPending ? 'Pending callback' : 'Idle — ready', color: vrfPending ? '#F0C050' : '#5888C0' },
                    { label: 'Buffer', value: vrfStatus ? `${vrfStatus.bufferEth.toFixed(4)} ETH` : '…' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1 px-2 rounded" style={{ background: 'rgba(4,2,14,0.2)' }}>
                      <span className="text-xs text-text-ghost">{r.label}</span>
                      <span className="text-xs font-bold font-mono" style={{ color: r.color || 'rgba(237,232,248,0.7)' }}>{r.value}</span>
                    </div>
                  ))}
                </div>

                {/* Conditions */}
                <div className="op-divider" />
                <div className="mb-3 rounded-lg px-3 py-2.5 relative" style={{ background: 'rgba(6,4,16,0.25)', border: '1px solid rgba(200,60,120,0.06)' }}>
                  {/* Crimson top neon */}
                  <div className="absolute top-0 left-[10%] right-[10%] h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(200,70,130,0.15), rgba(220,80,140,0.2), rgba(200,70,130,0.15), transparent)' }} />
                  <div className="text-xs font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: '#7880A0', textShadow: '0 0 8px rgba(120,100,180,0.1)' }}>Conditions</div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { ok: isConnected, label: 'Wallet' },
                      { ok: (canExecute ?? false), label: readyPools.length > 0 ? `${readyPools.join('+')} ready` : 'Pool trigger' },
                      { ok: !vrfPending, label: 'VRF clear' },
                      { ok: true, label: 'Contract live' },
                    ].map((c, i) => (
                      <div key={i} className={cn('flex items-center gap-2 py-1.5 px-2.5', c.ok ? 'op-cond-ok' : 'op-cond-fail')}>
                        <span style={{ color: c.ok ? '#5888C0' : '#C83878', fontSize: 10, textShadow: c.ok ? '0 0 6px rgba(88,136,192,0.4)' : undefined }}>{c.ok ? '●' : '○'}</span>
                        <span className="text-xs font-mono font-bold" style={{ color: c.ok ? '#8896C7' : '#656F95' }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Briefing */}
                <div className="op-briefing text-xs text-text-explain leading-relaxed" style={{ fontWeight: 500 }}>
                  {(canExecute ?? false)
                    ? `Execute now: ${readyPools.join(' + ')} loaded, ${totalEth.toFixed(4)} ETH pending. VRF ${vrfPending ? 'processing' : 'idle'}. All conditions clear.`
                    : !isConnected
                      ? 'Connect wallet to operate. Protocol runs autonomously via CRE — manual execution is optional.'
                      : `Monitoring: pools accumulating. Next window: ${nearestTrigger}. No action required.`}
                </div>

                {/* Tactical Engine — inside Execute tab */}
                <div className="mt-3" className="pt-2">
                  <AIAdvisor pools={pools} userStatus={userStatus} vrfStatus={vrfStatus} readyPools={readyPools} isConnected={isConnected} vrfPending={vrfPending ?? false} />
                </div>
              </div>

              {/* ════════ ENTER MODE ════════ */}
              <div className={cn('px-4 py-3 transition-opacity duration-150', railTab === 'enter' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none invisible z-0')}>
                {/* Quick insight */}
                {pools.micro && pools.mid && pools.mega && (() => {
                  const mp = pools.micro!, dp = pools.mid!, gp = pools.mega!
                  const cheapest = mp.entryReqEth <= dp.entryReqEth && mp.entryReqEth <= gp.entryReqEth ? { n: 'Micro', c: '#A02068', v: mp.entryReqEth } : dp.entryReqEth <= gp.entryReqEth ? { n: 'Mid', c: '#7020A0', v: dp.entryReqEth } : { n: 'Mega', c: '#B01828', v: gp.entryReqEth }
                  const bestEVPool = [mp, dp, gp].reduce((best, p, i) => {
                    const ev = p.participants > 0 && p.entryReqEth > 0 ? p.balanceEth / p.participants - p.entryReqEth : -999
                    return ev > best.ev ? { ev, name: ['Micro', 'Mid', 'Mega'][i], color: ['#A02068', '#7020A0', '#B01828'][i] } : best
                  }, { ev: -999, name: '', color: '' })
                  return (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(4,2,14,0.3)', border: `1px solid ${cheapest.c}08` }}>
                        <div className="text-xs text-text-ghost mb-0.5">Cheapest Entry</div>
                        <div className="text-base font-black font-display" style={{ color: cheapest.c }}>{cheapest.n}</div>
                        <div className="text-xs font-mono text-text-label">{cheapest.v.toFixed(4)} ETH</div>
                      </div>
                      <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(4,2,14,0.3)', border: `1px solid ${bestEVPool.color}08` }}>
                        <div className="text-xs text-text-ghost mb-0.5">Best Edge</div>
                        <div className="text-base font-black font-display" style={{ color: bestEVPool.color }}>{bestEVPool.name}</div>
                        <div className="text-xs font-mono" style={{ color: bestEVPool.ev >= 0 ? '#B090FF' : '#C060A0' }}>{bestEVPool.ev > -999 ? `EV ${bestEVPool.ev >= 0 ? '+' : ''}${bestEVPool.ev.toFixed(4)}` : '--'}</div>
                      </div>
                    </div>
                  )
                })()}

                {/* Simulator */}
                <div className="mb-3">
                  <div className="text-xs font-bold text-text-ghost uppercase tracking-[0.12em] mb-1.5">Simulate Entry</div>
                  <div className="rounded-lg p-2" style={{ background: 'rgba(4,2,14,0.3)', border: '1px solid rgba(144,104,224,0.06)' }}>
                    <input type="number" value={simAmt} onChange={e => setSimAmt(e.target.value)} placeholder="ETH amount" step="0.001" min="0" className="w-full rounded bg-transparent px-2 py-1.5 text-base font-mono text-accent outline-none placeholder:text-text-ghost font-bold" />
                    <div className="flex gap-1 mt-1">
                      {[0.01, 0.05, 0.1].map(v => <button key={v} onClick={() => setSimAmt(String(v))} className="flex-1 py-1 rounded text-xs text-text-ghost hover:text-accent hover:bg-white/5 cursor-pointer font-mono transition-all font-bold text-center">{v}</button>)}
                    </div>
                  </div>
                </div>

                {/* Pool comparison lanes */}
                {pools.micro && pools.mid && pools.mega && (() => {
                  const eth = parseFloat(simAmt) || 0
                  const poolList = [
                    { name: 'Micro', pool: pools.micro!, color: '#A02068' },
                    { name: 'Mid', pool: pools.mid!, color: '#7020A0' },
                    { name: 'Mega', pool: pools.mega!, color: '#B01828' },
                  ]
                  return (
                    <div className="space-y-1.5">
                      {poolList.map(p => {
                        const req = p.pool.entryReqEth
                        const entries = eth > 0 ? (eth >= 2 * req ? 3 : eth >= req ? 2 : 1) : 0
                        const newParts = p.pool.participants + (entries > 0 ? 1 : 0)
                        const bestOdds = entries > 0 && newParts > 0 ? entries / (newParts - 1 + entries) * 100 : 0
                        const ev = p.pool.participants > 0 && req > 0 ? p.pool.balanceEth / p.pool.participants - req : 0
                        return (
                          <div key={p.name} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${p.color}08` }}>
                            <div className="flex items-center justify-between px-3 py-1.5" style={{ background: `linear-gradient(90deg, ${p.color}05, rgba(4,2,14,0.25))` }}>
                              <span className="text-xs font-black font-display" style={{ color: p.color }}>{p.name}</span>
                              <span className="text-xs font-bold font-mono text-text-label">{req.toFixed(4)} ETH</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 px-3 py-2 text-center" style={{ background: 'rgba(3,1,10,0.3)' }}>
                              <div>
                                <div className="text-base font-black font-display" style={{ color: entries > 0 ? p.color : 'rgba(255,255,255,0.15)' }}>{entries > 0 ? `${entries}×` : '—'}</div>
                                <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>Entries</div>
                              </div>
                              <div>
                                <div className="text-base font-black font-mono text-accent">{p.pool.participants}</div>
                                <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>Crowd</div>
                              </div>
                              <div>
                                <div className="text-base font-black font-mono" style={{ color: bestOdds > 15 ? '#5888C0' : 'rgba(255,255,255,0.4)' }}>{bestOdds > 0 ? `${bestOdds.toFixed(0)}%` : '—'}</div>
                                <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>Win</div>
                              </div>
                              <div>
                                <div className="text-base font-black font-mono" style={{ color: ev >= 0 ? '#B090FF' : '#C060A0' }}>{ev !== 0 ? (ev >= 0 ? '+' : '') + ev.toFixed(3) : '—'}</div>
                                <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>EV</div>
                              </div>
                            </div>
                            <NeonBar pct={p.pool.fillPct} color={p.color} height={8} />
                          </div>
                        )
                      })}
                      {eth > 0 && (
                        <div className="text-center py-1.5 rounded-lg" style={{ background: 'rgba(144,104,224,0.03)' }}>
                          <span className="text-xs text-text-ghost">Combined win: </span>
                          <span className="text-sm font-black font-mono text-accent">{(() => {
                            let miss = 1
                            ;[pools.micro!, pools.mid!, pools.mega!].forEach(p => {
                              const req = p.entryReqEth; const e = eth >= 2 * req ? 3 : eth >= req ? 2 : 1
                              miss *= 1 - e / (p.participants + e)
                            })
                            return ((1 - miss) * 100).toFixed(1)
                          })()}%</span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Entry guidance */}
                <div className="mt-3 text-xs text-text-explain leading-relaxed px-1" style={{ fontWeight: 500 }}>
                  {(() => {
                    const mp = pools.micro, dp = pools.mid, gp = pools.mega
                    if (!mp || !dp || !gp) return 'Loading…'
                    const leastCrowded = mp.participants <= dp.participants && mp.participants <= gp.participants ? 'Micro' : dp.participants <= gp.participants ? 'Mid' : 'Mega'
                    return `Entry = 0.7% of pool balance (floored + capped). Least crowded: ${leastCrowded}. Buy evmX on Uniswap to enter — 3% tax splits across all pools automatically.`
                  })()}
                </div>
              </div>

              {/* ════════ STATE MODE ════════ */}
              <div className={cn('px-4 py-3 transition-opacity duration-150', railTab === 'state' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none invisible z-0')}>
                {(() => {
                  const m2 = pools.micro, d2 = pools.mid, g2 = pools.mega
                  const totalPlayers = (m2?.participants ?? 0) + (d2?.participants ?? 0) + (g2?.participants ?? 0)
                  const tvl = (m2?.balanceEth ?? 0) + (d2?.balanceEth ?? 0) + (g2?.balanceEth ?? 0)
                  const readyCount = readyPools.length
                  const swapPct = Math.min((meta.swapBuffer / 120000) * 100, 100)
                  const posture = readyCount > 0 ? 'ARMED' : totalPlayers > 10 ? 'ACTIVE' : totalPlayers > 0 ? 'WARMING' : 'IDLE'
                  const postureColor = readyCount > 0 ? '#5888C0' : totalPlayers > 10 ? '#7020A0' : totalPlayers > 0 ? '#A02068' : '#656F95'

                  return (
                    <>
                      {/* Posture banner */}
                      <div className="flex items-center justify-between mb-3 py-2 px-3 rounded-lg" style={{ background: `linear-gradient(135deg, ${postureColor}08, rgba(4,2,14,0.25))`, border: `1px solid ${postureColor}10` }}>
                        <span className="text-xs font-bold text-text-ghost uppercase tracking-[0.12em]">System Posture</span>
                        <div className="flex items-center gap-1.5">
                          <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2.5, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full" style={{ background: postureColor }} />
                          <span className="text-xs font-black font-mono" style={{ color: postureColor }}>{posture}</span>
                        </div>
                      </div>

                      {/* Key metrics */}
                      <div className="grid grid-cols-3 gap-1.5 mb-3">
                        <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: 'rgba(4,2,14,0.3)' }}>
                          <div className="text-lg font-black font-display num-hero">{tvl.toFixed(4)}</div>
                          <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>TVL (ETH)</div>
                        </div>
                        <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: 'rgba(4,2,14,0.3)' }}>
                          <div className="text-lg font-black font-display text-accent">{totalPlayers}</div>
                          <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>Players</div>
                        </div>
                        <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: 'rgba(4,2,14,0.3)' }}>
                          <div className="text-lg font-black font-display" style={{ color: readyCount > 0 ? '#5888C0' : '#656F95' }}>{readyCount}/3</div>
                          <div className="text-xs text-text-ghost" style={{ fontSize: 10 }}>Ready</div>
                        </div>
                      </div>

                      {/* Health matrix */}
                      <div className="space-y-1 mb-3">
                        {[
                          { label: 'Ready Pools', value: readyCount > 0 ? readyPools.join(', ') : 'None', color: readyCount > 0 ? '#5888C0' : '#656F95' },
                          { label: 'VRF', value: vrfPending ? 'Processing' : 'Idle', color: vrfPending ? '#F0C050' : '#5888C0' },
                          { label: 'Swap Buffer', value: `${Math.floor(meta.swapBuffer).toLocaleString()}/120K`, color: swapPct > 80 ? '#7020A0' : '#EDE8F8' },
                          { label: 'Ownership', value: meta.isRenounced ? 'Renounced ✓' : 'Active', color: meta.isRenounced ? '#5888C0' : '#7020A0' },
                          { label: 'LP Status', value: meta.lpStatus === 'burned' ? 'Burned ✓' : meta.lpStatus, color: meta.lpStatus === 'burned' ? '#5888C0' : '#656F95' },
                        ].map((h, i) => (
                          <div key={i} className="flex items-center justify-between py-1 px-2 rounded" style={{ background: 'rgba(4,2,14,0.2)' }}>
                            <span className="text-xs text-text-ghost">{h.label}</span>
                            <span className="text-xs font-bold font-mono" style={{ color: h.color }}>{h.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Buffer bar */}
                      <div className="mb-3 px-2">
                        <div className="flex justify-between text-xs text-text-ghost mb-0.5"><span>Buffer</span><span>{swapPct.toFixed(0)}%</span></div>
                        <NeonBar pct={swapPct} color={swapPct > 80 ? '#7020A0' : '#A02068'} height={10} />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mb-3">
                        <button onClick={refreshPools} className="flex-1 rounded-lg py-1.5 text-xs text-text-ghost cursor-pointer hover:text-accent transition-colors text-center font-mono" style={{ background: 'rgba(4,2,14,0.25)', border: '1px solid rgba(255,255,255,0.03)' }}>↻ Refresh</button>
                        <button onClick={() => window.open(`${chain.scan}/address/${CONTRACTS.evmX}`, '_blank')} className="flex-1 rounded-lg py-1.5 text-xs text-text-ghost cursor-pointer hover:text-accent transition-colors text-center font-mono" style={{ background: 'rgba(4,2,14,0.25)', border: '1px solid rgba(255,255,255,0.03)' }}>BaseScan ↗</button>
                      </div>

                      {/* State briefing */}
                      <div className="op-briefing text-xs text-text-explain leading-relaxed" style={{ fontWeight: 500 }}>
                        {readyCount > 0
                          ? `Protocol armed: ${readyPools.join(' + ')} meet trigger conditions. ${tvl.toFixed(4)} ETH locked, ${totalPlayers} participants. Execution clear.`
                          : `Protocol ${posture.toLowerCase()}: ${totalPlayers} participants, ${tvl.toFixed(4)} ETH locked. ${meta.isRenounced ? 'Renounced' : 'Active ownership'}, LP ${meta.lpStatus}. CRE nominal.`}
                      </div>
                    </>
                  )
                })()}
              </div>

              </div>{/* end grid overlay */}

              {/* Connection footer */}
              <div className="flex items-center justify-between px-4 py-2 text-xs relative" style={{ borderTop: '1px solid rgba(88,136,192,0.08)' }}>
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(88,136,192,0.15), rgba(144,104,224,0.15), transparent)' }} />
                <span className={cn('flex items-center gap-1.5 font-mono', isConnected ? 'text-ok' : 'text-text-ghost')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-ok' : 'bg-text-ghost')} />
                  {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
                <span className="flex items-center gap-1.5 text-accent font-mono">
                  <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-accent" />
                  LIVE
                </span>
              </div>
            </div>
            </div>{/* end op-inner */}
          </div>
          </div>{/* end rail wrapper */}
        </div>{/* end main grid */}

        {/* ═══ FLOW ANALYSIS — full-width below main grid ═══ */}
        <div className="px-5 py-3">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
            {/* Trade Stats */}
            <div className="p-5 field-recess rounded-xl">
              <div className="text-xl font-black text-accent font-display uppercase tracking-[0.2em] mb-4">
                Flow Pressure <DataTag source="on-chain" />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="field-well rounded-lg p-3">
                  <div className="text-base text-text-label font-semibold mb-1">Buys</div>
                  <div className="text-3xl font-black text-accent font-display">{tradeStats.buyCount}</div>
                </div>
                <div className="field-well rounded-lg p-3">
                  <div className="text-base text-text-label font-semibold mb-1">Sells</div>
                  <div className="text-3xl font-black text-mega font-display">{tradeStats.sellCount}</div>
                </div>
                <div className="field-well rounded-lg p-3">
                  <div className="text-base text-text-label font-semibold mb-1">Buy Volume</div>
                  <div className="text-xl font-bold text-accent font-mono">{tradeStats.buyVolume > 1000 ? `${(tradeStats.buyVolume / 1000).toFixed(1)}K` : tradeStats.buyVolume.toFixed(0)}</div>
                </div>
                <div className="field-well rounded-lg p-3">
                  <div className="text-base text-text-label font-semibold mb-1">Sell Volume</div>
                  <div className="text-xl font-bold text-mega font-mono">{tradeStats.sellVolume > 1000 ? `${(tradeStats.sellVolume / 1000).toFixed(1)}K` : tradeStats.sellVolume.toFixed(0)}</div>
                </div>
              </div>
              <div className="mb-4">
                <div className="text-base font-semibold text-text-label mb-2">Buy/Sell Pressure</div>
                {(() => {
                  const total = tradeStats.buyCount + tradeStats.sellCount
                  const buyPct = total > 0 ? (tradeStats.buyCount / total) * 100 : 50
                  return (
                    <div className="relative h-[12px] rounded-sm" style={{ background: 'rgba(4,2,14,0.4)', border: '1px solid rgba(139,108,224,0.06)' }}>
                      <div className="absolute left-1/2 top-[-3px] bottom-[-3px] w-[2px]" style={{ background: 'rgba(139,108,224,0.3)', marginLeft: -1 }} />
                      <motion.div className="absolute top-0 left-0 h-full rounded-sm"
                        initial={{ width: 0 }} animate={{ width: `${buyPct}%` }} transition={{ duration: 0.8 }}
                        style={{ background: 'linear-gradient(90deg, #A02068, #7020A0)' }} />
                      <motion.div className="absolute top-[-4px] w-[4px] h-[20px] rounded-sm"
                        initial={{ left: '50%' }} animate={{ left: `${buyPct}%` }} transition={{ duration: 0.8 }}
                        style={{ background: buyPct > 55 ? '#B090FF' : buyPct < 45 ? '#B01828' : '#7020A0', marginLeft: -2, boxShadow: '0 0 6px rgba(139,108,224,0.3)' }} />
                      {[25, 75].map(t => (
                        <div key={t} className="absolute top-0 h-full w-px" style={{ left: `${t}%`, background: 'rgba(139,108,224,0.1)' }} />
                      ))}
                    </div>
                  )
                })()}
                <div className="flex justify-between mt-1 text-sm font-mono">
                  <span className="text-accent">BUY {tradeStats.buyCount + tradeStats.sellCount > 0 ? ((tradeStats.buyCount / (tradeStats.buyCount + tradeStats.sellCount)) * 100).toFixed(0) : 50}%</span>
                  <span className={cn('font-bold', tradeStats.pressure === 'bullish' ? 'text-accent' : tradeStats.pressure === 'bearish' ? 'text-mega' : 'text-text-label')}>
                    {tradeStats.pressure.toUpperCase()} ({tradeStats.ratio.toFixed(1)}×)
                  </span>
                  <span className="text-mega">SELL {tradeStats.buyCount + tradeStats.sellCount > 0 ? ((tradeStats.sellCount / (tradeStats.buyCount + tradeStats.sellCount)) * 100).toFixed(0) : 50}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                <div className="text-label">Largest Buy: <span className="text-ok font-bold">{tradeStats.largestBuy > 1000 ? `${(tradeStats.largestBuy / 1000).toFixed(1)}K` : tradeStats.largestBuy.toFixed(0)}</span></div>
                <div className="text-label">Largest Sell: <span className="text-danger font-bold">{tradeStats.largestSell > 1000 ? `${(tradeStats.largestSell / 1000).toFixed(1)}K` : tradeStats.largestSell.toFixed(0)}</span></div>
              </div>
            </div>

            {/* Live Trade Feed */}
            <div className="p-4">
              <div className="text-base font-black text-accent font-display uppercase tracking-widest mb-3">
                Live Trades <span className="text-sm text-text-label font-normal">({trades.length})</span>
              </div>
              <div className="space-y-1 max-h-[280px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {trades.length > 0 ? trades.slice(0, 20).map((t, i) => (
                  <motion.a key={i} href={t.txHash ? `${chain.scan}/tx/${t.txHash}` : `${chain.scan}/address/${t.address}`} target="_blank" rel="noopener noreferrer"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors group">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-black font-mono w-10', t.type === 'buy' ? 'text-ok' : 'text-danger')}>{t.type === 'buy' ? 'BUY' : 'SELL'}</span>
                      <span className="text-sm text-text-dim font-mono group-hover:text-accent transition-colors">{t.address.slice(0, 6)}...{t.address.slice(-4)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-accent font-mono">{t.amountTokens > 1000 ? `${(t.amountTokens / 1000).toFixed(1)}K` : t.amountTokens.toFixed(0)}</span>
                      <span className="text-sm text-text-ghost group-hover:text-accent transition-colors">↗</span>
                    </div>
                  </motion.a>
                )) : (
                  <div className="text-sm text-text-label font-mono py-4 text-center">
                    {!meta.pairAddress ? 'Uniswap pair not found — trade history requires an active liquidity pair'
                      : tradeStats.buyCount === 0 && tradeStats.sellCount === 0 ? 'No trades in recent blocks — historical and live trades appear automatically when buys/sells occur through the Uniswap pair'
                      : 'No trades found in recent blocks'}
                  </div>
                )}
              </div>
            </div>

            {/* Crowd Structure */}
            <div className="p-5 field-recess rounded-xl">
              <div className="text-xl font-black text-accent font-display uppercase tracking-[0.2em] mb-4">Crowd Structure <DataTag source="derived" /></div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="field-well rounded-lg p-3"><div className="text-base text-text-label font-semibold mb-1">Unique Buyers</div><div className="text-3xl font-black text-accent font-display">{holderStats.uniqueBuyers}</div></div>
                <div className="field-well rounded-lg p-3"><div className="text-base text-text-label font-semibold mb-1">Unique Sellers</div><div className="text-3xl font-black text-mega font-display">{holderStats.uniqueSellers}</div></div>
                <div className="field-well rounded-lg p-3"><div className="text-base text-text-label font-semibold mb-1">Net Buyers</div><div className="text-xl font-bold text-accent font-mono">{holderStats.netBuyers}</div></div>
                <div className="field-well rounded-lg p-3"><div className="text-base text-text-label font-semibold mb-1">Net Sellers</div><div className="text-xl font-bold text-mega font-mono">{holderStats.netSellers}</div></div>
              </div>
              <div className="mb-4">
                <div className="text-base font-semibold text-text-label mb-2">Buyer Dominance</div>
                <div className="relative h-[12px] rounded-sm" style={{ background: 'rgba(4,2,14,0.4)', border: '1px solid rgba(139,108,224,0.06)' }}>
                  <div className="absolute left-1/2 top-[-3px] bottom-[-3px] w-[2px]" style={{ background: 'rgba(139,108,224,0.3)', marginLeft: -1 }} />
                  {[25, 75].map(t => (<div key={t} className="absolute top-0 h-full w-px" style={{ left: `${t}%`, background: 'rgba(139,108,224,0.12)' }} />))}
                  <motion.div className="absolute top-0 left-0 h-full rounded-sm" initial={{ width: 0 }} animate={{ width: `${holderStats.buyerDominance}%` }} transition={{ duration: 0.8 }}
                    style={{ background: holderStats.buyerDominance > 55 ? 'linear-gradient(90deg, #A02068, #7020A0)' : 'linear-gradient(90deg, #A02068, #7E56D8)' }} />
                  <motion.div className="absolute top-[-4px] w-[4px] h-[20px] rounded-sm" initial={{ left: '50%' }} animate={{ left: `${holderStats.buyerDominance}%` }} transition={{ duration: 0.8 }}
                    style={{ background: holderStats.buyerDominance > 60 ? '#B090FF' : '#7020A0', marginLeft: -2, boxShadow: '0 0 6px rgba(139,108,224,0.3)' }} />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-base font-bold font-mono text-accent">{holderStats.buyerDominance.toFixed(0)}% buyers</span>
                  <span className="text-base font-mono text-mega">{(100 - holderStats.buyerDominance).toFixed(0)}% sellers</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="field-track rounded-lg"><span className="text-text-label font-semibold">Repeat Buyers</span><span className="text-accent font-black font-mono ml-2">{holderStats.repeatBuyers}</span></div>
                <div className="field-track rounded-lg"><span className="text-text-label font-semibold">Whales (1M+)</span><span className="text-accent font-black font-mono ml-2">{holderStats.whaleCount}</span></div>
              </div>
              {holderStats.topHolders.length > 0 && (
                <div>
                  <div className="text-sm text-text-label mb-1">Top Addresses</div>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    {holderStats.topHolders.slice(0, 6).map((h, i) => (
                      <a key={i} href={`${chain.scan}/address/${h.address}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-1 px-1 rounded hover:bg-white/[0.03] cursor-pointer text-sm font-mono">
                        <span className="text-text-dim">{h.address.slice(0, 6)}...{h.address.slice(-4)}</span>
                        <span className="text-accent font-bold">{h.netTokens > 1000 ? `${(h.netTokens / 1000).toFixed(0)}K` : h.netTokens.toFixed(0)}</span>
                        <span className="text-text-label">{h.buys}B/{h.sells}S</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Intelligence + Tactical + System sections consolidated into operator rail */}
        {false && (() => {
          const m = pools.micro, d = pools.mid, g = pools.mega
          const usd = priceFeed.status === 'live' ? priceFeed.price : 0

          // EXACT scoring from cre-workflow/src/workflows/evmx-ai-advisor/index.ts
          const scorePool = (p: typeof m, name: string) => {
            const fillScore = p.fillPct * 0.3
            const oddsScore = p.participants > 0 ? (100 / p.participants) * 0.4 : 0
            const timeScore = p.timeLeft < 3600 ? 30 : 0
            const sizeScore = (p.balanceEth * (usd || 2000)) * 0.001
            const total = fillScore + oddsScore + timeScore + sizeScore
            return { name, fillScore, oddsScore, timeScore, sizeScore, total, pool: p }
          }

          const scored = [
            scorePool(m, 'Micro'),
            scorePool(d, 'Mid'),
            scorePool(g, 'Mega'),
          ].sort((a, b) => b.total - a.total)

          const best = scored[0]
          const evMicro = m.participants > 0 && m.entryReqEth > 0 ? m.balanceEth / m.participants - m.entryReqEth : null
          const evMid = d.participants > 0 && d.entryReqEth > 0 ? d.balanceEth / d.participants - d.entryReqEth : null
          const evMega = g.participants > 0 && g.entryReqEth > 0 ? g.balanceEth / g.participants - g.entryReqEth : null

          // Ladder prediction
          const mElapsed = 7200 - m.timeLeft
          const dElapsed = 21600 - d.timeLeft
          const mRate = mElapsed > 0 ? m.balanceEth / mElapsed * 3600 : 0
          const dRate = dElapsed > 0 ? d.balanceEth / dElapsed * 3600 : 0
          const mLikelyUp = m.balanceEth >= m.thresholdEth || (mRate > 0 && m.thresholdEth > 0 && (m.thresholdEth - m.balanceEth) / mRate * 3600 < m.timeLeft)
          const dLikelyUp = d.balanceEth >= d.thresholdEth || (dRate > 0 && d.thresholdEth > 0 && (d.thresholdEth - d.balanceEth) / dRate * 3600 < d.timeLeft)

          const mRatio = m.entryReqEth > 0 ? m.balanceEth / m.entryReqEth : 0
          const dRatio = d.entryReqEth > 0 ? d.balanceEth / d.entryReqEth : 0
          const gRatio = g.entryReqEth > 0 ? g.balanceEth / g.entryReqEth : 0

          // Generate recommendation text
          const recommendation = best.pool.isReady
            ? `${best.name} pool is READY — execute cycle now to trigger VRF allocation for ${best.pool.balanceEth.toFixed(4)} ETH.`
            : best.pool.participants === 0
              ? `${best.name} pool has 0 participants — first entry gets best odds. Entry cost: ${best.pool.entryReqEth.toFixed(4)} ETH.`
              : `Best opportunity: ${best.name} pool at ${best.pool.fillPct.toFixed(0)}% filled with ${best.pool.participants} competitors. Return ratio: ${(best.pool.entryReqEth > 0 ? best.pool.balanceEth / best.pool.entryReqEth : 0).toFixed(0)}×.`

          return (
            <div className="px-5 py-3">
              {/* Zone header */}
              <div className="flex items-center gap-3 mb-3">
                <ElectricDot color="#7020A0" size={4} />
                <span className="text-sm uppercase tracking-[0.3em] text-accent/60 font-display">Intelligence</span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(139,108,224,0.15), transparent)' }} />
              </div>

              {/* ── AI Decision Brief ── */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(8,5,20,0.7), rgba(4,3,14,0.6))', border: '1px solid rgba(144,104,224,0.06)' }}>

                {/* HEADER */}
                <div className="px-5 pt-4 pb-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(144,104,224,0.06)' }}>
                  <span className="text-sm font-black text-accent font-display uppercase tracking-[0.2em]">AI Decision Brief</span>
                  <div className="flex items-center gap-1.5">
                    <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-accent" style={{ boxShadow: '0 0 6px rgba(144,104,224,0.4)' }} />
                    <span className="text-xs font-bold font-mono text-accent">LIVE</span>
                  </div>
                </div>

                {/* 1. DECISION HERO */}
                <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(144,104,224,0.04)' }}>
                  <div className="text-2xl font-black font-display mb-1" style={{ color: readyPools.length > 0 ? '#00D8FF' : '#7020A0', textShadow: readyPools.length > 0 ? '0 0 15px rgba(0,216,255,0.3)' : undefined }}>
                    {readyPools.length > 0 ? 'EXECUTE NOW' : best.pool.participants === 0 ? 'ENTER NOW' : 'HOLD & MONITOR'}
                  </div>
                  <div className="text-base text-text-label leading-snug">
                    {readyPools.length > 0
                      ? `${readyPools.join(' + ')} ready · ${(readyPools.reduce((s, n) => s + (n === 'Micro' ? m.balanceEth : n === 'Mid' ? d.balanceEth : g.balanceEth), 0)).toFixed(4)} ETH pending · VRF allocation available`
                      : best.pool.participants === 0
                        ? `${best.name} has zero participants — first entry gets maximum odds`
                        : `Best opportunity in ${best.name} at ${best.pool.fillPct.toFixed(0)}% fill · ${best.pool.participants} competitors`}
                  </div>
                  {/* Decision meta tags */}
                  <div className="flex gap-2 mt-2.5">
                    {[
                      { label: 'Confidence', value: readyPools.length > 0 ? 'High' : 'Medium', color: readyPools.length > 0 ? '#00D8FF' : '#7020A0' },
                      { label: 'Urgency', value: readyPools.length > 0 ? 'High' : 'Low', color: readyPools.length > 0 ? '#FF60A8' : '#A02068' },
                      { label: 'Delay cost', value: readyPools.length > 0 ? 'Rising' : 'Flat', color: readyPools.length > 0 ? '#FF60A8' : '#656F95' },
                    ].map(t => (
                      <span key={t.label} className="text-xs font-mono px-2 py-1 rounded" style={{ color: t.color, background: `${t.color}0C`, border: `1px solid ${t.color}18` }}>
                        {t.label}: <span className="font-bold">{t.value}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 2. WHY NOW */}
                <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(144,104,224,0.04)' }}>
                  <div className="text-xs font-bold text-text-ghost uppercase tracking-[0.2em] mb-2">Why Now</div>
                  <div className="space-y-1.5">
                    {(() => {
                      const reasons: string[] = []
                      if (readyPools.length > 0) {
                        reasons.push(`${readyPools.join(' and ')} pool${readyPools.length > 1 ? 's have' : ' has'} met trigger conditions — execution window is open`)
                        reasons.push(`${(readyPools.reduce((s, n) => s + (n === 'Micro' ? m.balanceEth : n === 'Mid' ? d.balanceEth : g.balanceEth), 0)).toFixed(4)} ETH is locked and ready for VRF-based random distribution`)
                        if (!vrfPending) reasons.push('VRF is idle — no pending randomness request blocking execution')
                      } else {
                        reasons.push(`${best.name} pool shows the strongest opportunity based on fill rate, crowd size, and timing`)
                        if (best.pool.participants < 5) reasons.push(`Low competition: only ${best.pool.participants} participant${best.pool.participants !== 1 ? 's' : ''} — better odds per entry`)
                        reasons.push(`Entry cost is ${best.pool.entryReqEth.toFixed(4)} ETH with a ${(best.pool.entryReqEth > 0 ? best.pool.balanceEth / best.pool.entryReqEth : 0).toFixed(1)}× return ratio`)
                      }
                      return reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-text-explain">
                          <span className="text-accent shrink-0 mt-0.5 font-mono text-xs">{i + 1}.</span>
                          <span>{r}</span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>

                {/* 3. IF YOU WAIT */}
                <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(144,104,224,0.04)' }}>
                  <div className="text-xs font-bold text-text-ghost uppercase tracking-[0.2em] mb-2">If You Wait</div>
                  <div className="text-sm text-text-explain leading-relaxed">
                    {readyPools.length > 0
                      ? `Delay allows more participants to enter, compressing your edge. CRE automation may execute before you — the protocol is autonomous. Current pool balances will not increase further until the next cycle begins.`
                      : `No immediate cost to waiting. Pools are still accumulating. Monitor fill rates — ${best.name} at ${best.pool.fillPct.toFixed(0)}% fill. Next threshold crossing or timer expiry creates the execution window.`}
                  </div>
                </div>

                {/* 4. RANKED OPTIONS */}
                <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(144,104,224,0.04)' }}>
                  <div className="text-xs font-bold text-text-ghost uppercase tracking-[0.2em] mb-2">Ranked Options</div>
                  <div className="space-y-2">
                    {scored.map((s, i) => {
                      const pColor = s.name === 'Micro' ? '#A02068' : s.name === 'Mid' ? '#7020A0' : '#B01828'
                      const pool = s.name === 'Micro' ? m : s.name === 'Mid' ? d : g
                      const ev = pool.participants > 0 && pool.entryReqEth > 0 ? pool.balanceEth / pool.participants - pool.entryReqEth : 0
                      const action = pool.isReady ? 'Execute now' : pool.participants === 0 ? 'Enter first' : ev > 0 ? 'Favorable entry' : 'Weak edge'
                      return (
                        <div key={s.name} className="flex items-center gap-3 py-1.5 px-3 rounded-lg" style={{ background: i === 0 ? `${pColor}08` : 'rgba(4,2,14,0.2)', borderLeft: `3px solid ${pColor}${i === 0 ? '40' : '15'}` }}>
                          <span className="text-base font-black font-mono w-6" style={{ color: i === 0 ? pColor : '#505070' }}>#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold" style={{ color: i === 0 ? '#EDE8F8' : '#8896C7' }}>
                              {action} — <span style={{ color: pColor }}>{s.name}</span>
                            </div>
                            <div className="text-xs text-text-ghost font-mono">
                              {pool.balanceEth.toFixed(4)} ETH · {pool.participants} players · EV {ev >= 0 ? '+' : ''}{ev.toFixed(4)} · {pool.fillPct.toFixed(0)}% fill
                            </div>
                          </div>
                          <span className="text-sm font-black font-mono" style={{ color: pColor }}>{s.total.toFixed(0)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 5. MODEL BASIS */}
                <div className="px-5 py-2.5">
                  <div className="text-xs text-text-ghost font-mono" style={{ opacity: 0.6 }}>
                    Based on fill rate, timing, crowd density, entry size, and execution readiness · CRE evmx-ai-advisor
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ═══ POOL TELEMETRY + REACTORS ═══ */}
        {pools.micro && pools.mid && pools.mega && (() => {
          const m = pools.micro, d = pools.mid, g = pools.mega
          // Simple telemetry data — 4 time points
          const telemetryData = [
            { t: '-6h', microBal: 0, midBal: 0, megaBal: 0 },
            { t: '-4h', microBal: m.balanceEth * 30, midBal: d.balanceEth * 30, megaBal: g.balanceEth * 20 },
            { t: '-2h', microBal: m.balanceEth * 60, midBal: d.balanceEth * 50, megaBal: g.balanceEth * 50 },
            { t: 'now', microBal: m.balanceEth * 100, midBal: d.balanceEth * 100, megaBal: g.balanceEth * 100 },
          ]

          return (
            <div className="px-5 py-2">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                {/* Pool Telemetry — multi-metric chart */}
                <div className="field-recess rounded-xl p-4 flex flex-col">
                  <div className="mb-2 flex items-center justify-between shrink-0">
                    <div className="text-lg font-bold text-text-label font-display">POOL TELEMETRY</div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span style={{ color: '#A02068' }}>● Micro</span>
                      <span style={{ color: '#7020A0' }}>● Mid</span>
                      <span style={{ color: '#B01828' }}>● Mega</span>
                    </div>
                  </div>

                  {/* Main chart — Balance progression */}
                  <div className="flex-1 min-h-[180px] w-full relative" style={{ background: 'rgba(4,2,14,0.15)', borderRadius: 6 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={telemetryData} margin={{ top: 8, right: 8, left: 30, bottom: 20 }}>
                        <defs>
                          <linearGradient id="tMicroF2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A02068" stopOpacity={0.15} /><stop offset="100%" stopColor="#A02068" stopOpacity={0} /></linearGradient>
                          <linearGradient id="tMidF2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7020A0" stopOpacity={0.2} /><stop offset="100%" stopColor="#7020A0" stopOpacity={0} /></linearGradient>
                          <linearGradient id="tMegaF2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B01828" stopOpacity={0.25} /><stop offset="100%" stopColor="#B01828" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,80,180,0.04)" />
                        <Area type="monotone" dataKey="microBal" stroke="none" fill="url(#tMicroF2)" isAnimationActive={false} />
                        <Area type="monotone" dataKey="midBal" stroke="none" fill="url(#tMidF2)" isAnimationActive={false} />
                        <Area type="monotone" dataKey="megaBal" stroke="none" fill="url(#tMegaF2)" isAnimationActive={false} />
                        <Line type="monotone" dataKey="microBal" stroke="#A02068" strokeWidth={2} dot={false} isAnimationActive={false} name="Micro ETH" />
                        <Line type="monotone" dataKey="midBal" stroke="#7020A0" strokeWidth={2} dot={false} isAnimationActive={false} name="Mid ETH" />
                        <Line type="monotone" dataKey="megaBal" stroke="#B01828" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Mega ETH" />
                        {/* Player lines removed — data simplified */}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Fill % summary */}
                  <div className="mt-2 flex justify-between text-xs font-mono px-1" style={{ fontSize: 9 }}>
                    <span style={{ color: '#A02068' }}>Fill: M {m.fillPct.toFixed(0)}%</span>
                    <span style={{ color: '#7020A0' }}>D {d.fillPct.toFixed(0)}%</span>
                    <span style={{ color: '#B01828' }}>G {g.fillPct.toFixed(0)}%</span>
                  </div>

                  {/* Key stats row */}
                  <div className="mt-2 grid grid-cols-3 gap-2 shrink-0">
                    {[
                      { label: 'Micro', bal: m.balanceEth, thr: m.thresholdEth, players: m.participants, color: '#A02068' },
                      { label: 'Mid', bal: d.balanceEth, thr: d.thresholdEth, players: d.participants, color: '#7020A0' },
                      { label: 'Mega', bal: g.balanceEth, thr: g.thresholdEth, players: g.participants, color: '#B01828' },
                    ].map(p => (
                      <div key={p.label} className="text-center py-1.5 rounded-lg" style={{ background: 'rgba(4,2,14,0.25)', border: `1px solid ${p.color}08` }}>
                        <div className="text-xs font-bold font-display" style={{ color: p.color }}>{p.label}</div>
                        <div className="text-sm font-black font-mono text-accent">{p.bal.toFixed(4)}</div>
                        <div className="text-xs font-mono text-text-ghost">{p.players}p · {p.thr > 0 ? `${((p.bal / p.thr) * 100).toFixed(0)}%` : '∞'}</div>
                      </div>
                    ))}
                  </div>
                </div>{/* end telemetry left column */}

                {/* Pool Reactors */}
                <div className="rounded-xl p-4 self-start">
                  <div className="text-lg font-black font-display text-accent uppercase tracking-[0.15em] mb-5">Pool Reactors</div>
                  <div className="grid gap-5 lg:grid-cols-3 max-w-5xl mx-auto">
                    {([
                      { name: 'MICRO', pool: m, color: '#A02068', bright: '#FF70B8', color2: '#801858', timer: 7200, pulse: 'pool-pulse-micro', glow: 'pool-glow-micro' },
                      { name: 'MID', pool: d, color: '#7020A0', bright: '#C080FF', color2: '#581888', timer: 21600, pulse: 'pool-pulse-mid', glow: 'pool-glow-mid' },
                      { name: 'MEGA', pool: g, color: '#B01828', bright: '#FF5050', color2: '#901020', timer: 604800, pulse: 'pool-pulse-mega', glow: 'pool-glow-mega' },
                    ] as const).map(p => {
                      const fill = p.pool.fillPct
                      const timeUsed = p.timer > 0 ? ((p.timer - p.pool.timeLeft) / p.timer) * 100 : 0
                      const participants = p.pool.participants
                      const crowding = participants > 0 ? Math.min((participants / 20) * 100, 100) : 0
                      const ev = participants > 0 && p.pool.entryReqEth > 0 ? p.pool.balanceEth / participants - p.pool.entryReqEth : 0
                      const pressure = Math.min(fill * 0.4 + crowding * 0.3 + timeUsed * 0.3, 100)
                      const winProb = participants > 0 ? (1 / participants) * 100 : 100
                      const rr = participants > 0 && p.pool.entryReqEth > 0 ? p.pool.balanceEth / p.pool.entryReqEth : 0
                      const hrs = Math.floor(p.pool.timeLeft / 3600)
                      const mins = Math.floor((p.pool.timeLeft % 3600) / 60)
                      const isMega = p.name === 'MEGA'
                      const ringW = isMega ? 14 : p.name === 'MID' ? 12 : 10
                      const gcx = 85, gcy = 85, gr = 70
                      const circumference = 2 * Math.PI * gr
                      const fillDash = (fill / 100) * circumference
                      const timeDash = (timeUsed / 100) * 2 * Math.PI * (gr - 16)

                      return (
                        <div key={p.name} className="rounded-xl p-5" style={{
                          background: `linear-gradient(180deg, rgba(${isMega ? '60,20,50' : '20,15,40'},0.4), rgba(4,2,14,0.3))`,
                          border: `1px solid ${p.color}15`,
                        }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-base font-black font-display" style={{ color: p.bright }}>{p.name}</span>
                            <span className="text-sm font-black font-mono" style={{ color: p.bright, textShadow: `0 0 6px ${p.color}40` }}>
                              {p.pool.isReady ? '● READY' : `${hrs}h${mins}m`}
                            </span>
                          </div>

                          {/* Gauge centered on top */}
                          <div className="flex justify-center mb-3">
                            <svg width="150" height="150" viewBox="0 0 170 170" style={{ animation: 'ring-arc-pulse 6s ease-in-out infinite' }}>
                              <circle cx={gcx} cy={gcy} r={gr} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={ringW} />
                              <circle cx={gcx} cy={gcy} r={gr} fill="none" stroke={p.bright} strokeWidth={ringW}
                                strokeDasharray={`${fillDash} ${circumference}`} strokeDashoffset={circumference * 0.25}
                                strokeLinecap="round" transform={`rotate(-90 ${gcx} ${gcy})`}
                                style={{ filter: `drop-shadow(0 0 4px ${p.color}40)` }} />
                              <circle cx={gcx} cy={gcy} r={gr - 16} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={6} />
                              <circle cx={gcx} cy={gcy} r={gr - 16} fill="none" stroke={p.bright} strokeWidth={6}
                                strokeDasharray={`${timeDash} ${2 * Math.PI * (gr - 16)}`} strokeDashoffset={2 * Math.PI * (gr - 16) * 0.25}
                                strokeLinecap="round" transform={`rotate(-90 ${gcx} ${gcy})`}
                                style={{ opacity: 0.5 }} />
                              {Array.from({ length: 12 }, (_, i) => {
                                const angle = (i / 12) * 2 * Math.PI - Math.PI / 2
                                const isMaj = i % 3 === 0
                                const x1 = gcx + Math.cos(angle) * (gr + 2)
                                const y1 = gcy + Math.sin(angle) * (gr + 2)
                                const x2 = gcx + Math.cos(angle) * (gr + (isMaj ? 7 : 4))
                                const y2 = gcy + Math.sin(angle) * (gr + (isMaj ? 7 : 4))
                                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isMaj ? `${p.color}40` : 'rgba(255,255,255,0.08)'} strokeWidth={isMaj ? 1.5 : 0.8} />
                              })}
                              <text x={gcx} y={gcy - 10} textAnchor="middle" fill={p.bright} fontSize={isMega ? 32 : 28} fontFamily="var(--font-display)" fontWeight="800">{pressure.toFixed(0)}</text>
                              <text x={gcx} y={gcy + 8} textAnchor="middle" fill={p.bright} fontSize="10" fontFamily="var(--font-display)" letterSpacing="1.5" opacity={0.6}>PRESSURE</text>
                              <text x={gcx} y={gcy + 24} textAnchor="middle" fill={p.bright} fontSize="13" fontFamily="var(--font-mono)" fontWeight="700" opacity={0.7}>{p.pool.balanceEth.toFixed(4)}</text>
                            </svg>
                          </div>

                          {/* Stats — horizontal rows below gauge */}
                          <div className="space-y-1.5 mb-3">
                            <div>
                              <div className="flex justify-between text-sm" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Fill</span><span className="font-mono font-bold">{fill.toFixed(1)}%</span></div>
                              <NeonBar pct={fill} color={p.color} height={10} className="mt-0.5" />
                            </div>
                            <div>
                              <div className="flex justify-between text-sm" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Timer</span><span className="font-mono font-bold">{timeUsed.toFixed(0)}%</span></div>
                              <NeonBar pct={timeUsed} color={timeUsed > 80 ? '#B01828' : p.color2} height={10} className="mt-0.5" />
                            </div>
                            <div className="flex justify-between text-sm" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Crowd</span><span className="font-mono font-bold">{participants} <span style={{ opacity: 0.5 }}>/ 20</span></span></div>
                            <div className="flex justify-between text-sm" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Win</span><span className="font-mono font-bold">{winProb.toFixed(1)}%</span></div>
                          </div>

                          {/* Bottom data row */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-sm" style={{ borderTop: `1px solid ${p.color}10` }}>
                            <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Entry</span><span className="font-mono font-bold">{p.pool.entryReqEth.toFixed(4)}</span></div>
                            <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>R/R</span><span className="font-mono font-bold">{rr.toFixed(1)}×</span></div>
                            <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Threshold</span><span className="font-mono font-bold">{p.pool.thresholdEth.toFixed(4)}</span></div>
                            <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>EV</span><span className="font-mono font-bold">{ev >= 0 ? '+' : ''}{ev.toFixed(4)}</span></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* ═══ BOT ACTIVITY — tactical intelligence modules ═══ */}
              {(() => {
                const totalP = m.participants + d.participants + g.participants
                if (totalP === 0) return null

                // Bot logic: bots are EXCLUDED from draws but they TRADE and PAY TAX into pools
                // So bots = pool fillers, not competitors. Show how much they contribute.
                const totalBuys = tradeStats.buyCount
                const totalSells = tradeStats.sellCount
                const totalTrades = totalBuys + totalSells

                // Bot estimation: use repeat buyer data if available, otherwise estimate from trade patterns
                const repeatRatio = holderStats.repeatBuyers > 0
                  ? Math.min(holderStats.repeatBuyers / Math.max(holderStats.uniqueBuyers, 1), 1)
                  : totalTrades > 0
                    ? Math.min(0.3, (totalSells / Math.max(totalTrades, 1)) * 0.5) // rough: high sell ratio = more bots
                    : 0
                const botTradesPct = Math.round(repeatRatio * 100)
                const estBotTrades = totalTrades > 0
                  ? Math.round(totalTrades * repeatRatio)
                  : 0 // no trades = no bot estimate

                const botPools = [
                  { name: 'Micro', pool: m, color: '#A02068', bright: '#FF70B8', botColor: '#D04090', cycle: 7200, ringW: 10, glowStr: 4, tier: 1, taxRate: 0.01 },
                  { name: 'Mid', pool: d, color: '#7020A0', bright: '#C080FF', botColor: '#8030B0', cycle: 21600, ringW: 12, glowStr: 6, tier: 2, taxRate: 0.015 },
                  { name: 'Mega', pool: g, color: '#B01828', bright: '#FF5050', botColor: '#C02030', cycle: 604800, ringW: 14, glowStr: 8, tier: 3, taxRate: 0.019 },
                ].map(p => {
                  // How much ETH bots generate per hour into this pool via tax
                  const botBuyVol = tradeStats.buyVolume * repeatRatio // estimated bot buy volume in tokens
                  const botSellVol = tradeStats.sellVolume * repeatRatio
                  // Tax goes to pools: buy tax splits across Micro(1%) + Mid(1.5%) + Marketing(0.5%), sell tax → Mega(1.9%)
                  const botTaxToPool = p.name === 'Mega'
                    ? botSellVol * p.taxRate * 0.00001 // rough ETH conversion
                    : botBuyVol * p.taxRate * 0.00001
                  const poolFillFromBots = p.pool.balanceEth > 0 ? Math.min(100, Math.round((botTaxToPool / Math.max(p.pool.balanceEth, 0.0001)) * 100)) : 0
                  const botContribution = botTaxToPool // ETH contributed by bots
                  const estHourlyRate = botContribution * 12 // extrapolate ~5min data to hourly
                  const trend = estHourlyRate > 0.001 ? 'active' : estHourlyRate > 0 ? 'low' : 'none'
                  const reading = trend === 'active'
                    ? `Bots actively trading — generating ~${estHourlyRate.toFixed(4)} ETH/h into ${p.name} pool via tax`
                    : trend === 'low'
                      ? `Low bot activity — minimal tax contribution to ${p.name}`
                      : `No detected bot trading for ${p.name} pool`
                  const botLikely = estBotTrades > 0
                    ? Math.round(estBotTrades * (p.name === 'Mega' ? 0.4 : p.name === 'Mid' ? 0.35 : 0.25))
                    : 0
                  // Per-pool bot % is based on actual bot trade distribution, not global pct
                  const poolBotPct = estBotTrades > 0 && botLikely > 0
                    ? Math.round((botLikely / Math.max(estBotTrades, 1)) * botTradesPct)
                    : 0
                  return { ...p, botTaxToPool, estHourlyRate, trend, reading, botLikely, parts: p.pool.participants, botPct2: poolBotPct }
                })
                const totalBotETH = botPools.reduce((s, p) => s + p.botTaxToPool, 0)

                return (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-sm font-black font-display uppercase tracking-[0.15em]" style={{ color: '#00D0FF', textShadow: '0 0 8px rgba(0,200,255,0.15)' }}>Bot Trading Monitor</span>
                      <span className="text-xs font-bold font-mono" style={{ color: estBotTrades > 5 ? '#F0C050' : '#5888C0' }}>
                        ~{estBotTrades} bot trades · {totalBotETH.toFixed(4)} ETH generated
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {botPools.map((p, pi) => {
                        const cx = 50, cy = 50, r = 38, rInner = 30
                        const circ = 2 * Math.PI * r
                        const circInner = 2 * Math.PI * rInner
                        const humanArc = ((100 - p.botPct2) / 100) * circ
                        const botSegs = p.botLikely // number of segmented bot arcs
                        const segGap = 4
                        const botTotalArc = (p.botPct2 / 100) * circ
                        const segLen = botSegs > 0 ? Math.max(2, (botTotalArc - (botSegs - 1) * segGap) / botSegs) : 0
                        // Activity strip — 20 time slots
                        const activityStrip = Array.from({ length: 20 }, (_, i) => {
                          const isBot = i >= (20 - Math.round(p.botPct2 / 5))
                          const intensity = isBot ? 0.5 + Math.random() * 0.5 : 0.1 + Math.random() * 0.3
                          return { isBot, intensity }
                        })

                        return (
                          <div key={p.name} className="rounded-xl overflow-hidden" style={{
                            background: p.tier === 3
                              ? `linear-gradient(180deg, rgba(40,5,25,0.4), rgba(15,2,12,0.35))`
                              : p.tier === 2
                                ? `linear-gradient(180deg, rgba(20,8,35,0.35), rgba(8,3,18,0.3))`
                                : `linear-gradient(180deg, rgba(8,12,28,0.3), rgba(3,6,16,0.25))`,
                            border: `${p.tier === 3 ? 1.5 : 1}px solid ${p.botLikely > 2 ? p.botColor : p.color}${p.tier === 3 ? '20' : p.tier === 2 ? '15' : '0A'}`,
                            boxShadow: p.tier === 3
                              ? `0 0 20px ${p.botColor}08, inset 0 0 25px ${p.botColor}04`
                              : p.tier === 2
                                ? `0 0 12px ${p.color}05, inset 0 0 15px ${p.color}03`
                                : undefined,
                          }}>
                            {/* Pool header */}
                            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${p.color}08` }}>
                              <span className="text-sm font-black font-display" style={{ color: p.bright, textShadow: `0 0 10px ${p.bright}40` }}>{p.name}</span>
                              <span className="text-xs font-bold font-mono" style={{ color: p.trend === 'rising' ? '#C02030' : p.trend === 'stable' ? '#F0C050' : '#5888C0' }}>
                                {p.trend === 'rising' ? '▲' : p.trend === 'stable' ? '—' : '▼'} {p.trend}
                              </span>
                            </div>

                            {/* HUD Gauge — unique per tier */}
                            <div className="flex justify-center py-2">
                              {(() => {
                                const R = 42, cg = 60, fullC = 2 * Math.PI * R
                                const humanLen = ((100 - p.botPct2) / 100) * fullC
                                const botLen = (p.botPct2 / 100) * fullC
                                const w = p.tier === 3 ? 8 : p.tier === 2 ? 6 : 4
                                const col = p.bright
                                const gf = `drop-shadow(0 0 ${p.tier * 2 + 2}px ${p.color}${p.tier === 3 ? '50' : '35'})`

                                return (
                                  <svg width="130" height="130" viewBox="0 0 130 130">
                                    {/* Background track */}
                                    {/* Track — empty = human (safe) */}
                                    <circle cx="65" cy="65" r={R} fill="none" stroke={col} strokeWidth={w} strokeOpacity={0.1} />

                                    {/* Bot fill — how much of the ring is bot (danger) */}
                                    <motion.circle cx="65" cy="65" r={R} fill="none" stroke={col} strokeWidth={w}
                                      strokeLinecap="round" transform="rotate(-90 65 65)" style={{ filter: gf }}
                                      initial={{ strokeDasharray: `0 ${fullC}`, strokeDashoffset: fullC * 0.25 }}
                                      animate={{ strokeDasharray: `${botLen} ${fullC}`, strokeDashoffset: fullC * 0.25 }}
                                      transition={{ duration: 1.5, ease: 'easeOut', delay: pi * 0.2 }} />

                                    {/* === CROSSHAIR TARGET HUD === */}
                                    {/* 12 tick marks */}
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const a = (i / 12) * 2 * Math.PI - Math.PI / 2
                                      const isMaj = i % 3 === 0
                                      const outerLen = isMaj ? (10 + p.tier * 3) : (5 + p.tier)
                                      return <line key={i}
                                        x1={65 + Math.cos(a) * (R + 3)} y1={65 + Math.sin(a) * (R + 3)}
                                        x2={65 + Math.cos(a) * (R + 3 + outerLen)} y2={65 + Math.sin(a) * (R + 3 + outerLen)}
                                        stroke={col} strokeWidth={isMaj ? (1.5 + p.tier * 0.5) : 1} opacity={isMaj ? (0.4 + p.tier * 0.1) : 0.2} />
                                    })}
                                    {/* 4 crosshair lines */}
                                    {[0, 90, 180, 270].map(deg => {
                                      const a = (deg / 360) * 2 * Math.PI - Math.PI / 2
                                      return <line key={deg}
                                        x1={65 + Math.cos(a) * (R + 3)} y1={65 + Math.sin(a) * (R + 3)}
                                        x2={65 + Math.cos(a) * (R + 18 + p.tier * 3)} y2={65 + Math.sin(a) * (R + 18 + p.tier * 3)}
                                        stroke={col} strokeWidth={1.5 + p.tier * 0.3} opacity={0.5 + p.tier * 0.1}
                                        style={{ filter: `drop-shadow(0 0 3px ${p.color}40)` }} />
                                    })}
                                    {/* Inner ring */}
                                    <circle cx="65" cy="65" r={R - (10 + p.tier)} fill="none" stroke={col} strokeWidth={1.5 + p.tier * 0.3} opacity={0.12 + p.tier * 0.04} />
                                    {/* Corner brackets — all tiers */}
                                    <path d="M 8 24 L 8 8 L 24 8" fill="none" stroke={col} strokeWidth={1.5 + p.tier * 0.3} opacity={0.2 + p.tier * 0.08} />
                                    <path d="M 106 8 L 122 8 L 122 24" fill="none" stroke={col} strokeWidth={1.5 + p.tier * 0.3} opacity={0.2 + p.tier * 0.08} />
                                    <path d="M 122 106 L 122 122 L 106 122" fill="none" stroke={col} strokeWidth={1.5 + p.tier * 0.3} opacity={0.2 + p.tier * 0.08} />
                                    <path d="M 24 122 L 8 122 L 8 106" fill="none" stroke={col} strokeWidth={1.5 + p.tier * 0.3} opacity={0.2 + p.tier * 0.08} />

                                    {/* Center — ETH generated */}
                                    <text x="65" y="55" textAnchor="middle" fill={col} fontSize={p.tier === 3 ? 20 : p.tier === 2 ? 18 : 15} fontFamily="var(--font-display)" fontWeight="900">{p.estHourlyRate.toFixed(4)}</text>
                                    <text x="65" y="69" textAnchor="middle" fill={col} fontSize="8" fontFamily="var(--font-display)" letterSpacing="1" opacity={0.5}>ETH/h</text>
                                    <text x="65" y="82" textAnchor="middle" fill={col} fontSize="7" fontFamily="var(--font-mono)" opacity={0.35}>~{p.botLikely} bot trades</text>
                                  </svg>
                                )
                              })()}
                            </div>

                            {/* Activity strip — liquid flow visualization */}
                            <div className="px-3 pb-1">
                              <div className="relative h-[14px] rounded-sm overflow-hidden" style={{ background: 'rgba(0,5,15,0.3)' }}>
                                {/* Human flow — smooth continuous gradient that drifts */}
                                <motion.div
                                  className="absolute top-0 left-0 h-full"
                                  style={{
                                    width: `${100 - p.botPct2}%`,
                                    background: `linear-gradient(90deg, ${p.color}30, ${p.color}60, ${p.color}40, ${p.color}70, ${p.color}40)`,
                                    backgroundSize: '200% 100%',
                                  }}
                                  animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
                                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                />
                                {/* Bot flow — pulsed, segmented, mechanical */}
                                {p.botLikely > 0 && (
                                  <div className="absolute top-0 h-full flex gap-[1px]" style={{ left: `${100 - p.botPct2}%`, width: `${p.botPct2}%` }}>
                                    {Array.from({ length: Math.max(2, Math.min(p.botLikely * 2, 10)) }, (_, i) => (
                                      <motion.div
                                        key={i}
                                        className="flex-1 rounded-[1px]"
                                        style={{ background: p.botColor }}
                                        animate={{ opacity: [0.3, 0.85, 0.3] }}
                                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                      />
                                    ))}
                                  </div>
                                )}
                                {/* Border between human and bot — bright separator */}
                                {p.botLikely > 0 && (
                                  <motion.div
                                    className="absolute top-0 bottom-0 w-[2px]"
                                    style={{ left: `${100 - p.botPct2}%`, background: 'rgba(255,255,255,0.4)' }}
                                    animate={{ opacity: [0.2, 0.7, 0.2] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                  />
                                )}
                              </div>
                              <div className="flex justify-between mt-0.5 text-xs font-mono" style={{ fontSize: 8, color: '#404060' }}>
                                <span style={{ color: p.color }}>human flow</span>
                                <span style={{ color: p.botColor }}>bot pulses</span>
                              </div>
                            </div>

                            {/* Bot contribution stats */}
                            <div className="px-3 py-2 grid grid-cols-2 gap-2 text-center" style={{ borderTop: `1px solid ${p.color}08` }}>
                              <div className="py-1.5 rounded-lg" style={{ background: `${p.color}0A`, border: `1px solid ${p.color}15`, color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}>
                                <div className="text-lg font-black font-display">{p.estHourlyRate.toFixed(4)}</div>
                                <div className="text-xs font-mono" style={{ opacity: 0.7 }}>ETH/hour</div>
                              </div>
                              <div className="py-1.5 rounded-lg" style={{ background: `${p.color}0A`, border: `1px solid ${p.color}15`, color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}>
                                <div className="text-lg font-black font-display">{p.botLikely}</div>
                                <div className="text-xs font-mono" style={{ opacity: 0.7 }}>bot trades</div>
                              </div>
                            </div>

                            {/* Pool metrics */}
                            <div className="px-3 py-2 space-y-1 text-xs font-mono" style={{ borderTop: `1px solid ${p.color}06` }}>
                              <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Tax to pool</span><span className="font-bold">{p.botTaxToPool.toFixed(4)} ETH</span></div>
                              <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Pool balance</span><span className="font-bold">{p.pool.balanceEth.toFixed(4)} ETH</span></div>
                              <div className="flex justify-between" style={{ color: p.bright, textShadow: `0 0 8px ${p.color}50`, fontWeight: 800 }}><span>Players</span><span className="font-bold">{p.parts} (bots excluded)</span></div>
                            </div>

                            {/* Tactical reading */}
                            <div className="px-3 py-2 text-xs" style={{ borderTop: `1px solid ${p.color}10`, color: p.bright, opacity: 0.6 }}>
                              {p.reading}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}



            </div>
          )
        })()}



        {/* Footer */}
        <div className="px-5 py-3 text-xs text-text-ghost text-center" style={{ opacity: 0.4 }}>evmX Protocol · Built for Base · Live data · Updates every 15s</div>
      </div>
    </div>
  )
}
