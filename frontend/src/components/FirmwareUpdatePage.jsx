import { useEffect, useState } from 'react'
import { compareVersions } from '../utils/firmware'

const STEPS = [
  { key: 'checking', label: 'Checking device' },
  { key: 'downloading', label: 'Downloading firmware' },
  { key: 'rebooting', label: 'Rebooting into OTA mode' },
  { key: 'flashing', label: 'Flashing firmware' },
]

function stepState(status, stepKey) {
  if (!status || status.phase === 'idle') return 'pending'
  const curIdx = STEPS.findIndex((s) => s.key === status.phase)
  const stepIdx = STEPS.findIndex((s) => s.key === stepKey)
  if (stepIdx < curIdx) return 'done'
  if (stepIdx > curIdx) return 'pending'
  if (status.done) return status.error ? 'error' : 'done'
  return 'active'
}

const STEP_ICON = { done: '✓', error: '!', active: '●', pending: '○' }

export default function FirmwareUpdatePage({ ownNode, onChannelChange, onClose }) {
  const [release, setRelease] = useState(null)
  const [status, setStatus] = useState(null)
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)
  const running = status && status.phase !== 'idle' && !status.done

  useEffect(() => {
    fetch('/api/firmware/latest').then((r) => r.json()).then(setRelease).catch(console.error)
    fetch('/api/ota/status').then((r) => r.json()).then(setStatus).catch(console.error)
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      fetch('/api/ota/status').then((r) => r.json()).then(setStatus).catch(console.error)
    }, 1000)
    return () => clearInterval(timer)
  }, [running])

  function handleChannel(channel) {
    if (channel === release?.channel) return
    fetch('/api/firmware/channel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    })
      .then((r) => r.json())
      .then((d) => {
        setRelease(d)
        setConfirmDowngrade(false)
        onChannelChange?.(d.version || null)
      })
      .catch(console.error)
  }

  function handleDeploy() {
    fetch('/api/ota/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow_downgrade: confirmDowngrade }),
    })
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error)
  }

  const targetVersion = release?.version
  const current = ownNode?.firmware_version
  const cmp = compareVersions(current, targetVersion)
  const sameBuild = !!current && current === targetVersion
  const direction = sameBuild ? 'same' : cmp === -1 ? 'downgrade' : cmp === 0 ? 'reinstall' : 'upgrade'
  const deployLabel = { upgrade: 'Upgrade', downgrade: 'Downgrade', reinstall: 'Reinstall' }[direction]
  const deployDisabled = !targetVersion || direction === 'same' || (direction === 'downgrade' && !confirmDowngrade)

  return (
    <div className="firmware-page">
      <div className="firmware-page-card">
        <div className="firmware-page-header">
          <h2>Firmware Update</h2>
          <button className="firmware-page-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="firmware-page-channels" role="group" aria-label="Release channel">
          {['beta', 'alpha'].map((c) => (
            <button
              key={c}
              className={`firmware-channel-btn${release?.channel === c ? ' firmware-channel-btn--active' : ''}`}
              onClick={() => handleChannel(c)}
              disabled={running}
            >
              {c === 'beta' ? 'Beta' : 'Alpha'}
              {release?.channels?.[c] && <span>{release.channels[c].split('.').slice(0, 3).join('.')}</span>}
            </button>
          ))}
        </div>

        <div className="firmware-page-versions">
          <div className="firmware-page-version">
            <div className="firmware-page-label">Current</div>
            <div className="firmware-page-value">{ownNode?.firmware_version || 'unknown'}</div>
          </div>
          <div className="firmware-page-arrow">→</div>
          <div className="firmware-page-version">
            <div className="firmware-page-label">Target</div>
            <div className="firmware-page-value">{targetVersion || '…'}</div>
          </div>
        </div>

        <div className="firmware-page-warning">
          WiFi OTA requires firmware 2.7.18 or newer to work reliably — older
          versions can enter OTA mode but never receive WiFi credentials, so
          the push can't complete. The device will be briefly unreachable
          during the update, and it's designed to fail safe and revert to
          the current firmware on its own if something goes wrong.
        </div>

        {direction === 'downgrade' && (
          <label className="firmware-page-warning firmware-page-downgrade">
            <input
              type="checkbox"
              checked={confirmDowngrade}
              onChange={(e) => setConfirmDowngrade(e.target.checked)}
            />
            <span>
              This installs an older version than the device is running. Settings
              and node data written by the newer firmware may not load on the
              older one, and a factory reset can be needed afterwards. Back up
              your device config first.
            </span>
          </label>
        )}

        {release?.notes && (
          <div className="firmware-page-notes">
            <div className="firmware-page-label">Release notes</div>
            <pre>{release.notes}</pre>
            {release.url && (
              <a href={release.url} target="_blank" rel="noreferrer">View on GitHub →</a>
            )}
          </div>
        )}

        {!status || status.phase === 'idle' ? (
          <div className="firmware-page-actions">
            <button className="firmware-btn firmware-btn--cancel" onClick={onClose}>Cancel</button>
            <button className="firmware-btn firmware-btn--deploy" onClick={handleDeploy} disabled={deployDisabled}>
              {direction === 'same' ? 'Up to date' : deployLabel || 'Deploy'}
            </button>
          </div>
        ) : (
          <>
            <div className="firmware-page-progress">
              {STEPS.map((step) => {
                const s = stepState(status, step.key)
                return (
                  <div key={step.key} className={`firmware-step firmware-step--${s}`}>
                    <span className="firmware-step-icon">{STEP_ICON[s]}</span>
                    {step.label}
                    {s === 'active' && status.percent != null && (
                      <span className="firmware-step-percent">{status.percent}%</span>
                    )}
                  </div>
                )
              })}
            </div>

            {status.done && (
              <div className={`firmware-page-result${status.error ? ' firmware-page-result--error' : ''}`}>
                {status.error || status.detail}
              </div>
            )}

            <div className="firmware-page-actions">
              {status.done ? (
                <>
                  <button className="firmware-btn firmware-btn--cancel" onClick={onClose}>Close</button>
                  <button className="firmware-btn firmware-btn--deploy" onClick={handleDeploy} disabled={deployDisabled}>
                    {status.error ? 'Retry' : 'Deploy again'}
                  </button>
                </>
              ) : (
                <button className="firmware-btn firmware-btn--cancel" disabled title="An update in progress can't be safely cancelled">
                  Deploying…
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
