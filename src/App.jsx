import { useState, useEffect, useRef } from 'react';
import {
  createRoom, joinRoom, toggleReady, saveGameState, subscribeToRoom, subscribeToRooms
} from './firebase';
import {
  initializeGame, applyPlay, applyScout, flipEntireHand,
  checkRoundEnd, calculateRoundScore, getTopValue, getBottomValue,
  isConnectedInHand, isValidCombination, isStrongerThan, getAIAction
} from './gameLogic';

const COLORS = {1:'#FF6B6B',2:'#FF9F43',3:'#FECA57',4:'#48CA8B',5:'#1DD1A1',6:'#54A0FF',7:'#9B59B6',8:'#C44569',9:'#E17055',10:'#2C3E50'};
const TC = {1:'#fff',2:'#fff',3:'#333',4:'#fff',5:'#fff',6:'#fff',7:'#fff',8:'#fff',9:'#fff',10:'#fff'};
const AI_THINK = 1000;
const AI_SHOW  = 2000;

// ── 카드 ──
function Card({ card, selected, clickable, onClick, size='md', fieldValue, highlight }) {
  const isF = fieldValue !== undefined;
  const val = isF ? fieldValue : getTopValue(card);
  const bot = isF ? null : getBottomValue(card);
  const w={sm:36,md:52,lg:64}[size], h={sm:52,md:76,lg:94}[size], fs={sm:13,md:18,lg:24}[size];
  return (
    <div onClick={onClick} style={{
      width:w,height:h,borderRadius:8,overflow:'hidden',flexShrink:0,
      border:selected?'2px solid #F39C12':highlight?'2px solid #2ecc71':'2px solid rgba(255,255,255,0.2)',
      boxShadow:selected?'0 0 14px rgba(243,156,18,0.7)':highlight?'0 0 10px rgba(46,204,113,0.5)':'0 2px 6px rgba(0,0,0,0.4)',
      transform:selected?'translateY(-8px)':'translateY(0)',cursor:clickable?'pointer':'default',
      display:'flex',flexDirection:'column',transition:'all 0.15s',
    }}
    onMouseEnter={e=>{if(clickable&&!selected)e.currentTarget.style.transform='translateY(-3px)';}}
    onMouseLeave={e=>{if(clickable&&!selected)e.currentTarget.style.transform='translateY(0)';}}>
      {isF?(
        <div style={{flex:1,background:COLORS[val],color:TC[val],display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontFamily:"'Black Han Sans',sans-serif",fontSize:fs+6}}>{val}</span>
        </div>
      ):(
        <>
          <div style={{flex:1,background:COLORS[val],color:TC[val],display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontFamily:"'Black Han Sans',sans-serif",fontSize:fs}}>{val}</span>
          </div>
          <div style={{flex:1,background:COLORS[bot],color:TC[bot],display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontFamily:"'Black Han Sans',sans-serif",fontSize:fs,transform:'rotate(180deg)',display:'block'}}>{bot}</span>
          </div>
        </>
      )}
    </div>
  );
}

function CardBack() {
  return <div style={{width:28,height:42,borderRadius:5,flexShrink:0,background:'linear-gradient(135deg,#1a1a4e,#2d2d7a)',border:'2px solid rgba(255,255,255,0.1)'}}/>;
}

function InsertBtn({ onClick }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{width:h?28:14,height:52,background:h?'rgba(46,204,113,0.4)':'rgba(46,204,113,0.15)',
        border:'2px dashed #2ecc71',borderRadius:6,cursor:'pointer',transition:'all 0.15s',flexShrink:0,
        padding:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#2ecc71',fontSize:h?16:0,fontWeight:900}}>
      {h&&'↓'}
    </button>
  );
}

