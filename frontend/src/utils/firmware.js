// Versions look like "2.7.15.567b8ea" (major.minor.patch.git-hash) — only the
// numeric triple is orderable, the hash is just a build identifier.
// Returns 1 if b is newer than a, -1 if older, 0 if the same, null if unparseable.
export function compareVersions(a, b) {
  if (!a || !b) return null
  const parse = (v) => v.split('.').slice(0, 3).map(Number)
  const pa = parse(a)
  const pb = parse(b)
  if ([...pa, ...pb].some(Number.isNaN)) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] > pa[i] ? 1 : -1
  }
  return 0
}

export function isUpdateAvailable(current, latest) {
  return compareVersions(current, latest) === 1
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
