import { useEffect, useRef, useState } from 'react'
import { NodeAvatar } from './Sidebar'
import { relativeTime } from '../utils/nodeColor'

const MAX_LENGTH = 200

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dayKey(isoString) {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(isoString) {
  const d = new Date(isoString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'

  const opts = { weekday: 'long', day: 'numeric', month: 'long' }
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString([], opts)
}

function NodeListPanel({ nodes, myNodeId, messageNodeIds, onSelectNode }) {
  const [search, setSearch] = useState('')

  const participants = Object.values(nodes)
    .filter((n) => messageNodeIds.has(n.node_id))
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
      if (!a.last_heard) return 1
      if (!b.last_heard) return -1
      return new Date(b.last_heard) - new Date(a.last_heard)
    })

  return (
    <div className="msg-node-list">
      <input
        className="msg-node-search"
        placeholder="Search nodes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="msg-node-list-items">
        {participants.map((node) => (
          <div key={node.node_id} className="msg-node-row" onClick={() => onSelectNode(node.node_id)}>
            <NodeAvatar node={node} isOwn={node.node_id === myNodeId} size={36} />
            <div className="msg-node-info">
              <div className="msg-node-name">
                {node.long_name || node.short_name || node.node_id}
                {node.node_id === myNodeId && <span className="badge-you">You</span>}
              </div>
              <div className="msg-node-sub">{node.node_id}</div>
            </div>
          </div>
        ))}
        {participants.length === 0 && (
          <div style={{ padding: '16px 12px', color: 'var(--text-dim)', fontSize: 12 }}>
            {search ? 'No matches' : 'No participants yet'}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Messages({ messages, nodes, myNodeId, onSelectNode, unreadCount, onMenuOpen }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const dividerRef = useRef(null)
  // Snapshot unread count at mount — Messages remounts on each tab visit
  const unreadAtMount = useRef(unreadCount)
  const hasScrolledRef = useRef(false)

  // Stable first-unread ID based on mount snapshot
  const firstUnreadCount = unreadAtMount.current
  const firstUnreadId =
    firstUnreadCount > 0 && messages.length >= firstUnreadCount
      ? messages[messages.length - firstUnreadCount]?.id
      : null

  // On first render with data: scroll to divider (if unread) or bottom.
  // On subsequent message arrivals: scroll to bottom.
  useEffect(() => {
    if (messages.length === 0) return
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true
      if (dividerRef.current) {
        dividerRef.current.scrollIntoView({ behavior: 'instant' })
      } else {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      }
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || text.length > MAX_LENGTH) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.detail || 'Send failed')
      }
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  function senderNode(msg) {
    if (msg.direction === 'out') return null
    return nodes[msg.from_node_id] || null
  }

  function senderLabel(msg) {
    if (msg.direction === 'out') return 'You'
    const node = nodes[msg.from_node_id]
    return node?.short_name || msg.from_node_id.slice(-4).toUpperCase()
  }

  const messageNodeIds = new Set(messages.map((m) => m.from_node_id))
  const messageById = Object.fromEntries(messages.map((m) => [m.id, m]))

  // Group consecutive messages from same sender, inserting day + unread dividers
  const grouped = []
  let currentDayKey = null
  for (const msg of messages) {
    // Day divider
    const msgDayKey = msg.timestamp ? dayKey(msg.timestamp) : null
    if (msgDayKey && msgDayKey !== currentDayKey) {
      currentDayKey = msgDayKey
      grouped.push({ type: 'day', label: dayLabel(msg.timestamp) })
    }

    // Unread divider (inserted before the first unread message)
    if (msg.id === firstUnreadId) {
      grouped.push({ type: 'divider' })
    }

    const last = grouped[grouped.length - 1]
    const canAppend =
      last &&
      last.type === 'message' &&
      last.from_node_id === msg.from_node_id &&
      last.direction === msg.direction &&
      !msg.reply_id

    if (canAppend) {
      last.texts.push({ id: msg.id, text: msg.text, time: msg.timestamp, reply_id: msg.reply_id })
    } else {
      grouped.push({
        type: 'message',
        from_node_id: msg.from_node_id,
        direction: msg.direction,
        texts: [{ id: msg.id, text: msg.text, time: msg.timestamp, reply_id: msg.reply_id }],
        firstTime: msg.timestamp,
      })
    }
  }

  return (
    <div className="messages-view">
      <div className="messages-main">
        <div className="messages-header">
          Messages: Primary
          {onMenuOpen && (
            <button className="toolbar-menu-btn" onClick={onMenuOpen}>☰</button>
          )}
        </div>
        <div className="messages-list">
          {grouped.length === 0 && (
            <div className="messages-empty">
              <div className="messages-empty-icon">✉</div>
              <div>No messages yet.</div>
            </div>
          )}
          {grouped.map((item, i) => {
            if (item.type === 'day') {
              return (
                <div key={`day-${item.label}`} className="msg-day-divider">
                  <span>{item.label}</span>
                </div>
              )
            }

            if (item.type === 'divider') {
              return (
                <div key="unread-divider" className="msg-unread-divider" ref={dividerRef}>
                  <span>New messages</span>
                </div>
              )
            }

            const group = item
            const isOut = group.direction === 'out'
            const node = isOut ? null : nodes[group.from_node_id]
            const label = isOut
              ? 'You'
              : node?.long_name || node?.short_name || group.from_node_id.slice(-4).toUpperCase()
            return (
              <div key={i} className={`msg-group${isOut ? ' msg-group--out' : ''}`}>
                <NodeAvatar
                  node={isOut ? (myNodeId ? nodes[myNodeId] : null) : node}
                  isOwn={isOut}
                  size={32}
                />
                <div className="msg-group-body">
                  <div className="msg-group-meta">
                    <span
                      className="msg-group-sender"
                      onClick={() => !isOut && onSelectNode(group.from_node_id)}
                      style={{ cursor: isOut ? 'default' : 'pointer' }}
                    >
                      {label}
                    </span>
                    <span className="msg-group-time">{formatTime(group.firstTime)}</span>
                  </div>
                  {group.texts.map((t) => {
                    const replyTo = t.reply_id ? messageById[t.reply_id] : null
                    const replyNode = replyTo ? nodes[replyTo.from_node_id] : null
                    const replyLabel =
                      replyTo?.direction === 'out'
                        ? 'You'
                        : replyNode?.short_name || replyTo?.from_node_id?.slice(-4).toUpperCase()
                    return (
                      <div key={t.id}>
                        {replyTo && (
                          <div className="msg-reply-quote">
                            <span className="msg-reply-sender">↩ {replyLabel}:</span>
                            <span className="msg-reply-text">
                              {replyTo.text.slice(0, 80)}
                              {replyTo.text.length > 80 ? '…' : ''}
                            </span>
                          </div>
                        )}
                        <div className="msg-bubble">{t.text}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <form className="message-form" onSubmit={handleSend}>
          {error && <div className="message-error">{error}</div>}
          <div className="message-input-row">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your message here..."
              maxLength={MAX_LENGTH}
              disabled={sending}
              className="message-input"
            />
            <span className="message-counter">{text.length}/{MAX_LENGTH}</span>
            <button type="submit" disabled={sending || !text.trim()} className="btn-send">➤</button>
          </div>
        </form>
      </div>
      <NodeListPanel
        nodes={nodes}
        myNodeId={myNodeId}
        messageNodeIds={messageNodeIds}
        onSelectNode={onSelectNode}
      />
    </div>
  )
}
