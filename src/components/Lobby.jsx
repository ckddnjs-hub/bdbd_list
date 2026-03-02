import { useState, useEffect } from 'react';
import { createRoom, joinRoom, subscribeToRooms } from '../firebase/config';

export default function Lobby({ onJoinRoom }) {
  const [playerName, setPlayerName] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [rooms, setRooms] = useState([]);
  const [tab, setTab] = useState('create'); // create | join | browse
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = subscribeToRooms(setRooms);
    return unsub;
  }, []);

  const handleCreate = async () => {
    if (!playerName.trim()) return setError('닉네임을 입력해주세요.');
    setLoading(true);
    setError('');
    try {
      const info = await createRoom(playerName.trim());
      onJoinRoom(info);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (roomId) => {
    if (!playerName.trim()) return setError('닉네임을 입력해주세요.');
    setLoading(true);
    setError('');
    try {
      const info = await joinRoom(roomId || roomIdInput.trim(), playerName.trim());
      onJoinRoom(info);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="logo">
          <span className="logo-s">S</span>
          <span className="logo-cout">COUT</span>
          <span className="logo-bang">!</span>
        </div>
        <p className="tagline">Scout a card to build up your hands!</p>
      </div>

      <div className="lobby-card">
        <div className="name-input-section">
          <label>닉네임</label>
          <input
            className="input"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="닉네임을 입력하세요"
            maxLength={12}
            onKeyDown={e => e.key === 'Enter' && tab === 'create' && handleCreate()}
          />
        </div>

        <div className="tab-bar">
          {['create', 'join', 'browse'].map(t => (
            <button
              key={t}
              className={`tab-btn ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {{ create: '방 만들기', join: '코드로 입장', browse: '방 목록' }[t]}
            </button>
          ))}
        </div>

        {tab === 'create' && (
          <div className="tab-content">
            <p className="hint">새 방을 만들고 친구를 초대하세요 (3~5명)</p>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? '생성 중...' : '방 만들기'}
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="tab-content">
            <label>방 코드</label>
            <input
              className="input"
              value={roomIdInput}
              onChange={e => setRoomIdInput(e.target.value)}
              placeholder="방 코드를 입력하세요"
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            <button
              className="btn btn-primary"
              onClick={() => handleJoin()}
              disabled={loading}
            >
              {loading ? '입장 중...' : '입장하기'}
            </button>
          </div>
        )}

        {tab === 'browse' && (
          <div className="tab-content">
            <div className="room-list">
              {rooms.length === 0 ? (
                <p className="empty-hint">대기 중인 방이 없습니다.</p>
              ) : (
                rooms.map(room => {
                  const playerCount = Object.keys(room.players || {}).length;
                  return (
                    <div key={room.id} className="room-item">
                      <div className="room-info">
                        <span className="room-host">
                          {Object.values(room.players || {})[0]?.name}의 방
                        </span>
                        <span className="room-count">{playerCount}/5명</span>
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleJoin(room.id)}
                        disabled={loading}
                      >
                        입장
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}
      </div>

      <div className="rules-summary">
        <h3>게임 방법</h3>
        <div className="rules-grid">
          <div className="rule-item">
            <span className="rule-icon">🃏</span>
            <span>마당보다 강한 조합을 내려놓거나</span>
          </div>
          <div className="rule-item">
            <span className="rule-icon">🔍</span>
            <span>스카우트로 마당 패 끝 카드를 가져오거나</span>
          </div>
          <div className="rule-item">
            <span className="rule-icon">⚡</span>
            <span>더블 액션으로 스카우트 후 바로 플레이</span>
          </div>
        </div>
      </div>
    </div>
  );
}
