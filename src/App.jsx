import { useState, useEffect, useRef } from 'react';
import {
  createRoom, joinRoom, toggleReady, saveGameState,
  subscribeToRoom, subscribeToRooms, subscribeToAllRooms,
  deleteRoom, leaveRoom, sendEmoji, confirmRoundReady, clearRoundReady
} from './firebase';
import {
  initializeGame, applyPlay, applyScout, flipEntireHand,
  checkRoundEnd, calculateRoundScore,
  getTopValue, getBottomValue,
  isConnectedInHand, isValidCombination, isStrongerThan, getAIAction
} from './gameLogic';

// ─── 상수 ────────────────────────────────────────────────────
const CC = {
  1:{bg:'#E8192C',text:'#fff'}, 2:{bg:'#FF6B1A',text:'#fff'}, 3:{bg:'#F5C800',text:'#1a1a1a'},
  4:{bg:'#22A845',text:'#fff'}, 5:{bg:'#1A8FE3',text:'#fff'}, 6:{bg:'#1B3FA0',text:'#fff'},
  7:{bg:'#7B2FF7',text:'#fff'}, 8:{bg:'#F0F0F0',text:'#1a1a1a'}, 9:{bg:'#909090',text:'#fff'},
  10:{bg:'#111111',text:'#fff'},
};
const PC     = ['#E8192C','#1A8FE3','#22A845','#F5C800','#7B2FF7'];
const ADMIN  = '토토';
const AI_THINK = 1200, AI_SHOW = 2800;
const TURN_TIMEOUT = 45;
const EMOJIS = [
  {id:'angry', icon:'😡', label:'분노'},
  {id:'sleepy',icon:'😴', label:'졸림'},
  {id:'laugh', icon:'😂', label:'웃음'},
  {id:'clap',  icon:'👏', label:'칭찬'},
  {id:'sad',   icon:'😢', label:'슬픔'},
];
const AVATARS = ['🦊','🐺','🦁','🐯','🐻','🐼','🦄','🐲','🦅','🦋','🐙','🦈','🦎','🐸','🦩'];
const CARD_W = 50; // 손패 카드 너비
const CARD_H = 76;
const CARD_FS = 17;

function getAvatar(pid) {
  let h=0; for(let i=0;i<pid.length;i++) h=(h*31+pid.charCodeAt(i))>>>0;
  return AVATARS[h%AVATARS.length];
}

// ─── 공통 버튼 스타일 ─────────────────────────────────────────
const lBtn=(bg,pad='12px 16px',fs=15,col='#fff')=>({
  background:bg,border:'none',borderRadius:10,color:col,
  fontFamily:'Nunito,sans-serif',fontSize:fs,fontWeight:800,
  padding:pad,cursor:'pointer',transition:'all 0.15s',
  display:'flex',alignItems:'center',justifyContent:'center'
});
const lobbyLbl  ={display:'block',fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7};
const lobbyInput={width:'100%',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.15)',borderRadius:10,color:'#fff',fontFamily:'Nunito,sans-serif',fontSize:16,padding:'12px 16px',outline:'none',boxSizing:'border-box'};

// ─── 카드 Face ────────────────────────────────────────────────
function CardFace({top,bot,w,h,fs,border,shadow,style={},onClick}) {
  const ct=CC[top]||CC[1], cb=CC[bot]||CC[1];
  return (
    <div onClick={onClick} style={{width:w,height:h,borderRadius:9,overflow:'hidden',flexShrink:0,
      border,boxShadow:shadow,display:'flex',flexDirection:'column',
      cursor:onClick?'pointer':'default',...style}}>
      {/* 위 숫자 — 정방향, 왼쪽 상단 */}
      <div style={{flex:1,background:ct.bg,color:ct.text,position:'relative'}}>
        <span style={{
          position:'absolute',top:3,left:5,
          fontFamily:"'Helvetica Neue',Arial,sans-serif",
          fontSize:fs,fontWeight:500,lineHeight:1,userSelect:'none',
        }}>{top}</span>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:2,background:'rgba(0,0,0,0.15)'}}/>
      </div>
      {/* 아래 절반 전체를 180도 회전 → 뒤집어보면 숫자가 왼쪽 위에 보임 */}
      <div style={{flex:1,background:cb.bg,color:cb.text,
        display:'flex',alignItems:'flex-start',justifyContent:'flex-start',
        padding:'3px 0 0 5px',
        transform:'rotate(180deg)'}}>
        <span style={{
          fontFamily:"'Helvetica Neue',Arial,sans-serif",
          fontSize:fs,fontWeight:500,lineHeight:1,userSelect:'none',
        }}>{bot}</span>
      </div>
    </div>
  );
}

// ─── 손패 카드 (flip preview용 소형) ─────────────────────────
function SmallCard({card, dim=false}) {
  const top=getTopValue(card), bot=getBottomValue(card);
  return <CardFace top={top} bot={bot} w={38} h={58} fs={13}
    border="2px solid rgba(255,255,255,0.2)" shadow="0 2px 8px rgba(0,0,0,0.5)"
    style={{opacity:dim?0.55:1}}/>;
}

