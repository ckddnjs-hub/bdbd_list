// ==========================================
// OtherPlayers - 다른 플레이어 손패 (뒷면)
// ==========================================
export function OtherPlayers({ players, hands, currentPlayerId }) {
  return (
    <div className="other-players">
      {players.map(player => {
        const hand = hands?.[player.id] || [];
        const isCurrentPlayer = player.id === currentPlayerId;

        return (
          <div
            key={player.id}
            className={`other-player ${isCurrentPlayer ? 'current-turn' : ''}`}
          >
            <div className="other-player-info">
              <span className="other-player-name">
                {player.name}
                {isCurrentPlayer && <span className="turn-dot" />}
              </span>
              <span className="other-hand-count">{hand.length}장</span>
            </div>
            <div className="other-hand-cards">
              {hand.map((_, idx) => (
                <div key={idx} className="card-back" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default OtherPlayers;
