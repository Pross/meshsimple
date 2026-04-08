import { useState } from 'react'
import { NodeAvatar } from './Sidebar'
import { relativeTime } from '../utils/nodeColor'

export default function NodeList({ nodes, myNodeId, onSelectNode }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_heard')

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
      if (sortBy === 'last_heard') {
        if (!a.last_heard) return 1
        if (!b.last_heard) return -1
        return new Date(b.last_heard) - new Date(a.last_heard)
      }
      if (sortBy === 'name') {
        return (a.short_name || a.node_id).localeCompare(b.short_name || b.node_id)
      }
      if (sortBy === 'hops') {
        return (a.hops_away ?? 99) - (b.hops_away ?? 99)
      }
      return 0
    })

  return (
    <div className="nodes-view">
      <div className="nodes-toolbar">
        <input
          className="msg-node-search"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="nodes-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="last_heard">Last heard</option>
          <option value="name">Name</option>
          <option value="hops">Hops</option>
        </select>
      </div>
      <div className="nodes-count">Nodes ({sorted.length})</div>
      <div className="nodes-list">
        {sorted.map((node) => {
          const isOwn = node.node_id === myNodeId
          return (
            <div key={node.node_id} className="nodes-row" onClick={() => onSelectNode(node.node_id)}>
              <NodeAvatar node={node} isOwn={isOwn} size={40} />
              <div className="nodes-row-info">
                <div className="nodes-row-name">
                  {node.long_name || node.short_name || node.node_id}
                  {isOwn && <span className="badge-you">You</span>}
                </div>
                <div className="nodes-row-sub">{node.node_id}</div>
              </div>
              <div className="nodes-row-stats">
                <div className="nodes-stat">{relativeTime(node.last_heard)}</div>
                {node.battery_level != null && <div className="nodes-stat">{node.battery_level}%</div>}
                {node.hops_away != null && <div className="nodes-stat">{node.hops_away} hop{node.hops_away !== 1 ? 's' : ''}</div>}
                {node.snr != null && <div className="nodes-stat">{node.snr} dB</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
