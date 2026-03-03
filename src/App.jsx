import { useState, useEffect, useCallback } from 'react';
import {
  createRoom, joinRoom, toggleReady, saveGameState, subscribeToRoom, subscribeToRooms
} from './firebase';
import {
  initializeGame, applyPlay, applyScout, flipEntireHand,
  checkRoundEnd, calculateRoundScore, getTopValue, getBottomValue,
  isConnectedInHand, isValidCombination, isStrongerThan, getAIAction
} from './gameLogic';

// ============================================================
// 상수
// ============================================================
const COLORS = {
  1:'#FF6B6B', 2:'#FF9F43', 3:'#FECA57', 4:'#48CA8B', 5:'#1DD1A1',
  6:'#54A0FF', 7:'#9B59B6', 8:'#C44569', 9:'#E17055', 10:'#2C3E50',
};
const TEXT = { 1:'#fff',2:'#fff',3:'#333',4:'#fff',5:'#fff',6:'#fff',7:'#fff',8:'#fff',9:'#fff',10:'#fff' };
const AI_DELAY = 1200; // ms

// ============================================================
// 카드 컴포넌트
// ============================================================
function Card({ card, selected, clickable, onClick, size = 'md', fieldValue }) {
  const isField = fieldValue !== undefined;
  const val = isField ? fieldValue : getTopValue(card);
  const bot = isField ? null : getBottomValue(card);
  const w = { sm:36, md:52, lg:64 }[size];
  const h = { sm:52, md:76, lg:94 }[size];
  const fs = { sm:13, md:18, lg:24 }[size];

  return (
    <div onClick={onClick} style={{
      width:w, height:h, borderRadius:8, overflow:'hidden', flexShrink:0, position:'relative',
      border: selected ? '2px solid #F39C12' : '2px solid rgba(255,255,255,0.2)',
      boxShadow: selected ? '0 0 12px rgba(243,156,18,0.6)' : '0 2px 6px rgba(0,0,0,0.4)',
      transform: selected ? 'translateY(-8px)' : clickable ? undefined : undefined,
      cursor: clickable ? 'pointer' : 'default',
      display:'flex', flexDirection:'column', transition:'all 0.15s',
    }}
    onMouseEnter={e => { if(clickable) e.currentTarget.style.transform = selected?'translateY(-8px)':'translateY(-3px)'; }}
    onMouseLeave={e => { if(clickable) e.currentTarget.style.transform = selected?'translateY(-8px)':'translateY(0)'; }}
    >
      {isField ? (
        <div style={{ flex:1, background:COLORS[val], color:TEXT[val], display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:fs+6 }}>{val}</span>
        </div>
      ) : (
        <>
          <div style={{ flex:1, background:COLORS[val], color:TEXT[val], display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:fs }}>{val}</span>
          </div>
          <div style={{ flex:1, background:COLORS[bot], color:TEXT[bot], display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:fs, transform:'rotate(180deg)', display:'block' }}>{bot}</span>
          </div>
        </>
      )}
    </div>
  );
}

function CardBack({ size='sm' }) {
  const w = { sm:32, md:48 }[size], h = { sm:48, md:70 }[size];
  return (
    <div style={{ width:w, height:h, borderRadius:6, flexShrink:0,
      background:'linear-gradient(135deg,#1a1a4e,#2d2d7a)',
      border:'2px solid rgba(255,255,255,0.1)', boxShadow:'0 2px 4px rgba(0,0,0,0.3)' }} />
  );
}

