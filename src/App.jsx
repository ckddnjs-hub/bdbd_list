import { useState, useEffect, useRef } from 'react';
import { createRoom, joinRoom, toggleReady, saveGameState, subscribeToRoom, subscribeToRooms, subscribeToAllRooms, deleteRoom } from './firebase';
import { initializeGame, applyPlay, applyScout, flipEntireHand, checkRoundEnd, calculateRoundScore, getTopValue, getBottomValue, isConnectedInHand, isValidCombination, isStrongerThan, getAIAction } from './gameLogic';

// ─── 색상 팔레트 ──────────────────────────────────────────────
const CC = {
  1:  { bg:'#E8192C', text:'#fff'    },
  2:  { bg:'#FF6B1A', text:'#fff'    },
  3:  { bg:'#F5C800', text:'#1a1a1a' },
  4:  { bg:'#22A845', text:'#fff'    },
  5:  { bg:'#1A8FE3', text:'#fff'    },
  6:  { bg:'#1B3FA0', text:'#fff'    },
  7:  { bg:'#7B2FF7', text:'#fff'    },
  8:  { bg:'#F0F0F0', text:'#1a1a1a' },
  9:  { bg:'#909090', text:'#fff'    },
  10: { bg:'#111111', text:'#fff'    },
};
const PC = ['#E8192C','#1A8FE3','#22A845','#F5C800','#7B2FF7'];
const ADMIN = '토토';
const AI_THINK = 1200, AI_SHOW = 2200;

// ─── 랜덤 아바타 이모지 세트 ──────────────────────────────────
const AVATARS = ['🦊','🐺','🦁','🐯','🐻','🐼','🦄','🐲','🦅','🦋','🐙','🦈','🦎','🐸','🦩'];
// 플레이어 ID → 아바타 결정적 매핑
function getAvatar(pid) {
  let h = 0;
  for (let i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

// ─── 카드 공통 렌더 ───────────────────────────────────────────
function CardFace({ top, bot, w, h, fs, border, shadow, style={} }) {
  const ct=CC[top]||CC[1], cb=CC[bot]||CC[1];
  return (
    <div style={{ width:w, height:h, borderRadius:10, overflow:'hidden', flexShrink:0,
      border, boxShadow:shadow, display:'flex', flexDirection:'column',
      position:'relative', ...style }}>
      <div style={{flex:1,background:ct.bg,color:ct.text,display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
        <span style={{fontFamily:"'Noto Sans KR','Helvetica Neue',Arial,sans-serif",fontSize:fs,fontWeight:300,lineHeight:1,userSelect:'none'}}>{top}</span>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:2,background:'rgba(0,0,0,0.18)'}}/>
      </div>
      <div style={{flex:1,background:cb.bg,color:cb.text,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontFamily:"'Noto Sans KR','Helvetica Neue',Arial,sans-serif",fontSize:fs,fontWeight:300,lineHeight:1,transform:'rotate(180deg)',display:'block',userSelect:'none'}}>{bot}</span>
      </div>
    </div>
  );
}

// ─── 손패 카드 (부채꼴 겹침) ──────────────────────────────────
// 핵심: position:absolute, 겹쳐서 부채꼴 배치
function HandCard({ card, selected, clickable, onClick, rotate=0, left=0, bottom=0, zIndex=0, size='md', dim=false }) {
  const top=getTopValue(card), bot=getBottomValue(card);
  const [hov,setHov]=useState(false);
  const W = size==='sm' ? 38 : size==='lg' ? 64 : 50;
  const H = size==='sm' ? 56 : size==='lg' ? 96 : 76;
  const FS= size==='sm' ? 13 : size==='lg' ? 24 : 18;
  const liftY = selected ? -28 : hov&&clickable ? -14 : 0;

  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        position:'absolute', left, bottom,
        width:W, height:H,
        transform:`rotate(${rotate}deg) translateY(${liftY}px)`,
        transformOrigin:'bottom center',
        zIndex: selected ? 1000 : hov ? 500 : zIndex,
        cursor: clickable ? 'pointer' : 'default',
        transition:'transform 0.18s cubic-bezier(0.34,1.4,0.64,1), z-index 0s',
        opacity: dim ? 0.5 : 1,
        filter: dim ? 'grayscale(0.3)' : 'none',
      }}>
      <CardFace top={top} bot={bot} w={W} h={H} fs={FS}
        border={selected?'3px solid #FFE066':hov&&clickable?'2.5px solid rgba(255,255,255,0.7)':'2px solid rgba(255,255,255,0.28)'}
        shadow={selected?'0 0 22px rgba(255,224,102,0.9),0 8px 24px rgba(0,0,0,0.7)':hov&&clickable?'0 12px 28px rgba(0,0,0,0.7)':'0 4px 14px rgba(0,0,0,0.6)'}/>
      {selected&&<div style={{position:'absolute',inset:0,borderRadius:10,background:'rgba(255,224,102,0.1)',pointerEvents:'none'}}/>}
    </div>
  );
}

