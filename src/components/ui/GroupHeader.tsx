export function GroupHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 2px 4px' }}>
      <div style={{ width:6,height:6,borderRadius:'50%',background:color,flexShrink:0 }} />
      <div style={{ fontSize:10,fontWeight:700,color,letterSpacing:'0.08em',textTransform:'uppercase' }}>{label}</div>
      <div style={{ flex:1,height:1,background:color,opacity:0.2 }} />
    </div>
  )
}
