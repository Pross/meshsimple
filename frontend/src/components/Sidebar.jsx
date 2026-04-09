import { nodeColor } from '../utils/nodeColor'

const NAV_ITEMS = [
  { id: 'messages', label: 'Messages' },
  { id: 'map', label: 'Map' },
  { id: 'nodes', label: 'Nodes' },
]

function NodeAvatar({ node, isOwn, size = 36 }) {
  const label = node?.short_name || (node?.node_id?.slice(-4).toUpperCase() ?? '??')
  const color = nodeColor(node?.hops_away, isOwn)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.3,
    }}>
      {label}
    </div>
  )
}

export default function Sidebar({ activeTab, onTabChange, nodeCount, unreadCount, unreadFading, ownNode, theme, onThemeChange, collapsed }) {
  return (
    <div className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-inner">
        <div className="sidebar-logo">
          <img src="/favicon.svg" className="sidebar-logo-icon" alt="" />
          <span className="sidebar-logo-text">MeshSimple</span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item${activeTab === item.id ? ' active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
              {item.id === 'nodes' && nodeCount > 0 && (
                <span className="sidebar-badge">{nodeCount}</span>
              )}
              {item.id === 'messages' && unreadCount > 0 && (
                <span className={`sidebar-badge sidebar-badge--unread${unreadFading ? ' fading' : ''}`}>{unreadCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-channels">
          <div className="sidebar-section-label">Channels</div>
          <button
            className={`sidebar-nav-item${activeTab === 'messages' ? ' active' : ''}`}
            onClick={() => onTabChange('messages')}
          >
            # Primary
          </button>
        </div>

        <div className="sidebar-spacer" />

        {ownNode && (
          <div className="sidebar-own-node">
            <div className="sidebar-own-node-header">
              <NodeAvatar node={ownNode} isOwn size={40} />
              <div>
                <div className="sidebar-own-node-name">{ownNode.long_name || ownNode.short_name || ownNode.node_id}</div>
                <div className="sidebar-own-node-id">{ownNode.node_id}</div>
              </div>
            </div>
            <div className="sidebar-own-node-stats">
              {ownNode.battery_level != null && (
                <div className="sidebar-stat">
                  <span className="sidebar-stat-icon">🔋</span>
                  {ownNode.battery_level}% {ownNode.voltage != null ? `· ${ownNode.voltage.toFixed(2)}V` : ''}
                </div>
              )}
              {ownNode.firmware_version && (
                <div className="sidebar-stat">
                  <span className="sidebar-stat-icon">⚙</span>
                  {ownNode.firmware_version}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="sidebar-theme">
          <div className="sidebar-section-label">Color Scheme</div>
          <div className="theme-buttons">
            {['light', 'dark', 'system'].map((t) => (
              <button
                key={t}
                className={`theme-btn${theme === t ? ' active' : ''}`}
                onClick={() => onThemeChange(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

export { NodeAvatar }