// ─── 마당패 카드 (겹침 + 스카우트) ───────────────────────────
function FieldCard({ fc, scoutable, onScout, left=0, zIndex=0, totalCards=1 }) {
  const [flippedView,setFlippedView]=useState(false);
  const [hov,setHov]=useState(false);
  const rawTop = fc.flipped ? fc.bottom : fc.top;
  const rawBot = fc.flipped ? fc.top    : fc.bottom;
  const dTop = flippedView ? rawBot : rawTop;
  const dBot = flippedView ? rawTop : rawBot;
  const W=56, H=84, FS=22;
  const rot = (zIndex - (totalCards-1)/2) * 3;

  return (
    <div style={{position:'absolute',left,bottom:0,zIndex:scoutable&&hov?999:zIndex}} 
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{
        transform:`rotate(${rot}deg) translateY(${scoutable&&hov?-18:0}px)`,
        transformOrigin:'bottom center',
        transition:'transform 0.18s cubic-bezier(0.34,1.4,0.64,1)',
      }}>
        <CardFace top={dTop} bot={dBot} w={W} h={H} fs={FS}
          border={scoutable?(hov?'3px solid #FFE066':'2.5px solid rgba(255,224,102,0.6)'):'2px solid rgba(255,255,255,0.25)'}
          shadow={scoutable&&hov?'0 0 22px rgba(255,224,102,0.8),0 8px 24px rgba(0,0,0,0.7)':'0 4px 14px rgba(0,0,0,0.55)'}/>
      </div>
      {/* 스카우트 버튼 — 호버 시 카드 위에 */}
      {scoutable&&hov&&(
        <div style={{position:'absolute',top:-62,left:'50%',transform:'translateX(-50%)',display:'flex',gap:3,zIndex:999,whiteSpace:'nowrap'}}>
          <button onClick={e=>{e.stopPropagation();setFlippedView(v=>!v);}}
            style={{fontSize:10,padding:'3px 7px',border:'none',borderRadius:5,cursor:'pointer',
              background:flippedView?'#FFE066':'rgba(30,30,60,0.9)',
              color:flippedView?'#1a1a1a':'#eee',fontFamily:'Nunito,sans-serif',fontWeight:700}}>
            ↕{flippedView?' 뒤집음':''}
          </button>
          <button onClick={e=>{e.stopPropagation();onScout(flippedView);setFlippedView(false);}}
            style={{fontSize:10,padding:'3px 7px',border:'none',borderRadius:5,cursor:'pointer',
              background:'#FFE066',color:'#1a1a1a',fontFamily:'Nunito,sans-serif',fontWeight:800}}>
            가져오기
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 삽입 버튼 ────────────────────────────────────────────────
function InsertBtn({ onClick, left, bottom, zIndex=200 }) {
  const [h,setH]=useState(false);
  return (
    <div style={{position:'absolute',left,bottom,zIndex,display:'flex',alignItems:'flex-end'}}>
      <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
        style={{width:h?26:12,height:76,background:h?'rgba(0,220,150,0.45)':'rgba(0,220,150,0.12)',
          border:'2px dashed #00DC96',borderRadius:7,cursor:'pointer',transition:'all 0.14s',
          padding:0,display:'flex',alignItems:'center',justifyContent:'center',
          color:'#00DC96',fontSize:h?17:0,fontWeight:900}}>
        {h&&'↓'}
      </button>
    </div>
  );
}

// ─── 부채꼴 손패 계산 ─────────────────────────────────────────
function computeFanLayout(count, containerW, cardW=50, overlap=0.52) {
  // overlap: 0=겹침없음, 1=완전겹침
  const step = cardW * (1 - overlap);
  const totalW = step * (count - 1) + cardW;
  const startX = Math.max(0, (containerW - totalW) / 2);
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({
    left: startX + i * step,
    rotate: (i - mid) * 3,
    bottom: Math.abs(i - mid) * 1.5,
    zIndex: i,
  }));
}

// ─── 공통 스타일 ──────────────────────────────────────────────
const lBtn=(bg,pad='12px 16px',fs=15,col='#fff')=>({background:bg,border:'none',borderRadius:10,color:col,fontFamily:'Nunito,sans-serif',fontSize:fs,fontWeight:800,padding:pad,cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',justifyContent:'center'});
const lobbyLbl={display:'block',fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7};
const lobbyInput={width:'100%',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.15)',borderRadius:10,color:'#fff',fontFamily:'Nunito,sans-serif',fontSize:16,padding:'12px 16px',outline:'none',boxSizing:'border-box'};

// ─── 로비 ─────────────────────────────────────────────────────
function Lobby({ onEnter }) {
  const [name,setName]=useState('');
  const [code,setCode]=useState('');
  const [tab,setTab]=useState('create');
  const [rooms,setRooms]=useState([]);
  const [allRooms,setAllRooms]=useState([]);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');
  const [deleting,setDeleting]=useState(null);
  const isAdmin=name.trim()===ADMIN;
  useEffect(()=>subscribeToRooms(setRooms),[]);
  useEffect(()=>{ if(isAdmin) return subscribeToAllRooms(setAllRooms); },[isAdmin]);
  const go=async fn=>{
    if(!name.trim())return setErr('닉네임을 입력해주세요.');
    setLoading(true);setErr('');
    try{onEnter(await fn());}catch(e){setErr(e.message);}finally{setLoading(false);}
  };
  const handleDelete=async rid=>{
    setDeleting(rid);try{await deleteRoom(rid);}finally{setDeleting(null);}
  };
  const statusLabel=r=>{
    if(r.status==='playing')return{label:'게임 중',color:'#E8192C'};
    const pc=Object.keys(r.players||{}).length;
    return{label:`대기 ${pc}명`,color:'#22A845'};
  };
  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 30% 20%, #c17a2a 0%, #8b4a0a 40%, #5a2d00 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:440}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontFamily:"'Black Han Sans',sans-serif",fontSize:76,lineHeight:1,textShadow:'0 4px 20px rgba(0,0,0,0.5)',letterSpacing:'-2px'}}>
            <span style={{color:'#FFE066'}}>S</span><span style={{color:'#fff'}}>COUT</span><span style={{color:'#FF6B35'}}>!</span>
          </div>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginTop:6,letterSpacing:'0.15em',textTransform:'uppercase'}}>Scout a card · Build your hands</p>
        </div>
        <div style={{background:'rgba(0,0,0,0.45)',borderRadius:20,padding:26,backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{marginBottom:14}}>
            <label style={lobbyLbl}>닉네임{isAdmin&&<span style={{marginLeft:6,background:'#FFE066',color:'#1a1a1a',fontSize:10,padding:'1px 7px',borderRadius:4,fontWeight:800}}>👑 관리자</span>}</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="닉네임 입력" maxLength={12}
              style={{...lobbyInput,border:`1.5px solid ${isAdmin?'#FFE066':'rgba(255,255,255,0.15)'}`,transition:'border 0.2s'}}/>
          </div>
          <button style={{...lBtn('linear-gradient(135deg,#7B2FF7,#1B3FA0)','13px',15),width:'100%',marginBottom:14}}
            onClick={()=>onEnter({solo:true,playerName:name.trim()||'플레이어'})}>
            🤖 AI와 혼자 플레이 (나 + AI 3명)
          </button>
          <div style={{display:'flex',gap:3,background:'rgba(0,0,0,0.3)',borderRadius:10,padding:4,marginBottom:14}}>
            {['create','join','browse'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?'#E8192C':'transparent',border:'none',color:tab===t?'#fff':'rgba(255,255,255,0.4)',borderRadius:7,padding:'9px 4px',cursor:'pointer',fontFamily:'Nunito,sans-serif',fontWeight:700,fontSize:13,transition:'all 0.15s'}}>
                {{create:'방 만들기',join:'코드 입장',browse:'방 목록'}[t]}
              </button>
            ))}
          </div>
          {tab==='create'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
            <p style={{color:'rgba(255,255,255,0.4)',fontSize:13,textAlign:'center'}}>방을 만들고 친구를 초대하세요 (3~5명)</p>
            <button style={lBtn('#E8192C')} disabled={loading} onClick={()=>go(()=>createRoom(name.trim()))}>{loading?'생성 중...':'방 만들기'}</button>
          </div>}
          {tab==='join'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
            <label style={lobbyLbl}>방 코드</label>
            <input value={code} onChange={e=>setCode(e.target.value)} placeholder="방 코드 입력" style={lobbyInput}/>
            <button style={lBtn('#E8192C')} disabled={loading} onClick={()=>go(()=>joinRoom(code.trim(),name.trim()))}>{loading?'입장 중...':'입장'}</button>
          </div>}
          {tab==='browse'&&<div style={{display:'flex',flexDirection:'column',gap:7}}>
            {rooms.length===0?<p style={{color:'rgba(255,255,255,0.3)',fontSize:13,textAlign:'center',padding:16}}>대기 중인 방 없음</p>
            :rooms.map(r=>{const pc=Object.keys(r.players||{}).length;return(
              <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.07)',borderRadius:10,padding:'10px 14px'}}>
                <div><div style={{fontWeight:700,fontSize:14,color:'#fff'}}>{Object.values(r.players||{})[0]?.name}의 방</div><div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>{pc}/5명</div></div>
                <button style={lBtn('#E8192C','7px 14px',12)} disabled={loading} onClick={()=>go(()=>joinRoom(r.id,name.trim()))}>입장</button>
              </div>);})}
          </div>}
          {err&&<p style={{color:'#FF8080',fontSize:13,textAlign:'center',marginTop:10}}>{err}</p>}
        </div>
        {isAdmin&&(
          <div style={{marginTop:14,background:'rgba(0,0,0,0.5)',borderRadius:16,padding:20,backdropFilter:'blur(8px)',border:'1.5px solid rgba(255,224,102,0.35)'}}>
            <p style={{color:'#FFE066',fontSize:13,fontWeight:800,marginBottom:14}}>👑 관리자 — 방 관리 ({allRooms.length}개)</p>
            {allRooms.length===0?<p style={{color:'rgba(255,255,255,0.3)',fontSize:13,textAlign:'center'}}>방 없음</p>
            :allRooms.map(r=>{const sl=statusLabel(r);const host=Object.values(r.players||{})[0]?.name||'?';const pc=Object.keys(r.players||{}).length;return(
              <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.05)',borderRadius:10,padding:'10px 14px',marginBottom:7,border:'1px solid rgba(255,255,255,0.08)'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                    <span style={{fontWeight:700,fontSize:13,color:'#eee'}}>{host}의 방</span>
                    <span style={{background:sl.color,color:'#fff',fontSize:10,padding:'1px 7px',borderRadius:4,fontWeight:700}}>{sl.label}</span>
                  </div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.35)',fontFamily:'monospace'}}>{r.id?.slice(-8)} · {pc}명</div>
                </div>
                <button onClick={()=>handleDelete(r.id)} disabled={deleting===r.id}
                  style={{background:deleting===r.id?'#555':'#E8192C',border:'none',borderRadius:8,color:'#fff',fontFamily:'Nunito,sans-serif',fontSize:12,fontWeight:700,padding:'6px 12px',cursor:deleting===r.id?'not-allowed':'pointer',flexShrink:0}}>
                  {deleting===r.id?'삭제 중...':'🗑 삭제'}
                </button>
              </div>);})}
          </div>
        )}
        <div style={{marginTop:14,background:'rgba(0,0,0,0.3)',borderRadius:16,padding:18,backdropFilter:'blur(8px)'}}>
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:11,marginBottom:12,textTransform:'uppercase',letterSpacing:'0.1em'}}>게임 방법</p>
          {[['🃏','A. 플레이','마당보다 강한 조합 내려놓기'],['🔍','B. 스카우트','마당 끝 카드 → 손패 원하는 위치에'],['⚡','C. 더블 액션','스카우트 후 바로 플레이 (1회)'],['↕','뒤집기','라운드 시작 전 손패 방향 선택']].map(([ic,nm,ds])=>(
            <div key={nm} style={{display:'flex',gap:10,marginBottom:10,alignItems:'flex-start'}}>
              <span style={{fontSize:18,flexShrink:0}}>{ic}</span>
              <div><div style={{fontWeight:700,color:'#eee',fontSize:13}}>{nm}</div><div style={{color:'rgba(255,255,255,0.45)',fontSize:12}}>{ds}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 대기실 ───────────────────────────────────────────────────
function WaitingRoom({ roomId, playerId, room, onLeave }) {
  const players=Object.values(room.players||{});
  const me=room.players?.[playerId];
  const isHost=room.hostId===playerId;
  const allReady=players.length>=3&&players.every(p=>p.ready||p.id===room.hostId);
  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 30% 20%, #c17a2a 0%, #8b4a0a 40%, #5a2d00 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:440}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <button style={{background:'none',border:'none',color:'rgba(255,255,255,0.5)',cursor:'pointer',fontSize:14,fontFamily:'Nunito,sans-serif'}} onClick={onLeave}>← 나가기</button>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.5)'}}>방 코드: <strong style={{fontFamily:'monospace',color:'#FFE066',fontSize:12}}>{roomId}</strong>
            <button style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:6,color:'#fff',fontSize:11,padding:'3px 9px',marginLeft:7,cursor:'pointer',fontFamily:'Nunito,sans-serif'}} onClick={()=>navigator.clipboard.writeText(roomId)}>복사</button>
          </div>
        </div>
        <div style={{background:'rgba(0,0,0,0.45)',borderRadius:20,padding:26,backdropFilter:'blur(12px)'}}>
          <h2 style={{textAlign:'center',marginBottom:6,fontSize:24,color:'#fff'}}>대기 중...</h2>
          <p style={{color:'rgba(255,255,255,0.4)',fontSize:14,textAlign:'center',marginBottom:22}}>3~5명이 모이면 시작 가능</p>
          <div style={{display:'flex',flexDirection:'column',gap:9,marginBottom:22}}>
            {players.map((p,i)=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:13,background:'rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 16px',border:`2px solid ${p.ready||p.id===room.hostId?'#00DC96':p.id===playerId?PC[0]:'rgba(255,255,255,0.1)'}`}}>
                <div style={{width:44,height:44,borderRadius:'50%',background:PC[i%PC.length],display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,border:'2px solid rgba(255,255,255,0.2)',flexShrink:0}}>{getAvatar(p.id)}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',gap:7,alignItems:'center',fontWeight:700,color:'#fff'}}>
                    {p.name}
                    {p.id===room.hostId&&<span style={{background:'#FFE066',color:'#1a1a1a',fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:800}}>방장</span>}
                    {p.id===playerId&&<span style={{background:PC[0],color:'#fff',fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:800}}>나</span>}
                  </div>
                  <div style={{fontSize:12,color:p.ready||p.id===room.hostId?'#00DC96':'rgba(255,255,255,0.35)',marginTop:2}}>{p.id===room.hostId?'방장':p.ready?'✓ 준비 완료':'대기 중...'}</div>
                </div>
              </div>
            ))}
          </div>
          {isHost
            ?<button style={lBtn(allReady?'#E8192C':'#444','16px',16)} onClick={async()=>await saveGameState(roomId,initializeGame(players.map(p=>p.id)),'playing')} disabled={!allReady}>
              {players.length<3?`최소 3명 필요 (${players.length}/3)`:!allReady?'모든 플레이어 준비 대기 중':'게임 시작! 🎮'}
             </button>
            :<button style={lBtn(me?.ready?'#555':'#E8192C','16px',16)} onClick={()=>toggleReady(roomId,playerId,!me?.ready)}>{me?.ready?'준비 취소':'준비 완료!'}</button>}
        </div>
      </div>
    </div>
  );
}

