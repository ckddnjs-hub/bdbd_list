// ==========================================
// SCOUT! 게임 핵심 로직
// ==========================================

// 카드 덱 생성 (45장: 1~10 두 숫자 조합, 중복 없음, 각 카드 고유)
export function createDeck() {
  const deck = [];
  let id = 0;
  for (let top = 1; top <= 10; top++) {
    for (let bottom = 1; bottom <= 10; bottom++) {
      if (top !== bottom) {
        // 뒤집으면 top/bottom 교환되므로 중복 제거 (top < bottom만)
        if (top < bottom) {
          deck.push({ id: id++, top, bottom });
        }
      }
    }
  }
  // top === bottom 카드는 없음 (총 45장: C(10,2) = 45)
  return deck;
}

// 덱 셔플
export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// 플레이어 수에 따라 카드 배분
export function dealCards(deck, playerCount) {
  const cardsPerPlayer = { 3: 12, 4: 11, 5: 9 }[playerCount];
  const hands = {};
  const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);

  playerIds.forEach((pid, i) => {
    hands[pid] = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer).map((card, idx) => ({
      ...card,
      flipped: false, // 위아래 뒤집힘 여부
      position: idx,
    }));
  });

  return hands;
}

// 카드의 현재 위쪽 숫자 반환
export function getTopValue(card) {
  return card.flipped ? card.bottom : card.top;
}

// 카드의 현재 아래쪽 숫자 반환
export function getBottomValue(card) {
  return card.flipped ? card.top : card.bottom;
}

// ==========================================
// 조합 유효성 검사
// ==========================================

// 선택된 카드들이 유효한 조합인지 확인
// cards: 손패에서 선택된 카드 배열 (순서대로)
export function isValidCombination(cards) {
  if (!cards || cards.length === 0) return false;
  if (cards.length === 1) return true;

  const values = cards.map(c => getTopValue(c));

  // 같은 숫자 조합인지 확인
  if (values.every(v => v === values[0])) return true;

  // 연속된 숫자 조합인지 확인 (오름차순 또는 내림차순)
  const isAscending = values.every((v, i) => i === 0 || v === values[i - 1] + 1);
  const isDescending = values.every((v, i) => i === 0 || v === values[i - 1] - 1);

  return isAscending || isDescending;
}

