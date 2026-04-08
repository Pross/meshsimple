import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import { nodeColor } from '../utils/nodeColor'

function makeNodeIcon(node, isOwn) {
  const label = node.short_name || node.node_id.slice(-4).toUpperCase()
  const color = nodeColor(node.hops_away, isOwn)
  const star = isOwn ? `<div style="position:absolute;top:-6px;right:-4px;font-size:12px;line-height:1">★</div>` : ''
  return L.divIcon({
    className: '',
    html: `<div style="
      position:relative;
      width:42px;height:42px;border-radius:50%;
      background:${color};
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:11px;
      border:2px solid rgba(255,255,255,0.4);
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
    ">${label}${star}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -24],
  })
}

function FitBounds({ nodes }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    const positions = nodes.filter((n) => n.lat && n.lon).map((n) => [n.lat, n.lon])
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [50, 50], maxZoom: 13 })
      fitted.current = true
    }
  }, [nodes, map])

  return null
}

function InvalidateSize({ trigger }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 220)
    return () => clearTimeout(t)
  }, [trigger, map])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], 14)
  }, [target, map])
  return null
}

export default function Map({ nodes, myNodeId, onSelectNode, flyTarget, nodePanelCollapsed }) {
  const nodesWithPos = Object.values(nodes).filter((n) => n.lat && n.lon)

  return (
    <MapContainer
      center={[51.5, -1.5]}
      zoom={6}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitBounds nodes={nodesWithPos} />
      <InvalidateSize trigger={nodePanelCollapsed} />
      {flyTarget && <FlyTo target={flyTarget} />}
      <MarkerClusterGroup chunkedLoading>
        {nodesWithPos.map((node) => (
          <Marker
            key={node.node_id}
            position={[node.lat, node.lon]}
            icon={makeNodeIcon(node, node.node_id === myNodeId)}
            eventHandlers={{ click: () => onSelectNode(node.node_id) }}
          >
            <Popup>
              <strong>{node.short_name || node.node_id}</strong>
              {node.long_name && <div style={{ fontSize: 12 }}>{node.long_name}</div>}
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
