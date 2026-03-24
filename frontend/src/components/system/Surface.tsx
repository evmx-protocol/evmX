import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Depth = 'void' | 'stage' | 'pit' | 'surface' | 'dock' | 'raised'

const DEPTH_CLASSES: Record<Depth, string> = {
  void: 'bg-void',
  stage: 'bg-stage',
  pit: 'bg-pit',
  surface: 'bg-surface',
  dock: 'bg-dock',
  raised: 'bg-raised',
}

interface SurfaceProps {
  depth: Depth
  children: ReactNode
  className?: string
  as?: 'div' | 'main' | 'aside' | 'section' | 'article'
}

export function Surface({ depth, children, className, as: Tag = 'div' }: SurfaceProps) {
  return (
    <Tag className={cn(DEPTH_CLASSES[depth], className)}>
      {children}
    </Tag>
  )
}
