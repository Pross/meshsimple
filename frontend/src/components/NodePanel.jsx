import { nodeColor, relativeTime } from '../utils/nodeColor'
import { NodeAvatar } from './Sidebar'

export default function NodePanel({ node, myNodeId, onClose, onLocate }) {
  if (!node) return null

  const isOwn = node.node_id === myNodeId
  const rows = [
    ['Node ID', node.node_id],
    ['Last heard', node.last_heard ? new Date(node.last_heard).toLocaleString() : null],
    ['Latitude', node.lat?.toFixed(6)],
    ['Longitude', node.lon?.toFixed(6)],
    ['Battery', node.battery_level != null ? `${node.battery_level}%` : null],
    ['Voltage', node.voltage != null ? `${node.voltage.toFixed(2)} V` : null],
    ['SNR', node.snr != null ? `${node.snr} dB` : null],
    ['Hops away', node.hops_away != null ? node.hops_away : null],
    ['Hardware', node.hardware_model],
    ['Firmware', node.firmware_version],
  ]

  return (
    <div className="node-panel">
      <div className="node-panel-header">
        <NodeAvatar node={node} isOwn={isOwn} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="node-panel-name">
            {node.long_name || node.short_name || node.node_id}
            {isOwn && <span className="badge-you">You</span>}
          </div>
          <div className="node-panel-subname">{relativeTime(node.last_heard)}</div>
        </div>
        <div className="node-panel-actions">
          {node.lat && node.lon && (
            <button className="btn-small" onClick={() => onLocate(node)}>Locate</button>
          )}
          <button className="btn-small btn-close" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="node-panel-body">
        {rows.map(([label, value]) =>
          value != null ? (
            <div key={label} className="node-detail-row">
              <span className="node-detail-label">{label}</span>
              <span className="node-detail-value">{value}</span>
            </div>
          ) : null
        )}
      </div>
    </div>
  )
}
