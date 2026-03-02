import { useState, useCallback } from 'react';
import CardComponent from './CardComponent';
import { isConnectedInHand, isValidCombination, getTopValue } from '../utils/gameLogic';

export default function PlayerHand({
  hand,
  isMyTurn,
  mode, // 'play' | 'scout' | 'double'
  onPlay,
  onFlipHand,
  canFlipHand,
  hasFlippedThisRound,
}) {
  const [selectedIndices, setSelectedIndices] = useState([]);

  const toggleSelect = useCallback((idx) => {
    if (!isMyTurn || mode === 'scout') return;

    setSelectedIndices(prev => {
      if (prev.includes(idx)) {
        return prev.filter(i => i !== idx);
      }
      const next = [...prev, idx].sort((a, b) => a - b);
      // 연결된 카드만 선택 가능
      const isConnected = next.length <= 1 || next.every((v, i) => i === 0 || v === next[i-1] + 1);
      return isConnected ? next : prev;
    });
  }, [isMyTurn, mode]);

  const selectedCards = selectedIndices.map(i => hand[i]);
  const isValidSelection = selectedIndices.length > 0 &&
    isConnectedInHand(hand, selectedIndices) &&
    isValidCombination(selectedCards);

  const handlePlayClick = () => {
    if (!isValidSelection) return;
    onPlay(selectedIndices);
    setSelectedIndices([]);
  };

  const handleFlip = () => {
    if (canFlipHand && !hasFlippedThisRound) {
      onFlipHand();
    }
  };

  return (
    <div className="player-hand-container">
      <div className="hand-controls">
        {isMyTurn && mode === 'play' && (
          <div className="hand-actions">
            <button
              className={`btn btn-sm ${isValidSelection ? 'btn-primary' : 'btn-disabled'}`}
              onClick={handlePlayClick}
              disabled={!isValidSelection}
            >
              플레이 ({selectedIndices.length}장)
            </button>
            {selectedIndices.length > 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setSelectedIndices([])}
              >
                선택 취소
              </button>
            )}
          </div>
        )}
        <button
          className={`btn btn-sm btn-ghost ${!canFlipHand || hasFlippedThisRound ? 'disabled' : ''}`}
          onClick={handleFlip}
          disabled={!canFlipHand || hasFlippedThisRound}
          title="손패 위아래 뒤집기 (라운드당 1회)"
        >
          ↕ 뒤집기
        </button>
      </div>

      <div className={`hand-cards ${isMyTurn ? 'my-turn' : ''}`}>
        {hand.map((card, idx) => (
          <div key={card.id} className="hand-card-wrapper">
            <CardComponent
              card={card}
              flipped={card.flipped}
              isSelected={selectedIndices.includes(idx)}
              isPlayable={isMyTurn && mode === 'play'}
              onClick={isMyTurn && mode === 'play' ? () => toggleSelect(idx) : undefined}
              size="normal"
            />
          </div>
        ))}
      </div>

      {isMyTurn && mode === 'play' && selectedIndices.length > 0 && (
        <div className="selection-hint">
          {isValidSelection
            ? `✓ 유효한 조합입니다`
            : `✗ 유효하지 않은 조합 (연결된 카드 + 같은 숫자 또는 연속 숫자)`
          }
        </div>
      )}
    </div>
  );
}
