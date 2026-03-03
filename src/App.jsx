import { useState, useEffect, useRef } from 'react';
import { createRoom, joinRoom, toggleReady, saveGameState, subscribeToRoom, subscribeToRooms } from './firebase';
import { initializeGame, applyPlay, applyScout, flipEntireHand, checkRoundEnd, calculateRoundScore, getTopValue, getBottomValue, isConnectedInHand, isValidCombination, isStrongerThan, getAIAction } from './gameLogic';

// ============================================================
// 색상 & 상수
// ============================================================
const CARD_COLORS = {
  1:  { bg:'#E63946', text:'#fff' },
  2:  { bg:'#E76F51', text:'#fff' },
  3:  { bg:'#F4A261', text:'#1a1a1a' },
  4:  { bg:'#2A9D8F', text:'#fff' },
  5:  { bg:'#43AA8B', text:'#fff' },
  6:  { bg:'#4361EE', text:'#fff' },
  7:  { bg:'#7209B7', text:'#fff' },
  8:  { bg:'#B5179E', text:'#fff' },
  9:  { bg:'#F72585', text:'#fff' },
  10: { bg:'#1a1a1a', text:'#fff' },
};
const PLAYER_COLORS = ['#E63946','#4361EE','#2A9D8F','#F4A261','#7209B7'];
const AI_THINK = 1200;
const AI_SHOW  = 2200;

// ============================================================
// 카드 컴포넌트 — 손패용 (위아래 숫자, 기울기 지원)
// ============================================================
function HandCard({ card, selected, clickable, onClick, rotate = 0, zIndex = 0, translateY = 0 }) {
  const top = getTopValue(card);
  const bot = getBottomValue(card);
  const ct  = CARD_COLORS[top] || CARD_COLORS[1];
  const cb  = CARD_COLORS[bot] || CARD_COLORS[1];
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 72, height: 108, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
        border: selected ? '3px solid #FFE066' : hov && clickable ? '3px solid rgba(255,255,255,0.6)' : '2.5px solid rgba(255,255,255,0.25)',
        boxShadow: selected ? '0 0 20px rgba(255,224,102,0.8), 0 8px 24px rgba(0,0,0,0.6)'
                 : hov && clickable ? '0 12px 28px rgba(0,0,0,0.7)' : '0 6px 18px rgba(0,0,0,0.55)',
        transform: `rotate(${rotate}deg) translateY(${selected ? translateY - 18 : hov && clickable ? translateY - 8 : translateY}px)`,
        cursor: clickable ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column',
        transition: 'all 0.18s cubic-bezier(0.34,1.4,0.64,1)',
        zIndex: selected ? 999 : hov ? 99 : zIndex,
        position: 'relative',
      }}
    >
      <div style={{ flex:1, background:ct.bg, color:ct.text, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
        <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:26, lineHeight:1 }}>{top}</span>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'rgba(0,0,0,0.2)' }}/>
      </div>
      <div style={{ flex:1, background:cb.bg, color:cb.text, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:26, lineHeight:1, transform:'rotate(180deg)', display:'block' }}>{bot}</span>
      </div>
      {selected && <div style={{ position:'absolute', inset:0, background:'rgba(255,224,102,0.1)', pointerEvents:'none' }}/>}
    </div>
  );
}

// 마당패 카드 — 위아래 표시 + 스카우트 버튼
function FieldCard({ fc, scoutable, onScout, size = 'lg', rotate = 0 }) {
  const [flippedView, setFlippedView] = useState(false);
  const [hov, setHov] = useState(false);

  const rawTop = fc.flipped ? fc.bottom : fc.top;
  const rawBot = fc.flipped ? fc.top    : fc.bottom;
  const displayTop = flippedView ? rawBot : rawTop;
  const displayBot = flippedView ? rawTop : rawBot;

  const ct = CARD_COLORS[displayTop] || CARD_COLORS[1];
  const cb = CARD_COLORS[displayBot] || CARD_COLORS[1];
  const w  = { md:58, lg:78 }[size], h = { md:86, lg:116 }[size], fs = { md:20, lg:28 }[size];

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width:w, height:h, borderRadius:11, overflow:'hidden', flexShrink:0,
          border: scoutable ? (hov ? '3px solid #FFE066' : '2.5px solid rgba(255,224,102,0.5)') : '2px solid rgba(255,255,255,0.2)',
          boxShadow: scoutable && hov ? '0 0 20px rgba(255,224,102,0.7)' : '0 6px 18px rgba(0,0,0,0.5)',
          transform: `rotate(${rotate}deg)`,
          display:'flex', flexDirection:'column', transition:'all 0.15s',
        }}
      >
        <div style={{ flex:1, background:ct.bg, color:ct.text, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
          <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:fs, lineHeight:1 }}>{displayTop}</span>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'rgba(0,0,0,0.2)' }}/>
        </div>
        <div style={{ flex:1, background:cb.bg, color:cb.text, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:fs, lineHeight:1, transform:'rotate(180deg)', display:'block' }}>{displayBot}</span>
        </div>
      </div>

      {scoutable && (
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => setFlippedView(v => !v)} style={{ ...miniBtn, background:'rgba(255,255,255,0.15)' }}>↕</button>
          <button onClick={() => onScout(flippedView)} style={{ ...miniBtn, background:'#FFE066', color:'#1a1a1a', fontWeight:800 }}>가져오기</button>
        </div>
      )}
    </div>
  );
}

