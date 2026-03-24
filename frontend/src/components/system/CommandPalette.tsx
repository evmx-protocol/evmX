import { Command } from 'cmdk'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

/**
 * Command palette wrapper (⌘K) — built on cmdk.
 * Use for quick actions: pool switching, cycle execution, contract copy, etc.
 */
export function CommandPalette({ open, onOpenChange, children }: CommandPaletteProps) {
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        'fixed top-[20%] left-1/2 -translate-x-1/2 z-50',
        'w-[min(90vw,480px)] bg-stage rounded-lg shadow-[0_8px_60px_rgba(0,0,0,.7)] overflow-hidden',
      )}
    >
      <Command.Input
        placeholder="Search actions..."
        className="w-full px-4 py-3 bg-transparent text-text-primary font-mono text-sm outline-none placeholder:text-text-ghost"
      />
      <Command.List className="max-h-[300px] overflow-y-auto p-2">
        <Command.Empty className="py-4 text-center text-xs text-text-ghost font-mono">
          No results
        </Command.Empty>
        {children}
      </Command.List>
    </Command.Dialog>
  )
}

interface CommandItemProps {
  onSelect: () => void
  children: React.ReactNode
  className?: string
}

export function CommandItem({ onSelect, children, className }: CommandItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'px-3 py-2 rounded-sm text-xs font-mono text-text-dim cursor-pointer',
        'data-[selected=true]:bg-mid/10 data-[selected=true]:text-text-primary',
        'transition-colors',
        className,
      )}
    >
      {children}
    </Command.Item>
  )
}
