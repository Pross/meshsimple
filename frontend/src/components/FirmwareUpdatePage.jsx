import { useEffect, useState } from 'react'

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

export default function FirmwareUpdatePage({ ownNode, latestFirmware, onClose }) {
  const [release, setRelease] = useState(null)
  const [status, setStatus] = useState(null)
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

  function handleDeploy() {
    fetch('/api/ota/start', { method: 'POST' })
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error)
  }

  const targetVersion = latestFirmware || release?.version

  return (
    <div className="firmware-page">
      <div className="firmware-page-card">
        <div className="firmware-page-header">
          <h2>Firmware Update</h2>
          <button className="firmware-page-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="firmware-page-versions">
          <div className="firmware-page-version">
            <div className="firmware-page-label">Current</div>
            <div className="firmware-page-value">{ownNode?.firmware_version || 'unknown'}</div>
          </div>
          <div className="firmware-page-arrow">→</div>
          <div className="firmware-page-version">
            <div className="firmware-page-label">Latest</div>
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
            <button className="firmware-btn firmware-btn--deploy" onClick={handleDeploy}>Deploy</button>
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
                  <button className="firmware-btn firmware-btn--deploy" onClick={handleDeploy}>
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