// 손패에서 연결된(인접한) 카드들인지 확인
export function isConnectedInHand(hand, selectedIndices) {
  if (selectedIndices.length === 0) return false;
  if (selectedIndices.length === 1) return true;

  const sorted = [...selectedIndices].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

// ==========================================
// 조합 강도 비교
// ==========================================

// 현재 마당 패보다 강한지 확인
export function isStrongerThan(newCards, fieldCards) {
  if (!fieldCards || fieldCards.length === 0) return true;

  const newValues = newCards.map(c => getTopValue(c));
  const fieldValues = fieldCards.map(c => c.value !== undefined ? c.value : getTopValue(c));

  // 카드 수 비교 (많은 쪽이 강함)
  if (newValues.length !== fieldValues.length) {
    return newValues.length > fieldValues.length;
  }

  // 같은 수인 경우 종류 비교
  const newIsSame = newValues.every(v => v === newValues[0]);
  const fieldIsSame = fieldValues.every(v => v === fieldValues[0]);

  if (newValues.length > 1) {
    // 연속 vs 같은 숫자: 같은 숫자가 더 강함
    const newIsRun = !newIsSame;
    const fieldIsRun = !fieldIsSame;

    if (newIsSame && fieldIsRun) return true;  // 같은 숫자 > 연속 숫자
    if (newIsRun && fieldIsSame) return false; // 연속 숫자 < 같은 숫자
  }

  // 같은 종류끼리: 가장 낮은 숫자 비교 (높은 쪽이 강함)
  const newMin = Math.min(...newValues);
  const fieldMin = Math.min(...fieldValues);

  if (newMin !== fieldMin) return newMin > fieldMin;

  // 최솟값도 같으면 플레이 불가
  return false;
}

// 선택한 카드들로 플레이 가능한 조합 생성
export function buildPlayCombination(cards) {
  return cards.map(card => ({
    cardId: card.id,
    value: getTopValue(card),
    top: card.top,
    bottom: card.bottom,
    flipped: card.flipped,
  }));
}

// ==========================================
// 게임 초기화
// ==========================================

export function initializeGame(players) {
  const deck = shuffleDeck(createDeck());
  const playerCount = players.length;
  const hands = dealCards(deck, playerCount);

  // 플레이어 ID 매핑
  const playerHandMap = {};
  players.forEach((pid, i) => {
    playerHandMap[pid] = hands[`p${i}`];
  });

  return {
    status: 'playing',
    currentPlayerIndex: 0,
    players: players,
    hands: playerHandMap,
    field: null,        // 현재 마당 패 { cards, ownerId }
    scores: Object.fromEntries(players.map(p => [p, 0])),
    roundScores: [],
    doubleActionUsed: Object.fromEntries(players.map(p => [p, false])),
    tokens: 0,          // 테이블 위 특점 토큰 수
    round: 1,
  };
}

// ==========================================
// 액션 처리
// ==========================================

// 플레이 액션
export function applyPlay(gameState, playerId, selectedIndices) {
  const hand = [...gameState.hands[playerId]];
  const selectedCards = selectedIndices.map(i => hand[i]);

  // 유효성 검사
  if (!isConnectedInHand(hand, selectedIndices)) {
    return { error: '손패에서 연결된 카드만 선택할 수 있습니다.' };
  }
  if (!isValidCombination(selectedCards)) {
    return { error: '유효하지 않은 조합입니다.' };
  }

  const newCombination = buildPlayCombination(selectedCards);

  // 마당 패와 비교
  if (gameState.field && !isStrongerThan(selectedCards, gameState.field.cards)) {
    return { error: '마당 패보다 강한 조합이어야 합니다.' };
  }

  // 카드 제거
  const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
  sortedIndices.forEach(i => hand.splice(i, 1));

  const newState = {
    ...gameState,
    hands: { ...gameState.hands, [playerId]: hand },
    field: {
      cards: newCombination,
      ownerId: playerId,
    },
    tokens: gameState.tokens, // 토큰은 그대로
  };

  return { state: newState };
}

// 스카우트 액션
export function applyScout(gameState, playerId, fieldCardIndex, handInsertIndex) {
  if (!gameState.field) return { error: '마당 패가 없습니다.' };

  const fieldCard = gameState.field.cards[fieldCardIndex];
  if (!fieldCard) return { error: '유효하지 않은 카드 선택입니다.' };

  // 양끝 카드만 가져올 수 있음
  const isFirst = fieldCardIndex === 0;
  const isLast = fieldCardIndex === gameState.field.cards.length - 1;
  if (!isFirst && !isLast) {
    return { error: '마당 패의 양끝 카드만 가져올 수 있습니다.' };
  }

  const hand = [...gameState.hands[playerId]];
  const newCard = {
    id: fieldCard.cardId,
    top: fieldCard.top,
    bottom: fieldCard.bottom,
    flipped: fieldCard.flipped,
  };

  // 손패에 삽입
  hand.splice(handInsertIndex, 0, newCard);

  // 마당 패에서 제거
  const newFieldCards = gameState.field.cards.filter((_, i) => i !== fieldCardIndex);

  // 마당 패 주인에게 토큰 지급 (테이블에서)
  const fieldOwnerId = gameState.field.ownerId;
  let newTokens = gameState.tokens;
  let newScores = { ...gameState.scores };

  if (newTokens > 0) {
    newTokens--;
    newScores[fieldOwnerId] = (newScores[fieldOwnerId] || 0) + 1;
  }

  const newState = {
    ...gameState,
    hands: { ...gameState.hands, [playerId]: hand },
    field: newFieldCards.length > 0
      ? { ...gameState.field, cards: newFieldCards }
      : gameState.field, // 마당 패는 카드 없어도 유지 (오너 정보 보존)
    scores: newScores,
    tokens: newTokens,
    currentPlayerIndex: (gameState.currentPlayerIndex + 1) % gameState.players.length,
  };

  return { state: newState };
}

// 더블 액션 (스카우트 후 즉시 플레이)
export function applyDoubleAction(gameState, playerId, fieldCardIndex, handInsertIndex, playIndices) {
  // 스카우트 먼저
  const scoutResult = applyScout(gameState, playerId, fieldCardIndex, handInsertIndex);
  if (scoutResult.error) return scoutResult;

  // 더블 액션 사용 표시 & 차례 되돌리기
  const stateAfterScout = {
    ...scoutResult.state,
    currentPlayerIndex: gameState.currentPlayerIndex, // 차례 유지
    doubleActionUsed: { ...scoutResult.state.doubleActionUsed, [playerId]: true },
  };

  // 플레이
  const playResult = applyPlay(stateAfterScout, playerId, playIndices);
  if (playResult.error) return playResult;

  // 차례 넘김
  const finalState = {
    ...playResult.state,
    currentPlayerIndex: (gameState.currentPlayerIndex + 1) % gameState.players.length,
  };

  return { state: finalState };
}

// ==========================================
// 라운드 종료 조건 확인
// ==========================================

export function checkRoundEnd(gameState) {
  // 조건 i: 손패가 다 떨어짐
  for (const pid of gameState.players) {
    if (gameState.hands[pid].length === 0) {
      return { ended: true, reason: 'empty_hand', winnerId: pid };
    }
  }

  // 조건 ii: 자신이 플레이한 카드에 대해 다른 모든 플레이어가 스카우트만 진행
  // (이건 복잡한 상태 추적 필요 - 단순화: 필드 주인 이외 모두 차례 건너뜀 감지)
  // 실제 구현에서는 consecutiveScouts 카운터로 추적

  return { ended: false };
}

// 라운드 점수 계산
export function calculateRoundScore(gameState, winnerId) {
  const scores = {};
  
  gameState.players.forEach(pid => {
    let score = 0;
    
    if (pid === winnerId) {
      // 승자: 각 특점 토큰 +1점
      score = gameState.scores[pid] || 0;
    } else {
      // 패자: 현재 점수(토큰) - 손패 장수
      const tokens = gameState.scores[pid] || 0;
      const handSize = gameState.hands[pid].length;
      score = tokens - handSize;
    }
    
    scores[pid] = score;
  });
  
  return scores;
}

// 손패 위아래 뒤집기
export function flipEntireHand(hand) {
  return hand.map(card => ({
    ...card,
    flipped: !card.flipped,
  })).reverse(); // 순서도 반전
}
