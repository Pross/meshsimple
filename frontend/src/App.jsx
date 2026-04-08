import { useEffect, useState, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Map from './components/Map'
import MapNodePanel from './components/MapNodePanel'
import NodeList from './components/NodeList'
import NodePanel from './components/NodePanel'
import Messages from './components/Messages'
import { useWebSocket } from './hooks/useWebSocket'
import { useTheme } from './hooks/useTheme'
import './App.css'

export default function App() {
  const [nodes, setNodes] = useState({})
  const [messages, setMessages] = useState([])
  const [myNodeId, setMyNodeId] = useState(null)
  const [activeTab, setActiveTab] = useState('map')
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadFading, setUnreadFading] = useState(false)
  const [theme, setTheme] = useTheme()
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const markReadTimer = useRef(null)

  useEffect(() => {
    fetch('/api/nodes').then((r) => r.json()).then((data) => {
      const map = {}
      data.forEach((n) => { map[n.node_id] = n })
      setNodes(map)
    }).catch(console.error)

    fetch('/api/messages').then((r) => r.json()).then(setMessages).catch(console.error)

    fetch('/api/messages/unread-count')
      .then((r) => r.json())
      .then((d) => setUnreadCount(d.count))
      .catch(console.error)

    fetch('/api/config').then((r) => r.json()).then((d) => setMyNodeId(d.my_node_id || null)).catch(console.error)
  }, [])

  // Update tab title with unread count
  useEffect(() => {
    document.title = unreadCount > 0 ? `[${unreadCount}] meshsimple` : 'meshsimple'
  }, [unreadCount])

  const handleWsMessage = useCallback((event) => {
    if (event.type === 'node_update') {
      setNodes((prev) => ({ ...prev, [event.data.node_id]: event.data }))
    } else if (event.type === 'message') {
      setMessages((prev) => [...prev, event.data])
      // Only count inbound messages received while not on messages tab
      if (activeTabRef.current !== 'messages' && event.data.direction === 'in') {
        setUnreadCount((n) => n + 1)
      }
    }
  }, [])

  useWebSocket(handleWsMessage)

  function handleTabChange(tab) {
    setActiveTab(tab)
    if (tab === 'messages') {
      clearTimeout(markReadTimer.current)
      markReadTimer.current = setTimeout(() => {
        setUnreadFading(true)
        fetch('/api/messages/mark-read', { method: 'POST' }).catch(console.error)
        setTimeout(() => {
          setUnreadCount(0)
          setUnreadFading(false)
        }, 400)
      }, 5000)
    } else {
      clearTimeout(markReadTimer.current)
    }
  }

  function handleSelectNode(nodeId) {
    setSelectedNodeId(nodeId)
    setActiveTab('map')
  }

  function handleLocate(node) {
    setActiveTab('map')
    setFlyTarget({ lat: node.lat, lon: node.lon, _t: Date.now() })
  }

  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null
  const ownNode = myNodeId ? nodes[myNodeId] : null

  return (
    <div className="app">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        nodeCount={Object.keys(nodes).length}
        unreadCount={unreadCount}
        unreadFading={unreadFading}
        ownNode={ownNode}
        theme={theme}
        onThemeChange={setTheme}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div className="main-content">
        {activeTab === 'map' && (
          <div className="map-area">
            <div className="map-wrapper">
              <Map
                nodes={nodes}
                myNodeId={myNodeId}
                onSelectNode={handleSelectNode}
                flyTarget={flyTarget}
              />
              {selectedNode && (
                <NodePanel
                  node={selectedNode}
                  myNodeId={myNodeId}
                  onClose={() => setSelectedNodeId(null)}
                  onLocate={handleLocate}
                />
              )}
            </div>
            <MapNodePanel
              nodes={nodes}
              myNodeId={myNodeId}
              onSelectNode={handleSelectNode}
            />
          </div>
        )}

        {activeTab === 'messages' && (
          <Messages
            messages={messages}
            nodes={nodes}
            myNodeId={myNodeId}
            onSelectNode={handleSelectNode}
          />
        )}

        {activeTab === 'nodes' && (
          <NodeList
            nodes={nodes}
            myNodeId={myNodeId}
            onSelectNode={handleSelectNode}
          />
        )}
      </div>
    </div>
  )
}
