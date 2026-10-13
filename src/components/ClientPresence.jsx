export default function ClientPresence({ activity, checkedAt }) {
  const fresh = checkedAt && Date.now() - checkedAt < 45000
  if (!fresh) return <span style={{color:'var(--muted)',fontSize:12}}>Status unavailable</span>
  if (!activity?.last_seen_at) return <span style={{color:'var(--muted)',fontSize:12}}>Last seen unavailable</span>
  const date = new Date(activity.last_seen_at)
  const online = activity.is_online && Date.now() - date.getTime() < 60000
  return <span title={online ? 'Active within the past minute. Closing the app may take a minute to show as offline.' : 'Last confirmed activity, shown in your local time.'} style={{display:'inline-flex',alignItems:'center',gap:5,color:online?'#087b55':'var(--muted)',fontSize:12,lineHeight:1.5}}>
    <span aria-hidden="true" style={{width:7,height:7,borderRadius:'50%',background:online?'#087b55':'#81938a',flexShrink:0}} />
    {online ? 'Online' : `Last seen ${date.toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}`}
  </span>
}
