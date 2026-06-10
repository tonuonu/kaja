import type { ProfileContent } from '../lib/events'
import { avatarGradient } from './format'

export function Avatar({ pubkey, profile }: { pubkey: string; profile?: ProfileContent }) {
  if (profile?.picture) {
    return <img class="avatar" src={profile.picture} alt="" loading="lazy" />
  }
  const initials = (profile?.name ?? pubkey).slice(0, 2)
  return (
    <div class="avatar" style={{ background: avatarGradient(pubkey) }}>
      {initials}
    </div>
  )
}
