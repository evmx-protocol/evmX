import { memo } from 'react'
import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  type Transition,
} from 'motion/react'

const ASSETS = {
  base: '/backgrounds/space-base-4k.webp',
  nebula: '/backgrounds/space-nebula-overlay.webp',
  starsNear: '/backgrounds/space-stars-near.webp',
} as const

type MotionLoopOptions = {
  x: number
  y: number
  scaleFrom: number
  scaleTo: number
  duration: number
  delay?: number
}

function createLoop(
  enabled: boolean,
  { x, y, scaleFrom, scaleTo, duration, delay = 0 }: MotionLoopOptions,
) {
  if (!enabled) {
    return {
      initial: { x: 0, y: 0, scale: 1 },
      animate: { x: 0, y: 0, scale: 1 },
      transition: { duration: 0 } satisfies Transition,
    }
  }

  return {
    initial: { x: 0, y: 0, scale: scaleFrom },
    animate: {
      x: [0, x, 0],
      y: [0, y, 0],
      scale: [scaleFrom, scaleTo, scaleFrom],
    },
    transition: {
      duration,
      delay,
      repeat: Infinity,
      repeatType: 'loop' as const,
      ease: 'easeInOut',
    } satisfies Transition,
  }
}

type LayerImageProps = {
  src: string
  className?: string
  style?: React.CSSProperties
  motion: ReturnType<typeof createLoop>
}

const LayerImage = ({
  src,
  className,
  style,
  motion: mot,
}: LayerImageProps) => {
  return (
    <m.img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="eager"
      decoding="async"
      initial={mot.initial}
      animate={mot.animate}
      transition={mot.transition}
      className={className}
      style={{
        ...style,
        backfaceVisibility: 'hidden',
        transform: 'translateZ(0)',
        willChange: 'transform, opacity',
        userSelect: 'none',
      }}
    />
  )
}

export const BackgroundLayers = memo(function BackgroundLayers() {
  const reduceMotion = useReducedMotion()
  const animated = !reduceMotion

  const baseMotion = createLoop(animated, {
    x: -18,
    y: -10,
    scaleFrom: 1.035,
    scaleTo: 1.06,
    duration: 70,
  })

  const leftNebulaMotion = createLoop(animated, {
    x: -26,
    y: -8,
    scaleFrom: 1.08,
    scaleTo: 1.14,
    duration: 95,
  })

  const rightNebulaMotion = createLoop(animated, {
    x: 22,
    y: -12,
    scaleFrom: 1.08,
    scaleTo: 1.145,
    duration: 105,
    delay: 2,
  })

  const nearStarsMotion = createLoop(animated, {
    x: 16,
    y: -14,
    scaleFrom: 1.03,
    scaleTo: 1.085,
    duration: 60,
    delay: 1.5,
  })

  return (
    <LazyMotion features={domAnimation}>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {/* 0) hard base color fallback */}
        <div className="absolute inset-0 bg-[#02040b]" />

        {/* 1) BASE SPACE LAYER — full clarity, no dimming */}
        <LayerImage
          src={ASSETS.base}
          motion={baseMotion}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.98]"
        />

        {/* 2) EDGE NEBULA LEFT — only at edges */}
        <LayerImage
          src={ASSETS.nebula}
          motion={leftNebulaMotion}
          className="absolute left-[-8%] top-[-4%] h-[112%] w-[62%] object-cover object-left opacity-[0.24] mix-blend-screen"
          style={{
            WebkitMaskImage:
              'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 58%, rgba(0,0,0,0.15) 82%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 58%, rgba(0,0,0,0.15) 82%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* 3) EDGE NEBULA RIGHT — mirrored */}
        <LayerImage
          src={ASSETS.nebula}
          motion={rightNebulaMotion}
          className="absolute right-[-8%] top-[-3%] h-[114%] w-[62%] scale-x-[-1] object-cover object-right opacity-[0.22] mix-blend-screen"
          style={{
            WebkitMaskImage:
              'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 58%, rgba(0,0,0,0.15) 82%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 58%, rgba(0,0,0,0.15) 82%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* 4) NEAR STAR LAYER — depth through parallax, must remain visible */}
        <LayerImage
          src={ASSETS.starsNear}
          motion={nearStarsMotion}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.34] mix-blend-screen"
          style={{
            WebkitMaskImage:
              'radial-gradient(ellipse at center, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.78) 22%, rgba(0,0,0,0.92) 58%, rgba(0,0,0,1) 100%)',
            maskImage:
              'radial-gradient(ellipse at center, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.78) 22%, rgba(0,0,0,0.92) 58%, rgba(0,0,0,1) 100%)',
          }}
        />

        {/* 5) very light readability wash — NOT darkening */}
        <div
          className="absolute inset-0"
          style={{
            background: 'rgba(3, 6, 18, 0.12)',
          }}
        />

        {/* 6) center calm + edge vignette — center calmer, not darker */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(
                ellipse at center,
                rgba(0,0,0,0.03) 0%,
                rgba(0,0,0,0.06) 28%,
                rgba(0,0,0,0.12) 58%,
                rgba(0,0,0,0.22) 100%
              )
            `,
          }}
        />

        {/* 7) subtle side atmosphere — premium edge energy */}
        <div
          className="absolute inset-0 opacity-[0.28] mix-blend-screen"
          style={{
            background: `
              radial-gradient(circle at 14% 50%, rgba(174, 71, 255, 0.14) 0%, rgba(174, 71, 255, 0.05) 18%, rgba(174, 71, 255, 0.00) 36%),
              radial-gradient(circle at 86% 46%, rgba(255, 66, 196, 0.14) 0%, rgba(255, 66, 196, 0.05) 18%, rgba(255, 66, 196, 0.00) 36%)
            `,
          }}
        />
      </div>
    </LazyMotion>
  )
})
