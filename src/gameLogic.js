// ============================================================
// SCOUT! 게임 로직 + AI
// ============================================================

export function createDeck() {
  const deck = [];
  let id = 0;
  for (let top = 1; top <= 10; top++)
    for (let bottom = top + 1; bottom <= 10; bottom++)
      deck.push({ id: id++, top, bottom, flipped: false });
  return deck;
}

export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function getTopValue(card) { return card.flipped ? card.bottom : card.top; }
export function getBottomValue(card) { return card.flipped ? card.top : card.bottom; }

export function isValidCombination(cards) {
  if (!cards || cards.length === 0) return false;
  if (cards.length === 1) return true;
  const values = cards.map(getTopValue);
  if (values.every(v => v === values[0])) return true;
  const asc = values.every((v, i) => i === 0 || v === values[i-1] + 1);
  const desc = values.every((v, i) => i === 0 || v === values[i-1] - 1);
  return asc || desc;
}

export function isConnectedInHand(hand, indices) {
  if (indices.length <= 1) return true;
  const s = [...indices].sort((a,b) => a-b);
  return s.every((v, i) => i === 0 || v === s[i-1] + 1);
}

export function isStrongerThan(newCards, fieldCards) {
  if (!fieldCards || fieldCards.length === 0) return true;
  const nv = newCards.map(getTopValue);
  const fv = fieldCards.map(c => c.value ?? getTopValue(c));
  if (nv.length !== fv.length) return nv.length > fv.length;
  const nSame = nv.every(v => v === nv[0]);
  const fSame = fv.every(v => v === fv[0]);
  if (nv.length > 1) {
    if (nSame && !fSame) return true;
    if (!nSame && fSame) return false;
  }
  const nMin = Math.min(...nv), fMin = Math.min(...fv);
  if (nMin !== fMin) return nMin > fMin;
  return false;
}

export function initializeGame(players) {
  const deck = shuffleDeck(createDeck());
  const count = players.length;
  const perPlayer = { 3: 12, 4: 11, 5: 9 }[count] || 9;
  const hands = {};
  players.forEach((pid, i) => {
    hands[pid] = deck.slice(i * perPlayer, (i+1) * perPlayer);
  });
  return {
    status: 'playing',
    currentPlayerIndex: 0,
    players,
    hands,
    field: null,
    scores: Object.fromEntries(players.map(p => [p, 0])),
    totalScores: Object.fromEntries(players.map(p => [p, 0])),
    tokens: 25,
    round: 1,
    doubleActionUsed: Object.fromEntries(players.map(p => [p, false])),
    handFlipped: Object.fromEntries(players.map(p => [p, false])),
    consecutiveScouts: 0,
    lastPlayerId: null,
  };
}

export function applyPlay(state, playerId, indices) {
  const hand = [...state.hands[playerId]];
  const selected = indices.map(i => hand[i]);
  if (!isConnectedInHand(hand, indices)) return { error: '연결된 카드만 선택 가능합니다.' };
  if (!isValidCombination(selected)) return { error: '유효하지 않은 조합입니다.' };
  const combo = selected.map(c => ({ cardId: c.id, value: getTopValue(c), top: c.top, bottom: c.bottom, flipped: c.flipped }));
  if (state.field && !isStrongerThan(selected, state.field.cards)) return { error: '마당 패보다 강한 조합이어야 합니다.' };
  const sorted = [...indices].sort((a,b) => b-a);
  sorted.forEach(i => hand.splice(i, 1));
  const next = (state.currentPlayerIndex + 1) % state.players.length;
  return { state: { ...state, hands: { ...state.hands, [playerId]: hand }, field: { cards: combo, ownerId: playerId }, currentPlayerIndex: next, consecutiveScouts: 0, lastPlayerId: playerId } };
}

export function applyScout(state, playerId, fieldIndex, insertIndex) {
  if (!state.field) return { error: '마당 패가 없습니다.' };
  const isEdge = fieldIndex === 0 || fieldIndex === state.field.cards.length - 1;
  if (!isEdge) return { error: '양끝 카드만 가져올 수 있습니다.' };
  const fc = state.field.cards[fieldIndex];
  const newCard = { id: fc.cardId, top: fc.top, bottom: fc.bottom, flipped: fc.flipped };
  const hand = [...state.hands[playerId]];
  const safeInsert = Math.min(Math.max(0, insertIndex), hand.length);
  hand.splice(safeInsert, 0, newCard);
  const newFieldCards = state.field.cards.filter((_, i) => i !== fieldIndex);
  let tokens = state.tokens;
  const scores = { ...state.scores };
  if (tokens > 0) { tokens--; scores[state.field.ownerId] = (scores[state.field.ownerId] || 0) + 1; }
  const next = (state.currentPlayerIndex + 1) % state.players.length;
  const consec = state.consecutiveScouts + 1;
  return { state: { ...state, hands: { ...state.hands, [playerId]: hand }, field: newFieldCards.length > 0 ? { ...state.field, cards: newFieldCards } : state.field, scores, tokens, currentPlayerIndex: next, consecutiveScouts: consec } };
}

export function flipEntireHand(hand) {
  return [...hand].reverse().map(c => ({ ...c, flipped: !c.flipped }));
}

export function checkRoundEnd(state) {
  for (const pid of state.players)
    if (state.hands[pid].length === 0) return { ended: true, winnerId: pid };
  if (state.field && state.consecutiveScouts >= state.players.length - 1 && state.lastPlayerId)
    return { ended: true, winnerId: state.lastPlayerId };
  return { ended: false };
}

export function calculateRoundScore(state, winnerId) {
  const scores = {};
  state.players.forEach(pid => {
    if (pid === winnerId) scores[pid] = state.scores[pid] || 0;
    else scores[pid] = (state.scores[pid] || 0) - state.hands[pid].length;
  });
  return scores;
}

// ============================================================
// AI 로직
// ============================================================

export function getAIAction(state, aiId) {
  const hand = state.hands[aiId];
  if (!hand || hand.length === 0) return null;

  // 1) 낼 수 있는 조합 찾기
  const bestPlay = findBestPlay(hand, state.field);
  if (bestPlay) return { type: 'play', indices: bestPlay };

  // 2) 마당 패가 있고 내 것이 아니면 스카우트
  if (state.field && state.field.ownerId !== aiId) {
    const fieldCards = state.field.cards;
    // 더 유용한 끝 카드 선택
    const firstVal = fieldCards[0].value;
    const lastVal = fieldCards[fieldCards.length - 1].value;
    const fieldIndex = firstVal >= lastVal ? 0 : fieldCards.length - 1;
    const insertIndex = hand.length; // 끝에 삽입
    return { type: 'scout', fieldIndex, insertIndex };
  }

  // 3) 마당 패 없으면 아무 단일 카드 플레이
  return { type: 'play', indices: [0] };
}

function findBestPlay(hand, field) {
  const fieldCards = field?.cards || null;
  let bestIndices = null;
  let bestStrength = -1;

  // 모든 연속 구간 탐색
  for (let start = 0; start < hand.length; start++) {
    for (let end = start; end < hand.length; end++) {
      const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      const cards = indices.map(i => hand[i]);
      if (!isValidCombination(cards)) continue;
      if (fieldCards && !isStrongerThan(cards, fieldCards)) continue;
      // 더 많은 카드를 내는 게 좋음
      const strength = cards.length * 10 + Math.min(...cards.map(getTopValue));
      if (strength > bestStrength) { bestStrength = strength; bestIndices = indices; }
    }
  }
  return bestIndices;
}
