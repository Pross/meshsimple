import { useState } from 'react'
import { NodeAvatar } from './Sidebar'
import { relativeTime } from '../utils/nodeColor'

export default function MapNodePanel({ nodes, myNodeId, onSelectNode }) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const sorted = Object.values(nodes)
    .filter((n) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        n.short_name?.toLowerCase().includes(q) ||
        n.long_name?.toLowerCase().includes(q) ||
        n.node_id?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      // Own node always first
      if (a.node_id === myNodeId) return -1
      if (b.node_id === myNodeId) return 1
      if (!a.last_heard) return 1
      if (!b.last_heard) return -1
      return new Date(b.last_heard) - new Date(a.last_heard)
    })

  return (
    <div className={`map-node-panel${collapsed ? ' map-node-panel--collapsed' : ''}`}>
      <button className="map-node-panel-toggle" onClick={() => setCollapsed((v) => !v)}>
        {collapsed ? '‹' : '›'}
      </button>
      {!collapsed && (
        <>
          <input
            className="msg-node-search"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="map-node-list">
            {sorted.map((node) => {
              const isOwn = node.node_id === myNodeId
              return (
                <div
                  key={node.node_id}
                  className={`map-node-row${isOwn ? ' map-node-row--own' : ''}`}
                  onClick={() => onSelectNode(node.node_id)}
                >
                  <NodeAvatar node={node} isOwn={isOwn} size={32} />
                  <div className="map-node-info">
                    <div className="map-node-name">
                      {node.long_name || node.short_name || node.node_id}
                      {isOwn && <span className="badge-you">You</span>}
                    </div>
                    <div className="map-node-sub">{relativeTime(node.last_heard)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
