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

export function getTopValue(card)    { return card.flipped ? card.bottom : card.top; }
export function getBottomValue(card) { return card.flipped ? card.top : card.bottom; }

export function isValidCombination(cards) {
  if (!cards || cards.length === 0) return false;
  if (cards.length === 1) return true;
  const vals = cards.map(getTopValue);
  if (vals.every(v => v === vals[0])) return true;
  const asc  = vals.every((v, i) => i === 0 || v === vals[i-1] + 1);
  const desc = vals.every((v, i) => i === 0 || v === vals[i-1] - 1);
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

function findFirstPlayer(players, hands) {
  for (let i = 0; i < players.length; i++) {
    const hand = hands[players[i]];
    const has12 = hand.some(c =>
      (c.top === 1 && c.bottom === 2) || (c.top === 2 && c.bottom === 1)
    );
    if (has12) return i;
  }
  return 0;
}

export function initializeGame(players) {
  const deck = shuffleDeck(createDeck());
  const count = players.length;
  const perPlayer = { 3:12, 4:11, 5:9 }[count] || 9;
  const hands = {};
  players.forEach((pid, i) => {
    hands[pid] = deck.slice(i * perPlayer, (i+1) * perPlayer);
  });
  const firstIdx = findFirstPlayer(players, hands);
  return {
    status: 'playing',
    currentPlayerIndex: firstIdx,
    players,
    hands,
    field: null,
    scores: Object.fromEntries(players.map(p => [p, 0])),
    // 플레이어별 누적 먹은 마당패 카드 수
    capturedCards: Object.fromEntries(players.map(p => [p, 0])),
    totalScores: Object.fromEntries(players.map(p => [p, 0])),
    tokens: 25,
    round: 1,
    doubleActionUsed: Object.fromEntries(players.map(p => [p, false])),
    handFlipped: Object.fromEntries(players.map(p => [p, false])),
    lastFieldPlayerId: null,
    scoutedSinceLastPlay: [],
    // 라운드 종료 확인 상태: { [playerId]: true }
    roundReadyNext: {},
  };
}

export function applyPlay(state, playerId, indices) {
  const hand = [...state.hands[playerId]];
  const selected = indices.map(i => hand[i]);
  if (!isConnectedInHand(hand, indices)) return { error: '연결된 카드만 선택 가능합니다.' };
  if (!isValidCombination(selected)) return { error: '유효하지 않은 조합입니다.' };
  const combo = selected.map(c => ({
    cardId: c.id, value: getTopValue(c), top: c.top, bottom: c.bottom, flipped: c.flipped
  }));
  if (state.field && !isStrongerThan(selected, state.field.cards))
    return { error: '마당 패보다 강한 조합이어야 합니다.' };

  // 이전 마당패 카드 수 누적
  const prevFieldCount = state.field ? state.field.cards.length : 0;
  const capturedCards = { ...state.capturedCards };
  capturedCards[playerId] = (capturedCards[playerId] || 0) + prevFieldCount;

  [...indices].sort((a,b)=>b-a).forEach(i => hand.splice(i,1));
  const next = (state.currentPlayerIndex + 1) % state.players.length;
  return { state: {
    ...state,
    hands: { ...state.hands, [playerId]: hand },
    field: { cards: combo, ownerId: playerId },
    capturedCards,
    currentPlayerIndex: next,
    lastFieldPlayerId: playerId,
    scoutedSinceLastPlay: [],
  }};
}

export function applyScout(state, playerId, fieldIndex, insertIndex, shouldFlip = false) {
  if (!state.field) return { error: '마당 패가 없습니다.' };
  const isEdge = fieldIndex === 0 || fieldIndex === state.field.cards.length - 1;
  if (!isEdge) return { error: '양끝 카드만 가져올 수 있습니다.' };

  const fc = state.field.cards[fieldIndex];
  const newFlipped = shouldFlip ? !fc.flipped : fc.flipped;
  const newCard = { id: fc.cardId ?? fc.id, top: fc.top, bottom: fc.bottom, flipped: newFlipped };
  const hand = [...state.hands[playerId]];
  hand.splice(Math.min(Math.max(0, insertIndex), hand.length), 0, newCard);

  // 버그 수정: 마지막 1장도 완전히 제거
  const newFieldCards = state.field.cards.filter((_, i) => i !== fieldIndex);
  let tokens = state.tokens;
  const scores = { ...state.scores };
  if (tokens > 0) { tokens--; scores[state.field.ownerId] = (scores[state.field.ownerId] || 0) + 1; }

  const next = (state.currentPlayerIndex + 1) % state.players.length;
  const scoutedSinceLastPlay = [...(state.scoutedSinceLastPlay||[])];
  if (!scoutedSinceLastPlay.includes(playerId)) scoutedSinceLastPlay.push(playerId);

  // 마당패가 0장이 되면 field를 null로
  const newField = newFieldCards.length > 0 ? { ...state.field, cards: newFieldCards } : null;

  return { state: {
    ...state,
    hands: { ...state.hands, [playerId]: hand },
    field: newField,
    scores,
    tokens,
    currentPlayerIndex: next,
    scoutedSinceLastPlay,
  }};
}

export function flipEntireHand(hand) {
  return [...hand].reverse().map(c => ({ ...c, flipped: !c.flipped }));
}

export function checkRoundEnd(state) {
  for (const pid of state.players) {
    if ((state.hands[pid]?.length ?? 99) === 0) {
      return { ended: true, winnerId: pid };
    }
  }
  if (state.field && state.lastFieldPlayerId) {
    const others = state.players.filter(p => p !== state.lastFieldPlayerId);
    const allScouted = others.length > 0 && others.every(p => state.scoutedSinceLastPlay?.includes(p));
    if (allScouted) {
      return { ended: true, winnerId: state.lastFieldPlayerId };
    }
  }
  return { ended: false };
}

export function calculateRoundScore(state, winnerId) {
  const scores = {};
  state.players.forEach(pid => {
    if (pid === winnerId) {
      scores[pid] = (state.scores[pid] || 0) + (state.capturedCards[pid] || 0);
    } else {
      const tokens = state.scores[pid] || 0;
      const captured = state.capturedCards[pid] || 0;
      const handSize = state.hands[pid]?.length || 0;
      scores[pid] = tokens + captured - handSize;
    }
  });
  return scores;
}

// ============================================================
// AI 로직
// ============================================================
export function getAIAction(state, aiId) {
  const hand = state.hands[aiId];
  if (!hand || hand.length === 0) return null;
  const bestPlay = findBestPlay(hand, state.field);
  if (bestPlay) return { type: 'play', indices: bestPlay };
  if (state.field && state.field.ownerId !== aiId && state.field.cards.length > 0) {
    const fieldCards = state.field.cards;
    const firstVal = fieldCards[0].value;
    const lastVal  = fieldCards[fieldCards.length - 1].value;
    const fieldIndex = lastVal >= firstVal ? fieldCards.length - 1 : 0;
    return { type: 'scout', fieldIndex, insertIndex: hand.length };
  }
  return { type: 'play', indices: [0] };
}

function findBestPlay(hand, field) {
  const fieldCards = field?.cards || null;
  let bestIndices = null, bestStrength = -1;
  for (let start = 0; start < hand.length; start++) {
    for (let end = start; end < hand.length; end++) {
      const indices = Array.from({ length: end-start+1 }, (_,i) => start+i);
      const cards   = indices.map(i => hand[i]);
      if (!isValidCombination(cards)) continue;
      if (fieldCards && !isStrongerThan(cards, fieldCards)) continue;
      const strength = cards.length * 10 + Math.min(...cards.map(getTopValue));
      if (strength > bestStrength) { bestStrength = strength; bestIndices = indices; }
    }
  }
  return bestIndices;
}
