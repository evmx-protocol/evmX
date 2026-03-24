import { DataTag } from '@/components/system/DataTag'

export function RulesStrip() {
  const rules = [
    { label: 'Min Hold', value: '10K+', tag: false },
    { label: 'Buy Tax', value: '3%', tag: false },
    { label: 'Sell Tax', value: '3%', tag: false },
    { label: 'Max Entries', value: '3/pool', tag: false },
    { label: 'Sell', value: 'Revokes', warn: true, tag: false },
    { label: 'Whale', value: '3%', tag: false },
    { label: 'Same-block', value: '1 TX', tag: false },
  ]

  return (
    <div className="flex flex-wrap gap-x-1 gap-y-0.5 py-2">
      <DataTag source="static-config" label="protocol rules" className="mr-1" />
      {rules.map(r => (
        <span key={r.label} className="text-[9px] font-mono text-text-ghost px-1">
          {r.label}: <span className={r.warn ? 'text-danger font-semibold' : 'text-text-dim font-semibold'}>{r.value}</span>
        </span>
      ))}
    </div>
  )
}
