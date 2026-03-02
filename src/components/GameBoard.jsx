import { useState, useEffect } from 'react';
import { subscribeToRoom, updateGameState } from '../firebase/config';
import {
  applyPlay,
  applyScout,
  applyDoubleAction,
  checkRoundEnd,
  calculateRoundScore,
  flipEntireHand,
  initializeGame,
  isStrongerThan,
} from '../utils/gameLogic';
import PlayerHand from './PlayerHand';
import FieldArea from './FieldArea';
import ScoreBoard from './ScoreBoard';
import OtherPlayers from './OtherPlayers';
import ActionPanel from './ActionPanel';

export default function GameBoard({ roomId, playerId, room, onLeave }) {
  const [gameState, setGameState] = useState(room.gameState);
  const [actionMode, setActionMode] = useState('play'); // play | scout | double
  const [scoutTarget, setScoutTarget] = useState(null); // { fieldIndex }
  const [message, setMessage] = useState('');
  const [showScores, setShowScores] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);
  const [roundResult, setRoundResult] = useState(null);

  // Firebase 실시간 동기화
  useEffect(() => {
    const unsub = subscribeToRoom(roomId, (data) => {
      if (data?.gameState) {
        setGameState(data.gameState);
      }
    });
    return unsub;
  }, [roomId]);

  if (!gameState) return <div className="loading">게임 로딩 중...</div>;

  const players = Object.values(room.players || {});
  const myHand = gameState.hands?.[playerId] || [];
  const currentPlayerId = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayerId === playerId;
  const me = players.find(p => p.id === playerId);

  const showMsg = (msg, duration = 2500) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  };

  // 게임 상태 저장 + 라운드 종료 체크
  const saveAndCheck = async (newState) => {
    const endCheck = checkRoundEnd(newState);
    if (endCheck.ended) {
      handleRoundEnd(newState, endCheck.winnerId);
      return;
    }
    await updateGameState(roomId, newState);
  };

  // 플레이 액션
  const handlePlay = async (selectedIndices) => {
    const result = applyPlay(gameState, playerId, selectedIndices);
    if (result.error) return showMsg(`❌ ${result.error}`);

    // 차례 넘기기
    const nextState = {
      ...result.state,
      currentPlayerIndex: (gameState.currentPlayerIndex + 1) % gameState.players.length,
      consecutiveScouts: 0,
    };

    await saveAndCheck(nextState);
    setActionMode('play');
  };

  // 스카우트 액션
  const handleScout = async (fieldIndex) => {
    // 손패 어느 위치에 삽입할지 - 일단 끝에 삽입 (UI에서 선택 가능하게 개선 가능)
    const insertIndex = myHand.length;
    const result = applyScout(gameState, playerId, fieldIndex, insertIndex);
    if (result.error) return showMsg(`❌ ${result.error}`);

    await saveAndCheck(result.state);
    setActionMode('play');
    setScoutTarget(null);
    showMsg('✅ 스카우트 완료!');
  };

  // 더블 액션 (스카우트 후 플레이)
  const handleDoubleAction = async (fieldIndex, insertIndex, playIndices) => {
    if (gameState.doubleActionUsed?.[playerId]) {
      return showMsg('❌ 이미 더블 액션을 사용했습니다.');
    }
    const result = applyDoubleAction(gameState, playerId, fieldIndex, insertIndex, playIndices);
    if (result.error) return showMsg(`❌ ${result.error}`);

    await saveAndCheck(result.state);
    setActionMode('play');
    showMsg('⚡ 더블 액션!');
  };

  // 손패 뒤집기
  const handleFlipHand = async () => {
    const newHand = flipEntireHand(myHand);
    const newState = {
      ...gameState,
      hands: { ...gameState.hands, [playerId]: newHand },
      handFlipped: { ...gameState.handFlipped, [playerId]: true },
    };
    await updateGameState(roomId, newState);
    showMsg('↕ 손패를 뒤집었습니다!');
  };

  // 라운드 종료 처리
  const handleRoundEnd = async (finalState, winnerId) => {
    const scores = calculateRoundScore(finalState, winnerId);
    const winnerName = players.find(p => p.id === winnerId)?.name || winnerId;

    setRoundResult({ scores, winnerName, winnerId });
    setRoundEnded(true);

    // 점수 누적
    const newTotalScores = { ...gameState.totalScores };
    finalState.players.forEach(pid => {
      newTotalScores[pid] = (newTotalScores[pid] || 0) + (scores[pid] || 0);
    });

    const newState = {
      ...finalState,
      status: 'roundEnd',
      totalScores: newTotalScores,
      lastRoundScores: scores,
    };

    await updateGameState(roomId, newState);
  };

  // 다음 라운드 시작 (호스트만)
  const handleNextRound = async () => {
    if (room.hostId !== playerId) return;
    const newGame = initializeGame(gameState.players);
    const newState = {
      ...newGame,
      round: (gameState.round || 1) + 1,
      totalScores: gameState.totalScores || {},
      status: 'playing',
    };
    await updateGameState(roomId, newState);
    setRoundEnded(false);
    setRoundResult(null);
  };

  // 라운드 종료 화면
  if (roundEnded && roundResult) {
    return (
      <div className="round-end-overlay">
        <div className="round-end-card">
          <h2>라운드 {gameState.round} 종료!</h2>
          <p className="winner-announce">🏆 {roundResult.winnerName} 승리!</p>

          <div className="round-scores">
            {gameState.players.map(pid => {
              const name = players.find(p => p.id === pid)?.name || pid;
              const score = roundResult.scores[pid] || 0;
              return (
                <div key={pid} className={`score-row ${pid === roundResult.winnerId ? 'winner' : ''}`}>
                  <span>{name}</span>
                  <span className={score >= 0 ? 'score-positive' : 'score-negative'}>
                    {score >= 0 ? `+${score}` : score}
                  </span>
                </div>
              );
            })}
          </div>

          {room.hostId === playerId ? (
            <button className="btn btn-primary btn-lg" onClick={handleNextRound}>
              다음 라운드 →
            </button>
          ) : (
            <p className="waiting-hint">방장이 다음 라운드를 시작하길 기다리는 중...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="game-board">
      {/* 헤더 */}
      <div className="game-header">
        <div className="game-info">
          <span className="round-badge">라운드 {gameState.round || 1}</span>
          <span className="token-count">🏅 토큰: {gameState.tokens || 0}</span>
        </div>
        <button className="btn-icon" onClick={() => setShowScores(!showScores)}>
          📊
        </button>
      </div>

      {/* 점수판 */}
      {showScores && (
        <ScoreBoard
          players={players}
          scores={gameState.totalScores || {}}
          roundScores={gameState.scores || {}}
          onClose={() => setShowScores(false)}
        />
      )}

      {/* 다른 플레이어들 */}
      <OtherPlayers
        players={players.filter(p => p.id !== playerId)}
        hands={gameState.hands}
        currentPlayerId={currentPlayerId}
      />

      {/* 마당 패 */}
      <FieldArea
        field={gameState.field}
        players={players}
        isMyTurn={isMyTurn}
        mode={actionMode}
        myPlayerId={playerId}
        onScout={handleScout}
      />

      {/* 액션 패널 */}
      {isMyTurn && (
        <ActionPanel
          mode={actionMode}
          onModeChange={setActionMode}
          doubleUsed={gameState.doubleActionUsed?.[playerId]}
          field={gameState.field}
          myId={playerId}
        />
      )}

      {/* 메시지 */}
      {message && (
        <div className="game-message">{message}</div>
      )}

      {/* 내 손패 */}
      <div className="my-area">
        <div className="my-area-header">
          <span className="my-name">
            {me?.name} {isMyTurn && <span className="turn-indicator">← 내 차례!</span>}
          </span>
          <span className="hand-count">{myHand.length}장</span>
        </div>
        <PlayerHand
          hand={myHand}
          isMyTurn={isMyTurn && actionMode === 'play'}
          mode={actionMode}
          onPlay={handlePlay}
          onFlipHand={handleFlipHand}
          canFlipHand={!gameState.handFlipped?.[playerId]}
          hasFlippedThisRound={gameState.handFlipped?.[playerId]}
        />
      </div>

      {!isMyTurn && (
        <div className="waiting-turn">
          {players.find(p => p.id === currentPlayerId)?.name || '???'}의 차례...
        </div>
      )}
    </div>
  );
}
