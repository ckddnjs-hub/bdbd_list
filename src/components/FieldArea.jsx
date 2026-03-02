import { FieldCard } from './CardComponent';

export default function FieldArea({
  field,
  players,
  isMyTurn,
  mode, // 'scout' | 'double'
  myPlayerId,
  onScout,
}) {
  if (!field) {
    return (
      <div className="field-area empty">
        <div className="field-empty-hint">
          <span>마당 패 없음</span>
          <p>첫 번째 플레이어가 카드를 내려놓으세요</p>
        </div>
      </div>
    );
  }

  const ownerName = players.find(p => p.id === field.ownerId)?.name || '???';
  const isOwner = field.ownerId === myPlayerId;
  const canScout = isMyTurn && (mode === 'scout' || mode === 'double') && !isOwner;

  const handleScout = (index) => {
    if (!canScout) return;
    onScout(index);
  };

  return (
    <div className="field-area">
      <div className="field-owner">
        <span className="owner-label">마당 패</span>
        <span className="owner-name">{ownerName}의 패</span>
      </div>

      <div className="field-cards">
        {field.cards.map((card, idx) => {
          const isEdge = idx === 0 || idx === field.cards.length - 1;
          const scoutable = canScout && isEdge;

          return (
            <div
              key={`${card.cardId}-${idx}`}
              className={`field-card-wrapper ${scoutable ? 'scoutable' : ''}`}
              onClick={scoutable ? () => handleScout(idx) : undefined}
            >
              <FieldCard value={card.value} size="large" />
              {scoutable && (
                <div className="scout-hint">스카우트</div>
              )}
            </div>
          );
        })}
      </div>

      {canScout && (
        <p className="scout-instruction">
          ← 양끝 카드를 클릭해서 스카우트하세요 →
        </p>
      )}
    </div>
  );
}