// ============================================================
// 로비
// ============================================================
function Lobby({ onEnter }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('create');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => subscribeToRooms(setRooms), []);

  const go = async (fn) => {
    if (!name.trim()) return setErr('닉네임을 입력해주세요.');
    setLoading(true); setErr('');
    try { onEnter(await fn()); }
    catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth:420, margin:'0 auto', padding:'32px 16px', minHeight:'100vh' }}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ fontFamily:"'Black Han Sans',sans-serif", fontSize:64, lineHeight:1 }}>
          <span style={{color:'#E74C3C'}}>S</span><span style={{color:'#eee'}}>COUT</span><span style={{color:'#F39C12'}}>!</span>
        </div>
        <p style={{ color:'#aaa', fontSize:13, marginTop:8 }}>Scout a card to build up your hands!</p>
      </div>

      <div style={card}>
        <div style={{ marginBottom:16 }}>
          <label style={lbl}>닉네임</label>
          <input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="닉네임 입력" maxLength={12} />
        </div>

        {/* AI 솔로 플레이 버튼 */}
        <button style={{...btn, background:'#8e44ad', marginBottom:16, width:'100%'}}
          onClick={() => onEnter({ solo: true, playerName: name.trim() || '플레이어' })}>
          🤖 AI와 혼자 플레이 (테스트용)
        </button>

        <div style={{ display:'flex', gap:4, background:'#0f3460', borderRadius:8, padding:4, marginBottom:16 }}>
          {['create','join','browse'].map(t => (
            <button key={t} style={{ flex:1, background:tab===t?'#E74C3C':'none', border:'none',
              color:tab===t?'#fff':'#aaa', borderRadius:6, padding:'8px 4px', cursor:'pointer',
              fontFamily:'Nunito,sans-serif', fontWeight:700, fontSize:13 }}
              onClick={() => setTab(t)}>
              {{create:'방 만들기', join:'코드 입장', browse:'방 목록'}[t]}
            </button>
          ))}
        </div>

        {tab === 'create' && (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <p style={{color:'#aaa',fontSize:13,textAlign:'center'}}>방을 만들고 친구를 초대하세요 (3~5명)</p>
            <button style={{...btn, background:'#E74C3C'}} disabled={loading}
              onClick={() => go(() => createRoom(name.trim()))}>
              {loading ? '생성 중...' : '방 만들기'}
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <label style={lbl}>방 코드</label>
            <input style={inp} value={code} onChange={e=>setCode(e.target.value)} placeholder="방 코드 입력" />
            <button style={{...btn, background:'#E74C3C'}} disabled={loading}
              onClick={() => go(() => joinRoom(code.trim(), name.trim()))}>
              {loading ? '입장 중...' : '입장'}
            </button>
          </div>
        )}

        {tab === 'browse' && (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {rooms.length === 0
              ? <p style={{color:'#aaa',fontSize:13,textAlign:'center',padding:16}}>대기 중인 방 없음</p>
              : rooms.map(r => {
                  const pc = Object.keys(r.players||{}).length;
                  return (
                    <div key={r.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                      background:'#0f3460',borderRadius:8,padding:'10px 14px',border:'1px solid rgba(255,255,255,0.1)'}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14}}>{Object.values(r.players||{})[0]?.name}의 방</div>
                        <div style={{fontSize:12,color:'#aaa'}}>{pc}/5명</div>
                      </div>
                      <button style={{...btn, padding:'6px 12px', fontSize:12}} disabled={loading}
                        onClick={() => go(() => joinRoom(r.id, name.trim()))}>입장</button>
                    </div>
                  );
                })
            }
          </div>
        )}

        {err && <p style={{color:'#E74C3C',fontSize:13,textAlign:'center',marginTop:8}}>{err}</p>}
      </div>

      <div style={{...card, marginTop:16}}>
        <p style={{color:'#aaa',fontSize:12,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>게임 방법</p>
        {[['🃏','A. 플레이 — 마당보다 강한 조합 내려놓기'],['🔍','B. 스카우트 — 마당 패 끝 카드 가져오기'],['⚡','C. 더블 액션 — 스카우트 후 바로 플레이']].map(([ic,tx]) => (
          <div key={tx} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,fontSize:13}}>
            <span style={{fontSize:18}}>{ic}</span><span>{tx}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 대기실
// ============================================================
function WaitingRoom({ roomId, playerId, room, onLeave }) {
  const players = Object.values(room.players || {});
  const me = room.players?.[playerId];
  const isHost = room.hostId === playerId;
  const allReady = players.length >= 3 && players.every(p => p.ready || p.id === room.hostId);

  const handleStart = async () => {
    const pids = players.map(p => p.id);
    const gs = initializeGame(pids);
    await saveGameState(roomId, gs, 'playing');
  };

  return (
    <div style={{ maxWidth:420, margin:'0 auto', padding:16, minHeight:'100vh' }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <button style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}} onClick={onLeave}>← 나가기</button>
        <div style={{fontSize:13,color:'#aaa'}}>
          방 코드: <strong style={{fontFamily:'monospace',color:'#eee',fontSize:11}}>{roomId}</strong>
          <button style={{...btn,padding:'2px 8px',fontSize:11,marginLeft:6}}
            onClick={() => navigator.clipboard.writeText(roomId)}>복사</button>
        </div>
      </div>

      <h2 style={{textAlign:'center',marginBottom:8}}>대기 중...</h2>
      <p style={{color:'#aaa',fontSize:14,textAlign:'center',marginBottom:24}}>3~5명이 모이면 시작 가능</p>

      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
        {players.map(p => (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:12,background:'#16213e',
            borderRadius:10,padding:'12px 16px',border:`2px solid ${p.ready||p.id===room.hostId?'#2ecc71':p.id===playerId?'#3498DB':'rgba(255,255,255,0.1)'}`}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'#0f3460',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:18}}>
              {p.name[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:6,alignItems:'center',fontWeight:700}}>
                {p.name}
                {p.id===room.hostId&&<span style={{background:'#F39C12',color:'#333',fontSize:10,padding:'2px 6px',borderRadius:4,fontWeight:800}}>방장</span>}
                {p.id===playerId&&<span style={{background:'#3498DB',color:'#fff',fontSize:10,padding:'2px 6px',borderRadius:4,fontWeight:800}}>나</span>}
              </div>
              <div style={{fontSize:12,color:p.ready||p.id===room.hostId?'#2ecc71':'#aaa'}}>
                {p.id===room.hostId?'방장':p.ready?'준비 완료':'대기 중'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isHost ? (
        <button style={{...btn, background:allReady?'#E74C3C':'#555', width:'100%', padding:14, fontSize:16, opacity:allReady?1:0.6}}
          onClick={handleStart} disabled={!allReady}>
          {players.length<3?`최소 3명 필요 (${players.length}/3)`:!allReady?'모든 플레이어가 준비 필요':'게임 시작!'}
        </button>
      ) : (
        <button style={{...btn, background:me?.ready?'#555':'#E74C3C', width:'100%', padding:14, fontSize:16}}
          onClick={() => toggleReady(roomId, playerId, !me?.ready)}>
          {me?.ready?'준비 취소':'준비 완료'}
        </button>
      )}
    </div>
  );
}

// ============================================================
// 메인 게임 보드
// ============================================================
function GameBoard({ roomId, playerId, room, gameState: initState, solo, soloPlayers, onLeave }) {
  const [gs, setGs] = useState(initState);
  const [mode, setMode] = useState('play');
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState('');
  const [roundEnd, setRoundEnd] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);

  const players = solo ? soloPlayers : Object.values(room?.players || {});
  const myHand = gs.hands?.[playerId] || [];
  const curId = gs.players[gs.currentPlayerIndex];
  const isMyTurn = curId === playerId;
  const isAI = id => id?.startsWith('ai_');

  const showMsg = (m, d=2500) => { setMsg(m); setTimeout(() => setMsg(''), d); };

  // Firebase 동기화 (멀티 모드만)
  useEffect(() => {
    if (solo) return;
    return subscribeToRoom(roomId, data => { if (data?.gameState) setGs(data.gameState); });
  }, [roomId, solo]);

  // AI 자동 플레이
  useEffect(() => {
    if (!gs || roundEnd) return;
    const cur = gs.players[gs.currentPlayerIndex];
    if (!isAI(cur)) return;
    setAiThinking(true);
    const timer = setTimeout(() => {
      const action = getAIAction(gs, cur);
      if (!action) { setAiThinking(false); return; }
      let result;
      if (action.type === 'play') result = applyPlay(gs, cur, action.indices);
      else result = applyScout(gs, cur, action.fieldIndex, action.insertIndex);
      if (result.error) { setAiThinking(false); return; }
      const newGs = result.state;
      const end = checkRoundEnd(newGs);
      if (end.ended) { finishRound(newGs, end.winnerId); setAiThinking(false); return; }
      setGs(newGs);
      if (!solo) saveGameState(roomId, newGs);
      setAiThinking(false);
    }, AI_DELAY);
    return () => clearTimeout(timer);
  }, [gs?.currentPlayerIndex, roundEnd]);

  const persist = async (newGs) => {
    setGs(newGs);
    if (!solo) await saveGameState(roomId, newGs);
  };

  const finishRound = (finalGs, winnerId) => {
    const scores = calculateRoundScore(finalGs, winnerId);
    const total = { ...finalGs.totalScores };
    finalGs.players.forEach(pid => { total[pid] = (total[pid]||0) + (scores[pid]||0); });
    setRoundEnd({ scores, winnerId, total, finalGs });
  };

  const handlePlay = async () => {
    if (!isMyTurn || selected.length === 0) return;
    const result = applyPlay(gs, playerId, selected);
    if (result.error) return showMsg('❌ ' + result.error);
    setSelected([]);
    const end = checkRoundEnd(result.state);
    if (end.ended) return finishRound(result.state, end.winnerId);
    await persist(result.state);
  };

  const handleScout = async (fi) => {
    if (!isMyTurn) return;
    const result = applyScout(gs, playerId, fi, myHand.length);
    if (result.error) return showMsg('❌ ' + result.error);
    setMode('play');
    const end = checkRoundEnd(result.state);
    if (end.ended) return finishRound(result.state, end.winnerId);
    await persist(result.state);
    showMsg('✅ 스카우트!');
  };

  const handleFlip = async () => {
    if (gs.handFlipped?.[playerId]) return showMsg('이미 이번 라운드에 뒤집었습니다.');
    const newGs = { ...gs, hands: { ...gs.hands, [playerId]: flipEntireHand(myHand) }, handFlipped: { ...gs.handFlipped, [playerId]: true } };
    await persist(newGs);
    showMsg('↕ 손패를 뒤집었습니다!');
  };

  const handleNextRound = async () => {
    if (!roundEnd) return;
    const newGs = { ...initializeGame(gs.players), round: (gs.round||1)+1, totalScores: roundEnd.total };
    setRoundEnd(null); setSelected([]); setMode('play');
    await persist(newGs);
  };

  const toggleSelect = (idx) => {
    if (!isMyTurn || mode !== 'play') return;
    setSelected(prev => {
      const next = prev.includes(idx) ? prev.filter(i=>i!==idx) : [...prev, idx].sort((a,b)=>a-b);
      if (next.length > 1 && !isConnectedInHand(myHand, next)) return prev;
      return next;
    });
  };

  const selectedCards = selected.map(i => myHand[i]);
  const validPlay = selected.length > 0 && isConnectedInHand(myHand, selected) && isValidCombination(selectedCards) &&
    (!gs.field || isStrongerThan(selectedCards, gs.field.cards));

  const getName = (pid) => players.find(p=>p.id===pid)?.name || pid;
  const canScout = gs.field && gs.field.ownerId !== playerId;

  // 라운드 종료 화면
  if (roundEnd) {
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,backdropFilter:'blur(8px)'}}>
        <div style={{...card,width:'90%',maxWidth:380,textAlign:'center',padding:32}}>
          <h2 style={{marginBottom:8}}>라운드 {gs.round} 종료!</h2>
          <p style={{color:'#F39C12',fontWeight:800,fontSize:18,marginBottom:20}}>🏆 {getName(roundEnd.winnerId)} 승리!</p>
          <div style={{marginBottom:24}}>
            <p style={{color:'#aaa',fontSize:12,marginBottom:10,textTransform:'uppercase'}}>이번 라운드 점수</p>
            {gs.players.map(pid => (
              <div key={pid} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',
                borderRadius:8,marginBottom:4,background:pid===roundEnd.winnerId?'rgba(46,204,113,0.15)':'rgba(255,255,255,0.05)'}}>
                <span>{getName(pid)}</span>
                <span style={{fontWeight:800,color:(roundEnd.scores[pid]||0)>=0?'#2ecc71':'#E74C3C'}}>
                  {(roundEnd.scores[pid]||0)>=0?'+':''}{roundEnd.scores[pid]||0}
                </span>
              </div>
            ))}
            <p style={{color:'#aaa',fontSize:12,margin:'16px 0 10px',textTransform:'uppercase'}}>누적 점수</p>
            {[...gs.players].sort((a,b)=>(roundEnd.total[b]||0)-(roundEnd.total[a]||0)).map(pid => (
              <div key={pid} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',
                borderRadius:8,marginBottom:4,background:'rgba(255,255,255,0.05)'}}>
                <span>{getName(pid)}</span>
                <span style={{fontWeight:800,color:'#F39C12'}}>{roundEnd.total[pid]||0}</span>
              </div>
            ))}
          </div>
          <button style={{...btn,background:'#E74C3C',width:'100%',padding:14,fontSize:16}} onClick={handleNextRound}>
            다음 라운드 →
          </button>
          <button style={{...btn,width:'100%',padding:10,marginTop:8,fontSize:13}} onClick={onLeave}>로비로</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',padding:8,gap:8,maxWidth:600,margin:'0 auto'}}>

      {/* 헤더 */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',...card,padding:'8px 12px'}}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <span style={{background:'#E74C3C',color:'#fff',fontSize:12,fontWeight:800,padding:'4px 10px',borderRadius:20}}>
            라운드 {gs.round||1}
          </span>
          <span style={{fontSize:13,color:'#F39C12',fontWeight:700}}>🏅 {gs.tokens||0}</span>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          {aiThinking && <span style={{fontSize:12,color:'#aaa'}}>🤖 AI 생각 중...</span>}
          <button style={{background:'none',border:'none',color:'#aaa',fontSize:13,cursor:'pointer'}} onClick={onLeave}>나가기</button>
        </div>
      </div>

      {/* 다른 플레이어들 */}
      <div style={{display:'flex',gap:8,overflowX:'auto',...card,padding:10}}>
        {players.filter(p=>p.id!==playerId).map(p => {
          const h = gs.hands?.[p.id]||[];
          const isCur = p.id===curId;
          return (
            <div key={p.id} style={{minWidth:110,padding:8,borderRadius:8,border:`2px solid ${isCur?'#F39C12':'rgba(255,255,255,0.1)'}`,
              background:isCur?'rgba(243,156,18,0.1)':'transparent',flexShrink:0}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:700}}>
                  {p.name} {isCur&&<span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#F39C12',animation:'pulse 1s infinite'}}/>}
                </span>
                <span style={{fontSize:11,color:'#aaa'}}>{h.length}장</span>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:2}}>
                {h.map((_,i)=><CardBack key={i}/>)}
              </div>
            </div>
          );
        })}
      </div>

      {/* 마당 패 */}
      <div style={{...card,minHeight:130,display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:16}}>
        {!gs.field ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flex:1,opacity:0.4}}>
            <span style={{fontSize:14,fontWeight:700,color:'#aaa'}}>마당 패 없음</span>
            <p style={{fontSize:12,color:'#aaa',marginTop:4}}>첫 번째로 카드를 내려놓으세요</p>
          </div>
        ) : (
          <>
            <div style={{display:'flex',justifyContent:'space-between',width:'100%'}}>
              <span style={{fontSize:11,color:'#aaa',textTransform:'uppercase'}}>마당 패</span>
              <span style={{fontSize:13,fontWeight:700,color:'#F39C12'}}>{getName(gs.field.ownerId)}의 패</span>
            </div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'center'}}>
              {gs.field.cards.map((fc, idx) => {
                const isEdge = idx===0||idx===gs.field.cards.length-1;
                const scoutable = isMyTurn && (mode==='scout') && canScout && isEdge;
                return (
                  <div key={idx} style={{position:'relative',cursor:scoutable?'pointer':'default'}}
                    onClick={scoutable?()=>handleScout(idx):undefined}>
                    <Card fieldValue={fc.value} size="lg"
                      card={{top:fc.value,bottom:fc.value,flipped:false}} />
                    {scoutable && (
                      <div style={{position:'absolute',top:-22,left:'50%',transform:'translateX(-50%)',
                        background:'#F39C12',color:'#333',fontSize:10,fontWeight:800,padding:'2px 6px',borderRadius:4,whiteSpace:'nowrap'}}>
                        스카우트
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isMyTurn && mode==='scout' && canScout &&
              <p style={{fontSize:12,color:'#F39C12'}}>← 양끝 카드를 클릭해서 스카우트 →</p>}
          </>
        )}
      </div>

      {/* 액션 패널 (내 차례만) */}
      {isMyTurn && (
        <div style={{...card,padding:12}}>
          <p style={{fontSize:11,color:'#aaa',textTransform:'uppercase',marginBottom:8}}>액션 선택</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            {[
              ['play','🃏','A. 플레이','카드 내려놓기', true],
              ['scout','🔍','B. 스카우트','마당 패 가져오기', canScout],
              ['double','⚡','C. 더블','스카우트+플레이', canScout && !gs.doubleActionUsed?.[playerId]],
            ].map(([m,ic,nm,ds,en]) => (
              <button key={m} onClick={()=>en&&setMode(m)} style={{
                background:mode===m?'rgba(231,76,60,0.2)':'#0f3460',
                border:`2px solid ${mode===m?'#E74C3C':'rgba(255,255,255,0.1)'}`,
                borderRadius:8,color:'#eee',fontFamily:'Nunito,sans-serif',
                padding:'8px 6px',cursor:en?'pointer':'not-allowed',
                opacity:en?1:0.35,display:'flex',flexDirection:'column',alignItems:'center',gap:2
              }}>
                <span style={{fontSize:20}}>{ic}</span>
                <span style={{fontSize:11,fontWeight:800}}>{nm}</span>
                <span style={{fontSize:10,color:'#aaa'}}>{ds}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 내 손패 */}
      <div style={{...card,padding:12,border:'1px solid #3498DB'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <span style={{fontWeight:800,fontSize:14}}>
            내 손패 ({myHand.length}장)
            {isMyTurn&&<span style={{color:'#F39C12',fontSize:12,marginLeft:8,animation:'pulse 1s infinite'}}>← 내 차례!</span>}
          </span>
          <div style={{display:'flex',gap:6}}>
            {isMyTurn && mode==='play' && selected.length>0 && (
              <>
                <button style={{...btn,padding:'6px 12px',fontSize:12,background:validPlay?'#E74C3C':'#555',opacity:validPlay?1:0.5}}
                  onClick={handlePlay} disabled={!validPlay}>
                  플레이 ({selected.length}장)
                </button>
                <button style={{...btn,padding:'6px 12px',fontSize:12}} onClick={()=>setSelected([])}>취소</button>
              </>
            )}
            <button style={{...btn,padding:'6px 10px',fontSize:11,opacity:gs.handFlipped?.[playerId]?0.4:1}}
              onClick={handleFlip} disabled={!!gs.handFlipped?.[playerId]}
              title="손패 위아래 뒤집기 (라운드당 1회)">↕ 뒤집기</button>
          </div>
        </div>
        <div style={{display:'flex',gap:4,overflowX:'auto',padding:'6px 2px 12px'}}>
          {myHand.map((card,idx) => (
            <Card key={card.id} card={card} size="md"
              selected={selected.includes(idx)}
              clickable={isMyTurn && mode==='play'}
              onClick={()=>toggleSelect(idx)} />
          ))}
        </div>
        {isMyTurn && mode==='play' && selected.length>0 && (
          <p style={{fontSize:12,textAlign:'center',color:validPlay?'#2ecc71':'#E74C3C',marginTop:4}}>
            {validPlay?'✓ 낼 수 있습니다':'✗ 유효하지 않은 조합이거나 마당보다 약합니다'}
          </p>
        )}
      </div>

      {!isMyTurn && !aiThinking && (
        <p style={{textAlign:'center',fontSize:14,color:'#aaa',padding:8}}>
          {getName(curId)}의 차례...
        </p>
      )}

      {msg && (
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          background:'rgba(0,0,0,0.9)',color:'#fff',padding:'12px 24px',borderRadius:24,
          fontSize:16,fontWeight:700,zIndex:1000,backdropFilter:'blur(8px)',
          border:'1px solid rgba(255,255,255,0.2)',pointerEvents:'none'}}>
          {msg}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
      `}</style>
    </div>
  );
}

// ============================================================
// 앱 루트
// ============================================================
export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [info, setInfo] = useState(null);
  const [room, setRoom] = useState(null);

  useEffect(() => {
    if (!info?.roomId || info?.solo) return;
    return subscribeToRoom(info.roomId, setRoom);
  }, [info?.roomId]);

  const handleEnter = (data) => {
    if (data.solo) {
      // AI 솔로 모드: Firebase 없이 로컬 상태만 사용
      const aiIds = ['ai_1','ai_2'];
      const pId = 'human_player';
      const soloPlayers = [
        { id: pId, name: data.playerName },
        { id: 'ai_1', name: 'AI 봇1' },
        { id: 'ai_2', name: 'AI 봇2' },
      ];
      const gs = initializeGame([pId, 'ai_1', 'ai_2']);
      setInfo({ solo: true, playerId: pId, gameState: gs, soloPlayers });
      setScreen('game');
    } else {
      setInfo(data);
      setScreen('room');
    }
  };

  if (screen === 'lobby') return <Lobby onEnter={handleEnter} />;

  if (screen === 'room' && info && room) {
    if (room.status === 'playing' && room.gameState)
      return <GameBoard roomId={info.roomId} playerId={info.playerId}
        room={room} gameState={room.gameState} solo={false}
        onLeave={() => { setScreen('lobby'); setInfo(null); setRoom(null); }} />;
    return <WaitingRoom roomId={info.roomId} playerId={info.playerId} room={room}
      onLeave={() => { setScreen('lobby'); setInfo(null); setRoom(null); }} />;
  }

  if (screen === 'game' && info?.solo)
    return <GameBoard playerId={info.playerId} gameState={info.gameState}
      soloPlayers={info.soloPlayers} solo={true}
      onLeave={() => { setScreen('lobby'); setInfo(null); }} />;

  return <div style={{color:'#aaa',textAlign:'center',paddingTop:100}}>연결 중...</div>;
}

// ============================================================
// 스타일 상수
// ============================================================
const card = {
  background:'#16213e', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)',
  boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
};
const btn = {
  display:'inline-flex', alignItems:'center', justifyContent:'center',
  background:'#0f3460', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8,
  color:'#eee', fontFamily:'Nunito,sans-serif', fontSize:14, fontWeight:700,
  padding:'10px 16px', cursor:'pointer', transition:'all 0.2s',
};
const lbl = { display:'block', fontSize:12, fontWeight:700, color:'#aaa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 };
const inp = {
  width:'100%', background:'#0f3460', border:'1px solid rgba(255,255,255,0.1)',
  borderRadius:8, color:'#eee', fontFamily:'Nunito,sans-serif', fontSize:16,
  padding:'12px 16px', outline:'none',
};