const miniBtn = { fontSize:11, padding:'3px 7px', border:'none', borderRadius:5, cursor:'pointer', color:'#eee', fontFamily:'Nunito,sans-serif' };

// 삽입 버튼
function InsertBtn({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width:h?32:16, height:80, background:h?'rgba(0,220,150,0.4)':'rgba(0,220,150,0.12)', border:'2.5px dashed #00DC96', borderRadius:8, cursor:'pointer', transition:'all 0.15s', flexShrink:0, padding:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#00DC96', fontSize:h?20:0, fontWeight:900 }}>
      {h && '↓'}
    </button>
  );
}

// ============================================================
// 로비
// ============================================================
function Lobby({ onEnter }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tab, setTab]   = useState('create');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]   = useState('');
  useEffect(() => subscribeToRooms(setRooms), []);
  const go = async fn => {
    if (!name.trim()) return setErr('닉네임을 입력해주세요.');
    setLoading(true); setErr('');
    try { onEnter(await fn()); } catch(e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at 30% 20%, #c17a2a 0%, #8b4a0a 40%, #5a2d00 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        {/* 로고 */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:80, lineHeight:1, textShadow:'0 4px 20px rgba(0,0,0,0.5)', letterSpacing:'-3px' }}>
            <span style={{ color:'#FFE066' }}>S</span>
            <span style={{ color:'#fff' }}>COUT</span>
            <span style={{ color:'#FF6B35' }}>!</span>
          </div>
          <p style={{ color:'rgba(255,255,255,0.6)', fontSize:13, marginTop:6, letterSpacing:'0.15em', textTransform:'uppercase' }}>Scout a card · Build your hands</p>
        </div>

        <div style={{ background:'rgba(0,0,0,0.45)', borderRadius:20, padding:28, backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>닉네임</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="닉네임 입력" maxLength={12}
              style={{ width:'100%', background:'rgba(255,255,255,0.08)', border:'1.5px solid rgba(255,255,255,0.15)', borderRadius:10, color:'#fff', fontFamily:'Nunito,sans-serif', fontSize:16, padding:'12px 16px', outline:'none', boxSizing:'border-box' }} />
          </div>

          <button style={{ width:'100%', background:'linear-gradient(135deg,#7209B7,#4361EE)', border:'none', borderRadius:12, color:'#fff', fontFamily:'Nunito,sans-serif', fontSize:15, fontWeight:800, padding:14, cursor:'pointer', marginBottom:16, letterSpacing:'0.03em' }}
            onClick={() => onEnter({ solo:true, playerName:name.trim()||'플레이어' })}>
            🤖 AI와 혼자 플레이 (테스트)
          </button>

          {/* 탭 */}
          <div style={{ display:'flex', gap:3, background:'rgba(0,0,0,0.3)', borderRadius:10, padding:4, marginBottom:16 }}>
            {['create','join','browse'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex:1, background:tab===t?'#E63946':'transparent', border:'none', color:tab===t?'#fff':'rgba(255,255,255,0.4)', borderRadius:7, padding:'9px 4px', cursor:'pointer', fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:13, transition:'all 0.15s' }}>
                {{ create:'방 만들기', join:'코드 입장', browse:'방 목록' }[t]}
              </button>
            ))}
          </div>

          {tab==='create' && <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:13, textAlign:'center' }}>방을 만들고 친구를 초대하세요 (3~5명)</p>
            <button style={lobbyBtn('#E63946')} disabled={loading} onClick={() => go(() => createRoom(name.trim()))}>{loading?'생성 중...':'방 만들기'}</button>
          </div>}
          {tab==='join' && <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <label style={{ display:'block', fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>방 코드</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="방 코드 입력"
              style={{ width:'100%', background:'rgba(255,255,255,0.08)', border:'1.5px solid rgba(255,255,255,0.15)', borderRadius:10, color:'#fff', fontFamily:'Nunito,sans-serif', fontSize:16, padding:'12px 16px', outline:'none', boxSizing:'border-box' }} />
            <button style={lobbyBtn('#E63946')} disabled={loading} onClick={() => go(() => joinRoom(code.trim(), name.trim()))}>{loading?'입장 중...':'입장'}</button>
          </div>}
          {tab==='browse' && <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {rooms.length===0
              ? <p style={{ color:'rgba(255,255,255,0.3)', fontSize:13, textAlign:'center', padding:16 }}>대기 중인 방 없음</p>
              : rooms.map(r => { const pc=Object.keys(r.players||{}).length; return (
                <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.07)', borderRadius:10, padding:'10px 14px' }}>
                  <div><div style={{ fontWeight:700, fontSize:14, color:'#fff' }}>{Object.values(r.players||{})[0]?.name}의 방</div><div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{pc}/5명</div></div>
                  <button style={lobbyBtn('#E63946', '7px 14px', 12)} disabled={loading} onClick={() => go(() => joinRoom(r.id, name.trim()))}>입장</button>
                </div>); })}
          </div>}
          {err && <p style={{ color:'#FF6B6B', fontSize:13, textAlign:'center', marginTop:10 }}>{err}</p>}
        </div>

        <div style={{ marginTop:16, background:'rgba(0,0,0,0.3)', borderRadius:16, padding:20, backdropFilter:'blur(8px)' }}>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:11, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.1em' }}>게임 방법</p>
          {[['🃏','A. 플레이 — 마당보다 강한 조합 내려놓기'],['🔍','B. 스카우트 — 마당 끝 카드 가져오기 (위치 선택)'],['⚡','C. 더블 액션 — 스카우트 후 바로 플레이'],['↕','라운드 시작 전 손패 뒤집기 (1회)']].map(([ic,tx])=>(
            <div key={tx} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:9, fontSize:13, color:'rgba(255,255,255,0.65)' }}>
              <span style={{ fontSize:17, flexShrink:0 }}>{ic}</span><span>{tx}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const lobbyBtn = (bg, pad='12px 16px', fs=15) => ({ background:bg, border:'none', borderRadius:10, color:'#fff', fontFamily:'Nunito,sans-serif', fontSize:fs, fontWeight:800, padding:pad, cursor:'pointer', transition:'all 0.18s', display:'flex', alignItems:'center', justifyContent:'center' });

// ============================================================
// 대기실
// ============================================================
function WaitingRoom({ roomId, playerId, room, onLeave }) {
  const players  = Object.values(room.players||{});
  const me       = room.players?.[playerId];
  const isHost   = room.hostId===playerId;
  const allReady = players.length>=3 && players.every(p=>p.ready||p.id===room.hostId);
  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at 30% 20%, #c17a2a 0%, #8b4a0a 40%, #5a2d00 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <button style={{ background:'none', border:'none', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontSize:14, fontFamily:'Nunito,sans-serif' }} onClick={onLeave}>← 나가기</button>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>
            방 코드: <strong style={{ fontFamily:'monospace', color:'#FFE066', fontSize:12 }}>{roomId}</strong>
            <button style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:6, color:'#fff', fontSize:11, padding:'3px 9px', marginLeft:7, cursor:'pointer', fontFamily:'Nunito,sans-serif' }} onClick={() => navigator.clipboard.writeText(roomId)}>복사</button>
          </div>
        </div>
        <div style={{ background:'rgba(0,0,0,0.45)', borderRadius:20, padding:28, backdropFilter:'blur(12px)' }}>
          <h2 style={{ textAlign:'center', marginBottom:6, fontSize:24, color:'#fff' }}>대기 중...</h2>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:14, textAlign:'center', marginBottom:24 }}>3~5명이 모이면 시작 가능</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
            {players.map((p,i) => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:14, background:'rgba(255,255,255,0.07)', borderRadius:12, padding:'13px 16px', border:`2px solid ${p.ready||p.id===room.hostId?'#00DC96':p.id===playerId?PLAYER_COLORS[0]:'rgba(255,255,255,0.1)'}` }}>
                <div style={{ width:42, height:42, borderRadius:'50%', background:PLAYER_COLORS[i%PLAYER_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:20, color:'#fff', border:'2px solid rgba(255,255,255,0.2)' }}>
                  {p.name[0].toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:7, alignItems:'center', fontWeight:700, color:'#fff' }}>
                    {p.name}
                    {p.id===room.hostId && <span style={{ background:'#FFE066', color:'#1a1a1a', fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:800 }}>방장</span>}
                    {p.id===playerId    && <span style={{ background:PLAYER_COLORS[0], color:'#fff', fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:800 }}>나</span>}
                  </div>
                  <div style={{ fontSize:12, color:p.ready||p.id===room.hostId?'#00DC96':'rgba(255,255,255,0.35)', marginTop:2 }}>
                    {p.id===room.hostId?'방장':p.ready?'✓ 준비 완료':'대기 중...'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {isHost
            ? <button style={lobbyBtn(allReady?'#E63946':'#444', '16px', 16)} onClick={async()=>{ await saveGameState(roomId,initializeGame(players.map(p=>p.id)),'playing'); }} disabled={!allReady}>
                {players.length<3?`최소 3명 필요 (${players.length}/3)`:!allReady?'모든 플레이어 준비 대기 중':'게임 시작! 🎮'}
              </button>
            : <button style={lobbyBtn(me?.ready?'#555':'#E63946', '16px', 16)} onClick={() => toggleReady(roomId,playerId,!me?.ready)}>
                {me?.ready?'준비 취소':'준비 완료!'}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 게임 보드 — 공식 앱 레이아웃
// ============================================================
function GameBoard({ roomId, playerId, room, gameState:initGs, solo, soloPlayers, onLeave }) {
  const [gs, setGs]             = useState(initGs);
  const [mode, setMode]         = useState('flip_choice');
  const [selected, setSelected] = useState([]);
  const [msg, setMsg]           = useState('');
  const [roundEnd, setRoundEnd] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [scoutIdx, setScoutIdx]     = useState(null);
  const [insertMode, setInsertMode] = useState(false);
  const [aiAction, setAiAction]     = useState(null);
  const [showHelp, setShowHelp]     = useState(false);
  const timerRef = useRef(null);

  const players  = solo ? soloPlayers : Object.values(room?.players||{});
  const myHand   = gs.hands?.[playerId]||[];
  const curId    = gs.players[gs.currentPlayerIndex];
  const isMyTurn = curId===playerId;
  const isAI     = id => id?.startsWith('ai_');
  const getName  = pid => players.find(p=>p.id===pid)?.name||pid;
  const showMsg  = (m,d=2500) => { setMsg(m); setTimeout(()=>setMsg(''),d); };
  const myColor  = PLAYER_COLORS[players.findIndex(p=>p.id===playerId)%PLAYER_COLORS.length] || PLAYER_COLORS[0];

  useEffect(()=>{ if(solo)return; return subscribeToRoom(roomId,d=>{ if(d?.gameState)setGs(d.gameState); }); },[roomId,solo]);

  // AI
  useEffect(()=>{
    if(!gs||roundEnd)return;
    const cur=gs.players[gs.currentPlayerIndex];
    if(!isAI(cur))return;
    setAiThinking(true);
    timerRef.current=setTimeout(()=>{
      const action=getAIAction(gs,cur);
      if(!action){setAiThinking(false);return;}
      let result;
      if(action.type==='play') result=applyPlay(gs,cur,action.indices);
      else result=applyScout(gs,cur,action.fieldIndex,action.insertIndex);
      if(result.error){setAiThinking(false);return;}
      setAiAction(action.type==='play'
        ?{type:'play',name:getName(cur),cards:action.indices.map(i=>gs.hands[cur][i])}
        :{type:'scout',name:getName(cur),val:gs.field?.cards[action.fieldIndex]?.value});
      const ngs=result.state;
      setTimeout(()=>{
        setAiAction(null);
        const end=checkRoundEnd(ngs);
        if(end.ended){finishRound(ngs,end.winnerId);setAiThinking(false);return;}
        setGs(ngs);
        if(!solo)saveGameState(roomId,ngs);
        setAiThinking(false);
      },AI_SHOW);
    },AI_THINK);
    return()=>clearTimeout(timerRef.current);
  },[gs?.currentPlayerIndex,roundEnd]);

  const persist    = async ngs => { setGs(ngs); if(!solo) await saveGameState(roomId,ngs); };
  const finishRound= (fgs,wid) => {
    const sc=calculateRoundScore(fgs,wid);
    const tot={...fgs.totalScores};
    fgs.players.forEach(pid=>{tot[pid]=(tot[pid]||0)+(sc[pid]||0);});
    setRoundEnd({sc,wid,tot});
  };

  const handleFlipChoice = async doFlip => {
    if(doFlip){
      const ngs={...gs,hands:{...gs.hands,[playerId]:flipEntireHand(myHand)},handFlipped:{...gs.handFlipped,[playerId]:true}};
      await persist(ngs); showMsg('↕ 손패를 뒤집었습니다!');
    }
    setMode('play');
  };

  const handlePlay = async () => {
    if(!isMyTurn||selected.length===0)return;
    const r=applyPlay(gs,playerId,selected);
    if(r.error)return showMsg('❌ '+r.error);
    setSelected([]);
    const end=checkRoundEnd(r.state);
    if(end.ended)return finishRound(r.state,end.winnerId);
    await persist(r.state);
  };

  const handleSelectField=(fi,shouldFlip)=>{
    if(!isMyTurn||mode!=='scout'||insertMode)return;
    setScoutIdx({fi,shouldFlip});
    setInsertMode(true);
  };

  const handleInsert=async insertIdx=>{
    if(scoutIdx===null)return;
    const{fi,shouldFlip}=scoutIdx;
    const r=applyScout(gs,playerId,fi,insertIdx,shouldFlip);
    if(r.error){showMsg('❌ '+r.error);return;}
    setScoutIdx(null);setInsertMode(false);setMode('play');
    const end=checkRoundEnd(r.state);
    if(end.ended)return finishRound(r.state,end.winnerId);
    await persist(r.state);showMsg('✅ 스카우트!');
  };

  const cancelScout=()=>{setScoutIdx(null);setInsertMode(false);setMode('play');};

  const toggleSelect=idx=>{
    if(!isMyTurn||mode!=='play'||insertMode)return;
    setSelected(prev=>{
      const next=prev.includes(idx)?prev.filter(i=>i!==idx):[...prev,idx].sort((a,b)=>a-b);
      if(next.length>1&&!isConnectedInHand(myHand,next))return prev;
      return next;
    });
  };

  const selCards=selected.map(i=>myHand[i]);
  const validPlay=selected.length>0&&isConnectedInHand(myHand,selected)&&isValidCombination(selCards)&&(!gs.field||isStrongerThan(selCards,gs.field.cards));
  const canScout =gs.field&&gs.field.ownerId!==playerId;

  const handleNextRound=async()=>{
    const ngs={...initializeGame(gs.players),round:(gs.round||1)+1,totalScores:roundEnd.tot};
    setRoundEnd(null);setSelected([]);setMode('flip_choice');setScoutIdx(null);setInsertMode(false);
    await persist(ngs);
  };

  // ── 라운드 종료 ──
  if(roundEnd){
    return(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(16px)'}}>
        <div style={{background:'rgba(20,10,0,0.95)',border:'1px solid rgba(255,200,80,0.3)',borderRadius:24,width:'90%',maxWidth:380,padding:36,textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.8)'}}>
          <div style={{fontSize:48,marginBottom:8}}>🏆</div>
          <h2 style={{marginBottom:4,fontSize:26,color:'#fff'}}>라운드 {gs.round} 종료!</h2>
          <p style={{color:'#FFE066',fontWeight:800,fontSize:18,marginBottom:24}}>{getName(roundEnd.wid)} 승리!</p>
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:11,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>이번 라운드</p>
          {gs.players.map(pid=>(
            <div key={pid} style={{display:'flex',justifyContent:'space-between',padding:'9px 14px',borderRadius:10,marginBottom:5,background:pid===roundEnd.wid?'rgba(0,220,150,0.12)':'rgba(255,255,255,0.05)'}}>
              <span style={{color:'#eee'}}>{getName(pid)}</span>
              <span style={{fontWeight:800,color:(roundEnd.sc[pid]||0)>=0?'#00DC96':'#FF6B6B'}}>{(roundEnd.sc[pid]||0)>=0?'+':''}{roundEnd.sc[pid]||0}</span>
            </div>
          ))}
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:11,margin:'18px 0 10px',textTransform:'uppercase',letterSpacing:'0.08em'}}>누적 점수</p>
          {[...gs.players].sort((a,b)=>(roundEnd.tot[b]||0)-(roundEnd.tot[a]||0)).map(pid=>(
            <div key={pid} style={{display:'flex',justifyContent:'space-between',padding:'9px 14px',borderRadius:10,marginBottom:5,background:'rgba(255,255,255,0.04)'}}>
              <span style={{color:'#eee'}}>{getName(pid)}</span>
              <span style={{fontWeight:800,color:'#FFE066'}}>{roundEnd.tot[pid]||0}</span>
            </div>
          ))}
          <button style={{...lobbyBtn('#E63946','16px',16),width:'100%',marginTop:20}} onClick={handleNextRound}>다음 라운드 →</button>
          <button style={{...lobbyBtn('rgba(255,255,255,0.1)','12px',14),width:'100%',marginTop:8}} onClick={onLeave}>로비로</button>
        </div>
      </div>
    );
  }

  // ── 뒤집기 선택 ──
  if(mode==='flip_choice'){
    const flipped=flipEntireHand(myHand);
    return(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(16px)'}}>
        <div style={{background:'rgba(20,10,0,0.95)',border:'1px solid rgba(255,200,80,0.25)',borderRadius:24,width:'95%',maxWidth:560,padding:30,boxShadow:'0 20px 60px rgba(0,0,0,0.8)'}}>
          <h2 style={{textAlign:'center',marginBottom:4,fontSize:22,color:'#fff'}}>라운드 {gs.round||1} 시작!</h2>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:14,textAlign:'center',marginBottom:2}}>손패를 뒤집겠습니까?</p>
          <p style={{color:'rgba(255,255,255,0.25)',fontSize:12,textAlign:'center',marginBottom:20}}>한 번만 가능 — 게임 중 변경 불가</p>
          <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>현재 손패</p>
          <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:10,WebkitOverflowScrolling:'touch'}}>
            {myHand.map(c=><HandCard key={c.id} card={c} size="sm"/>)}
          </div>
          <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.08em',margin:'14px 0 8px'}}>뒤집으면</p>
          <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:10,WebkitOverflowScrolling:'touch'}}>
            {flipped.map(c=><HandCard key={c.id+'f'} card={c} size="sm"/>)}
          </div>
          <div style={{display:'flex',gap:12,marginTop:24}}>
            <button style={{...lobbyBtn('#E63946','15px',15),flex:1}} onClick={()=>handleFlipChoice(true)}>↕ 뒤집기</button>
            <button style={{...lobbyBtn('#00DC96','15px',15),flex:1,color:'#0a1a0a'}} onClick={()=>handleFlipChoice(false)}>그대로 진행</button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 메인 게임 화면 — 공식 앱 스타일 레이아웃
  // ============================================================
  const otherPlayers = players.filter(p=>p.id!==playerId);

  return (
    <div style={{
      width:'100vw', height:'100vh', position:'relative', overflow:'hidden',
      background:'radial-gradient(ellipse at 25% 15%, #d4892e 0%, #9b5a0f 35%, #5a2d00 70%, #3a1a00 100%)',
      fontFamily:'Nunito,sans-serif',
    }}>
      {/* 배경 방사선 무늬 */}
      <div style={{position:'absolute',inset:0,background:'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.03) 0deg 10deg, transparent 10deg 20deg)',pointerEvents:'none'}}/>

      {/* ── 헤더 ── */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:56,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',zIndex:10}}>
        {/* 라운드 */}
        <div style={{background:'rgba(0,0,0,0.5)',borderRadius:12,padding:'6px 14px',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.1em'}}>ROUND</div>
          <div style={{fontSize:22,fontWeight:900,color:'#fff',lineHeight:1}}>{gs.round||1}</div>
        </div>

        {/* 도움말 버튼 */}
        <button onClick={()=>setShowHelp(v=>!v)} style={{width:42,height:42,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.2)',color:'#fff',fontSize:18,cursor:'pointer',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center'}}>?</button>

        {/* 토큰 & 나가기 */}
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{background:'rgba(0,0,0,0.5)',borderRadius:20,padding:'6px 14px',backdropFilter:'blur(8px)',border:'1px solid rgba(255,200,80,0.3)',display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:16}}>🏅</span>
            <span style={{fontWeight:800,fontSize:16,color:'#FFE066'}}>{gs.tokens||0}</span>
          </div>
          <button onClick={onLeave} style={{width:42,height:42,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.6)',fontSize:18,cursor:'pointer',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
      </div>

      {/* ── 왼쪽: 다른 플레이어 목록 ── */}
      <div style={{position:'absolute',top:64,left:12,zIndex:10,display:'flex',flexDirection:'column',gap:6,maxWidth:200}}>
        {otherPlayers.map((p,i)=>{
          const hLen=gs.hands?.[p.id]?.length||0;
          const tok =gs.scores?.[p.id]||0;
          const isCur=p.id===curId;
          const pColor=PLAYER_COLORS[(players.findIndex(pl=>pl.id===p.id))%PLAYER_COLORS.length];
          return(
            <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(0,0,0,0.55)',borderRadius:14,padding:'8px 12px',backdropFilter:'blur(8px)',border:`2px solid ${isCur?'#FFE066':'rgba(255,255,255,0.1)'}`,transition:'all 0.2s',boxShadow:isCur?'0 0 16px rgba(255,224,102,0.4)':'none'}}>
              {/* 아바타 */}
              <div style={{width:36,height:36,borderRadius:'50%',background:pColor,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:16,color:'#fff',border:`2px solid ${isCur?'#FFE066':'rgba(255,255,255,0.2)'}`,flexShrink:0,position:'relative'}}>
                {p.name[0].toUpperCase()}
                {isCur&&<div style={{position:'absolute',bottom:-3,right:-3,width:10,height:10,borderRadius:'50%',background:'#FFE066',border:'1.5px solid #000',animation:'pulse 1s infinite'}}/>}
              </div>
              {/* 정보 */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:800,color:isCur?'#FFE066':'#eee',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                <div style={{display:'flex',gap:10,marginTop:2}}>
                  <span style={{fontSize:12,color:'rgba(255,255,255,0.7)',fontWeight:700}}>🃏 {hLen}</span>
                  <span style={{fontSize:12,color:'#FFE066',fontWeight:700}}>🏅 {tok}</span>
                </div>
              </div>
              {/* 더블액션 아이콘 */}
              {!gs.doubleActionUsed?.[p.id]&&<span style={{fontSize:14,opacity:0.7}}>⚡</span>}
            </div>
          );
        })}
      </div>

      {/* ── 중앙: 마당 패 ── */}
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-58%)',zIndex:5,display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
        {!gs.field?(
          <div style={{background:'rgba(0,0,0,0.3)',borderRadius:20,padding:'24px 36px',border:'2px dashed rgba(255,255,255,0.2)',backdropFilter:'blur(8px)',textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:6}}>🃏</div>
            <p style={{color:'rgba(255,255,255,0.5)',fontSize:14,fontWeight:600}}>마당 패 없음</p>
            <p style={{color:'rgba(255,255,255,0.3)',fontSize:12,marginTop:4}}>첫 번째로 카드를 내려놓으세요</p>
          </div>
        ):(
          <>
            <div style={{background:'rgba(0,0,0,0.4)',borderRadius:10,padding:'4px 12px',backdropFilter:'blur(6px)'}}>
              <span style={{fontSize:12,color:'#FFE066',fontWeight:700}}>{getName(gs.field.ownerId)}의 마당 패</span>
            </div>
            {/* 카드들 — 살짝 기울어진 배치 */}
            <div style={{display:'flex',gap:6,alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap',maxWidth:480}}>
              {gs.field.cards.map((fc,idx)=>{
                const total=gs.field.cards.length;
                const mid=(total-1)/2;
                const rot=(idx-mid)*2;
                const isEdge=idx===0||idx===total-1;
                const scoutable=isMyTurn&&mode==='scout'&&canScout&&isEdge&&!insertMode;
                return(
                  <FieldCard key={idx} fc={fc} scoutable={scoutable} size="lg" rotate={rot}
                    onScout={(sf)=>handleSelectField(idx,sf)}/>
                );
              })}
            </div>
            {isMyTurn&&mode==='scout'&&!insertMode&&canScout&&
              <div style={{background:'rgba(255,224,102,0.15)',borderRadius:10,padding:'5px 14px',border:'1px solid rgba(255,224,102,0.4)'}}>
                <p style={{fontSize:12,color:'#FFE066',textAlign:'center'}}>← 양끝 카드에서 가져오기 선택 →</p>
              </div>}
            {insertMode&&
              <div style={{background:'rgba(0,220,150,0.15)',borderRadius:10,padding:'5px 14px',border:'1px solid rgba(0,220,150,0.4)'}}>
                <p style={{fontSize:12,color:'#00DC96',textAlign:'center'}}>↓ 아래 손패에서 삽입 위치를 선택하세요</p>
              </div>}
          </>
        )}
      </div>

      {/* ── AI 행동 알림 ── */}
      {aiAction&&(
        <div style={{position:'absolute',top:64,right:16,zIndex:20,background:'rgba(0,0,0,0.7)',borderRadius:16,padding:'12px 16px',border:'1px solid rgba(255,200,80,0.4)',backdropFilter:'blur(12px)',maxWidth:220}}>
          <p style={{fontSize:13,fontWeight:800,color:'#FFE066',marginBottom:7}}>🤖 {aiAction.name}</p>
          {aiAction.type==='play'?(
            <div>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:5}}>플레이:</p>
              <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{aiAction.cards.map((c,i)=><HandCard key={i} card={c}/>)}</div>
            </div>
          ):(
            <p style={{fontSize:12,color:'rgba(255,255,255,0.6)'}}>스카우트 → [{aiAction.val}] 가져감</p>
          )}
        </div>
      )}

      {/* ── AI 생각 중 ── */}
      {aiThinking&&!aiAction&&(
        <div style={{position:'absolute',top:64,right:16,zIndex:20,background:'rgba(0,0,0,0.6)',borderRadius:12,padding:'8px 14px',backdropFilter:'blur(8px)'}}>
          <p style={{fontSize:13,color:'rgba(255,255,255,0.6)',animation:'pulse 1s infinite'}}>🤖 생각 중...</p>
        </div>
      )}

      {/* ── 하단: 내 손패 + 액션 ── */}
      <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10}}>

        {/* 액션 버튼 바 (내 차례일 때) */}
        {isMyTurn&&!insertMode&&(
          <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:8,padding:'0 16px'}}>
            {[['play','🃏','플레이',true],['scout','🔍','스카우트',canScout],['double','⚡','더블',canScout&&!gs.doubleActionUsed?.[playerId]]].map(([m,ic,nm,en])=>(
              <button key={m} onClick={()=>{if(en){setMode(m);setSelected([]);}}} style={{
                background: mode===m ? 'rgba(230,57,70,0.85)' : 'rgba(0,0,0,0.55)',
                border:`2px solid ${mode===m?'#E63946':'rgba(255,255,255,0.15)'}`,
                borderRadius:14, color: en ? '#fff' : 'rgba(255,255,255,0.25)',
                fontFamily:'Nunito,sans-serif', padding:'8px 18px', cursor:en?'pointer':'not-allowed',
                backdropFilter:'blur(8px)', fontWeight:700, fontSize:14, display:'flex', alignItems:'center', gap:6,
                transition:'all 0.15s', boxShadow: mode===m ? '0 4px 16px rgba(230,57,70,0.5)' : 'none',
              }}>
                <span style={{fontSize:18}}>{ic}</span>{nm}
              </button>
            ))}
          </div>
        )}

        {/* 삽입 모드 배너 */}
        {insertMode&&isMyTurn&&(
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:12,marginBottom:8,padding:'0 16px'}}>
            <div style={{background:'rgba(0,220,150,0.2)',border:'1.5px solid #00DC96',borderRadius:12,padding:'7px 16px',backdropFilter:'blur(8px)'}}>
              <span style={{fontSize:13,color:'#00DC96',fontWeight:700}}>📌 삽입 위치 ↓ 를 클릭하세요</span>
            </div>
            <button onClick={cancelScout} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:10,color:'rgba(255,255,255,0.6)',fontFamily:'Nunito,sans-serif',fontSize:12,padding:'7px 14px',cursor:'pointer'}}>취소</button>
          </div>
        )}

        {/* 플레이 버튼 (카드 선택됐을 때) */}
        {isMyTurn&&mode==='play'&&!insertMode&&selected.length>0&&(
          <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:8}}>
            <button onClick={handlePlay} disabled={!validPlay} style={{background:validPlay?'#E63946':'rgba(255,255,255,0.1)',border:`2px solid ${validPlay?'#E63946':'rgba(255,255,255,0.2)'}`,borderRadius:14,color:validPlay?'#fff':'rgba(255,255,255,0.3)',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,padding:'9px 24px',cursor:validPlay?'pointer':'not-allowed',backdropFilter:'blur(8px)',transition:'all 0.15s',boxShadow:validPlay?'0 4px 20px rgba(230,57,70,0.6)':'none'}}>
              {validPlay?`✓ 플레이! (${selected.length}장)`:`✗ 유효하지 않음`}
            </button>
            <button onClick={()=>setSelected([])} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:12,color:'rgba(255,255,255,0.5)',fontFamily:'Nunito,sans-serif',fontSize:13,padding:'9px 16px',cursor:'pointer',backdropFilter:'blur(8px)'}}>취소</button>
          </div>
        )}

        {/* 내 손패 영역 */}
        <div style={{background:'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 100%)',backdropFilter:'blur(10px)',borderTop:'1px solid rgba(255,255,255,0.08)',padding:'12px 16px 20px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {/* 내 아바타 */}
              <div style={{width:32,height:32,borderRadius:'50%',background:myColor,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:14,color:'#fff',border:`2px solid ${isMyTurn?'#FFE066':'rgba(255,255,255,0.2)'}`}}>
                {(players.find(p=>p.id===playerId)?.name||'?')[0].toUpperCase()}
              </div>
              <span style={{fontSize:13,fontWeight:800,color:isMyTurn?'#FFE066':'rgba(255,255,255,0.7)'}}>
                {players.find(p=>p.id===playerId)?.name||'나'} ({myHand.length}장)
                {isMyTurn&&<span style={{marginLeft:6,fontSize:11,color:'#FFE066',animation:'pulse 1s infinite'}}>← 내 차례!</span>}
              </span>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <span style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>토큰 <strong style={{color:'#FFE066'}}>{gs.scores?.[playerId]||0}</strong></span>
              {!gs.doubleActionUsed?.[playerId]&&<span style={{fontSize:18}} title="더블 액션 사용 가능">⚡</span>}
            </div>
          </div>

          {/* 손패 카드 — 가로 스크롤 */}
          {insertMode?(
            <div style={{display:'flex',gap:3,overflowX:'auto',paddingBottom:4,alignItems:'center',WebkitOverflowScrolling:'touch'}}>
              <InsertBtn onClick={()=>handleInsert(0)}/>
              {myHand.map((c,i)=>(
                <div key={c.id} style={{display:'contents'}}>
                  <HandCard card={c}/>
                  <InsertBtn onClick={()=>handleInsert(i+1)}/>
                </div>
              ))}
            </div>
          ):(
            <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:4,WebkitOverflowScrolling:'touch',alignItems:'flex-end'}}>
              {myHand.map((c,idx)=>{
                const total=myHand.length;
                const mid=(total-1)/2;
                const rot=(idx-mid)*1.5;
                const ty=Math.abs(idx-mid)*1.5;
                return(
                  <HandCard key={c.id} card={c}
                    selected={selected.includes(idx)}
                    clickable={isMyTurn&&mode==='play'}
                    onClick={()=>toggleSelect(idx)}
                    rotate={rot}
                    translateY={ty}
                    zIndex={idx}/>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 상대 차례 안내 ── */}
      {!isMyTurn&&!aiThinking&&(
        <div style={{position:'absolute',bottom:200,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.55)',borderRadius:20,padding:'8px 20px',backdropFilter:'blur(8px)',zIndex:5}}>
          <p style={{fontSize:14,color:'rgba(255,255,255,0.6)',textAlign:'center'}}>{getName(curId)}의 차례...</p>
        </div>
      )}

      {/* ── 도움말 팝업 ── */}
      {showHelp&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(8px)'}} onClick={()=>setShowHelp(false)}>
          <div style={{background:'rgba(20,10,0,0.95)',border:'1px solid rgba(255,200,80,0.3)',borderRadius:20,padding:28,maxWidth:360,width:'90%'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'#FFE066',marginBottom:16,fontSize:18}}>게임 방법</h3>
            {[['🃏','A. 플레이','마당보다 강한 조합을 내려놓기'],['🔍','B. 스카우트','마당 끝 카드를 손패에 삽입'],['⚡','C. 더블','스카우트 후 바로 플레이 (1회)'],['↕','뒤집기','라운드 시작 전 손패 방향 선택']].map(([ic,nm,ds])=>(
              <div key={nm} style={{display:'flex',gap:12,marginBottom:14,alignItems:'flex-start'}}>
                <span style={{fontSize:22,flexShrink:0}}>{ic}</span>
                <div><div style={{fontWeight:800,color:'#fff',fontSize:14}}>{nm}</div><div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginTop:2}}>{ds}</div></div>
              </div>
            ))}
            <button onClick={()=>setShowHelp(false)} style={{...lobbyBtn('#E63946','10px',14),width:'100%',marginTop:8}}>닫기</button>
          </div>
        </div>
      )}

      {/* ── 메시지 토스트 ── */}
      {msg&&(
        <div style={{position:'fixed',top:'40%',left:'50%',transform:'translate(-50%,-50%)',background:'rgba(10,5,0,0.92)',color:'#fff',padding:'14px 28px',borderRadius:28,fontSize:16,fontWeight:700,zIndex:1000,backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.15)',pointerEvents:'none',boxShadow:'0 8px 32px rgba(0,0,0,0.6)'}}>
          {msg}
        </div>
      )}

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px}
      `}</style>
    </div>
  );
}

// ============================================================
// 앱 루트
// ============================================================
export default function App() {
  const [screen,setScreen]=useState('lobby');
  const [info,setInfo]=useState(null);
  const [room,setRoom]=useState(null);
  useEffect(()=>{ if(!info?.roomId||info?.solo)return; return subscribeToRoom(info.roomId,setRoom); },[info?.roomId]);
  const handleEnter=data=>{
    if(data.solo){
      const pId='human_player';
      const sp=[{id:pId,name:data.playerName},{id:'ai_1',name:'AI 봇 A'},{id:'ai_2',name:'AI 봇 B'}];
      const gs=initializeGame([pId,'ai_1','ai_2']);
      setInfo({solo:true,playerId:pId,gameState:gs,soloPlayers:sp});
      setScreen('game');
    }else{setInfo(data);setScreen('room');}
  };
  const leave=()=>{setScreen('lobby');setInfo(null);setRoom(null);};
  if(screen==='lobby')return <Lobby onEnter={handleEnter}/>;
  if(screen==='room'&&info&&room){
    if(room.status==='playing'&&room.gameState)
      return <GameBoard roomId={info.roomId} playerId={info.playerId} room={room} gameState={room.gameState} solo={false} onLeave={leave}/>;
    return <WaitingRoom roomId={info.roomId} playerId={info.playerId} room={room} onLeave={leave}/>;
  }
  if(screen==='game'&&info?.solo)
    return <GameBoard playerId={info.playerId} gameState={info.gameState} soloPlayers={info.soloPlayers} solo={true} onLeave={leave}/>;
  return <div style={{color:'rgba(255,255,255,0.4)',textAlign:'center',paddingTop:100}}>연결 중...</div>;
}
