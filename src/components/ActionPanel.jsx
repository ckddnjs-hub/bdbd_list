// ==========================================
// ActionPanel - 액션 선택 버튼
// ==========================================
export function ActionPanel({ mode, onModeChange, doubleUsed, field, myId }) {
  const isFieldOwner = field?.ownerId === myId;
  const canScout = field && !isFieldOwner;

  return (
    <div className="action-panel">
      <p className="action-label">액션 선택</p>
      <div className="action-buttons">
        <button
          className={`action-btn ${mode === 'play' ? 'active' : ''}`}
          onClick={() => onModeChange('play')}
        >
          <span className="action-icon">🃏</span>
          <span className="action-name">A. 플레이</span>
          <span className="action-desc">카드 내려놓기</span>
        </button>

        <button
          className={`action-btn ${mode === 'scout' ? 'active' : ''} ${!canScout ? 'disabled' : ''}`}
          onClick={() => canScout && onModeChange('scout')}
          disabled={!canScout}
        >
          <span className="action-icon">🔍</span>
          <span className="action-name">B. 스카우트</span>
          <span className="action-desc">마당 패 가져오기</span>
        </button>

        <button
          className={`action-btn ${mode === 'double' ? 'active' : ''} ${doubleUsed || !canScout ? 'disabled' : ''}`}
          onClick={() => !doubleUsed && canScout && onModeChange('double')}
          disabled={doubleUsed || !canScout}
        >
          <span className="action-icon">⚡</span>
          <span className="action-name">C. 더블 액션</span>
          <span className="action-desc">{doubleUsed ? '사용 완료' : '스카우트 + 플레이'}</span>
        </button>
      </div>
    </div>
  );
}

// ==========================================
// ScoreBoard - 점수 현황
// ==========================================
export function ScoreBoard({ players, scores, roundScores, onClose }) {
  return (
    <div className="scoreboard-overlay" onClick={onClose}>
      <div className="scoreboard-card" onClick={e => e.stopPropagation()}>
        <div className="scoreboard-header">
          <h3>점수 현황</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <table className="score-table">
          <thead>
            <tr>
              <th>플레이어</th>
              <th>이번 라운드</th>
              <th>총점</th>
            </tr>
          </thead>
          <tbody>
            {players.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).map(player => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td className="score-cell">
                  {roundScores?.[player.id] !== undefined
                    ? roundScores[player.id]
                    : '-'}
                </td>
                <td className="score-cell total">
                  {scores?.[player.id] || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ActionPanel;