// ─── 라운드 종료 화면 ─────────────────────────────────────────
function RoundEndScreen({ gs, roundEnd, players, getName, onNext, onLeave }) {
  const sorted=[...gs.players].sort((a,b)=>(roundEnd.tot[b]||0)-(roundEnd.tot[a]||0));
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',overflowY:'auto',zIndex:200,backdropFilter:'blur(16px)'}}>
      <div style={{maxWidth:520,margin:'0 auto',padding:'28px 16px 40px'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:46,marginBottom:6}}>🏆</div>
          <h2 style={{color:'#fff',fontSize:26,marginBottom:4}}>라운드 {gs.round} 종료!</h2>
          <p style={{color:'#FFE066',fontWeight:800,fontSize:18}}>{getName(roundEnd.wid)} 승리!</p>
        </div>
        {gs.players.map((pid,pi)=>{
          const isWinner=pid===roundEnd.wid;
          const pColor=PC[pi%PC.length];
          const hand=gs.hands?.[pid]||[];
          const tokens=gs.scores?.[pid]||0;
          const penalty=hand.length;
          const score=roundEnd.sc[pid]||0;
          const ownedField=gs.field?.ownerId===pid?gs.field.cards:[];
          return (
            <div key={pid} style={{background:isWinner?'rgba(0,220,150,0.1)':'rgba(255,255,255,0.05)',border:`2px solid ${isWinner?'#00DC96':'rgba(255,255,255,0.1)'}`,borderRadius:16,padding:'16px 18px',marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:44,height:44,borderRadius:'50%',background:pColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0,border:`3px solid ${isWinner?'#00DC96':'rgba(255,255,255,0.2)'}`}}>{getAvatar(pid)}</div>
                <div style={{flex:1}}>
                  <span style={{fontWeight:800,fontSize:16,color:isWinner?'#00DC96':'#eee'}}>{getName(pid)}</span>
                  {isWinner&&<span style={{marginLeft:8,background:'#00DC96',color:'#0a2a1a',fontSize:11,padding:'2px 8px',borderRadius:4,fontWeight:800}}>🏆 승자</span>}
                </div>
                <div style={{fontSize:22,fontWeight:900,color:score>=0?'#00DC96':'#FF6B6B'}}>{score>=0?'+':''}{score}</div>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                {[['🏅 토큰',`+${tokens}`,'#FFE066'],!isWinner&&['✗ 손패 감점',`-${penalty}장`,'#FF6B6B'],ownedField.length>0&&['📋 마당패',`${ownedField.length}장`,'#aaa']].filter(Boolean).map(([lb,val,col])=>(
                  <div key={lb} style={{background:'rgba(255,255,255,0.07)',borderRadius:8,padding:'4px 10px',display:'flex',flexDirection:'column',alignItems:'center',minWidth:60}}>
                    <span style={{fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{lb}</span>
                    <span style={{fontSize:14,fontWeight:800,color:col}}>{val}</span>
                  </div>
                ))}
              </div>
              {hand.length>0?(
                <div>
                  <p style={{fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:7}}>손패 ({hand.length}장){!isWinner&&<span style={{color:'#FF6B6B',marginLeft:4}}>← 감점</span>}</p>
                  <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                    {hand.map((c,i)=>{
                      const top=getTopValue(c), bot=getBottomValue(c);
                      return <CardFace key={i} top={top} bot={bot} w={38} h={56} fs={13}
                        border={`2px solid rgba(255,255,255,${isWinner?'0.3':'0.15'})`}
                        shadow="0 2px 8px rgba(0,0,0,0.5)"
                        style={{opacity:isWinner?1:0.55}}/>;
                    })}
                  </div>
                </div>
              ):<p style={{fontSize:12,color:'#00DC96'}}>✓ 손패 소진!</p>}
              {ownedField.length>0&&(
                <div style={{marginTop:10}}>
                  <p style={{fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:7}}>마당패 보유</p>
                  <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                    {ownedField.map((fc,i)=>{
                      const top=fc.flipped?fc.bottom:fc.top, bot=fc.flipped?fc.top:fc.bottom;
                      return <CardFace key={i} top={top} bot={bot} w={38} h={56} fs={13} border="2px solid rgba(255,255,255,0.2)" shadow="0 2px 8px rgba(0,0,0,0.5)"/>;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div style={{background:'rgba(255,255,255,0.04)',borderRadius:14,padding:'14px 18px',marginBottom:20,border:'1px solid rgba(255,255,255,0.08)'}}>
          <p style={{color:'rgba(255,255,255,0.4)',fontSize:11,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>누적 점수 순위</p>
          {sorted.map((pid,rank)=>{
            const pi=gs.players.indexOf(pid);
            return(
              <div key={pid} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{fontSize:14,fontWeight:900,color:rank===0?'#FFE066':'rgba(255,255,255,0.3)',width:20,textAlign:'center'}}>{rank+1}</span>
                <div style={{width:32,height:32,borderRadius:'50%',background:PC[pi%PC.length],display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{getAvatar(pid)}</div>
                <span style={{flex:1,fontWeight:700,fontSize:14,color:rank===0?'#FFE066':'#eee'}}>{getName(pid)}</span>
                <span style={{fontWeight:900,fontSize:18,color:rank===0?'#FFE066':'#eee'}}>{roundEnd.tot[pid]||0}</span>
              </div>
            );
          })}
        </div>
        <button style={{...lBtn('#E8192C','16px',16),width:'100%',marginBottom:8}} onClick={onNext}>다음 라운드 →</button>
        <button style={{...lBtn('rgba(255,255,255,0.1)','12px',14),width:'100%'}} onClick={onLeave}>로비로</button>
      </div>
    </div>
  );
}

// ─── 상대방 패널 카드 ─────────────────────────────────────────
function OpponentPanel({ p, gs, players, isCur }) {
  const pi  = players.findIndex(pl=>pl.id===p.id);
  const col = PC[pi%PC.length];
  const hLen= gs.hands?.[p.id]?.length||0;
  const tok = gs.scores?.[p.id]||0;
  const dbl = !gs.doubleActionUsed?.[p.id];
  // 이 플레이어가 마지막에 낸 마당패 카드 수 (field owner면)
  const fieldCards = gs.field?.ownerId===p.id ? gs.field.cards.length : 0;

  return (
    <div style={{
      background:isCur?'rgba(255,184,0,0.15)':'rgba(0,0,0,0.5)',
      border:`2px solid ${isCur?'#FFE066':'rgba(255,255,255,0.1)'}`,
      borderRadius:14, padding:'10px 13px', backdropFilter:'blur(10px)',
      boxShadow:isCur?'0 0 18px rgba(255,184,0,0.3)':'none',
      transition:'all 0.25s', minWidth:130, flex:'1 1 130px', maxWidth:190,
    }}>
      {/* 아바타 + 이름 */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:9}}>
        <div style={{position:'relative',flexShrink:0}}>
          <div style={{width:40,height:40,borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,border:`2.5px solid ${isCur?'#FFE066':col}`}}>{getAvatar(p.id)}</div>
          {isCur&&<div style={{position:'absolute',bottom:-2,right:-2,width:11,height:11,borderRadius:'50%',background:'#FFE066',border:'2px solid #000',animation:'pulse 1s infinite'}}/>}
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:800,fontSize:12,color:isCur?'#FFE066':'#eee',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:90}}>{p.name}</div>
          {isCur&&<div style={{fontSize:10,color:'#FFE066',marginTop:1}}>차례 중...</div>}
        </div>
      </div>
      {/* 스탯 그리드 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
        <StatCell icon="🃏" label="손패" value={hLen} highlight={hLen<=3}/>
        <StatCell icon="🏅" label="토큰" value={tok} color="#FFE066"/>
        <StatCell icon="📋" label="마당패" value={fieldCards} color={fieldCards>0?'#aaa':'rgba(255,255,255,0.3)'}/>
        <StatCell icon="⚡" label="더블" value={dbl?'O':'X'} color={dbl?'#FFE066':'rgba(255,255,255,0.2)'}/>
      </div>
    </div>
  );
}

function StatCell({ icon, label, value, color='#eee', highlight=false }) {
  return (
    <div style={{background:'rgba(255,255,255,0.07)',borderRadius:7,padding:'5px 7px',display:'flex',alignItems:'center',gap:5}}>
      <span style={{fontSize:13}}>{icon}</span>
      <div>
        <div style={{fontSize:9,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
        <div style={{fontSize:14,fontWeight:800,color:highlight?'#FF6B6B':color,lineHeight:1}}>{value}</div>
      </div>
    </div>
  );
}

// ─── 게임 보드 ────────────────────────────────────────────────
function GameBoard({ roomId, playerId, room, gameState:initGs, solo, soloPlayers, onLeave }) {
  const [gs,setGs]             = useState(initGs);
  const [mode,setMode]         = useState('flip_choice');
  const [doublePhase,setDoublePhase] = useState(null);
  const [selected,setSelected] = useState([]);
  const [msg,setMsg]           = useState('');
  const [roundEnd,setRoundEnd] = useState(null);
  const [aiThinking,setAiThinking] = useState(false);
  const [scoutIdx,setScoutIdx]     = useState(null);
  const [insertMode,setInsertMode] = useState(false);
  const [aiAction,setAiAction]     = useState(null);
  const [showHelp,setShowHelp]     = useState(false);
  const handContainerRef = useRef(null);
  const [handW,setHandW]    = useState(360);
  const timerRef = useRef(null);

  const players  = solo ? soloPlayers : Object.values(room?.players||{});
  const myHand   = gs.hands?.[playerId]||[];
  const curId    = gs.players[gs.currentPlayerIndex];
  const isMyTurn = curId===playerId;
  const isAI     = id=>id?.startsWith('ai_');
  const getName  = pid=>players.find(p=>p.id===pid)?.name||pid;
  const showMsg  = (m,d=2800)=>{ setMsg(m); setTimeout(()=>setMsg(''),d); };
  const myIdx    = players.findIndex(p=>p.id===playerId);
  const myColor  = PC[myIdx%PC.length]||PC[0];
  const canScout = gs.field&&gs.field.ownerId!==playerId;
  const canDouble= canScout&&!gs.doubleActionUsed?.[playerId];

  // 손패 컨테이너 너비 추적
  useEffect(()=>{
    if(!handContainerRef.current)return;
    const ro=new ResizeObserver(([e])=>setHandW(e.contentRect.width));
    ro.observe(handContainerRef.current);
    return()=>ro.disconnect();
  },[]);

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

  const persist=async ngs=>{setGs(ngs);if(!solo)await saveGameState(roomId,ngs);};
  const finishRound=(fgs,wid)=>{
    const sc=calculateRoundScore(fgs,wid);
    const tot={...fgs.totalScores};
    fgs.players.forEach(pid=>{tot[pid]=(tot[pid]||0)+(sc[pid]||0);});
    setRoundEnd({sc,wid,tot});
  };

  const handleFlipChoice=async doFlip=>{
    if(doFlip){
      const ngs={...gs,hands:{...gs.hands,[playerId]:flipEntireHand(myHand)},handFlipped:{...gs.handFlipped,[playerId]:true}};
      await persist(ngs);showMsg('↕ 손패를 뒤집었습니다!');
    }
    setMode('play');
  };

  const handlePlay=async()=>{
    if(!isMyTurn||selected.length===0)return;
    const r=applyPlay(gs,playerId,selected);
    if(r.error)return showMsg('❌ '+r.error);
    setSelected([]);
    if(doublePhase==='scouted'){
      r.state.doubleActionUsed={...r.state.doubleActionUsed,[playerId]:true};
      setDoublePhase(null);
    }
    const end=checkRoundEnd(r.state);
    if(end.ended)return finishRound(r.state,end.winnerId);
    await persist(r.state);
    setMode('play');
  };

  const handleSelectField=(fi,shouldFlip)=>{
    if(!isMyTurn||(mode!=='scout'&&mode!=='double')||insertMode)return;
    setScoutIdx({fi,shouldFlip,isDouble:mode==='double'});
    setInsertMode(true);
  };

  const handleInsert=async insertIdx=>{
    if(scoutIdx===null)return;
    const{fi,shouldFlip,isDouble}=scoutIdx;
    const r=applyScout(gs,playerId,fi,insertIdx,shouldFlip);
    if(r.error){showMsg('❌ '+r.error);return;}
    setScoutIdx(null);setInsertMode(false);
    if(isDouble){
      const myIdx2=r.state.players.indexOf(playerId);
      const stateForDouble={...r.state,currentPlayerIndex:myIdx2};
      setGs(stateForDouble);
      if(!solo)saveGameState(roomId,stateForDouble);
      setDoublePhase('scouted');
      setMode('play');
      showMsg('⚡ 스카우트 완료! 이제 카드를 내려놓으세요.');
      return;
    }
    const end=checkRoundEnd(r.state);
    if(end.ended)return finishRound(r.state,end.winnerId);
    await persist(r.state);
    setMode('play');
    showMsg('✅ 스카우트!');
  };

  const cancelScout=()=>{setScoutIdx(null);setInsertMode(false);if(doublePhase!=='scouted')setMode('play');};

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

  const handleNextRound=async()=>{
    const ngs={...initializeGame(gs.players),round:(gs.round||1)+1,totalScores:roundEnd.tot};
    setRoundEnd(null);setSelected([]);setMode('flip_choice');setScoutIdx(null);setInsertMode(false);setDoublePhase(null);
    await persist(ngs);
  };

  if(roundEnd){
    return <RoundEndScreen gs={gs} roundEnd={roundEnd} players={players} getName={getName} onNext={handleNextRound} onLeave={onLeave}/>;
  }

  // ── 뒤집기 선택 ──
  if(mode==='flip_choice'){
    const flipped=flipEntireHand(myHand);
    const fanN=computeFanLayout(myHand.length,Math.min(560,window.innerWidth-40)-32);
    const fanF=computeFanLayout(flipped.length,Math.min(560,window.innerWidth-40)-32);
    const cH=100;
    return(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(16px)'}}>
        <div style={{background:'rgba(20,10,0,0.97)',border:'1px solid rgba(255,200,80,0.25)',borderRadius:22,width:'95%',maxWidth:580,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,0.8)'}}>
          <h2 style={{textAlign:'center',marginBottom:4,fontSize:21,color:'#fff'}}>라운드 {gs.round||1} 시작!</h2>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:14,textAlign:'center',marginBottom:2}}>손패를 뒤집겠습니까?</p>
          <p style={{color:'rgba(255,255,255,0.25)',fontSize:12,textAlign:'center',marginBottom:18}}>한 번만 가능 — 게임 중 변경 불가</p>
          {[['현재 손패', myHand, fanN],['뒤집으면', flipped, fanF]].map(([label,cards,fan])=>(
            <div key={label} style={{marginBottom:16}}>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{label}</p>
              <div style={{position:'relative',height:cH,overflow:'visible'}}>
                {cards.map((c,i)=>{
                  const f=fan[i]||{left:i*28,rotate:0,bottom:0,zIndex:i};
                  return <HandCard key={c.id+(label==='뒤집으면'?'f':'')} card={c} size="sm" left={f.left} bottom={f.bottom} rotate={f.rotate} zIndex={f.zIndex}/>;
                })}
              </div>
            </div>
          ))}
          <div style={{display:'flex',gap:12,marginTop:24}}>
            <button style={{...lBtn('#E8192C','14px',15),flex:1}} onClick={()=>handleFlipChoice(true)}>↕ 뒤집기</button>
            <button style={{...lBtn('#00DC96','14px',15,'#0a1a0a'),flex:1}} onClick={()=>handleFlipChoice(false)}>그대로 진행</button>
          </div>
        </div>
      </div>
    );
  }

  const otherPlayers=players.filter(p=>p.id!==playerId);
  const scoutModeActive=(mode==='scout'||mode==='double')&&isMyTurn&&canScout&&!insertMode;

  // ── 손패 겹침 레이아웃 ──
  const CARD_W=50;
  const fanLayout=computeFanLayout(myHand.length,handW,CARD_W,0.50);
  const handHeight=110;
  // 삽입 모드: 카드들 사이에 공간 추가
  const insertFan=insertMode ? computeFanLayout(myHand.length,handW,CARD_W,0.35) : fanLayout;

  // ── 마당패 겹침 레이아웃 ──
  const fieldCards=gs.field?.cards||[];
  const FIELD_W=56;
  const FIELD_OVERLAP=0.45;
  const fieldStep=FIELD_W*(1-FIELD_OVERLAP);
  const fieldTotalW=fieldStep*(fieldCards.length-1)+FIELD_W;

  return (
    <div style={{width:'100vw',height:'100vh',position:'relative',overflow:'hidden',
      background:'radial-gradient(ellipse at 25% 15%, #d4892e 0%, #9b5a0f 35%, #5a2d00 70%, #3a1a00 100%)',
      fontFamily:'Nunito,sans-serif'}}>
      <div style={{position:'absolute',inset:0,background:'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.025) 0deg 10deg, transparent 10deg 20deg)',pointerEvents:'none'}}/>

      {/* ── 헤더 ── */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:50,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',zIndex:10}}>
        <div style={{background:'rgba(0,0,0,0.5)',borderRadius:11,padding:'4px 13px',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{fontSize:9,color:'rgba(255,255,255,0.45)',textTransform:'uppercase',letterSpacing:'0.1em'}}>ROUND</div>
          <div style={{fontSize:20,fontWeight:900,color:'#fff',lineHeight:1}}>{gs.round||1}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {aiThinking&&!aiAction&&<span style={{fontSize:12,color:'rgba(255,255,255,0.45)',animation:'pulse 1s infinite',background:'rgba(0,0,0,0.4)',padding:'4px 10px',borderRadius:8,backdropFilter:'blur(6px)'}}>🤖 생각 중...</span>}
          <button onClick={()=>setShowHelp(v=>!v)} style={{width:36,height:36,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.2)',color:'#fff',fontSize:16,cursor:'pointer',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center'}}>?</button>
          <div style={{background:'rgba(0,0,0,0.5)',borderRadius:18,padding:'4px 12px',backdropFilter:'blur(8px)',border:'1px solid rgba(255,200,80,0.3)',display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:13}}>🏅</span>
            <span style={{fontWeight:800,fontSize:14,color:'#FFE066'}}>{gs.tokens||0}</span>
          </div>
          <button onClick={onLeave} style={{width:36,height:36,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.55)',fontSize:16,cursor:'pointer',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
      </div>

      {/* ── 상대방 패널들 (상단) ── */}
      <div style={{position:'absolute',top:58,left:10,right:10,zIndex:10,display:'flex',gap:8,flexWrap:'wrap'}}>
        {otherPlayers.map(p=>(
          <OpponentPanel key={p.id} p={p} gs={gs} players={players} isCur={p.id===curId}/>
        ))}
      </div>

      {/* ── 마당패 (중앙) ── */}
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-58%)',zIndex:5,display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
        {!gs.field?(
          <div style={{background:'rgba(0,0,0,0.3)',borderRadius:18,padding:'20px 28px',border:'2px dashed rgba(255,255,255,0.2)',backdropFilter:'blur(8px)',textAlign:'center'}}>
            <div style={{fontSize:24,marginBottom:4}}>🃏</div>
            <p style={{color:'rgba(255,255,255,0.5)',fontSize:14,fontWeight:600}}>마당 패 없음</p>
            <p style={{color:'rgba(255,255,255,0.3)',fontSize:12,marginTop:2}}>첫 번째로 카드를 내려놓으세요</p>
          </div>
        ):(
          <>
            <div style={{background:'rgba(0,0,0,0.45)',borderRadius:9,padding:'3px 12px',backdropFilter:'blur(6px)'}}>
              <span style={{fontSize:12,color:'#FFE066',fontWeight:700}}>{getName(gs.field.ownerId)}의 마당 패 ({fieldCards.length}장)</span>
            </div>
            {/* 겹치는 마당패 */}
            <div style={{position:'relative',height:120,width:Math.max(fieldTotalW+20,100)}}>
              {fieldCards.map((fc,idx)=>(
                <FieldCard key={idx} fc={fc}
                  scoutable={scoutModeActive&&(idx===0||idx===fieldCards.length-1)}
                  left={idx*fieldStep}
                  zIndex={idx}
                  totalCards={fieldCards.length}
                  onScout={sf=>handleSelectField(idx,sf)}/>
              ))}
            </div>
            {scoutModeActive&&<div style={{background:'rgba(255,224,102,0.12)',borderRadius:9,padding:'4px 12px',border:'1px solid rgba(255,224,102,0.35)'}}>
              <p style={{fontSize:11,color:'#FFE066',textAlign:'center'}}>← 양끝 카드 호버 → 가져오기</p>
            </div>}
            {insertMode&&<div style={{background:'rgba(0,220,150,0.12)',borderRadius:9,padding:'4px 12px',border:'1px solid rgba(0,220,150,0.35)'}}>
              <p style={{fontSize:11,color:'#00DC96',textAlign:'center'}}>↓ 아래 손패에서 삽입 위치 선택</p>
            </div>}
          </>
        )}
      </div>

      {/* ── AI 행동 알림 ── */}
      {aiAction&&(
        <div style={{position:'absolute',top:58,right:10,zIndex:20,background:'rgba(0,0,0,0.75)',borderRadius:14,padding:'10px 14px',border:'1px solid rgba(255,200,80,0.4)',backdropFilter:'blur(12px)',maxWidth:220}}>
          <p style={{fontSize:13,fontWeight:800,color:'#FFE066',marginBottom:6}}>🤖 {aiAction.name}</p>
          {aiAction.type==='play'?(
            <div>
              <p style={{fontSize:10,color:'rgba(255,255,255,0.45)',marginBottom:5}}>플레이:</p>
              <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                {aiAction.cards.map((c,i)=>{
                  const top=getTopValue(c),bot=getBottomValue(c);
                  return <CardFace key={i} top={top} bot={bot} w={36} h={54} fs={13} border="2px solid rgba(255,255,255,0.25)" shadow="0 2px 8px rgba(0,0,0,0.5)"/>;
                })}
              </div>
            </div>
          ):<p style={{fontSize:12,color:'rgba(255,255,255,0.55)'}}>스카우트 → [{aiAction.val}] 가져감</p>}
        </div>
      )}

      {/* ── 하단 영역 ── */}
      <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10}}>

        {/* 더블액션 진행 배너 */}
        {doublePhase==='scouted'&&isMyTurn&&(
          <div style={{display:'flex',justifyContent:'center',marginBottom:6}}>
            <div style={{background:'rgba(255,184,0,0.2)',border:'2px solid #FFB800',borderRadius:11,padding:'6px 18px',backdropFilter:'blur(8px)'}}>
              <span style={{fontSize:13,color:'#FFE066',fontWeight:800}}>⚡ 더블액션 — 이제 카드를 선택해서 플레이!</span>
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        {isMyTurn&&!insertMode&&doublePhase===null&&(
          <div style={{display:'flex',justifyContent:'center',gap:7,marginBottom:6,padding:'0 14px'}}>
            {[['play','🃏','플레이',true],['scout','🔍','스카우트',canScout],['double','⚡','더블',canDouble]].map(([m,ic,nm,en])=>(
              <button key={m} onClick={()=>{if(en){setMode(m);setSelected([]);}}} style={{
                background:mode===m?'rgba(232,25,44,0.85)':'rgba(0,0,0,0.55)',
                border:`2px solid ${mode===m?'#E8192C':'rgba(255,255,255,0.14)'}`,
                borderRadius:13,color:en?'#fff':'rgba(255,255,255,0.22)',
                fontFamily:'Nunito,sans-serif',padding:'7px 15px',cursor:en?'pointer':'not-allowed',
                backdropFilter:'blur(8px)',fontWeight:700,fontSize:14,display:'flex',alignItems:'center',gap:5,
                transition:'all 0.14s',boxShadow:mode===m?'0 4px 14px rgba(232,25,44,0.45)':'none',
              }}>
                <span style={{fontSize:17}}>{ic}</span>{nm}
              </button>
            ))}
          </div>
        )}

        {/* 삽입 배너 */}
        {insertMode&&isMyTurn&&(
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:10,marginBottom:6,padding:'0 14px'}}>
            <div style={{background:'rgba(0,220,150,0.18)',border:'1.5px solid #00DC96',borderRadius:11,padding:'5px 14px',backdropFilter:'blur(8px)'}}>
              <span style={{fontSize:13,color:'#00DC96',fontWeight:700}}>📌 삽입 위치 ↓ 클릭</span>
            </div>
            <button onClick={cancelScout} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:9,color:'rgba(255,255,255,0.55)',fontFamily:'Nunito,sans-serif',fontSize:12,padding:'5px 12px',cursor:'pointer'}}>취소</button>
          </div>
        )}

        {/* 플레이 버튼 */}
        {isMyTurn&&(mode==='play'||doublePhase==='scouted')&&!insertMode&&selected.length>0&&(
          <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:6}}>
            <button onClick={handlePlay} disabled={!validPlay} style={{background:validPlay?'#E8192C':'rgba(255,255,255,0.09)',border:`2px solid ${validPlay?'#E8192C':'rgba(255,255,255,0.18)'}`,borderRadius:13,color:validPlay?'#fff':'rgba(255,255,255,0.28)',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,padding:'7px 20px',cursor:validPlay?'pointer':'not-allowed',backdropFilter:'blur(8px)',transition:'all 0.14s',boxShadow:validPlay?'0 4px 18px rgba(232,25,44,0.55)':'none'}}>
              {validPlay?`✓ 플레이! (${selected.length}장)`:'✗ 유효하지 않음'}
            </button>
            <button onClick={()=>setSelected([])} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:11,color:'rgba(255,255,255,0.45)',fontFamily:'Nunito,sans-serif',fontSize:13,padding:'7px 13px',cursor:'pointer',backdropFilter:'blur(8px)'}}>취소</button>
          </div>
        )}

        {/* 내 손패 영역 */}
        <div style={{background:'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 100%)',backdropFilter:'blur(10px)',borderTop:'1px solid rgba(255,255,255,0.08)',padding:'10px 16px 20px'}}>
          {/* 내 정보 바 */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <div style={{display:'flex',alignItems:'center',gap:9}}>
              <div style={{position:'relative'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:myColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,border:`2.5px solid ${isMyTurn?'#FFE066':'rgba(255,255,255,0.2)'}`}}>{getAvatar(playerId)}</div>
                {isMyTurn&&<div style={{position:'absolute',bottom:-2,right:-2,width:10,height:10,borderRadius:'50%',background:'#FFE066',border:'2px solid #000',animation:'pulse 1s infinite'}}/>}
              </div>
              <div>
                <span style={{fontSize:13,fontWeight:800,color:isMyTurn?'#FFE066':'rgba(255,255,255,0.7)'}}>
                  {players.find(p=>p.id===playerId)?.name||'나'} ({myHand.length}장)
                </span>
                {isMyTurn&&<div style={{fontSize:10,color:'#FFE066',animation:'pulse 1.5s infinite'}}>← 내 차례!</div>}
              </div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:9,color:'rgba(255,255,255,0.35)',textTransform:'uppercase'}}>토큰</div>
                <div style={{fontSize:16,fontWeight:900,color:'#FFE066',lineHeight:1}}>{gs.scores?.[playerId]||0}</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:9,color:'rgba(255,255,255,0.35)',textTransform:'uppercase'}}>더블</div>
                <div style={{fontSize:16,fontWeight:900,color:canDouble?'#FFE066':'rgba(255,255,255,0.2)',lineHeight:1}}>{canDouble?'⚡':'✓'}</div>
              </div>
            </div>
          </div>

          {/* 부채꼴 손패 */}
          <div ref={handContainerRef} style={{position:'relative',height:handHeight+20,overflow:'visible',width:'100%'}}>
            {insertMode ? (
              // 삽입 모드: 카드 + InsertBtn 겹침
              <>
                {insertFan.map((f,i)=>(
                  <HandCard key={myHand[i]?.id||i} card={myHand[i]} size="md"
                    left={f.left+14} bottom={f.bottom+2} rotate={f.rotate} zIndex={i}/>
                ))}
                {/* 삽입 버튼: 각 카드 사이 + 처음 */}
                {Array.from({length:myHand.length+1},(_,i)=>{
                  const leftPos = i===0
                    ? (insertFan[0]?.left||0)
                    : i===myHand.length
                    ? (insertFan[myHand.length-1]?.left||0)+50+14
                    : ((insertFan[i-1]?.left||0)+(insertFan[i]?.left||0))/2+14+CARD_W/2-6;
                  return <InsertBtn key={`ins-${i}`} onClick={()=>handleInsert(i)} left={leftPos} bottom={2} zIndex={500+i}/>;
                })}
              </>
            ) : (
              fanLayout.map((f,i)=>(
                <HandCard key={myHand[i]?.id||i} card={myHand[i]} size="md"
                  left={f.left} bottom={f.bottom} rotate={f.rotate} zIndex={i}
                  selected={selected.includes(i)}
                  clickable={isMyTurn&&(mode==='play'||doublePhase==='scouted')}
                  onClick={()=>toggleSelect(i)}/>
              ))
            )}
          </div>
        </div>
      </div>

      {!isMyTurn&&!aiThinking&&(
        <div style={{position:'absolute',bottom:210,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.52)',borderRadius:18,padding:'6px 16px',backdropFilter:'blur(8px)',zIndex:5,whiteSpace:'nowrap'}}>
          <p style={{fontSize:13,color:'rgba(255,255,255,0.5)',textAlign:'center'}}>{getName(curId)}의 차례...</p>
        </div>
      )}

      {/* 도움말 */}
      {showHelp&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(8px)'}} onClick={()=>setShowHelp(false)}>
          <div style={{background:'rgba(20,10,0,0.97)',border:'1px solid rgba(255,200,80,0.3)',borderRadius:20,padding:26,maxWidth:360,width:'90%'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'#FFE066',marginBottom:15,fontSize:17}}>게임 방법</h3>
            {[['🃏','A. 플레이','마당보다 강한 조합 내려놓기'],['🔍','B. 스카우트','마당 끝 카드를 손패에 삽입'],['⚡','C. 더블','스카우트 후 바로 플레이 (1회)'],['↕','뒤집기','라운드 시작 전 손패 방향 선택']].map(([ic,nm,ds])=>(
              <div key={nm} style={{display:'flex',gap:11,marginBottom:13,alignItems:'flex-start'}}>
                <span style={{fontSize:21,flexShrink:0}}>{ic}</span>
                <div><div style={{fontWeight:800,color:'#fff',fontSize:14}}>{nm}</div><div style={{color:'rgba(255,255,255,0.45)',fontSize:12,marginTop:2}}>{ds}</div></div>
              </div>
            ))}
            <button onClick={()=>setShowHelp(false)} style={{...lBtn('#E8192C','10px',14),width:'100%',marginTop:7}}>닫기</button>
          </div>
        </div>
      )}

      {msg&&(
        <div style={{position:'fixed',top:'38%',left:'50%',transform:'translate(-50%,-50%)',background:'rgba(10,5,0,0.94)',color:'#fff',padding:'12px 26px',borderRadius:26,fontSize:16,fontWeight:700,zIndex:1000,backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.13)',pointerEvents:'none',boxShadow:'0 8px 30px rgba(0,0,0,0.6)'}}>
          {msg}
        </div>
      )}

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:2px}
      `}</style>
    </div>
  );
}

// ─── 앱 루트 ──────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]=useState('lobby');
  const [info,setInfo]=useState(null);
  const [room,setRoom]=useState(null);
  useEffect(()=>{ if(!info?.roomId||info?.solo)return; return subscribeToRoom(info.roomId,setRoom); },[info?.roomId]);
  const handleEnter=data=>{
    if(data.solo){
      const pId='human_player';
      const sp=[{id:pId,name:data.playerName},{id:'ai_1',name:'AI A'},{id:'ai_2',name:'AI B'},{id:'ai_3',name:'AI C'}];
      const gs=initializeGame([pId,'ai_1','ai_2','ai_3']);
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
