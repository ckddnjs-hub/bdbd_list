import { useState, useEffect } from 'react';
import {
  subscribeToRoom,
  toggleReady,
  startGame,
  updateGameState,
} from '../firebase/config';
import { initializeGame } from '../utils/gameLogic';
import GameBoard from './GameBoard';

export default function GameRoom({ roomId, playerId, onLeave }) {
  const [room, setRoom] = useState(null);

  useEffect(() => {
    const unsub = subscribeToRoom(roomId, setRoom);
    return unsub;
  }, [roomId]);

  if (!room) return <div className="loading">연결 중...</div>;

  const players = Object.values(room.players || {});
  const me = room.players?.[playerId];
  const isHost = room.hostId === playerId;
  const allReady = players.length >= 3 && players.every(p => p.ready || p.id === room.hostId);

  const handleReady = () => {
    toggleReady(roomId, playerId, !me?.ready);
  };

  const handleStart = async () => {
    if (!allReady) return;
    const playerIds = players.map(p => p.id);
    const gameState = initializeGame(playerIds);
    await startGame(roomId, gameState);
  };

  // 게임 중이면 GameBoard 렌더
  if (room.status === 'playing' && room.gameState) {
    return (
      <GameBoard
        roomId={roomId}
        playerId={playerId}
        room={room}
        onLeave={onLeave}
      />
    );
  }

  return (
    <div className="game-room">
      <div className="room-header">
        <button className="btn-back" onClick={onLeave}>← 나가기</button>
        <div className="room-code">
          방 코드: <strong>{roomId}</strong>
          <button
            className="btn-copy"
            onClick={() => navigator.clipboard.writeText(roomId)}
          >
            복사
          </button>
        </div>
      </div>

      <div className="waiting-area">
        <h2>대기 중...</h2>
        <p className="waiting-hint">3~5명이 모이면 게임을 시작할 수 있습니다.</p>

        <div className="player-slots">
          {players.map(player => (
            <div
              key={player.id}
              className={`player-slot ${player.id === playerId ? 'me' : ''} ${player.ready || player.id === room.hostId ? 'ready' : ''}`}
            >
              <div className="player-avatar">
                {player.name[0].toUpperCase()}
              </div>
              <div className="player-slot-info">
                <span className="player-slot-name">
                  {player.name}
                  {player.id === room.hostId && <span className="host-badge">방장</span>}
                  {player.id === playerId && <span className="me-badge">나</span>}
                </span>
                <span className={`ready-status ${player.ready || player.id === room.hostId ? 'ready' : ''}`}>
                  {player.id === room.hostId ? '방장' : player.ready ? '준비 완료' : '대기 중'}
                </span>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 3 - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="player-slot empty">
              <div className="player-avatar empty">?</div>
              <span className="player-slot-name">대기 중...</span>
            </div>
          ))}
        </div>

        <div className="room-actions">
          {isHost ? (
            <button
              className={`btn btn-primary btn-lg ${!allReady ? 'disabled' : ''}`}
              onClick={handleStart}
              disabled={!allReady}
            >
              {players.length < 3
                ? `최소 3명 필요 (${players.length}/3)`
                : !allReady
                ? '모든 플레이어가 준비를 눌러주세요'
                : '게임 시작!'}
            </button>
          ) : (
            <button
              className={`btn btn-lg ${me?.ready ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleReady}
            >
              {me?.ready ? '준비 취소' : '준비 완료'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