// ─── 마당패 카드 ──────────────────────────────────────────────
function FieldCard({fc, scoutable, onScout, left=0, zIndex=0, totalCards=1, isOpen, onOpen}) {
  const [flippedView,setFlippedView]=useState(false);
  const rawTop=fc.flipped?fc.bottom:fc.top, rawBot=fc.flipped?fc.top:fc.bottom;
  const dTop=flippedView?rawBot:rawTop, dBot=flippedView?rawTop:rawBot;
  const W=54,H=82,FS=20;
  const mid=(totalCards-1)/2, rot=(zIndex-mid)*2.5;
  const active=scoutable&&isOpen;
  return (
    <div style={{position:'absolute',left,bottom:0,zIndex:active?999:zIndex}}>
      <div style={{transform:`rotate(${rot}deg) translateY(${active?-14:0}px)`,transformOrigin:'bottom center',transition:'transform 0.18s cubic-bezier(0.34,1.4,0.64,1)'}}>
        <CardFace top={dTop} bot={dBot} w={W} h={H} fs={FS}
          onClick={()=>{ if(scoutable) onOpen(); }}
          border={scoutable?(active?'2.5px solid #FFE066':'2px solid rgba(255,224,102,0.5)'):'2px solid rgba(255,255,255,0.2)'}
          shadow={active?'0 0 20px rgba(255,224,102,0.8),0 6px 20px rgba(0,0,0,0.7)':'0 3px 12px rgba(0,0,0,0.5)'}/>
      </div>
      {active&&(
        <div style={{position:'absolute',top:-68,left:'50%',transform:'translateX(-50%)',
          display:'flex',gap:4,zIndex:1000,whiteSpace:'nowrap',
          background:'rgba(10,5,0,0.92)',borderRadius:8,padding:'5px 7px',
          border:'1.5px solid rgba(255,224,102,0.4)'}}>
          <button onClick={e=>{e.stopPropagation();setFlippedView(v=>!v);}}
            style={{fontSize:11,padding:'4px 8px',border:'none',borderRadius:5,cursor:'pointer',
              background:flippedView?'#FFE066':'rgba(255,255,255,0.12)',
              color:flippedView?'#1a1a1a':'#eee',fontFamily:'Nunito,sans-serif',fontWeight:700}}>
            ↕ 뒤집음{flippedView?' ✓':''}
          </button>
          <button onClick={e=>{e.stopPropagation();onScout(flippedView);setFlippedView(false);onOpen(false);}}
            style={{fontSize:11,padding:'4px 8px',border:'none',borderRadius:5,cursor:'pointer',
              background:'#FFE066',color:'#1a1a1a',fontFamily:'Nunito,sans-serif',fontWeight:800}}>
            가져오기
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 삽입 버튼 ────────────────────────────────────────────────
function InsertBtn({onClick}) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{width:h?22:10,height:CARD_H,flexShrink:0,
        background:h?'rgba(0,220,150,0.45)':'rgba(0,220,150,0.12)',
        border:'2px dashed #00DC96',borderRadius:6,cursor:'pointer',transition:'all 0.13s',
        padding:0,display:'flex',alignItems:'center',justifyContent:'center',
        color:'#00DC96',fontSize:h?15:0,fontWeight:900}}>
      {h&&'↓'}
    </button>
  );
}

// ─── 상대방 패널 (1줄 압축) ───────────────────────────────────
function OpponentPanel({p, gs, players, isCur, emoji}) {
  const pi=players.findIndex(pl=>pl.id===p.id);
  const col=PC[pi%PC.length];
  const hLen=gs.hands?.[p.id]?.length||0;
  const tok=gs.scores?.[p.id]||0;
  const cap=gs.capturedCards?.[p.id]||0;
  const dbl=!gs.doubleActionUsed?.[p.id];
  return (
    <div style={{flex:'1 1 0',minWidth:0,
      background:isCur?'rgba(255,184,0,0.18)':'rgba(0,0,0,0.55)',
      border:`1.5px solid ${isCur?'#FFE066':'rgba(255,255,255,0.1)'}`,
      borderRadius:10,padding:'6px 8px',backdropFilter:'blur(10px)',
      boxShadow:isCur?'0 0 12px rgba(255,184,0,0.3)':'none',
      transition:'all 0.2s',display:'flex',flexDirection:'column',gap:4,position:'relative'}}>
      {/* 이모지 팝업 — 패널 아래 */}
      {emoji&&<div style={{position:'absolute',bottom:-30,left:'50%',transform:'translateX(-50%)',
        fontSize:22,zIndex:50,animation:'emojiPop 0.3s ease',pointerEvents:'none',
        background:'rgba(10,5,0,0.8)',borderRadius:20,padding:'2px 8px',
        border:'1px solid rgba(255,255,255,0.2)',whiteSpace:'nowrap',
        display:'flex',alignItems:'center',gap:4}}>
        {emoji}
      </div>}
      {/* 아바타 + 이름 + 더블 */}
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <div style={{position:'relative',flexShrink:0}}>
          <div style={{width:24,height:24,borderRadius:'50%',background:col,
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,
            border:`2px solid ${isCur?'#FFE066':col}`}}>
            {getAvatar(p.id)}
          </div>
          {isCur&&<div style={{position:'absolute',bottom:-2,right:-2,width:6,height:6,
            borderRadius:'50%',background:'#FFE066',border:'1.5px solid #000',animation:'pulse 1s infinite'}}/>}
        </div>
        <span style={{fontWeight:800,fontSize:10,color:isCur?'#FFE066':'#eee',
          whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1,minWidth:0}}>
          {p.name}
        </span>
        {dbl&&<span style={{fontSize:10}} title="더블 가능">⚡</span>}
      </div>
      {/* 미니 스탯 */}
      <div style={{display:'flex',gap:3}}>
        {[['🃏',hLen,hLen<=3?'#FF6B6B':'#eee'],['🏅',tok,'#FFE066'],['📥',cap,'#00DC96']].map(([ic,v,c])=>(
          <div key={ic} style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:4,
            padding:'2px 3px',display:'flex',alignItems:'center',justifyContent:'center',gap:2}}>
            <span style={{fontSize:9}}>{ic}</span>
            <span style={{fontSize:11,fontWeight:800,color:c,lineHeight:1}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 행동 알림 팝업 ───────────────────────────────────────────
// 플레이/스카우트 모두 카드 이미지 표시, 2.8초 유지
function ActionNotice({action}) {
  if(!action) return null;
  return (
    <div style={{position:'absolute',top:58,right:8,zIndex:50,
      background:'rgba(0,0,0,0.85)',borderRadius:12,padding:'9px 12px',
      border:'1.5px solid rgba(255,200,80,0.4)',backdropFilter:'blur(12px)',maxWidth:220,
      animation:'slideInRight 0.25s ease'}}>
      <div style={{fontSize:12,fontWeight:800,color:'#FFE066',marginBottom:5}}>
        {action.type==='play'?'🃏':'🔍'} {action.name} — {action.type==='play'?'플레이':'스카우트'}
      </div>
      <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
        {(action.cards||[]).map((c,i)=>{
          const top=getTopValue(c),bot=getBottomValue(c);
          return <CardFace key={i} top={top} bot={bot} w={36} h={54} fs={12}
            border="1.5px solid rgba(255,224,102,0.4)" shadow="0 2px 8px rgba(0,0,0,0.5)"/>;
        })}
      </div>
      {action.type==='scout'&&<div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:4}}>→ 손패로 가져감</div>}
    </div>
  );
}

// ─── 감정표현 버튼 패널 ───────────────────────────────────────
function EmojiPanel({onSend}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(v=>!v)}
        style={{background:open?'rgba(255,224,102,0.25)':'rgba(255,255,255,0.12)',
          border:`1.5px solid ${open?'#FFE066':'rgba(255,255,255,0.2)'}`,
          borderRadius:16,padding:'3px 8px',cursor:'pointer',
          fontSize:14,display:'flex',alignItems:'center',gap:3,
          color:'#fff',fontFamily:'Nunito,sans-serif',fontWeight:700,fontSize:12}}>
        😊 <span style={{fontSize:11}}>감정</span>
      </button>
      {open&&(
        <div style={{position:'absolute',bottom:34,left:0,display:'flex',gap:5,
          background:'rgba(10,5,0,0.94)',borderRadius:14,padding:'7px 9px',
          border:'1.5px solid rgba(255,255,255,0.12)',boxShadow:'0 8px 28px rgba(0,0,0,0.7)',
          zIndex:200,whiteSpace:'nowrap'}}>
          {EMOJIS.map(e=>(
            <button key={e.id} onClick={()=>{onSend(e.icon);setOpen(false);}} title={e.label}
              style={{width:36,height:36,borderRadius:8,background:'rgba(255,255,255,0.08)',
                border:'1.5px solid rgba(255,255,255,0.12)',fontSize:20,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              {e.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 라운드 종료 화면 ─────────────────────────────────────────
function RoundEndScreen({gs, roundEnd, players, getName, playerId, solo, onConfirm}) {
  const [confirmed,setConfirmed]=useState(false);
  const sorted=[...gs.players].sort((a,b)=>(roundEnd.tot[b]||0)-(roundEnd.tot[a]||0));
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',overflowY:'auto',zIndex:200,backdropFilter:'blur(16px)'}}>
      <div style={{maxWidth:520,margin:'0 auto',padding:'28px 16px 40px'}}>
        <div style={{textAlign:'center',marginBottom:22}}>
          <div style={{fontSize:44,marginBottom:6}}>🏆</div>
          <h2 style={{color:'#fff',fontSize:24,marginBottom:4}}>라운드 {gs.round} 종료!</h2>
          <p style={{color:'#FFE066',fontWeight:800,fontSize:17}}>{getName(roundEnd.wid)} 승리!</p>
        </div>
        {gs.players.map((pid,pi)=>{
          const isW=pid===roundEnd.wid, pColor=PC[pi%PC.length];
          const hand=gs.hands?.[pid]||[], tokens=gs.scores?.[pid]||0;
          const cap=gs.capturedCards?.[pid]||0, penalty=hand.length, score=roundEnd.sc[pid]||0;
          const ownedField=gs.field?.ownerId===pid?gs.field.cards:[];
          return (
            <div key={pid} style={{background:isW?'rgba(0,220,150,0.1)':'rgba(255,255,255,0.05)',
              border:`2px solid ${isW?'#00DC96':'rgba(255,255,255,0.1)'}`,
              borderRadius:14,padding:'14px 16px',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:pColor,flexShrink:0,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,
                  border:`3px solid ${isW?'#00DC96':'rgba(255,255,255,0.2)'}`}}>{getAvatar(pid)}</div>
                <div style={{flex:1}}>
                  <span style={{fontWeight:800,fontSize:15,color:isW?'#00DC96':'#eee'}}>{getName(pid)}</span>
                  {isW&&<span style={{marginLeft:8,background:'#00DC96',color:'#0a2a1a',fontSize:10,padding:'1px 7px',borderRadius:4,fontWeight:800}}>🏆 승자</span>}
                  {pid===playerId&&<span style={{marginLeft:6,background:'rgba(255,255,255,0.15)',color:'#fff',fontSize:10,padding:'1px 7px',borderRadius:4}}>나</span>}
                </div>
                <div style={{fontSize:20,fontWeight:900,color:score>=0?'#00DC96':'#FF6B6B'}}>{score>=0?'+':''}{score}</div>
              </div>
              <div style={{display:'flex',gap:7,marginBottom:10,flexWrap:'wrap'}}>
                {[['🏅 토큰',`+${tokens}`,'#FFE066'],['📥 먹은 패',`+${cap}장`,'#00DC96'],
                  ...(!isW?[['✗ 손패',`-${penalty}장`,'#FF6B6B']]:[])]
                  .map(([lb,v,c])=>(
                  <div key={lb} style={{background:'rgba(255,255,255,0.07)',borderRadius:7,padding:'4px 9px',display:'flex',flexDirection:'column',alignItems:'center'}}>
                    <span style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase'}}>{lb}</span>
                    <span style={{fontSize:13,fontWeight:800,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              {hand.length>0?(
                <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                  {hand.map((c,i)=><SmallCard key={i} card={c} dim={!isW}/>)}
                </div>
              ):<p style={{fontSize:12,color:'#00DC96'}}>✓ 손패 소진!</p>}
            </div>
          );
        })}
        {/* 누적 순위 */}
        <div style={{background:'rgba(255,255,255,0.04)',borderRadius:12,padding:'12px 16px',marginBottom:18,border:'1px solid rgba(255,255,255,0.08)'}}>
          <p style={{fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>누적 점수</p>
          {sorted.map((pid,rank)=>{
            const pi=gs.players.indexOf(pid);
            return(
              <div key={pid} style={{display:'flex',alignItems:'center',gap:9,marginBottom:7}}>
                <span style={{fontSize:13,fontWeight:900,color:rank===0?'#FFE066':'rgba(255,255,255,0.3)',width:18,textAlign:'center'}}>{rank+1}</span>
                <div style={{width:28,height:28,borderRadius:'50%',background:PC[pi%PC.length],flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>{getAvatar(pid)}</div>
                <span style={{flex:1,fontWeight:700,fontSize:13,color:rank===0?'#FFE066':'#eee'}}>{getName(pid)}</span>
                <span style={{fontWeight:900,fontSize:17,color:rank===0?'#FFE066':'#eee'}}>{roundEnd.tot[pid]||0}</span>
              </div>
            );
          })}
        </div>
        {!confirmed
          ?<button style={{...lBtn('#E8192C','15px',15),width:'100%'}} onClick={()=>{setConfirmed(true);onConfirm();}}>✓ 확인 (다음 라운드 준비)</button>
          :<div style={{textAlign:'center',color:'rgba(255,255,255,0.4)',fontSize:13,padding:14}}>다른 플레이어 확인 대기 중...</div>}
      </div>
    </div>
  );
}

// ─── 로비 ─────────────────────────────────────────────────────
function Lobby({onEnter}) {
  const [name,setName]=useState(''), [code,setCode]=useState('');
  const [tab,setTab]=useState('create'), [rooms,setRooms]=useState([]);
  const [allRooms,setAllRooms]=useState([]), [loading,setLoading]=useState(false);
  const [err,setErr]=useState(''), [deleting,setDeleting]=useState(null);
  const isAdmin=name.trim()===ADMIN;
  useEffect(()=>subscribeToRooms(setRooms),[]);
  useEffect(()=>{ if(isAdmin) return subscribeToAllRooms(setAllRooms); },[isAdmin]);
  const go=async fn=>{ if(!name.trim()) return setErr('닉네임 입력'); setLoading(true);setErr(''); try{onEnter(await fn());}catch(e){setErr(e.message);}finally{setLoading(false);} };
  const sl=r=>r.status==='playing'?{label:'게임 중',color:'#E8192C'}:{label:`대기 ${Object.keys(r.players||{}).length}명`,color:'#22A845'};
  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 30% 20%, #c17a2a 0%, #8b4a0a 40%, #5a2d00 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:440}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontFamily:"'Black Han Sans',sans-serif",fontSize:72,lineHeight:1,textShadow:'0 4px 20px rgba(0,0,0,0.5)',letterSpacing:'-2px'}}>
            <span style={{color:'#FFE066'}}>S</span><span style={{color:'#fff'}}>COUT</span><span style={{color:'#FF6B35'}}>!</span>
          </div>
          <p style={{color:'rgba(255,255,255,0.45)',fontSize:12,marginTop:5,letterSpacing:'0.15em',textTransform:'uppercase'}}>Scout a card · Build your hands</p>
        </div>
        <div style={{background:'rgba(0,0,0,0.45)',borderRadius:20,padding:24,backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{marginBottom:13}}>
            <label style={lobbyLbl}>닉네임{isAdmin&&<span style={{marginLeft:6,background:'#FFE066',color:'#1a1a1a',fontSize:10,padding:'1px 7px',borderRadius:4,fontWeight:800}}>👑 관리자</span>}</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="닉네임 입력" maxLength={12}
              style={{...lobbyInput,border:`1.5px solid ${isAdmin?'#FFE066':'rgba(255,255,255,0.15)'}`,transition:'border 0.2s'}}/>
          </div>
          <button style={{...lBtn('linear-gradient(135deg,#7B2FF7,#1B3FA0)','12px',14),width:'100%',marginBottom:13}}
            onClick={()=>onEnter({solo:true,playerName:name.trim()||'플레이어'})}>
            🤖 AI와 혼자 플레이 (나 + AI 3명)
          </button>
          <div style={{display:'flex',gap:3,background:'rgba(0,0,0,0.3)',borderRadius:10,padding:4,marginBottom:13}}>
            {['create','join','browse'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?'#E8192C':'transparent',border:'none',color:tab===t?'#fff':'rgba(255,255,255,0.4)',borderRadius:7,padding:'9px 4px',cursor:'pointer',fontFamily:'Nunito,sans-serif',fontWeight:700,fontSize:12,transition:'all 0.15s'}}>
                {{create:'방 만들기',join:'코드 입장',browse:'방 목록'}[t]}
              </button>
            ))}
          </div>
          {tab==='create'&&<div style={{display:'flex',justifyContent:'center'}}><button style={{...lBtn('#E8192C','12px 32px',15),minWidth:180}} disabled={loading} onClick={()=>go(()=>createRoom(name.trim()))}>{loading?'생성 중...':'🏠 방 만들기'}</button></div>}
          {tab==='join'&&<div style={{display:'flex',flexDirection:'column',gap:9}}>
            <input value={code} onChange={e=>setCode(e.target.value)} placeholder="방 코드" style={lobbyInput}/>
            <button style={lBtn('#E8192C')} disabled={loading} onClick={()=>go(()=>joinRoom(code.trim(),name.trim()))}>{loading?'입장 중...':'입장'}</button>
          </div>}
          {tab==='browse'&&<div style={{display:'flex',flexDirection:'column',gap:6}}>
            {rooms.length===0?<p style={{color:'rgba(255,255,255,0.3)',fontSize:13,textAlign:'center',padding:14}}>대기 중인 방 없음</p>
            :rooms.map(r=>{const pc=Object.keys(r.players||{}).length; return(
              <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.07)',borderRadius:10,padding:'9px 13px'}}>
                <div><div style={{fontWeight:700,fontSize:13,color:'#fff'}}>{Object.values(r.players||{})[0]?.name}의 방</div><div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>{pc}/5명</div></div>
                <button style={lBtn('#E8192C','6px 13px',12)} disabled={loading} onClick={()=>go(()=>joinRoom(r.id,name.trim()))}>입장</button>
              </div>);})}
          </div>}
          {err&&<p style={{color:'#FF8080',fontSize:13,textAlign:'center',marginTop:9}}>{err}</p>}
        </div>
        {isAdmin&&(
          <div style={{marginTop:13,background:'rgba(0,0,0,0.5)',borderRadius:16,padding:18,backdropFilter:'blur(8px)',border:'1.5px solid rgba(255,224,102,0.35)'}}>
            <p style={{color:'#FFE066',fontSize:12,fontWeight:800,marginBottom:12}}>👑 관리자 ({allRooms.length}개)</p>
            {allRooms.map(r=>{const s=sl(r);const host=Object.values(r.players||{})[0]?.name||'?';const pc=Object.keys(r.players||{}).length;return(
              <div key={r.id} style={{display:'flex',alignItems:'center',gap:9,background:'rgba(255,255,255,0.05)',borderRadius:10,padding:'9px 13px',marginBottom:6,border:'1px solid rgba(255,255,255,0.08)'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                    <span style={{fontWeight:700,fontSize:12,color:'#eee'}}>{host}의 방</span>
                    <span style={{background:s.color,color:'#fff',fontSize:10,padding:'1px 6px',borderRadius:4,fontWeight:700}}>{s.label}</span>
                  </div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.3)',fontFamily:'monospace'}}>{r.id?.slice(-8)} · {pc}명</div>
                </div>
                <button onClick={()=>{setDeleting(r.id);deleteRoom(r.id).finally(()=>setDeleting(null));}}
                  disabled={deleting===r.id}
                  style={{background:deleting===r.id?'#555':'#E8192C',border:'none',borderRadius:7,color:'#fff',fontFamily:'Nunito,sans-serif',fontSize:11,fontWeight:700,padding:'5px 11px',cursor:deleting===r.id?'not-allowed':'pointer',flexShrink:0}}>
                  {deleting===r.id?'삭제 중...':'🗑 삭제'}
                </button>
              </div>);})}
          </div>
        )}
        <div style={{marginTop:13,background:'rgba(0,0,0,0.3)',borderRadius:14,padding:16,backdropFilter:'blur(8px)'}}>
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:10,marginBottom:12,textTransform:'uppercase',letterSpacing:'0.1em'}}>게임 방법</p>
          {[
            {icon:'🚨',title:'절대 규칙',items:['손패 순서 변경 및 섞기 절대 금지','손패 뒤집기: 라운드 시작 직후 1회, 전체 뒤집기만 가능']},
            {icon:'🎯',title:'차례 액션 (3가지 중 택 1)',items:[
              '1. 플레이 — 마당보다 강한 조합 제출. 기존 마당 패는 내가 가져옴 (장당 +1점)',
              '2. 스카우트 — 마당 양끝 1장을 손패에 삽입. 원주인은 토큰 +1점',
              '3. 더블 액션 — 라운드당 1회, 스카우트 후 즉시 플레이',
            ]},
            {icon:'🃏',title:'카드 강약 (우선순위)',items:[
              '① 장수 많을수록 무조건 승리 — 3장 > 2장 > 1장',
              '② 장수 같으면: 같은숫자 > 연속숫자',
              '③ 조합·장수 모두 같으면: 숫자 높은 쪽 승리',
            ],table:[
              ['분류','약 →→→ 강'],
              ['[1장]','1 < 2 < 3 < … < 9 < 10'],
              ['[2장 연속]','1-2 < 2-3 < … < 9-10'],
              ['[2장 동일]','1-1 < 2-2 < … < 10-10'],
              ['[3장 연속]','1-2-3 < 2-3-4 < … < 8-9-10'],
              ['참고','10-10 > 9-10 (동일2장 > 연속2장)'],
            ]},
            {icon:'🏁',title:'라운드 종료 & 점수',items:[
              '종료: 손패 소진 OR 전원 스카우트 후 원래 차례 복귀',
              '득점(+): 먹은 마당 패 + 토큰 (장당 +1점)',
              '감점(-): 남은 손패 장당 -1점 (라운드 종료 당사자 면제)',
              '최종 승리: 인원수만큼 라운드 후 총점 최고득점자',
            ]},
          ].map(({icon,title,items,table})=>(
            <div key={title} style={{marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                <span style={{fontSize:14}}>{icon}</span>
                <span style={{fontWeight:800,color:'#FFE066',fontSize:11,textTransform:'uppercase',letterSpacing:'0.05em'}}>{title}</span>
              </div>
              {items.map((item,i)=>(
                <div key={i} style={{display:'flex',gap:6,marginBottom:3,paddingLeft:4}}>
                  <span style={{color:'rgba(255,255,255,0.3)',fontSize:11,flexShrink:0}}>·</span>
                  <span style={{color:'rgba(255,255,255,0.55)',fontSize:11,lineHeight:1.5}}>{item}</span>
                </div>
              ))}
              {table&&(
                <div style={{marginTop:6,marginLeft:4,background:'rgba(255,255,255,0.04)',borderRadius:8,overflow:'hidden',border:'1px solid rgba(255,255,255,0.08)'}}>
                  {table.map(([label,val],i)=>(
                    <div key={i} style={{display:'flex',borderBottom:i<table.length-1?'1px solid rgba(255,255,255,0.06)':'none',padding:'4px 8px',background:i===0?'rgba(255,255,255,0.06)':'transparent'}}>
                      <span style={{fontSize:10,fontWeight:i===0?700:500,color:i===0?'#FFE066':'rgba(255,255,255,0.4)',width:70,flexShrink:0}}>{label}</span>
                      <span style={{fontSize:10,color:i===0?'rgba(255,255,255,0.7)':'rgba(255,255,255,0.55)',fontFamily:'monospace',lineHeight:1.6}}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 대기실 ───────────────────────────────────────────────────
function WaitingRoom({roomId, playerId, room, onLeave}) {
  const players=Object.values(room.players||{});
  const me=room.players?.[playerId], isHost=room.hostId===playerId;
  const allReady=players.length>=3&&players.every(p=>p.ready||p.id===room.hostId);
  const [turnTime,setTurnTime]=useState(room.turnTime||45);

  const handleStart=async()=>{
    const gs=initializeGame(players.map(p=>p.id));
    await saveGameState(roomId,{...gs,turnTimeout:turnTime},'playing');
  };

  return (
    <div style={{minHeight:'100vh',background:'radial-gradient(ellipse at 30% 20%, #c17a2a 0%, #8b4a0a 40%, #5a2d00 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:420}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <button style={{background:'none',border:'none',color:'rgba(255,255,255,0.5)',cursor:'pointer',fontSize:13,fontFamily:'Nunito,sans-serif'}} onClick={async()=>{await leaveRoom(roomId,playerId);onLeave();}}>← 나가기</button>
          <div style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>방 코드: <strong style={{fontFamily:'monospace',color:'#FFE066'}}>{roomId}</strong>
            <button style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:5,color:'#fff',fontSize:10,padding:'2px 8px',marginLeft:6,cursor:'pointer',fontFamily:'Nunito,sans-serif'}} onClick={()=>navigator.clipboard.writeText(roomId)}>복사</button>
          </div>
        </div>
        <div style={{background:'rgba(0,0,0,0.45)',borderRadius:18,padding:24,backdropFilter:'blur(12px)'}}>
          <h2 style={{textAlign:'center',marginBottom:18,fontSize:22,color:'#fff'}}>대기 중...</h2>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
            {players.map((p,i)=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:12,background:'rgba(255,255,255,0.07)',borderRadius:11,padding:'11px 14px',border:`2px solid ${p.ready||p.id===room.hostId?'#00DC96':p.id===playerId?PC[0]:'rgba(255,255,255,0.1)'}`}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:PC[i%PC.length],display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,border:'2px solid rgba(255,255,255,0.2)',flexShrink:0}}>{getAvatar(p.id)}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',fontWeight:700,color:'#fff',fontSize:14}}>
                    {p.name}
                    {p.id===room.hostId&&<span style={{background:'#FFE066',color:'#1a1a1a',fontSize:10,padding:'1px 6px',borderRadius:3,fontWeight:800}}>방장</span>}
                    {p.id===playerId&&<span style={{background:PC[0],color:'#fff',fontSize:10,padding:'1px 6px',borderRadius:3,fontWeight:800}}>나</span>}
                  </div>
                  <div style={{fontSize:11,color:p.ready||p.id===room.hostId?'#00DC96':'rgba(255,255,255,0.35)',marginTop:2}}>{p.id===room.hostId?'방장':p.ready?'✓ 준비':'대기 중...'}</div>
                </div>
              </div>
            ))}
          </div>
          {/* 턴 시간 설정 — 방장만 */}
          {isHost&&(
            <div style={{background:'rgba(255,255,255,0.06)',borderRadius:12,padding:'12px 14px',marginBottom:14,border:'1px solid rgba(255,255,255,0.1)'}}>
              <p style={{fontSize:11,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:9}}>⏱ 턴 제한 시간</p>
              <div style={{display:'flex',gap:7}}>
                {[30,45,60].map(t=>(
                  <button key={t} onClick={()=>setTurnTime(t)}
                    style={{flex:1,padding:'8px 4px',borderRadius:9,border:`2px solid ${turnTime===t?'#FFE066':'rgba(255,255,255,0.15)'}`,
                      background:turnTime===t?'rgba(255,224,102,0.15)':'rgba(255,255,255,0.06)',
                      color:turnTime===t?'#FFE066':'rgba(255,255,255,0.55)',
                      fontFamily:'Nunito,sans-serif',fontWeight:800,fontSize:15,cursor:'pointer',transition:'all 0.15s'}}>
                    {t}초
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isHost&&room.turnTime&&(
            <p style={{textAlign:'center',color:'rgba(255,255,255,0.4)',fontSize:12,marginBottom:12}}>⏱ 턴 제한: {room.turnTime}초</p>
          )}
          {isHost
            ?<button style={lBtn(allReady?'#E8192C':'#444','15px',15)} disabled={!allReady} onClick={handleStart}>
              {players.length<3?`최소 3명 필요 (${players.length}/3)`:!allReady?'준비 대기 중':'게임 시작! 🎮'}
             </button>
            :<button style={lBtn(me?.ready?'#555':'#E8192C','15px',15)} onClick={()=>toggleReady(roomId,playerId,!me?.ready)}>{me?.ready?'준비 취소':'준비 완료!'}</button>}
        </div>
      </div>
    </div>
  );
}

// ─── 게임 보드 ────────────────────────────────────────────────
function GameBoard({roomId, playerId, room, gameState:initGs, solo, soloPlayers, onLeave}) {
  const [gs,setGs]         = useState(initGs);
  const [mode,setMode]     = useState('flip_choice');
  const [flipChoice,setFC] = useState(null);
  const [doublePhase,setDP]= useState(null);
  const [selected,setSel]  = useState([]);
  const [msg,setMsg]       = useState('');
  const [roundEnd,setRE]   = useState(null);
  const [aiThinking,setAIT]= useState(false);
  const [scoutIdx,setSIdx] = useState(null);
  const [insertMode,setIM] = useState(false);
  const [actionNotice,setAN]= useState(null);
  const [showHelp,setSH]   = useState(false);
  const [scoutAnim,setSA]  = useState(null);
  const [liveEmojis,setLE] = useState({});
  const [myEmoji,setME]    = useState(null);
  const [roundReady,setRR] = useState({});
  const [turnSec,setTS]    = useState(TURN_TIMEOUT);
  const [openFieldIdx,setOFI] = useState(null); // 마당패 선택 인덱스 (한번에 하나)
  const prevGsRef   = useRef(null); // 멀티 행동 감지용
  const timerRef    = useRef(null);
  const turnTimRef  = useRef(null);
  const noticeTimer = useRef(null);

  const players  = solo ? soloPlayers : Object.values(room?.players||{});
  const myHand   = gs.hands?.[playerId]||[];
  const curId    = gs.players[gs.currentPlayerIndex];
  const isMyTurn = curId===playerId;
  const isAI     = id=>id?.startsWith('ai_');
  const getName  = pid=>players.find(p=>p.id===pid)?.name||pid;
  const showMsg  = (m,d=2400)=>{setMsg(m);setTimeout(()=>setMsg(''),d);};
  const myIdx    = players.findIndex(p=>p.id===playerId);
  const myColor  = PC[myIdx%PC.length]||PC[0];
  const canScout = gs.field&&gs.field.ownerId!==playerId;
  const canDouble= canScout&&!gs.doubleActionUsed?.[playerId];
  const TIMEOUT  = gs.turnTimeout||TURN_TIMEOUT; // 방장이 설정한 값 사용

  // Firebase 구독
  useEffect(()=>{
    if(solo) return;
    return subscribeToRoom(roomId,d=>{
      if(!d) return;
      if(d.gameState){
        const newGs=d.gameState;
        // 다른 플레이어 행동 감지 → ActionNotice 표시
        const prev=prevGsRef.current;
        if(prev&&newGs.currentPlayerIndex!==prev.currentPlayerIndex){
          const actorId=prev.players[prev.currentPlayerIndex];
          if(actorId!==playerId&&actorId){
            const actorName=d.players?.[actorId]?.name||actorId;
            // 플레이 감지: field 주인이 actorId로 바뀜
            if(newGs.field?.ownerId===actorId&&newGs.field?.cards?.length>0){
              const cards=newGs.field.cards.map(fc=>({top:fc.value??fc.top,bottom:fc.bottom??fc.top,flipped:fc.flipped??false,id:fc.cardId}));
              showNotice({type:'play',name:actorName,cards});
            }
            // 스카우트 감지: field 장수가 줄었거나 null
            else if(!newGs.field||(prev.field&&newGs.field&&newGs.field.cards?.length<prev.field.cards?.length)){
              const scouted=prev.field?.cards?.find(fc=>!newGs.field?.cards?.find(nc=>nc.cardId===fc.cardId));
              if(scouted){
                const card={top:scouted.flipped?scouted.bottom:scouted.top,bottom:scouted.flipped?scouted.top:scouted.bottom,flipped:false,id:scouted.cardId};
                showNotice({type:'scout',name:actorName,cards:[card]});
              }
            }
          }
        }
        prevGsRef.current=newGs;
        setGs(newGs);
      }
      if(d.roundReady) setRR(d.roundReady);
      if(d.emojis){
        const map={};
        Object.values(d.emojis).forEach(e=>{ map[e.playerId]=e.emoji; });
        setLE(map);
      } else setLE({});
    });
  },[roomId,solo]);

  const showNotice=(notice)=>{
    setAN(notice);
    clearTimeout(noticeTimer.current);
    noticeTimer.current=setTimeout(()=>setAN(null),3000);
  };

  // 멀티 라운드 ready 체크
  useEffect(()=>{
    if(solo||!roundEnd) return;
    if(gs.players.length>0&&gs.players.every(pid=>roundReady[pid])) handleNextRound();
  },[roundReady,roundEnd]);

  // 45초 턴 타이머 (내 차례에만)
  useEffect(()=>{
    clearInterval(turnTimRef.current);
    if(!gs||roundEnd||mode==='flip_choice'||isAI(curId)||curId!==playerId) { setTS(TIMEOUT); return; }
    setTS(TIMEOUT);
    turnTimRef.current=setInterval(()=>{
      setTS(prev=>{
        if(prev<=1){
          clearInterval(turnTimRef.current);
          autoScoutOrPlay();
          return TIMEOUT;
        }
        return prev-1;
      });
    },1000);
    return()=>clearInterval(turnTimRef.current);
  },[gs?.currentPlayerIndex, roundEnd, mode]);

  const autoScoutOrPlay=()=>{
    // 마당패 있으면 마지막 카드 스카우트, 없으면 첫 카드 플레이
    const currGs=gs; // closure
    if(currGs.field&&currGs.field.cards.length>0){
      const fi=currGs.field.cards.length-1;
      const fc=currGs.field.cards[fi];
      const newCard={id:fc.cardId??fc.id,top:fc.top,bottom:fc.bottom,flipped:fc.flipped};
      const hand=[...(currGs.hands[playerId]||[]),newCard];
      const newFieldCards=currGs.field.cards.slice(0,-1);
      let tokens=currGs.tokens; const scores={...currGs.scores};
      if(tokens>0){tokens--;scores[currGs.field.ownerId]=(scores[currGs.field.ownerId]||0)+1;}
      const next=(currGs.currentPlayerIndex+1)%currGs.players.length;
      const scoutedList=[...(currGs.scoutedSinceLastPlay||[])];
      if(!scoutedList.includes(playerId)) scoutedList.push(playerId);
      const ngs={...currGs,hands:{...currGs.hands,[playerId]:hand},
        field:newFieldCards.length>0?{...currGs.field,cards:newFieldCards}:null,
        scores,tokens,currentPlayerIndex:next,scoutedSinceLastPlay:scoutedList};
      const end=checkRoundEnd(ngs);
      if(end.ended){finishRound(ngs,end.winnerId);return;}
      setGs(ngs); if(!solo)saveGameState(roomId,ngs);
      setMode('play'); showMsg('⏰ 시간 초과 — 자동 스카우트!');
    } else {
      const r=applyPlay(currGs,playerId,[0]);
      if(!r.error){const end=checkRoundEnd(r.state);if(end.ended){finishRound(r.state,end.winnerId);return;}setGs(r.state);if(!solo)saveGameState(roomId,r.state);showMsg('⏰ 자동 플레이!');}
    }
  };

  // AI 자동 실행
  useEffect(()=>{
    if(!gs||roundEnd) return;
    const cur=gs.players[gs.currentPlayerIndex];
    if(!isAI(cur)) return;
    setAIT(true);
    timerRef.current=setTimeout(()=>{
      const action=getAIAction(gs,cur);
      if(!action){setAIT(false);return;}
      let result;
      if(action.type==='play') result=applyPlay(gs,cur,action.indices);
      else result=applyScout(gs,cur,action.fieldIndex,action.insertIndex);
      if(result.error){setAIT(false);return;}
      // AI 행동 알림
      const noticeCards = action.type==='play'
        ? action.indices.map(i=>gs.hands[cur][i])
        : [gs.field?.cards[action.fieldIndex]].filter(Boolean).map(fc=>({
            top:fc.flipped?fc.bottom:fc.top, bottom:fc.flipped?fc.top:fc.bottom, flipped:false, id:fc.cardId
          }));
      showNotice({type:action.type, name:getName(cur), cards:noticeCards});
      const ngs=result.state;
      setTimeout(()=>{
        const end=checkRoundEnd(ngs);
        if(end.ended){finishRound(ngs,end.winnerId);setAIT(false);return;}
        setGs(ngs); if(!solo)saveGameState(roomId,ngs);
        setAIT(false);
      },AI_SHOW);
    },AI_THINK);
    return()=>clearTimeout(timerRef.current);
  },[gs?.currentPlayerIndex,roundEnd]);

  const persist=async ngs=>{setGs(ngs);if(!solo)await saveGameState(roomId,ngs);};
  const finishRound=(fgs,wid)=>{
    const sc=calculateRoundScore(fgs,wid), tot={...fgs.totalScores};
    fgs.players.forEach(pid=>{tot[pid]=(tot[pid]||0)+(sc[pid]||0);});
    setRE({sc,wid,tot});
  };

  const handleFlipConfirm=async()=>{
    if(flipChoice===null) return;
    if(flipChoice){
      const ngs={...gs,hands:{...gs.hands,[playerId]:flipEntireHand(myHand)},handFlipped:{...gs.handFlipped,[playerId]:true}};
      await persist(ngs); showMsg('↕ 손패 뒤집기!');
    }
    setFC(null); setMode('play');
  };

  const handlePlay=async()=>{
    if(!isMyTurn||selected.length===0) return;
    const r=applyPlay(gs,playerId,selected);
    if(r.error) return showMsg('❌ '+r.error);
    setSel([]);
    if(doublePhase==='scouted'){r.state.doubleActionUsed={...r.state.doubleActionUsed,[playerId]:true};setDP(null);}
    const end=checkRoundEnd(r.state);
    if(end.ended) return finishRound(r.state,end.winnerId);
    await persist(r.state); setMode('play');
  };

  const handleSelectField=(fi,shouldFlip)=>{
    if(!isMyTurn||(mode!=='scout'&&mode!=='double')||insertMode) return;
    setSIdx({fi,shouldFlip,isDouble:mode==='double'}); setIM(true);
  };

  const handleInsert=async insertIdx=>{
    if(scoutIdx===null) return;
    const {fi,shouldFlip,isDouble}=scoutIdx;
    const fc=gs.field?.cards[fi];
    if(!fc){showMsg('❌ 카드 없음');return;}
    const r=applyScout(gs,playerId,fi,insertIdx,shouldFlip);
    if(r.error){showMsg('❌ '+r.error);return;}
    setSIdx(null);setIM(false);
    // 스카우트 애니메이션용 카드
    const animTop=shouldFlip?(fc.flipped?fc.top:fc.bottom):(fc.flipped?fc.bottom:fc.top);
    const animBot=shouldFlip?(fc.flipped?fc.bottom:fc.top):(fc.flipped?fc.top:fc.bottom);
    setSA({card:{top:animTop,bottom:animBot,flipped:false},toLabel:getName(playerId)});
    if(isDouble){
      const myIdx2=r.state.players.indexOf(playerId);
      const sd={...r.state,currentPlayerIndex:myIdx2};
      setGs(sd); if(!solo)saveGameState(roomId,sd);
      setDP('scouted'); setMode('play'); showMsg('⚡ 스카우트! 이제 플레이하세요.');
      return;
    }
    const end=checkRoundEnd(r.state);
    if(end.ended) return finishRound(r.state,end.winnerId);
    await persist(r.state); setMode('play'); showMsg('✅ 스카우트!');
  };

  const cancelScout=()=>{setSIdx(null);setIM(false);if(doublePhase!=='scouted')setMode('play');};

  const toggleSelect=idx=>{
    if(!isMyTurn||mode!=='play'||insertMode) return;
    setSel(prev=>{
      const next=prev.includes(idx)?prev.filter(i=>i!==idx):[...prev,idx].sort((a,b)=>a-b);
      if(next.length>1&&!isConnectedInHand(myHand,next)) return prev;
      return next;
    });
  };

  const selCards=selected.map(i=>myHand[i]);
  const validPlay=selected.length>0&&isConnectedInHand(myHand,selected)&&isValidCombination(selCards)&&(!gs.field||isStrongerThan(selCards,gs.field.cards));

  const handleEmojiSend=async icon=>{
    const name=players.find(p=>p.id===playerId)?.name||'나';
    setME(icon); setTimeout(()=>setME(null),3000);
    if(solo){
      setLE(prev=>({...prev,[playerId]:icon}));
      setTimeout(()=>setLE(prev=>{const n={...prev};delete n[playerId];return n;}),3000);
    } else {
      await sendEmoji(roomId,playerId,icon,name);
    }
  };

  const handleRoundConfirm=async()=>{
    if(solo) handleNextRound();
    else await confirmRoundReady(roomId,playerId);
  };

  const handleNextRound=async()=>{
    const ngs={...initializeGame(gs.players),round:(gs.round||1)+1,totalScores:roundEnd.tot,turnTimeout:gs.turnTimeout};
    setRE(null);setSel([]);setMode('flip_choice');setSIdx(null);
    setIM(false);setDP(null);setFC(null);setRR({});
    if(!solo)await clearRoundReady(roomId);
    await persist(ngs);
  };

  const handleLeave=async()=>{if(!solo)await leaveRoom(roomId,playerId);onLeave();};

  if(roundEnd) return <RoundEndScreen gs={gs} roundEnd={roundEnd} players={players} getName={getName} playerId={playerId} solo={solo} onConfirm={handleRoundConfirm}/>;

  // ── 뒤집기 선택 화면 ──
  if(mode==='flip_choice'){
    const flipped=flipEntireHand(myHand);
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(16px)',padding:16}}>
        <div style={{background:'rgba(20,10,0,0.97)',border:'1px solid rgba(255,200,80,0.25)',borderRadius:20,width:'100%',maxWidth:520,padding:'20px 24px',boxShadow:'0 20px 60px rgba(0,0,0,0.8)',maxHeight:'90vh',overflowY:'auto'}}>
          <h2 style={{textAlign:'center',marginBottom:4,fontSize:19,color:'#fff'}}>라운드 {gs.round||1} 시작!</h2>
          <p style={{color:'rgba(255,255,255,0.45)',fontSize:12,textAlign:'center',marginBottom:16}}>
            뒤집기 여부 선택 후 <strong style={{color:'#FFE066'}}>확인</strong> 을 눌러야 진행됩니다
          </p>
          {[['현재 손패',myHand],['뒤집으면',flipped]].map(([label,cards])=>{
            const n=cards.length;
            const SW=36, step=SW*0.52;
            const totalW=step*(n-1)+SW;
            const mid=(n-1)/2;
            const containerW=Math.min(window.innerWidth-80, 480);
            const startX=totalW<containerW?Math.max(0,(containerW-totalW)/2):0;
            return (
              <div key={label} style={{marginBottom:14}}>
                <p style={{fontSize:10,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</p>
                <div style={{position:'relative',height:72,overflow:'visible',minWidth:totalW+SW}}>
                  {cards.map((c,i)=>{
                    const rot=(i-mid)*3;
                    const liftY=Math.abs(i-mid)*2;
                    const top=getTopValue(c),bot=getBottomValue(c);
                    return <div key={c.id+(label==='뒤집으면'?'f':'')}
                      style={{position:'absolute',left:startX+i*step,bottom:liftY,zIndex:i,
                        transform:`rotate(${rot}deg)`,transformOrigin:'bottom center'}}>
                      <CardFace top={top} bot={bot} w={SW} h={54} fs={12}
                        border="1.5px solid rgba(255,255,255,0.2)" shadow="0 2px 8px rgba(0,0,0,0.5)"/>
                    </div>;
                  })}
                </div>
              </div>
            );
          })}
          <div style={{display:'flex',gap:9,marginTop:8}}>
            <button onClick={()=>setFC(false)} style={{...lBtn(flipChoice===false?'#00DC96':'rgba(255,255,255,0.09)','12px',13,flipChoice===false?'#0a1a0a':'#fff'),flex:1,border:`2px solid ${flipChoice===false?'#00DC96':'rgba(255,255,255,0.18)'}`}}>그대로{flipChoice===false?' ✓':''}</button>
            <button onClick={()=>setFC(true)}  style={{...lBtn(flipChoice===true?'#E8192C':'rgba(255,255,255,0.09)','12px',13,'#fff'),flex:1,border:`2px solid ${flipChoice===true?'#E8192C':'rgba(255,255,255,0.18)'}`}}>↕ 뒤집기{flipChoice===true?' ✓':''}</button>
          </div>
          <button onClick={handleFlipConfirm} disabled={flipChoice===null}
            style={{...lBtn(flipChoice!==null?'#FFE066':'#333','13px',15,flipChoice!==null?'#1a1a1a':'rgba(255,255,255,0.2)'),width:'100%',marginTop:10,boxShadow:flipChoice!==null?'0 4px 18px rgba(255,224,102,0.5)':'none',transition:'all 0.2s'}}>
            {flipChoice===null?'먼저 위에서 선택해주세요':'✓ 확인 — 게임 시작!'}
          </button>
        </div>
      </div>
    );
  }

  // ── 메인 게임 화면 ──
  const fieldCards=gs.field?.cards||[];
  const FIELD_W=54, fieldStep=FIELD_W*0.58;
  const fieldTotalW=fieldStep*(fieldCards.length-1)+FIELD_W+16;
  const otherPlayers=players.filter(p=>p.id!==playerId);
  const scoutModeActive=(mode==='scout'||mode==='double')&&isMyTurn&&canScout&&!insertMode;

  return (
    <div style={{width:'100vw',height:'100vh',position:'relative',overflow:'hidden',
      background:'radial-gradient(ellipse at 25% 10%, #d4892e 0%, #9b5a0f 30%, #5a2d00 65%, #3a1a00 100%)',
      fontFamily:'Nunito,sans-serif'}}>
      <div style={{position:'absolute',inset:0,background:'repeating-conic-gradient(from 0deg,rgba(255,255,255,0.02) 0deg 10deg,transparent 10deg 20deg)',pointerEvents:'none'}}/>

      {/* ── 헤더 ── */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:48,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 10px',zIndex:10}}>
        <div style={{background:'rgba(0,0,0,0.5)',borderRadius:10,padding:'3px 11px',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div style={{fontSize:8,color:'rgba(255,255,255,0.45)',textTransform:'uppercase',letterSpacing:'0.1em'}}>ROUND</div>
          <div style={{fontSize:19,fontWeight:900,color:'#fff',lineHeight:1}}>{gs.round||1}</div>
        </div>
        {/* 턴 타이머 — 내 차례에만 */}
        {isMyTurn&&mode!=='flip_choice'&&(
          <div style={{background:turnSec<=10?'rgba(232,25,44,0.25)':'rgba(0,0,0,0.4)',borderRadius:20,padding:'4px 12px',border:`1.5px solid ${turnSec<=10?'#E8192C':'rgba(255,255,255,0.15)'}`,backdropFilter:'blur(8px)',display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:12,color:turnSec<=10?'#FF8080':'rgba(255,255,255,0.6)'}}>⏱</span>
            <span style={{fontWeight:800,fontSize:15,color:turnSec<=10?'#FF6B6B':'#eee',lineHeight:1}}>{turnSec}</span>
          </div>
        )}
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {aiThinking&&!actionNotice&&<span style={{fontSize:10,color:'rgba(255,255,255,0.45)',animation:'pulse 1s infinite',background:'rgba(0,0,0,0.4)',padding:'3px 8px',borderRadius:7}}>🤖 생각 중...</span>}
          <button onClick={()=>setSH(v=>!v)} style={{width:34,height:34,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.2)',color:'#fff',fontSize:14,cursor:'pointer',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center'}}>?</button>
          <div style={{background:'rgba(0,0,0,0.5)',borderRadius:16,padding:'3px 10px',backdropFilter:'blur(8px)',border:'1px solid rgba(255,200,80,0.3)',display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontSize:12}}>🏅</span>
            <span style={{fontWeight:800,fontSize:13,color:'#FFE066'}}>{gs.tokens||0}</span>
          </div>
          <button onClick={handleLeave} style={{width:34,height:34,borderRadius:'50%',background:'rgba(0,0,0,0.4)',border:'2px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.5)',fontSize:14,cursor:'pointer',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
      </div>

      {/* ── 상대방 패널 (헤더 바로 아래, 1줄) ── */}
      <div style={{position:'absolute',top:52,left:8,right:8,zIndex:10,display:'flex',gap:5,flexWrap:'nowrap'}}>
        {otherPlayers.map(p=>(
          <OpponentPanel key={p.id} p={p} gs={gs} players={players} isCur={p.id===curId} emoji={liveEmojis[p.id]}/>
        ))}
      </div>

      {/* ── AI 행동 알림 ── */}
      <ActionNotice action={actionNotice}/>

      {/* ── 마당패 영역 (중앙 약간 위) ── */}
      <div style={{position:'absolute',top:'40%',left:'50%',transform:'translate(-50%,-50%)',zIndex:5,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
        {!gs.field?(
          <div style={{background:'rgba(0,0,0,0.3)',borderRadius:16,padding:'16px 24px',border:'2px dashed rgba(255,255,255,0.18)',backdropFilter:'blur(8px)',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:4}}>🃏</div>
            <p style={{color:'rgba(255,255,255,0.45)',fontSize:13,fontWeight:600}}>마당 패 없음</p>
            <p style={{color:'rgba(255,255,255,0.3)',fontSize:11,marginTop:2}}>첫 번째로 내려놓으세요</p>
          </div>
        ):(
          <>
            <div style={{background:'rgba(0,0,0,0.45)',borderRadius:8,padding:'2px 11px',backdropFilter:'blur(6px)'}}>
              <span style={{fontSize:11,color:'#FFE066',fontWeight:700}}>{getName(gs.field.ownerId)}의 마당 ({fieldCards.length}장)</span>
            </div>
            <div style={{position:'relative',height:100,width:Math.max(fieldTotalW,80)}}>
              {fieldCards.map((fc,idx)=>{
                const isEdge=idx===0||idx===fieldCards.length-1;
                return (
                  <FieldCard key={idx} fc={fc}
                    scoutable={scoutModeActive&&isEdge}
                    left={idx*fieldStep} zIndex={idx} totalCards={fieldCards.length}
                    isOpen={openFieldIdx===idx}
                    onOpen={()=>setOFI(prev=>prev===idx?null:idx)}
                    onScout={sf=>{handleSelectField(idx,sf);setOFI(null);}}/>
                );
              })}
            </div>
            {scoutModeActive&&!insertMode&&<div style={{background:'rgba(255,224,102,0.1)',borderRadius:8,padding:'3px 10px',border:'1px solid rgba(255,224,102,0.3)'}}>
              <p style={{fontSize:10,color:'#FFE066',textAlign:'center'}}>← 양끝 카드 클릭 후 가져오기 →</p>
            </div>}
            {insertMode&&<div style={{background:'rgba(0,220,150,0.1)',borderRadius:8,padding:'3px 10px',border:'1px solid rgba(0,220,150,0.3)'}}>
              <p style={{fontSize:10,color:'#00DC96',textAlign:'center'}}>↓ 아래에서 삽입 위치 선택</p>
            </div>}
          </>
        )}
      </div>

      {/* ── 스카우트 애니메이션 ── */}
      {scoutAnim&&<ScoutAnim card={scoutAnim.card} toLabel={scoutAnim.toLabel} onDone={()=>setSA(null)}/>}

      {/* ── 하단 손패 영역 ── */}
      <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10}}>
        {/* 더블액션 배너 */}
        {doublePhase==='scouted'&&isMyTurn&&(
          <div style={{display:'flex',justifyContent:'center',marginBottom:5}}>
            <div style={{background:'rgba(255,184,0,0.18)',border:'1.5px solid #FFB800',borderRadius:10,padding:'5px 16px',backdropFilter:'blur(8px)'}}>
              <span style={{fontSize:12,color:'#FFE066',fontWeight:800}}>⚡ 더블액션 — 이제 카드를 플레이!</span>
            </div>
          </div>
        )}
        {/* 액션 버튼 */}
        {isMyTurn&&!insertMode&&doublePhase===null&&(
          <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:5,padding:'0 10px'}}>
            {[['play','🃏','플레이',true],['scout','🔍','스카우트',canScout],['double','⚡','더블',canDouble]].map(([m,ic,nm,en])=>(
              <button key={m} onClick={()=>{if(en){setMode(m);setSel([]);}}} style={{
                background:mode===m?'rgba(232,25,44,0.85)':'rgba(0,0,0,0.55)',
                border:`2px solid ${mode===m?'#E8192C':'rgba(255,255,255,0.13)'}`,
                borderRadius:11,color:en?'#fff':'rgba(255,255,255,0.22)',
                fontFamily:'Nunito,sans-serif',padding:'6px 13px',cursor:en?'pointer':'not-allowed',
                backdropFilter:'blur(8px)',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:4,
                transition:'all 0.14s',boxShadow:mode===m?'0 3px 12px rgba(232,25,44,0.4)':'none',
              }}>
                <span style={{fontSize:15}}>{ic}</span>{nm}
              </button>
            ))}
          </div>
        )}
        {/* 삽입 모드 배너 */}
        {insertMode&&isMyTurn&&(
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,marginBottom:5,padding:'0 10px'}}>
            <div style={{background:'rgba(0,220,150,0.16)',border:'1.5px solid #00DC96',borderRadius:10,padding:'4px 12px',backdropFilter:'blur(8px)'}}>
              <span style={{fontSize:12,color:'#00DC96',fontWeight:700}}>📌 삽입 위치 클릭</span>
            </div>
            <button onClick={cancelScout} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.16)',borderRadius:8,color:'rgba(255,255,255,0.5)',fontFamily:'Nunito,sans-serif',fontSize:12,padding:'4px 10px',cursor:'pointer'}}>취소</button>
          </div>
        )}
        {/* 플레이 버튼 */}
        {isMyTurn&&(mode==='play'||doublePhase==='scouted')&&!insertMode&&selected.length>0&&(
          <div style={{display:'flex',justifyContent:'center',gap:7,marginBottom:5}}>
            <button onClick={handlePlay} disabled={!validPlay} style={{background:validPlay?'#E8192C':'rgba(255,255,255,0.09)',border:`2px solid ${validPlay?'#E8192C':'rgba(255,255,255,0.16)'}`,borderRadius:11,color:validPlay?'#fff':'rgba(255,255,255,0.28)',fontFamily:'Nunito,sans-serif',fontSize:13,fontWeight:800,padding:'6px 18px',cursor:validPlay?'pointer':'not-allowed',backdropFilter:'blur(8px)',transition:'all 0.14s',boxShadow:validPlay?'0 3px 16px rgba(232,25,44,0.5)':'none'}}>
              {validPlay?`✓ 플레이! (${selected.length}장)`:'✗ 유효하지 않음'}
            </button>
            <button onClick={()=>setSel([])} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.16)',borderRadius:10,color:'rgba(255,255,255,0.4)',fontFamily:'Nunito,sans-serif',fontSize:12,padding:'6px 12px',cursor:'pointer',backdropFilter:'blur(8px)'}}>취소</button>
          </div>
        )}

        {/* ── 내 손패 바 ── */}
        <div style={{background:'linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.55) 100%)',backdropFilter:'blur(12px)',borderTop:'1px solid rgba(255,255,255,0.1)',padding:'10px 10px 0',paddingBottom:'max(20px, env(safe-area-inset-bottom, 20px))',overflow:'visible'}}>
          {/* 내 정보 + 감정표현 버튼 */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{position:'relative',flexShrink:0}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:myColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,border:`2.5px solid ${isMyTurn?'#FFE066':'rgba(255,255,255,0.2)'}`}}>{getAvatar(playerId)}</div>
                {isMyTurn&&<div style={{position:'absolute',bottom:-2,right:-2,width:8,height:8,borderRadius:'50%',background:'#FFE066',border:'1.5px solid #000',animation:'pulse 1s infinite'}}/>}
                {myEmoji&&<div style={{position:'absolute',top:-26,left:'50%',transform:'translateX(-50%)',fontSize:20,animation:'emojiPop 0.3s ease',pointerEvents:'none',zIndex:20}}>{myEmoji}</div>}
              </div>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:12,fontWeight:800,color:isMyTurn?'#FFE066':'rgba(255,255,255,0.7)'}}>
                    {players.find(p=>p.id===playerId)?.name||'나'} ({myHand.length}장)
                  </span>
                  <EmojiPanel onSend={handleEmojiSend}/>
                </div>
                {isMyTurn&&<div style={{fontSize:10,color:'#FFE066',animation:'pulse 1.5s infinite'}}>← 내 차례!</div>}
              </div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <div style={{textAlign:'center'}}><div style={{fontSize:8,color:'rgba(255,255,255,0.35)',textTransform:'uppercase'}}>토큰</div><div style={{fontSize:15,fontWeight:900,color:'#FFE066',lineHeight:1}}>{gs.scores?.[playerId]||0}</div></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:8,color:'rgba(255,255,255,0.35)',textTransform:'uppercase'}}>먹은 패</div><div style={{fontSize:15,fontWeight:900,color:'#00DC96',lineHeight:1}}>{gs.capturedCards?.[playerId]||0}</div></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:8,color:'rgba(255,255,255,0.35)',textTransform:'uppercase'}}>더블</div><div style={{fontSize:15,fontWeight:900,color:canDouble?'#FFE066':'rgba(255,255,255,0.18)',lineHeight:1}}>{canDouble?'⚡':'✓'}</div></div>
            </div>
          </div>

          {/* ── 손패 — 팬 레이아웃 + 좌우 스크롤 ── */}
          {/* 바깥 wrapper: 카드 상단 잘림 방지용 여유 공간 포함, overflow 제어 */}
          <div style={{
            position:'relative',
            /* 위쪽 여유: 회전+선택 올라옴 공간 */
            paddingTop:30,
            /* 스크롤은 이 안쪽 div에서 처리 */
          }}>
            <div className="hand-scroll" style={{
              overflowX:'auto',
              overflowY:'visible',
              WebkitOverflowScrolling:'touch',
              touchAction:'pan-x',
              paddingBottom:6,
            }}>
            {insertMode?(
              /* 삽입 모드 */
              <div style={{display:'flex',alignItems:'flex-end',paddingLeft:8,paddingRight:16,minWidth:'max-content'}}>
                <InsertBtn onClick={()=>handleInsert(0)}/>
                {myHand.map((c,i)=>(
                  <div key={c.id||i} style={{display:'flex',alignItems:'flex-end',flexShrink:0}}>
                    <div style={{width:CARD_W,flexShrink:0}}>
                      <CardFace top={getTopValue(c)} bot={getBottomValue(c)} w={CARD_W} h={CARD_H} fs={CARD_FS}
                        border="1.5px solid rgba(255,255,255,0.22)" shadow="0 2px 8px rgba(0,0,0,0.5)"/>
                    </div>
                    <InsertBtn onClick={()=>handleInsert(i+1)}/>
                  </div>
                ))}
              </div>
            ):(
              /* 팬 레이아웃 */
              <div style={{
                position:'relative',
                height:CARD_H+18,
                width:'max-content',
                minWidth:'100%',
                paddingLeft:8,
                paddingRight:16,
              }}>
                {myHand.map((c,idx)=>{
                  const n=myHand.length;
                  const step=CARD_W*0.52;
                  const mid=(n-1)/2;
                  const isSel=selected.includes(idx);
                  const rot=(idx-mid)*2.5;
                  const liftBase=Math.abs(idx-mid)*1.5;
                  return (
                    <div key={c.id||idx}
                      onClick={()=>toggleSelect(idx)}
                      style={{
                        position:'absolute',
                        left:8+idx*step,
                        bottom:liftBase,
                        transform:`rotate(${rot}deg) translateY(${isSel?-20:0}px)`,
                        transformOrigin:'bottom center',
                        transition:'transform 0.15s cubic-bezier(0.34,1.4,0.64,1)',
                        zIndex:idx,
                        cursor:isMyTurn&&(mode==='play'||doublePhase==='scouted')?'pointer':'default',
                      }}>
                      <CardFace top={getTopValue(c)} bot={getBottomValue(c)} w={CARD_W} h={CARD_H} fs={CARD_FS}
                        border={isSel?'2.5px solid #FFE066':'1.5px solid rgba(255,255,255,0.25)'}
                        shadow={isSel?'0 0 14px rgba(255,224,102,0.7),0 4px 12px rgba(0,0,0,0.6)':'0 2px 8px rgba(0,0,0,0.5)'}/>
                      {isSel&&<div style={{position:'absolute',inset:0,borderRadius:9,background:'rgba(255,224,102,0.12)',pointerEvents:'none'}}/>}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {!isMyTurn&&!aiThinking&&(
        <div style={{position:'absolute',bottom:185,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.5)',borderRadius:16,padding:'5px 14px',backdropFilter:'blur(8px)',zIndex:5,whiteSpace:'nowrap'}}>
          <p style={{fontSize:12,color:'rgba(255,255,255,0.45)',textAlign:'center'}}>{getName(curId)}의 차례...</p>
        </div>
      )}

      {/* 도움말 */}
      {showHelp&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(8px)'}} onClick={()=>setSH(false)}>
          <div style={{background:'rgba(20,10,0,0.97)',border:'1px solid rgba(255,200,80,0.3)',borderRadius:18,padding:24,maxWidth:340,width:'90%'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'#FFE066',marginBottom:13,fontSize:16}}>게임 방법</h3>
            {[['🃏','A. 플레이','마당보다 강한 조합 내려놓기'],['🔍','B. 스카우트','양끝 카드 클릭→ 가져오기'],['⚡','C. 더블','스카우트 후 바로 플레이'],['😊','감정표현','이름 옆 버튼 → 이모지 선택']].map(([ic,nm,ds])=>(
              <div key={nm} style={{display:'flex',gap:10,marginBottom:11,alignItems:'flex-start'}}>
                <span style={{fontSize:19,flexShrink:0}}>{ic}</span>
                <div><div style={{fontWeight:800,color:'#fff',fontSize:13}}>{nm}</div><div style={{color:'rgba(255,255,255,0.45)',fontSize:11,marginTop:1}}>{ds}</div></div>
              </div>
            ))}
            <button onClick={()=>setSH(false)} style={{...lBtn('#E8192C','9px',13),width:'100%',marginTop:6}}>닫기</button>
          </div>
        </div>
      )}

      {msg&&(
        <div style={{position:'fixed',top:'36%',left:'50%',transform:'translate(-50%,-50%)',background:'rgba(10,5,0,0.94)',color:'#fff',padding:'10px 22px',borderRadius:22,fontSize:15,fontWeight:700,zIndex:1000,backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.12)',pointerEvents:'none',boxShadow:'0 6px 24px rgba(0,0,0,0.6)'}}>
          {msg}
        </div>
      )}

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes emojiPop{0%{opacity:0;transform:translate(-50%,4px) scale(0.5)}70%{transform:translate(-50%,-2px) scale(1.2)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box}
        .hand-scroll{overflow-x:auto!important;overflow-y:visible!important;-webkit-overflow-scrolling:touch;touch-action:pan-x;}
        .hand-scroll::-webkit-scrollbar{height:3px}
        .hand-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:2px}
        .hand-scroll::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar{height:4px;width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px}
        ::-webkit-scrollbar-track{background:transparent}
      `}</style>
    </div>
  );
}

// ─── 스카우트 애니메이션 ──────────────────────────────────────
function ScoutAnim({card, toLabel, onDone}) {
  const [phase,setPhase]=useState(0);
  const top=getTopValue(card), bot=getBottomValue(card);
  useEffect(()=>{
    const t1=setTimeout(()=>setPhase(1),500);
    const t2=setTimeout(()=>onDone(),2200);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  return (
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:500}}>
      <div style={{position:'absolute',left:'50%',top:'45%',
        transform:phase===0?'translate(-50%,-50%) scale(1.15)':'translate(-50%,30%) scale(0.65)',
        transition:'transform 0.5s cubic-bezier(0.4,0,0.2,1),opacity 0.5s',opacity:phase===0?1:0}}>
        <CardFace top={top} bot={bot} w={58} h={86} fs={21}
          border="2.5px solid #FFE066" shadow="0 0 28px rgba(255,224,102,0.9)"/>
      </div>
      {phase===1&&<div style={{position:'absolute',top:'36%',left:'50%',transform:'translate(-50%,-50%)',
        background:'rgba(10,5,0,0.93)',color:'#FFE066',padding:'10px 22px',borderRadius:22,
        fontSize:15,fontWeight:800,border:'2px solid rgba(255,224,102,0.45)',
        boxShadow:'0 6px 24px rgba(0,0,0,0.6)',animation:'slideInRight 0.2s ease',
        display:'flex',alignItems:'center',gap:8}}>
        <CardFace top={top} bot={bot} w={32} h={48} fs={12} border="1px solid rgba(255,255,255,0.2)" shadow="none"/>
        <span>{toLabel}가 획득!</span>
      </div>}
    </div>
  );
}

// ─── 앱 루트 ─────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]=useState('lobby');
  const [info,setInfo]=useState(null);
  const [room,setRoom]=useState(null);
  useEffect(()=>{ if(!info?.roomId||info?.solo) return; return subscribeToRoom(info.roomId,setRoom); },[info?.roomId]);
  const handleEnter=data=>{
    if(data.solo){
      const pId='human_player';
      const sp=[{id:pId,name:data.playerName},{id:'ai_1',name:'AI A'},{id:'ai_2',name:'AI B'},{id:'ai_3',name:'AI C'}];
      setInfo({solo:true,playerId:pId,gameState:initializeGame([pId,'ai_1','ai_2','ai_3']),soloPlayers:sp});
      setScreen('game');
    } else { setInfo(data); setScreen('room'); }
  };
  const leave=()=>{setScreen('lobby');setInfo(null);setRoom(null);};
  if(screen==='lobby') return <Lobby onEnter={handleEnter}/>;
  if(screen==='room'&&info&&room){
    if(room.status==='playing'&&room.gameState)
      return <GameBoard roomId={info.roomId} playerId={info.playerId} room={room} gameState={room.gameState} solo={false} onLeave={leave}/>;
    return <WaitingRoom roomId={info.roomId} playerId={info.playerId} room={room} onLeave={leave}/>;
  }
  if(screen==='game'&&info?.solo)
    return <GameBoard playerId={info.playerId} gameState={info.gameState} soloPlayers={info.soloPlayers} solo={true} onLeave={leave}/>;
  return <div style={{color:'rgba(255,255,255,0.4)',textAlign:'center',paddingTop:100}}>연결 중...</div>;
}
