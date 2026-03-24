import { DataTag } from '@/components/system/DataTag'
import { StatusChip } from '@/components/system/StatusChip'
import { FillBar } from '@/components/system/FillBar'
import { Sparkline } from '@/components/system/Sparkline'
import { FadeIn, PulseValue } from '@/components/system/Animated'
import { Tooltip } from '@/components/system/Tooltip'
import { Surface } from '@/components/system/Surface'
import { IntelStrip } from '@/components/system/IntelStrip'

const MOCK_SPARKLINE_UP = [1.2, 1.3, 1.25, 1.4, 1.35, 1.5, 1.45, 1.6, 1.55, 1.7]
const MOCK_SPARKLINE_DOWN = [2.1, 2.0, 1.95, 1.8, 1.85, 1.7, 1.75, 1.6, 1.65, 1.5]
const MOCK_SPARKLINE_FLAT = [1.5, 1.5, 1.51, 1.49, 1.5, 1.5, 1.49, 1.51, 1.5, 1.5]

export function Lab() {
  return (
    <div className="min-h-screen bg-void text-text-primary p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-mono text-2xl font-extrabold mb-1">evmX Visual Lab</h1>
        <p className="text-xs text-text-ghost font-mono">Component variants · Design reference · NOT the live interface</p>
      </div>

      {/* ═══ TYPOGRAPHY SCALE ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Typography Scale</h2>
        <div className="space-y-2 font-mono">
          <div className="text-5xl font-extrabold tracking-[-2px]">0.0443 <span className="text-xl text-text-dim">ETH</span> <span className="text-xs text-text-ghost">— Hero (text-5xl)</span></div>
          <div className="text-3xl font-extrabold tracking-[-1px]">0.0290 <span className="text-lg text-text-dim">ETH</span> <span className="text-xs text-text-ghost">— Mega balance (text-3xl)</span></div>
          <div className="text-xl font-bold">12,450 evmX <span className="text-xs text-text-ghost">— Rail value (text-xl)</span></div>
          <div className="text-base font-semibold">0.0153 ETH <span className="text-xs text-text-ghost">— Mid balance (text-base)</span></div>
          <div className="text-sm font-semibold">0.0010 <span className="text-xs text-text-ghost">— Micro balance / entry cost (text-sm)</span></div>
          <div className="text-xs text-text-dim">Cycle #4 · 2h <span className="text-text-ghost">— Label (text-xs)</span></div>
          <div className="text-[10px] text-text-ghost">OPERATOR · READINESS · SYSTEM <span>— Micro label (10px)</span></div>
          <div className="text-[9px] text-text-ghost uppercase tracking-[3px]">Section Header <span className="tracking-normal">— Section header (9px, 3px tracking)</span></div>
          <div className="text-[8px] text-text-ghost uppercase tracking-[3px]">Operator <span className="tracking-normal">— Narrowest label (8px)</span></div>
        </div>
      </section>

      {/* ═══ DATA SOURCE TAGS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Data Source Tags</h2>
        <div className="flex flex-wrap gap-2">
          <DataTag source="on-chain" />
          <DataTag source="on-chain" label="chainlink" />
          <DataTag source="derived" />
          <DataTag source="estimate" />
          <DataTag source="estimate" label="linear est." />
          <DataTag source="estimate" label="bounds" />
          <DataTag source="estimate" label="1-entry" />
          <DataTag source="session-only" />
          <DataTag source="static-config" />
          <DataTag source="static-config" label="protocol rules" />
          <DataTag source="unavailable" />
          <DataTag source="unavailable" label="testnet — no feed" />
          <DataTag source="error" />
          <DataTag source="error" label="RPC error" />
          <DataTag source="loading" />
        </div>
      </section>

      {/* ═══ STATUS CHIPS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Status Chips</h2>
        <div className="flex flex-wrap gap-2">
          <StatusChip status="ready">READY</StatusChip>
          <StatusChip status="ready">THRESHOLD HIT</StatusChip>
          <StatusChip status="active">ACTIVE</StatusChip>
          <StatusChip status="warning">85% FILLED</StatusChip>
          <StatusChip status="idle">ACCUMULATING</StatusChip>
          <StatusChip status="danger">REVOKED</StatusChip>
          <StatusChip status="configured">CONFIGURED</StatusChip>
        </div>
      </section>

      {/* ═══ FILL BARS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Fill Bars</h2>
        <div className="space-y-3 max-w-[400px]">
          <div><span className="text-[9px] text-text-ghost font-mono">Micro 23%</span><FillBar pct={23} color="micro" /></div>
          <div><span className="text-[9px] text-text-ghost font-mono">Mid 67%</span><FillBar pct={67} color="mid" /></div>
          <div><span className="text-[9px] text-text-ghost font-mono">Mega 91%</span><FillBar pct={91} color="mega" /></div>
          <div><span className="text-[9px] text-text-ghost font-mono">Empty 0%</span><FillBar pct={0} color="micro" /></div>
          <div><span className="text-[9px] text-text-ghost font-mono">Full 100%</span><FillBar pct={100} color="mega" /></div>
        </div>
      </section>

      {/* ═══ SPARKLINES ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Sparkline Variants</h2>
        <div className="grid grid-cols-3 gap-4 max-w-[600px]">
          <div>
            <span className="text-[9px] text-text-ghost font-mono">Uptrend</span>
            <Sparkline data={MOCK_SPARKLINE_UP} height={32} />
          </div>
          <div>
            <span className="text-[9px] text-text-ghost font-mono">Downtrend</span>
            <Sparkline data={MOCK_SPARKLINE_DOWN} height={32} />
          </div>
          <div>
            <span className="text-[9px] text-text-ghost font-mono">Flat</span>
            <Sparkline data={MOCK_SPARKLINE_FLAT} height={32} />
          </div>
          <div>
            <span className="text-[9px] text-text-ghost font-mono">Insufficient data</span>
            <Sparkline data={[1.5]} height={32} />
          </div>
          <div>
            <span className="text-[9px] text-text-ghost font-mono">Tall (48px)</span>
            <Sparkline data={MOCK_SPARKLINE_UP} height={48} />
          </div>
          <div>
            <span className="text-[9px] text-text-ghost font-mono">Compact (16px)</span>
            <Sparkline data={MOCK_SPARKLINE_DOWN} height={16} />
          </div>
        </div>
      </section>

      {/* ═══ DEPTH SURFACES ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Depth Layers</h2>
        <div className="flex gap-3">
          {(['void', 'stage', 'pit', 'surface', 'dock', 'raised'] as const).map(d => (
            <Surface key={d} depth={d} className="px-4 py-6 rounded text-center min-w-[80px]">
              <div className="text-[9px] font-mono text-text-ghost">{d}</div>
            </Surface>
          ))}
        </div>
      </section>

      {/* ═══ MOTION VARIANTS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Motion Variants</h2>
        <div className="flex gap-4">
          <FadeIn delay={0}><div className="bg-pit px-4 py-3 rounded text-xs font-mono">FadeIn delay=0</div></FadeIn>
          <FadeIn delay={0.2}><div className="bg-pit px-4 py-3 rounded text-xs font-mono">FadeIn delay=0.2</div></FadeIn>
          <FadeIn delay={0.4}><div className="bg-pit px-4 py-3 rounded text-xs font-mono">FadeIn delay=0.4</div></FadeIn>
          <div className="bg-pit px-4 py-3 rounded text-xs font-mono">
            <PulseValue trigger={Date.now()}>PulseValue</PulseValue>
          </div>
        </div>
      </section>

      {/* ═══ TOOLTIP ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Tooltip (Radix)</h2>
        <div className="flex gap-4">
          <Tooltip content="Current threshold from contract. Ladder doubles on hit, halves on timeout.">
            <span className="text-xs font-mono text-micro cursor-help underline decoration-dotted">Hover: Smart Ladder</span>
          </Tooltip>
          <Tooltip content="0.7% of pool balance, clamped between floor and cap" side="bottom">
            <span className="text-xs font-mono text-mid cursor-help underline decoration-dotted">Hover: Entry Cost</span>
          </Tooltip>
          <Tooltip content="Selling revokes ALL entries in ALL pools for current + pending VRF cycles">
            <span className="text-xs font-mono text-danger cursor-help underline decoration-dotted">Hover: Sell Warning</span>
          </Tooltip>
        </div>
      </section>

      {/* ═══ INTEL STRIP ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">IntelStrip Variants</h2>
        <div className="grid grid-cols-2 gap-6">
          <IntelStrip title="Protocol State" items={[
            { label: 'Micro Ladder', value: '0.020 ETH (45%)', source: 'on-chain' },
            { label: 'Mid Ladder', value: '0.100 ETH (23%)', source: 'on-chain' },
            { label: 'Fill Rate', value: '0.0012 ETH/h', source: 'estimate', sourceLabel: 'linear' },
          ]} />
          <IntelStrip title="Return Analysis" items={[
            { label: 'Return Ratio', value: 'Mi:8× Md:15× Mg:22×', source: 'derived' },
            { label: 'EV (Mega)', value: '+0.0085', source: 'estimate', sourceLabel: '1-entry', color: 'text-ok' },
            { label: 'EV (Micro)', value: '-0.0003', source: 'estimate', sourceLabel: '1-entry', color: 'text-danger' },
          ]} />
        </div>
      </section>

      {/* ═══ POOL STAGE VARIANTS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Pool Stage Variants</h2>

        {/* Variant A: Current — asymmetric lanes */}
        <div className="mb-6">
          <div className="text-[10px] font-mono text-text-ghost mb-2">A: Asymmetric lanes (current — 1fr 1fr 1.6fr)</div>
          <div className="bg-pit rounded-md overflow-hidden">
            <div className="h-[3px] bg-gradient-to-r from-micro via-mid to-mega" />
            <div className="grid grid-cols-[1fr_1fr_1.6fr]">
              <div className="p-4 shadow-[inset_0_0_40px_rgba(64,200,224,.03)]">
                <div className="text-xs font-extrabold text-micro mb-1">⚡ MICRO</div>
                <div className="font-mono text-sm font-bold">0.0000</div>
                <div className="text-[9px] text-text-ghost font-mono mt-1">compact · tight · fast</div>
              </div>
              <div className="relative p-5 shadow-[inset_0_0_40px_rgba(48,192,168,.04)]">
                <div className="absolute left-0 top-4 bottom-4 w-px bg-text-ghost/15" />
                <div className="text-xs font-extrabold text-mid mb-1">🔮 MID</div>
                <div className="font-mono text-xl font-bold">0.0153</div>
                <div className="text-[9px] text-text-ghost font-mono mt-1">balanced · steady</div>
              </div>
              <div className="relative p-7 shadow-[inset_0_0_60px_rgba(232,160,48,.05)]">
                <div className="absolute left-0 top-4 bottom-4 w-px bg-text-ghost/15" />
                <div className="text-sm font-extrabold text-mega mb-1">🔥 MEGA</div>
                <div className="font-mono text-5xl font-extrabold tracking-[-2px]">0.0290</div>
                <div className="text-[9px] text-text-ghost font-mono mt-1">dominant · heavy · gravitational</div>
              </div>
            </div>
          </div>
        </div>

        {/* Variant B: Stacked — Mega on top, Micro+Mid below */}
        <div className="mb-6">
          <div className="text-[10px] font-mono text-text-ghost mb-2">B: Mega-dominant stack (Mega full width, Micro+Mid compressed below)</div>
          <div className="bg-pit rounded-md overflow-hidden">
            <div className="h-[3px] bg-mega" />
            <div className="p-7 shadow-[inset_0_0_60px_rgba(232,160,48,.05)]">
              <div className="text-sm font-extrabold text-mega mb-1">🔥 MEGA</div>
              <div className="font-mono text-5xl font-extrabold tracking-[-2px]">0.0290 <span className="text-lg text-text-dim">ETH</span></div>
              <div className="text-xs text-text-ghost font-mono mt-1">Day 6.8/7 · 12 players · Ready</div>
            </div>
            <div className="grid grid-cols-2">
              <div className="p-4 shadow-[inset_0_0_40px_rgba(64,200,224,.03)]">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-extrabold text-micro">⚡ MICRO</span>
                  <span className="font-mono text-sm font-bold">0.0000</span>
                </div>
                <div className="text-[9px] text-text-ghost font-mono">Cycle #4 · 0 players</div>
              </div>
              <div className="p-4 shadow-[inset_0_0_40px_rgba(48,192,168,.04)]">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-extrabold text-mid">🔮 MID</span>
                  <span className="font-mono text-sm font-bold">0.0153</span>
                </div>
                <div className="text-[9px] text-text-ghost font-mono">Cycle #3 · 8 players</div>
              </div>
            </div>
          </div>
        </div>

        {/* Variant C: Horizontal ticker with Mega anchored right */}
        <div className="mb-6">
          <div className="text-[10px] font-mono text-text-ghost mb-2">C: Horizontal flow — Micro/Mid as compact readouts, Mega as anchor block</div>
          <div className="bg-pit rounded-md overflow-hidden flex items-stretch">
            <div className="flex-1 flex">
              <div className="flex-1 p-3 shadow-[inset_0_0_40px_rgba(64,200,224,.03)]">
                <div className="text-[9px] font-extrabold text-micro uppercase tracking-wider">Micro</div>
                <div className="font-mono text-sm font-bold mt-0.5">0.0000</div>
                <FillBar pct={0} color="micro" className="mt-1" />
                <div className="text-[8px] text-text-ghost font-mono mt-1">Ready · 0 pl</div>
              </div>
              <div className="w-px bg-text-ghost/10" />
              <div className="flex-1 p-3 shadow-[inset_0_0_40px_rgba(48,192,168,.04)]">
                <div className="text-[9px] font-extrabold text-mid uppercase tracking-wider">Mid</div>
                <div className="font-mono text-sm font-bold mt-0.5">0.0153</div>
                <FillBar pct={45} color="mid" className="mt-1" />
                <div className="text-[8px] text-text-ghost font-mono mt-1">2h14m · 8 pl</div>
              </div>
            </div>
            <div className="w-px bg-mega/20" />
            <div className="w-[45%] p-5 shadow-[inset_0_0_60px_rgba(232,160,48,.05)] bg-mega/[.02]">
              <div className="text-xs font-extrabold text-mega uppercase tracking-wider">Mega</div>
              <div className="font-mono text-4xl font-extrabold tracking-[-2px] mt-1">0.0290</div>
              <FillBar pct={97} color="mega" className="mt-2" />
              <div className="text-[9px] text-text-ghost font-mono mt-1">Day 6.8/7 · 12 players · <span className="text-ok font-bold">READY</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ EXECUTION ZONE VARIANTS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Execution Zone Variants</h2>

        {/* Variant A: Current — 3 zone horizontal */}
        <div className="mb-6">
          <div className="text-[10px] font-mono text-text-ghost mb-2">A: Three-zone (Readiness | Button | System) — current</div>
          <div className="bg-pit rounded-md overflow-hidden">
            <div className="h-px bg-gradient-to-r from-mid/40 via-ok/30 to-mid/40" />
            <div className="flex items-center">
              <div className="flex-1 p-5">
                <div className="text-[8px] font-mono uppercase tracking-[3px] text-text-ghost mb-2">Readiness</div>
                <div className="font-mono text-xl font-extrabold text-ok">READY NOW</div>
                <div className="text-[10px] text-text-dim font-mono">Mega Pool</div>
              </div>
              <div className="px-6 py-4">
                <div className="bg-mid/12 text-mid font-mono font-extrabold uppercase tracking-wider px-8 py-3 rounded text-sm min-w-[200px] text-center">⚡ Execute</div>
              </div>
              <div className="flex-1 p-5 text-right">
                <div className="text-[8px] font-mono uppercase tracking-[3px] text-text-ghost mb-2">System</div>
                <div className="text-[10px] font-mono text-text-ghost space-y-0.5">
                  <div>VRF: <span className="text-ok">Idle</span></div>
                  <div>Buffer: 0.0000</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Variant B: Compact inline */}
        <div className="mb-6">
          <div className="text-[10px] font-mono text-text-ghost mb-2">B: Compact inline — single row</div>
          <div className="bg-pit rounded-md flex items-center gap-4 px-5 py-3">
            <div className="font-mono text-sm font-extrabold text-ok">READY</div>
            <span className="text-[9px] bg-mega/10 text-mega px-1.5 py-0.5 rounded-sm font-bold">Mega</span>
            <div className="flex-1" />
            <div className="text-[9px] font-mono text-text-ghost">VRF:Idle · Buf:0.0000</div>
            <div className="bg-mid/12 text-mid font-mono font-bold uppercase tracking-wider px-5 py-2 rounded text-xs cursor-pointer">⚡ Execute</div>
          </div>
        </div>

        {/* Variant C: Vertical command block */}
        <div className="mb-6">
          <div className="text-[10px] font-mono text-text-ghost mb-2">C: Vertical command block — centered CTA</div>
          <div className="bg-pit rounded-md p-6 text-center">
            <div className="text-[8px] font-mono uppercase tracking-[3px] text-text-ghost mb-3">Autonomous Execution</div>
            <div className="font-mono text-2xl font-extrabold text-ok mb-1">READY NOW</div>
            <div className="text-xs text-text-dim font-mono mb-4">Mega Pool · 12 players · 0.0290 ETH</div>
            <div className="inline-block bg-mid/12 text-mid font-mono font-extrabold uppercase tracking-wider px-10 py-3.5 rounded text-sm cursor-pointer hover:bg-mid/20 transition-colors">⚡ Execute Cycle</div>
            <div className="flex justify-center gap-6 mt-4 text-[9px] font-mono text-text-ghost">
              <span>VRF: <span className="text-ok">Idle</span></span>
              <span>Buffer: 0.0000</span>
              <span>CRE: Config</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ OPERATOR STRIP VARIANTS ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Operator Strip Variants</h2>

        <div className="grid grid-cols-3 gap-4">
          {/* Variant A: Current vertical */}
          <div>
            <div className="text-[10px] font-mono text-text-ghost mb-2">A: Vertical (current)</div>
            <div className="bg-pit/50 p-4">
              <div className="text-[7px] font-mono uppercase tracking-[3px] text-text-ghost mb-3">Operator</div>
              <div className="font-mono text-base font-extrabold">12,450 <span className="text-[9px] text-text-dim">evmX</span></div>
              <div className="flex gap-3 mt-1 text-[10px]">
                <span className="font-mono font-bold">2/3 <span className="text-text-ghost font-normal">pools</span></span>
                <span className="font-mono font-bold">5/9 <span className="text-text-ghost font-normal">entries</span></span>
              </div>
              <div className="mt-2 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[9px] font-mono">
                  <span className="text-text-ghost w-3">Mi</span>
                  <div className="flex gap-px"><div className="w-1.5 h-1.5 rounded-full bg-micro" /><div className="w-1.5 h-1.5 rounded-full bg-micro" /><div className="w-1.5 h-1.5 rounded-full bg-raised/60" /></div>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono">
                  <span className="text-text-ghost w-3">Md</span>
                  <div className="flex gap-px"><div className="w-1.5 h-1.5 rounded-full bg-mid" /><div className="w-1.5 h-1.5 rounded-full bg-raised/60" /><div className="w-1.5 h-1.5 rounded-full bg-raised/60" /></div>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono">
                  <span className="text-text-ghost w-3">Mg</span>
                  <div className="flex gap-px"><div className="w-1.5 h-1.5 rounded-full bg-mega" /><div className="w-1.5 h-1.5 rounded-full bg-mega" /><div className="w-1.5 h-1.5 rounded-full bg-mega" /></div>
                </div>
              </div>
            </div>
          </div>

          {/* Variant B: Ultra compact */}
          <div>
            <div className="text-[10px] font-mono text-text-ghost mb-2">B: Ultra compact</div>
            <div className="bg-pit/50 p-3">
              <div className="font-mono text-sm font-extrabold">12,450 <span className="text-[8px] text-text-ghost">evmX</span></div>
              <div className="text-[8px] font-mono text-text-ghost mt-0.5">2/3 pools · 5/9 entries</div>
              <div className="flex gap-1 mt-1.5">
                <span className="text-[8px] font-bold text-micro">Mi:2</span>
                <span className="text-[8px] font-bold text-mid">Md:1</span>
                <span className="text-[8px] font-bold text-mega">Mg:3</span>
              </div>
              <div className="text-[7px] text-danger/70 font-mono mt-1">⚠ sell=revoke 6</div>
            </div>
          </div>

          {/* Variant C: Horizontal bar */}
          <div>
            <div className="text-[10px] font-mono text-text-ghost mb-2">C: Horizontal bar</div>
            <div className="bg-pit/50 p-2 flex items-center gap-3 text-[9px] font-mono">
              <span className="font-bold">12,450</span>
              <span className="text-text-ghost">2/3</span>
              <div className="flex gap-px">
                <div className="w-1.5 h-1.5 rounded-full bg-micro" /><div className="w-1.5 h-1.5 rounded-full bg-micro" /><div className="w-1.5 h-1.5 rounded-full bg-raised/60" />
              </div>
              <div className="flex gap-px">
                <div className="w-1.5 h-1.5 rounded-full bg-mid" /><div className="w-1.5 h-1.5 rounded-full bg-raised/60" /><div className="w-1.5 h-1.5 rounded-full bg-raised/60" />
              </div>
              <div className="flex gap-px">
                <div className="w-1.5 h-1.5 rounded-full bg-mega" /><div className="w-1.5 h-1.5 rounded-full bg-mega" /><div className="w-1.5 h-1.5 rounded-full bg-mega" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DENSITY COMPARISON ═══ */}
      <section className="mb-10">
        <h2 className="text-xs font-mono font-bold text-text-ghost uppercase tracking-[3px] mb-4">Density Comparison</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] font-mono text-text-ghost mb-2">Low density (spacious)</div>
            <div className="bg-pit rounded p-6 space-y-4 text-sm font-mono">
              <div>Balance: <span className="font-bold">0.0290</span></div>
              <div>Players: <span className="font-bold">12</span></div>
              <div>Timer: <span className="font-bold text-ok">Ready</span></div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-text-ghost mb-2">Medium density (current)</div>
            <div className="bg-pit rounded p-4 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between"><span className="text-text-ghost">Balance</span><span className="font-bold">0.0290</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Players</span><span className="font-bold">12</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Timer</span><span className="font-bold text-ok">Ready</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Entry</span><span className="font-bold">0.0035</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Win %</span><span className="font-bold">2.8–8.3%</span></div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-text-ghost mb-2">High density (target)</div>
            <div className="bg-pit rounded p-3 text-[10px] font-mono space-y-px">
              <div className="flex justify-between"><span className="text-text-ghost">Bal</span><span className="font-bold">0.0290</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Pl</span><span>12</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">⏱</span><span className="text-ok font-bold">●RDY</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Ent</span><span>0.0035</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Win</span><span>2.8–8.3% <DataTag source="estimate" label="b" /></span></div>
              <div className="flex justify-between"><span className="text-text-ghost">EV</span><span className="text-ok">+0.008</span></div>
              <div className="flex justify-between"><span className="text-text-ghost">Ret</span><span>22×</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="text-[9px] text-text-ghost/40 font-mono pt-4">
        evmX Visual Lab — design reference only — not connected to live protocol
      </div>
    </div>
  )
}
