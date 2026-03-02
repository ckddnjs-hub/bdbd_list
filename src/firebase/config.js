// ==========================================
// Firebase 설정 및 게임 DB 함수
// ==========================================
// 사용 전 아래 firebaseConfig를 본인 Firebase 프로젝트 값으로 교체하세요!

import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
  get,
  remove,
  serverTimestamp,
} from 'firebase/database';

// 🔧 여기를 본인 Firebase 프로젝트 설정으로 교체하세요

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const firebaseConfig = {
  apiKey: "AIzaSyBlRRhM9VYlLlQyrLXXuJ4uzB6Zvt5tPnY",
  authDomain: "scout-84ff1.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "scout-84ff1",
  storageBucket: "scout-84ff1.firebasestorage.app",
  messagingSenderId: "431988627614",
  appId: "1:431988627614:web:8b7b5971150290d100c38f",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// ==========================================
// 방 관리
// ==========================================

// 방 생성
export async function createRoom(hostName) {
  const roomsRef = ref(db, 'rooms');
  const newRoomRef = push(roomsRef);
  const roomId = newRoomRef.key;
  const playerId = push(ref(db, 'temp')).key;

  await set(newRoomRef, {
    id: roomId,
    status: 'waiting', // waiting | playing | finished
    hostId: playerId,
    players: {
      [playerId]: {
        id: playerId,
        name: hostName,
        ready: false,
        connected: true,
        joinedAt: serverTimestamp(),
      }
    },
    createdAt: serverTimestamp(),
  });

  return { roomId, playerId };
}

// 방 참가
export async function joinRoom(roomId, playerName) {
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) throw new Error('방을 찾을 수 없습니다.');

  const room = snapshot.val();
  if (room.status !== 'waiting') throw new Error('이미 게임이 시작된 방입니다.');

  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= 5) throw new Error('방이 가득 찼습니다. (최대 5명)');

  const playerId = push(ref(db, 'temp')).key;

  await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    id: playerId,
    name: playerName,
    ready: false,
    connected: true,
    joinedAt: serverTimestamp(),
  });

  return { roomId, playerId };
}

// 준비 상태 토글
export async function toggleReady(roomId, playerId, ready) {
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), { ready });
}

// ==========================================
// 게임 상태 관리
// ==========================================

// 게임 시작 (호스트만 가능)
export async function startGame(roomId, gameState) {
  await update(ref(db, `rooms/${roomId}`), {
    status: 'playing',
    gameState: serializeGameState(gameState),
    startedAt: serverTimestamp(),
  });
}

// 게임 상태 업데이트
export async function updateGameState(roomId, gameState) {
  await update(ref(db, `rooms/${roomId}`), {
    gameState: serializeGameState(gameState),
    updatedAt: serverTimestamp(),
  });
}

// 게임 상태 직렬화 (Firebase는 undefined 불허)
function serializeGameState(state) {
  return JSON.parse(JSON.stringify(state, (key, value) =>
    value === undefined ? null : value
  ));
}

// 액션 전송 (낙관적 업데이트용 로그)
export async function pushAction(roomId, action) {
  const actionsRef = ref(db, `rooms/${roomId}/actions`);
  await push(actionsRef, {
    ...action,
    timestamp: serverTimestamp(),
  });
}

// 라운드 종료 처리
export async function endRound(roomId, roundScores, nextGameState) {
  await update(ref(db, `rooms/${roomId}`), {
    gameState: serializeGameState(nextGameState),
    [`roundHistory/${nextGameState.round - 1}`]: roundScores,
    updatedAt: serverTimestamp(),
  });
}

// 게임 종료
export async function endGame(roomId, finalScores) {
  await update(ref(db, `rooms/${roomId}`), {
    status: 'finished',
    finalScores,
    finishedAt: serverTimestamp(),
  });
}

// ==========================================
// 실시간 리스너
// ==========================================

// 방 실시간 구독
export function subscribeToRoom(roomId, callback) {
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  });
}

// 방 목록 구독 (로비용)
export function subscribeToRooms(callback) {
  const roomsRef = ref(db, 'rooms');
  return onValue(roomsRef, (snapshot) => {
    const rooms = snapshot.val() || {};
    const roomList = Object.values(rooms).filter(r => r.status === 'waiting');
    callback(roomList);
  });
}

// 연결 끊김 처리
export function setupDisconnectHandler(roomId, playerId) {
  const connectedRef = ref(db, `rooms/${roomId}/players/${playerId}/connected`);
  // onDisconnect는 Firebase SDK에서 직접 처리
  import('firebase/database').then(({ onDisconnect }) => {
    onDisconnect(connectedRef).set(false);
  });
}
