// Versions look like "2.7.15.567b8ea" (major.minor.patch.git-hash) — only the
// numeric triple is orderable, the hash is just a build identifier.
export function isUpdateAvailable(current, latest) {
  if (!current || !latest) return false
  const parse = (v) => v.split('.').slice(0, 3).map(Number)
  const [cMaj, cMin, cPatch] = parse(current)
  const [lMaj, lMin, lPatch] = parse(latest)
  if ([cMaj, cMin, cPatch, lMaj, lMin, lPatch].some(Number.isNaN)) return false
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
}
