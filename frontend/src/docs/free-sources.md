# Approved Free Sources for evmX Frontend

## Installed & Active

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| motion | ^12.x | MIT | React animations — transitions, hover, layout |
| @radix-ui/react-tooltip | ^1.x | MIT | Accessible tooltip primitive |
| @radix-ui/react-tabs | ^1.x | MIT | Accessible tabs primitive |
| @radix-ui/react-dialog | ^1.x | MIT | Accessible modal/dialog |
| @radix-ui/react-popover | ^1.x | MIT | Accessible popover |
| recharts | ^3.x | MIT | Sparkline/chart rendering |
| lucide-react | ^0.x | ISC | Icon library |
| class-variance-authority | ^0.x | Apache-2.0 | Component variant API |
| clsx + tailwind-merge | MIT | MIT | Class name utilities |

## Evaluated & Rejected

| Name | Reason |
|------|--------|
| DaisyUI | Pre-styled components would override evmX design language |
| Flowbite | Full UI kit — too opinionated, would create generic look |
| Preline UI | Same — full kit, not compatible with command-deck aesthetic |
| Material Tailwind | Material Design = wrong design direction entirely |
| TailGrids | Full framework — would pull toward template patterns |
| Magic UI / Aceternity UI | Landing-page oriented animated effects — too flashy for protocol interface |
| Tremor | Dashboard-focused — would regress into dashboard patterns |
| React Spring | Redundant with Motion, less React-idiomatic |

## Available for Future Use

| Name | What it provides | How to add |
|------|-----------------|-----------|
| @radix-ui/react-accordion | Collapsible sections | `npm install @radix-ui/react-accordion` |
| @radix-ui/react-select | Styled select dropdown | `npm install @radix-ui/react-select` |
| @radix-ui/react-switch | Toggle switch | `npm install @radix-ui/react-switch` |
| @radix-ui/react-scroll-area | Custom scrollbar | `npm install @radix-ui/react-scroll-area` |
| cmdk | Command palette (⌘K) | `npm install cmdk` — shadcn-compatible |
| sonner | Toast notifications | `npm install sonner` — better than current manual toast |
| vaul | Drawer/sheet component | `npm install vaul` |

## Design Direction Guardrails

When adding any new component source:
- Does it support unstyled/headless usage? (prefer yes)
- Does it fight the command-deck aesthetic? (reject if yes)
- Does it add generic dashboard patterns? (reject if yes)
- Is it MIT/Apache licensed? (require yes)
- Does it work with Tailwind v4? (require yes)
