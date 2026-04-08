import { useEffect, useRef, useState } from 'react'
import { NodeAvatar } from './Sidebar'
import { relativeTime } from '../utils/nodeColor'

const MAX_LENGTH = 200

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

export default function Messages({ messages, nodes, myNodeId, onSelectNode }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
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

  // Build set of node IDs that have participated in messages
  const messageNodeIds = new Set(messages.map((m) => m.from_node_id))

  // Lookup map for reply threading
  const messageById = Object.fromEntries(messages.map((m) => [m.id, m]))

  // Group consecutive messages from same sender
  const grouped = messages.reduce((acc, msg) => {
    const last = acc[acc.length - 1]
    if (last && last.from_node_id === msg.from_node_id && last.direction === msg.direction && !msg.reply_id) {
      last.texts.push({ id: msg.id, text: msg.text, time: msg.timestamp, reply_id: msg.reply_id })
    } else {
      acc.push({
        from_node_id: msg.from_node_id,
        direction: msg.direction,
        texts: [{ id: msg.id, text: msg.text, time: msg.timestamp, reply_id: msg.reply_id }],
        firstTime: msg.timestamp,
      })
    }
    return acc
  }, [])

  return (
    <div className="messages-view">
      <div className="messages-main">
        <div className="messages-header">Messages: Primary</div>
        <div className="messages-list">
          {grouped.length === 0 && (
            <div className="messages-empty">
              <div className="messages-empty-icon">✉</div>
              <div>No messages yet.</div>
            </div>
          )}
          {grouped.map((group, i) => {
            const isOut = group.direction === 'out'
            const node = isOut ? null : nodes[group.from_node_id]
            const label = isOut ? 'You' : (node?.long_name || node?.short_name || group.from_node_id.slice(-4).toUpperCase())
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
                    const replyLabel = replyTo?.direction === 'out'
                      ? 'You'
                      : (replyNode?.short_name || replyTo?.from_node_id?.slice(-4).toUpperCase())
                    return (
                      <div key={t.id}>
                        {replyTo && (
                          <div className="msg-reply-quote">
                            <span className="msg-reply-sender">↩ {replyLabel}:</span>
                            <span className="msg-reply-text">{replyTo.text.slice(0, 80)}{replyTo.text.length > 80 ? '…' : ''}</span>
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
