const HOP_COLORS = ['#2ecc71', '#3d9be9', '#2471b5', '#1a4f80', '#0f2d4a']

export function nodeColor(hopsAway, isOwn) {
  if (isOwn) return '#4ecca3'
  if (hopsAway == null) return '#4a90d9'
  return HOP_COLORS[Math.min(hopsAway, HOP_COLORS.length - 1)]
}

const DAY = 86400 * 1000

// Returns 'active' (< 24h), 'known' (< 7d), or 'old' (>= 7d / never seen)
export function nodeActivity(isoString) {
  if (!isoString) return 'old'
  const age = Date.now() - new Date(isoString).getTime()
  if (age < DAY) return 'active'
  if (age < DAY * 7) return 'known'
  return 'old'
}

export function relativeTime(isoString) {
  if (!isoString) return 'never'
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
