interface IconProps {
  size?: number
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.8,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
}

export function EchoIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 2.5a9.5 9.5 0 0 1 0 19" opacity="0.5" />
      <path d="M12 21.5a9.5 9.5 0 0 1 0-19" opacity="0.5" />
    </svg>
  )
}

export function FeedIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M4 5h16M4 12h16M4 19h10" />
    </svg>
  )
}

export function PeopleIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16.5 5.6a3.5 3.5 0 0 1 0 5.8M18.5 14.5c1.7.9 2.5 2.6 2.5 5" />
    </svg>
  )
}

export function GearIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
    </svg>
  )
}

export function HeartIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M12 20.5C6.5 16.6 3.5 13.3 3.5 9.7 3.5 7 5.6 5 8.2 5c1.5 0 3 .8 3.8 2C12.8 5.8 14.3 5 15.8 5c2.6 0 4.7 2 4.7 4.7 0 3.6-3 6.9-8.5 10.8z" />
    </svg>
  )
}

export function CopyIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </svg>
  )
}

export function ImageIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3.5 16.5 9 12l4 3.5 3.5-3 4 4" />
    </svg>
  )
}

export function LogoRings({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128">
      <g fill="none" stroke="var(--accent)" stroke-width="7">
        <circle cx="64" cy="64" r="13" fill="var(--accent)" stroke="none" />
        <circle cx="64" cy="64" r="32" opacity="0.85" />
        <circle cx="64" cy="64" r="52" opacity="0.4" />
      </g>
    </svg>
  )
}
