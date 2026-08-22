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

// "2.7.26.54e0d8d" -> { version: "2.7.26", hash: "54e0d8d" }, so the version
// number can be styled more prominently than the build hash suffix. Splits
// on the *last* dot rather than assuming a fixed major.minor.patch shape --
// the hash is always the final segment, however many numeric parts precede it.
export function splitFirmwareVersion(value) {
  if (!value) return { version: value, hash: '' }
  const lastDot = value.lastIndexOf('.')
  if (lastDot === -1) return { version: value, hash: '' }
  return { version: value.slice(0, lastDot), hash: value.slice(lastDot + 1) }
}