// ── 로비 ──
function Lobby({ onEnter }) {
  const [name,setName]=useState(''); const [code,setCode]=useState('');
  const [tab,setTab]=useState('create'); const [rooms,setRooms]=useState([]);
  const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  useEffect(()=>subscribeToRooms(setRooms),[]);
  const go=async(fn)=>{
    if(!name.trim())return setErr('닉네임을 입력해주세요.');
    setLoading(true);setErr('');
    try{onEnter(await fn());}catch(e){setErr(e.message);}finally{setLoading(false);}
  };
  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:'32px 16px',minHeight:'100vh'}}>
      <div style={{textAlign:'center',marginBottom:32}}>
        <div style={{fontFamily:"'Black Han Sans',sans-serif",fontSize:64,lineHeight:1}}>
          <span style={{color:'#E74C3C'}}>S</span><span style={{color:'#eee'}}>COUT</span><span style={{color:'#F39C12'}}>!</span>
        </div>
        <p style={{color:'#aaa',fontSize:13,marginTop:8}}>Scout a card to build up your hands!</p>
      </div>
      <div style={CS}>
        <div style={{marginBottom:16}}>
          <label style={LB}>닉네임</label>
          <input style={IP} value={name} onChange={e=>setName(e.target.value)} placeholder="닉네임 입력" maxLength={12}/>
        </div>
        <button style={{...BT,background:'#8e44ad',marginBottom:16,width:'100%'}}
          onClick={()=>onEnter({solo:true,playerName:name.trim()||'플레이어'})}>
          🤖 AI와 혼자 플레이 (테스트용)
        </button>
        <div style={{display:'flex',gap:4,background:'#0f3460',borderRadius:8,padding:4,marginBottom:16}}>
          {['create','join','browse'].map(t=>(
            <button key={t} style={{flex:1,background:tab===t?'#E74C3C':'none',border:'none',color:tab===t?'#fff':'#aaa',borderRadius:6,padding:'8px 4px',cursor:'pointer',fontFamily:'Nunito,sans-serif',fontWeight:700,fontSize:13}}
              onClick={()=>setTab(t)}>{{create:'방 만들기',join:'코드 입장',browse:'방 목록'}[t]}</button>
          ))}
        </div>
        {tab==='create'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          <p style={{color:'#aaa',fontSize:13,textAlign:'center'}}>방을 만들고 친구를 초대하세요 (3~5명)</p>
          <button style={{...BT,background:'#E74C3C'}} disabled={loading} onClick={()=>go(()=>createRoom(name.trim()))}>{loading?'생성 중...':'방 만들기'}</button>
        </div>}
        {tab==='join'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          <label style={LB}>방 코드</label>
          <input style={IP} value={code} onChange={e=>setCode(e.target.value)} placeholder="방 코드 입력"/>
          <button style={{...BT,background:'#E74C3C'}} disabled={loading} onClick={()=>go(()=>joinRoom(code.trim(),name.trim()))}>{loading?'입장 중...':'입장'}</button>
        </div>}
        {tab==='browse'&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
          {rooms.length===0?<p style={{color:'#aaa',fontSize:13,textAlign:'center',padding:16}}>대기 중인 방 없음</p>
          :rooms.map(r=>{const pc=Object.keys(r.players||{}).length;return(
            <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0f3460',borderRadius:8,padding:'10px 14px',border:'1px solid rgba(255,255,255,0.1)'}}>
              <div><div style={{fontWeight:700,fontSize:14}}>{Object.values(r.players||{})[0]?.name}의 방</div><div style={{fontSize:12,color:'#aaa'}}>{pc}/5명</div></div>
              <button style={{...BT,padding:'6px 12px',fontSize:12}} disabled={loading} onClick={()=>go(()=>joinRoom(r.id,name.trim()))}>입장</button>
            </div>);})}
        </div>}
        {err&&<p style={{color:'#E74C3C',fontSize:13,textAlign:'center',marginTop:8}}>{err}</p>}
      </div>
      <div style={{...CS,marginTop:16}}>
        <p style={{color:'#aaa',fontSize:12,marginBottom:10,textTransform:'uppercase'}}>게임 방법</p>
        {[['🃏','A. 플레이 — 마당보다 강한 조합 내려놓기'],['🔍','B. 스카우트 — 마당 끝 카드를 손패 원하는 위치에 삽입'],['⚡','C. 더블 액션 — 스카우트 후 바로 플레이'],['↕','라운드 시작 전 손패 뒤집기 선택 (1회)']].map(([ic,tx])=>(
          <div key={tx} style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8,fontSize:13}}>
            <span style={{fontSize:18,flexShrink:0}}>{ic}</span><span>{tx}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 대기실 ──
function WaitingRoom({ roomId, playerId, room, onLeave }) {
  const players=Object.values(room.players||{});
  const me=room.players?.[playerId];
  const isHost=room.hostId===playerId;
  const allReady=players.length>=3&&players.every(p=>p.ready||p.id===room.hostId);
  const handleStart=async()=>{ const gs=initializeGame(players.map(p=>p.id)); await saveGameState(roomId,gs,'playing'); };
  return (
    <div style={{maxWidth:420,margin:'0 auto',padding:16,minHeight:'100vh'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <button style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}} onClick={onLeave}>← 나가기</button>
        <div style={{fontSize:13,color:'#aaa'}}>방 코드: <strong style={{fontFamily:'monospace',color:'#eee',fontSize:11}}>{roomId}</strong>
          <button style={{...BT,padding:'2px 8px',fontSize:11,marginLeft:6}} onClick={()=>navigator.clipboard.writeText(roomId)}>복사</button>
        </div>
      </div>
      <h2 style={{textAlign:'center',marginBottom:8}}>대기 중...</h2>
      <p style={{color:'#aaa',fontSize:14,textAlign:'center',marginBottom:24}}>3~5명이 모이면 시작 가능</p>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
        {players.map(p=>(
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:12,background:'#16213e',borderRadius:10,padding:'12px 16px',
            border:`2px solid ${p.ready||p.id===room.hostId?'#2ecc71':p.id===playerId?'#3498DB':'rgba(255,255,255,0.1)'}`}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'#0f3460',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:18}}>
              {p.name[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:6,alignItems:'center',fontWeight:700}}>
                {p.name}
                {p.id===room.hostId&&<span style={{background:'#F39C12',color:'#333',fontSize:10,padding:'2px 6px',borderRadius:4,fontWeight:800}}>방장</span>}
                {p.id===playerId&&<span style={{background:'#3498DB',color:'#fff',fontSize:10,padding:'2px 6px',borderRadius:4,fontWeight:800}}>나</span>}
              </div>
              <div style={{fontSize:12,color:p.ready||p.id===room.hostId?'#2ecc71':'#aaa'}}>{p.id===room.hostId?'방장':p.ready?'준비 완료':'대기 중'}</div>
            </div>
          </div>
        ))}
      </div>
      {isHost
        ?<button style={{...BT,background:allReady?'#E74C3C':'#555',width:'100%',padding:14,fontSize:16,opacity:allReady?1:0.6}} onClick={handleStart} disabled={!allReady}>
          {players.length<3?`최소 3명 필요 (${players.length}/3)`:!allReady?'모든 플레이어 준비 필요':'게임 시작!'}
         </button>
        :<button style={{...BT,background:me?.ready?'#555':'#E74C3C',width:'100%',padding:14,fontSize:16}} onClick={()=>toggleReady(roomId,playerId,!me?.ready)}>
          {me?.ready?'준비 취소':'준비 완료'}
         </button>
      }
    </div>
  );
}

