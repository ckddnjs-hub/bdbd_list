// 스카우트 카드 컴포넌트
// 각 카드는 위/아래 두 숫자를 가짐

const COLOR_PALETTE = {
  1:  { bg: '#FF6B6B', text: '#fff' },
  2:  { bg: '#FF9F43', text: '#fff' },
  3:  { bg: '#FECA57', text: '#333' },
  4:  { bg: '#48CA8B', text: '#fff' },
  5:  { bg: '#1DD1A1', text: '#fff' },
  6:  { bg: '#54A0FF', text: '#fff' },
  7:  { bg: '#5F27CD', text: '#fff' },
  8:  { bg: '#C44569', text: '#fff' },
  9:  { bg: '#341F97', text: '#fff' },
  10: { bg: '#2C3E50', text: '#fff' },
};

export default function CardComponent({
  card,
  isSelected = false,
  isPlayable = false,
  onClick,
  size = 'normal', // 'small' | 'normal' | 'large'
  showBoth = true,  // 위아래 모두 표시 여부
  flipped = false,
}) {
  const topVal = flipped ? card.bottom : card.top;
  const bottomVal = flipped ? card.top : card.bottom;
  const topColor = COLOR_PALETTE[topVal] || { bg: '#999', text: '#fff' };
  const bottomColor = COLOR_PALETTE[bottomVal] || { bg: '#999', text: '#fff' };

  const sizeClass = {
    small: 'card-sm',
    normal: 'card-md',
    large: 'card-lg',
  }[size];

  return (
    <div
      className={`scout-card ${sizeClass} ${isSelected ? 'selected' : ''} ${isPlayable ? 'playable' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      {/* 위쪽 숫자 */}
      <div
        className="card-half card-top"
        style={{ background: topColor.bg, color: topColor.text }}
      >
        <span className="card-number">{topVal}</span>
      </div>

      {/* 아래쪽 숫자 */}
      {showBoth && (
        <div
          className="card-half card-bottom"
          style={{ background: bottomColor.bg, color: bottomColor.text }}
        >
          <span className="card-number card-number-bottom">{bottomVal}</span>
        </div>
      )}

      {isSelected && <div className="card-selected-overlay" />}
    </div>
  );
}

// 마당 패 카드 (값만 표시, 단면)
export function FieldCard({ value, size = 'normal' }) {
  const color = COLOR_PALETTE[value] || { bg: '#999', text: '#fff' };
  const sizeClass = { small: 'card-sm', normal: 'card-md', large: 'card-lg' }[size];

  return (
    <div
      className={`scout-card ${sizeClass} field-card`}
      style={{ background: color.bg, color: color.text }}
    >
      <span className="card-number-single">{value}</span>
    </div>
  );
}
