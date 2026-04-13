import { useState, useRef, useEffect } from 'react'
import { NodeAvatar } from './Sidebar'
import { relativeTime, nodeActivity } from '../utils/nodeColor'

const SORT_OPTIONS = [
  { value: 'last_heard', label: 'Last heard' },
  { value: 'name',       label: 'Name' },
  { value: 'hops',       label: 'Hops' },
]

function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = SORT_OPTIONS.find((o) => o.value === value)

  return (
    <div className="sort-dropdown" ref={ref}>
      <button className="sort-dropdown-btn nodes-sort" onClick={() => setOpen((v) => !v)}>
        {selected?.label} <span className="sort-dropdown-arrow">▾</span>
      </button>
      {open && (
        <div className="sort-dropdown-menu">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`sort-dropdown-item${o.value === value ? ' active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NodeList({ nodes, myNodeId, onSelectNode, onMenuOpen }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_heard')

  const allNodes = Object.values(nodes)
  const totalCount = allNodes.length
  const recentCount = allNodes.filter((n) => nodeActivity(n.last_heard) === 'active').length
  const knownCount = allNodes.filter((n) => nodeActivity(n.last_heard) === 'known').length
  const oldCount = allNodes.filter((n) => nodeActivity(n.last_heard) === 'old' && n.node_id !== myNodeId).length
  const activeCount = allNodes.filter((n) => nodeActivity(n.last_heard) !== 'old' || n.node_id === myNodeId).length
  const tooltip = `Heard in last 24h: ${recentCount} · Last 7 days: ${knownCount} · Older / never seen: ${oldCount} (hidden)`

  const sorted = allNodes
    .filter((n) => nodeActivity(n.last_heard) !== 'old' || n.node_id === myNodeId)
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
        {onMenuOpen && (
          <button className="toolbar-menu-btn" onClick={onMenuOpen}>☰</button>
        )}
        <input
          className="msg-node-search"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <SortDropdown value={sortBy} onChange={setSortBy} />
      </div>
      <div className="nodes-count" title={tooltip}>Nodes {activeCount} active out of {totalCount} total</div>
      <div className="nodes-list">
        {sorted.map((node) => {
          const isOwn = node.node_id === myNodeId
          const activity = nodeActivity(node.last_heard)
          return (
            <div key={node.node_id} className={`nodes-row${activity === 'known' ? ' nodes-row--dim' : ''}`} onClick={() => onSelectNode(node.node_id)}>
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