// ── 게임 보드 ──
function GameBoard({ roomId, playerId, room, gameState:initGs, solo, soloPlayers, onLeave }) {
  const [gs,setGs]           = useState(initGs);
  const [mode,setMode]       = useState('flip_choice'); // flip_choice | play | scout
  const [selected,setSelected] = useState([]);
  const [msg,setMsg]         = useState('');
  const [roundEnd,setRoundEnd] = useState(null);
  const [aiThinking,setAiThinking] = useState(false);
  const [scoutIdx,setScoutIdx]   = useState(null);   // 선택한 마당패 인덱스
  const [insertMode,setInsertMode] = useState(false); // 손패 삽입위치 선택 중
  const [aiAction,setAiAction]   = useState(null);   // AI가 방금 한 행동
  const timerRef = useRef(null);

  const players = solo ? soloPlayers : Object.values(room?.players||{});
  const myHand  = gs.hands?.[playerId]||[];
  const curId   = gs.players[gs.currentPlayerIndex];
  const isMyTurn = curId===playerId;
  const isAI    = id=>id?.startsWith('ai_');
  const getName = pid=>players.find(p=>p.id===pid)?.name||pid;
  const showMsg = (m,d=2500)=>{ setMsg(m); setTimeout(()=>setMsg(''),d); };

  // Firebase 동기화
  useEffect(()=>{ if(solo)return; return subscribeToRoom(roomId,d=>{ if(d?.gameState)setGs(d.gameState); }); },[roomId,solo]);

  // AI 플레이
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
      // AI 행동 표시
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

  // 뒤집기 선택
  const handleFlipChoice=async doFlip=>{
    if(doFlip){
      const ngs={...gs,hands:{...gs.hands,[playerId]:flipEntireHand(myHand)},handFlipped:{...gs.handFlipped,[playerId]:true}};
      await persist(ngs);showMsg('↕ 손패를 뒤집었습니다!');
    }
    setMode('play');
  };

  // 플레이
  const handlePlay=async()=>{
    if(!isMyTurn||selected.length===0)return;
    const r=applyPlay(gs,playerId,selected);
    if(r.error)return showMsg('❌ '+r.error);
    setSelected([]);
    const end=checkRoundEnd(r.state);
    if(end.ended)return finishRound(r.state,end.winnerId);
    await persist(r.state);
  };

  // 스카우트 1단계: 마당패 카드 선택
  const handleSelectField=fi=>{
    if(!isMyTurn||mode!=='scout'||insertMode)return;
    setScoutIdx(fi);setInsertMode(true);
  };

  // 스카우트 2단계: 손패 삽입 위치
  const handleInsert=async insertIdx=>{
    if(scoutIdx===null)return;
    const r=applyScout(gs,playerId,scoutIdx,insertIdx);
    if(r.error){showMsg('❌ '+r.error);return;}
    setScoutIdx(null);setInsertMode(false);setMode('play');
    const end=checkRoundEnd(r.state);
    if(end.ended)return finishRound(r.state,end.winnerId);
    await persist(r.state);showMsg('✅ 스카우트!');
  };

  const cancelScout=()=>{setScoutIdx(null);setInsertMode(false);setMode('play');};

  // 카드 선택
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
  const canScout=gs.field&&gs.field.ownerId!==playerId;

  const handleNextRound=async()=>{
    const ngs={...initializeGame(gs.players),round:(gs.round||1)+1,totalScores:roundEnd.tot};
    setRoundEnd(null);setSelected([]);setMode('flip_choice');setScoutIdx(null);setInsertMode(false);
    await persist(ngs);
  };

  // 라운드 종료
  if(roundEnd){
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(8px)'}}>
        <div style={{...CS,width:'90%',maxWidth:380,textAlign:'center',padding:32}}>
          <h2 style={{marginBottom:8}}>라운드 {gs.round} 종료!</h2>
          <p style={{color:'#F39C12',fontWeight:800,fontSize:18,marginBottom:20}}>🏆 {getName(roundEnd.wid)} 승리!</p>
          <p style={{color:'#aaa',fontSize:12,marginBottom:10,textTransform:'uppercase'}}>이번 라운드</p>
          {gs.players.map(pid=>(
            <div key={pid} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderRadius:8,marginBottom:4,background:pid===roundEnd.wid?'rgba(46,204,113,0.15)':'rgba(255,255,255,0.05)'}}>
              <span>{getName(pid)}</span>
              <span style={{fontWeight:800,color:(roundEnd.sc[pid]||0)>=0?'#2ecc71':'#E74C3C'}}>{(roundEnd.sc[pid]||0)>=0?'+':''}{roundEnd.sc[pid]||0}</span>
            </div>
          ))}
          <p style={{color:'#aaa',fontSize:12,margin:'16px 0 10px',textTransform:'uppercase'}}>누적</p>
          {[...gs.players].sort((a,b)=>(roundEnd.tot[b]||0)-(roundEnd.tot[a]||0)).map(pid=>(
            <div key={pid} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderRadius:8,marginBottom:4,background:'rgba(255,255,255,0.05)'}}>
              <span>{getName(pid)}</span><span style={{fontWeight:800,color:'#F39C12'}}>{roundEnd.tot[pid]||0}</span>
            </div>
          ))}
          <button style={{...BT,background:'#E74C3C',width:'100%',padding:14,fontSize:16,marginTop:16}} onClick={handleNextRound}>다음 라운드 →</button>
          <button style={{...BT,width:'100%',padding:10,marginTop:8,fontSize:13}} onClick={onLeave}>로비로</button>
        </div>
      </div>
    );
  }

  // 뒤집기 선택 화면 (라운드 시작 직후, 내 차례 여부 무관하게 본인만)
  if(mode==='flip_choice'){
    const flipped=flipEntireHand(myHand);
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,backdropFilter:'blur(8px)'}}>
        <div style={{...CS,width:'92%',maxWidth:400,padding:28,textAlign:'center'}}>
          <h2 style={{marginBottom:6}}>라운드 {gs.round||1} 시작!</h2>
          <p style={{color:'#aaa',fontSize:14,marginBottom:4}}>손패를 뒤집겠습니까?</p>
          <p style={{color:'#666',fontSize:12,marginBottom:20}}>한 번만 가능 — 게임 중 변경 불가</p>
          <p style={{color:'#aaa',fontSize:12,marginBottom:6}}>현재 손패</p>
          <div style={{display:'flex',gap:4,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
            {myHand.slice(0,9).map(c=><Card key={c.id} card={c} size="sm"/>)}
            {myHand.length>9&&<span style={{color:'#aaa',fontSize:12,alignSelf:'center'}}>+{myHand.length-9}</span>}
          </div>
          <p style={{color:'#aaa',fontSize:12,marginBottom:6}}>뒤집으면</p>
          <div style={{display:'flex',gap:4,justifyContent:'center',flexWrap:'wrap',marginBottom:20}}>
            {flipped.slice(0,9).map(c=><Card key={c.id+'f'} card={c} size="sm"/>)}
            {flipped.length>9&&<span style={{color:'#aaa',fontSize:12,alignSelf:'center'}}>+{flipped.length-9}</span>}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button style={{...BT,flex:1,padding:14,fontSize:15,background:'#E74C3C'}} onClick={()=>handleFlipChoice(true)}>↕ 뒤집기</button>
            <button style={{...BT,flex:1,padding:14,fontSize:15,background:'#2ecc71',color:'#111'}} onClick={()=>handleFlipChoice(false)}>그대로 진행</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 메인 화면 ──
  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',padding:8,gap:8,maxWidth:600,margin:'0 auto'}}>
      {/* 헤더 */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',...CS,padding:'8px 12px'}}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <span style={{background:'#E74C3C',color:'#fff',fontSize:12,fontWeight:800,padding:'4px 10px',borderRadius:20}}>라운드 {gs.round||1}</span>
          <span style={{fontSize:13,color:'#F39C12',fontWeight:700}}>🏅 {gs.tokens||0}</span>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {aiThinking&&<span style={{fontSize:12,color:'#aaa'}}>🤖 생각 중...</span>}
          <button style={{background:'none',border:'none',color:'#aaa',fontSize:13,cursor:'pointer'}} onClick={onLeave}>나가기</button>
        </div>
      </div>

      {/* AI 행동 표시 */}
      {aiAction&&(
        <div style={{...CS,padding:'10px 16px',border:'1px solid #F39C12',background:'rgba(243,156,18,0.08)'}}>
          <p style={{fontSize:13,fontWeight:700,color:'#F39C12',marginBottom:6}}>🤖 {aiAction.name}의 행동</p>
          {aiAction.type==='play'?(
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,color:'#aaa',flexShrink:0}}>플레이:</span>
              <div style={{display:'flex',gap:4}}>{aiAction.cards.map((c,i)=><Card key={i} card={c} size="sm"/>)}</div>
            </div>
          ):(
            <p style={{fontSize:12,color:'#aaa'}}>스카우트 — 마당 패 [{aiAction.val}] 가져감</p>
          )}
        </div>
      )}

      {/* 다른 플레이어 — 간결하게 */}
      <div style={{display:'flex',gap:8,overflowX:'auto',...CS,padding:10}}>
        {players.filter(p=>p.id!==playerId).map(p=>{
          const hLen=gs.hands?.[p.id]?.length||0;
          const tok=gs.scores?.[p.id]||0;
          const isCur=p.id===curId;
          return (
            <div key={p.id} style={{minWidth:110,padding:'8px 12px',borderRadius:8,flexShrink:0,
              border:`2px solid ${isCur?'#F39C12':'rgba(255,255,255,0.1)'}`,
              background:isCur?'rgba(243,156,18,0.08)':'rgba(255,255,255,0.02)'}}>
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
                {isCur&&<span style={{width:7,height:7,borderRadius:'50%',background:'#F39C12',display:'inline-block',flexShrink:0,animation:'pulse 1s infinite'}}/>}
                <span style={{fontSize:13,fontWeight:800,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:80}}>{p.name}</span>
              </div>
              <div style={{display:'flex',gap:14}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:22,fontWeight:900,lineHeight:1}}>{hLen}</div>
                  <div style={{fontSize:10,color:'#aaa',marginTop:2}}>손패</div>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:22,fontWeight:900,color:'#F39C12',lineHeight:1}}>{tok}</div>
                  <div style={{fontSize:10,color:'#aaa',marginTop:2}}>토큰</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 마당 패 */}
      <div style={{...CS,minHeight:120,display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:16}}>
        {!gs.field?(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:0.4}}>
            <span style={{fontSize:14,fontWeight:700,color:'#aaa'}}>마당 패 없음</span>
            <p style={{fontSize:12,color:'#aaa',marginTop:4}}>첫 번째로 카드를 내려놓으세요</p>
          </div>
        ):(
          <>
            <div style={{display:'flex',justifyContent:'space-between',width:'100%'}}>
              <span style={{fontSize:11,color:'#aaa',textTransform:'uppercase'}}>마당 패</span>
              <span style={{fontSize:13,fontWeight:700,color:'#F39C12'}}>{getName(gs.field.ownerId)}의 패</span>
            </div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'center'}}>
              {gs.field.cards.map((fc,idx)=>{
                const isEdge=idx===0||idx===gs.field.cards.length-1;
                const scoutable=isMyTurn&&mode==='scout'&&canScout&&isEdge&&!insertMode;
                return (
                  <div key={idx} style={{position:'relative',cursor:scoutable?'pointer':'default'}}
                    onClick={scoutable?()=>handleSelectField(idx):undefined}>
                    <Card fieldValue={fc.value} size="lg" card={{top:fc.value,bottom:fc.value,flipped:false}} highlight={scoutIdx===idx}/>
                    {scoutable&&<div style={{position:'absolute',top:-22,left:'50%',transform:'translateX(-50%)',background:'#F39C12',color:'#333',fontSize:10,fontWeight:800,padding:'2px 6px',borderRadius:4,whiteSpace:'nowrap'}}>가져오기</div>}
                  </div>
                );
              })}
            </div>
            {isMyTurn&&mode==='scout'&&!insertMode&&canScout&&<p style={{fontSize:12,color:'#F39C12'}}>← 양끝 카드 선택 →</p>}
            {insertMode&&<p style={{fontSize:12,color:'#2ecc71'}}>✅ 아래 손패에서 삽입 위치(↓)를 선택하세요</p>}
          </>
        )}
      </div>

      {/* 액션 패널 */}
      {isMyTurn&&!insertMode&&(
        <div style={{...CS,padding:12}}>
          <p style={{fontSize:11,color:'#aaa',textTransform:'uppercase',marginBottom:8}}>액션 선택</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            {[['play','🃏','A. 플레이','카드 내려놓기',true],
              ['scout','🔍','B. 스카우트','마당 패 가져오기',canScout],
              ['double','⚡','C. 더블','스카우트+플레이',canScout&&!gs.doubleActionUsed?.[playerId]]
            ].map(([m,ic,nm,ds,en])=>(
              <button key={m} onClick={()=>{if(en){setMode(m);setSelected([]);}}} style={{
                background:mode===m?'rgba(231,76,60,0.2)':'#0f3460',
                border:`2px solid ${mode===m?'#E74C3C':'rgba(255,255,255,0.1)'}`,
                borderRadius:8,color:'#eee',fontFamily:'Nunito,sans-serif',padding:'8px 6px',
                cursor:en?'pointer':'not-allowed',opacity:en?1:0.35,
                display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <span style={{fontSize:20}}>{ic}</span>
                <span style={{fontSize:11,fontWeight:800}}>{nm}</span>
                <span style={{fontSize:10,color:'#aaa'}}>{ds}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 삽입 모드 배너 */}
      {insertMode&&isMyTurn&&(
        <div style={{...CS,padding:'10px 16px',border:'1px solid #2ecc71',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,color:'#2ecc71',fontWeight:700}}>📌 [{gs.field?.cards[scoutIdx]?.value}] 카드 — 손패에서 삽입 위치 ↓ 클릭</span>
          <button style={{...BT,padding:'6px 12px',fontSize:12,background:'#555'}} onClick={cancelScout}>취소</button>
        </div>
      )}

      {/* 내 손패 */}
      <div style={{...CS,padding:12,border:'1px solid #3498DB'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <span style={{fontWeight:800,fontSize:14}}>
            내 손패 ({myHand.length}장)
            {isMyTurn&&!insertMode&&<span style={{color:'#F39C12',fontSize:12,marginLeft:8}}>← 내 차례!</span>}
          </span>
          {isMyTurn&&mode==='play'&&!insertMode&&selected.length>0&&(
            <div style={{display:'flex',gap:6}}>
              <button style={{...BT,padding:'6px 12px',fontSize:12,background:validPlay?'#E74C3C':'#555',opacity:validPlay?1:0.5}} onClick={handlePlay} disabled={!validPlay}>
                플레이 ({selected.length}장)
              </button>
              <button style={{...BT,padding:'6px 10px',fontSize:12}} onClick={()=>setSelected([])}>취소</button>
            </div>
          )}
        </div>

        {/* 삽입 모드: 카드 사이마다 ↓ 버튼 */}
        {insertMode?(
          <div style={{display:'flex',gap:3,overflowX:'auto',padding:'6px 2px 12px',alignItems:'center'}}>
            <InsertBtn onClick={()=>handleInsert(0)}/>
            {myHand.map((c,i)=>(
              <div key={c.id} style={{display:'contents'}}>
                <Card card={c} size="md"/>
                <InsertBtn onClick={()=>handleInsert(i+1)}/>
              </div>
            ))}
          </div>
        ):(
          <div style={{display:'flex',gap:4,overflowX:'auto',padding:'6px 2px 12px'}}>
            {myHand.map((c,idx)=>(
              <Card key={c.id} card={c} size="md"
                selected={selected.includes(idx)}
                clickable={isMyTurn&&mode==='play'}
                onClick={()=>toggleSelect(idx)}/>
            ))}
          </div>
        )}

        {isMyTurn&&mode==='play'&&!insertMode&&selected.length>0&&(
          <p style={{fontSize:12,textAlign:'center',color:validPlay?'#2ecc71':'#E74C3C',marginTop:4}}>
            {validPlay?'✓ 낼 수 있습니다':'✗ 유효하지 않거나 마당보다 약합니다'}
          </p>
        )}
      </div>

      {!isMyTurn&&!aiThinking&&<p style={{textAlign:'center',fontSize:14,color:'#aaa',padding:8}}>{getName(curId)}의 차례...</p>}

      {msg&&(
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          background:'rgba(0,0,0,0.92)',color:'#fff',padding:'12px 24px',borderRadius:24,
          fontSize:16,fontWeight:700,zIndex:1000,backdropFilter:'blur(8px)',
          border:'1px solid rgba(255,255,255,0.2)',pointerEvents:'none'}}>
          {msg}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}*{box-sizing:border-box}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}`}</style>
    </div>
  );
}

// ── 앱 루트 ──
export default function App() {
  const [screen,setScreen]=useState('lobby');
  const [info,setInfo]=useState(null);
  const [room,setRoom]=useState(null);
  useEffect(()=>{ if(!info?.roomId||info?.solo)return; return subscribeToRoom(info.roomId,setRoom); },[info?.roomId]);
  const handleEnter=data=>{
    if(data.solo){
      const pId='human_player';
      const sp=[{id:pId,name:data.playerName},{id:'ai_1',name:'AI 봇 1'},{id:'ai_2',name:'AI 봇 2'}];
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
  return <div style={{color:'#aaa',textAlign:'center',paddingTop:100}}>연결 중...</div>;
}

const CS={background:'#16213e',borderRadius:12,border:'1px solid rgba(255,255,255,0.1)',boxShadow:'0 4px 20px rgba(0,0,0,0.5)'};
const BT={display:'inline-flex',alignItems:'center',justifyContent:'center',background:'#0f3460',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#eee',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:700,padding:'10px 16px',cursor:'pointer',transition:'all 0.2s'};
const LB={display:'block',fontSize:12,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8};
const IP={width:'100%',background:'#0f3460',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'#eee',fontFamily:'Nunito,sans-serif',fontSize:16,padding:'12px 16px',outline:'none'};
