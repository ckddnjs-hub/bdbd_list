import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, push, get, remove, serverTimestamp } from 'firebase/database';

// 🔧 여기를 본인 Firebase 프로젝트 설정으로 교체하세요
const firebaseConfig = {
  apiKey: "AIzaSyBlRRhM9VYlLlQyrLXXuJ4uzB6Zvt5tPnY",
  authDomain: "scout-84ff1.firebaseapp.com",
  databaseURL: "https://scout-84ff1-default-rtdb.firebaseio.com",
  projectId: "scout-84ff1",
  storageBucket: "scout-84ff1.firebasestorage.app",
  messagingSenderId: "431988627614",
  appId: "1:431988627614:web:8b7b5971150290d100c38f",
}


const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export async function createRoom(hostName) {
  const roomsRef = ref(db, 'rooms');
  const newRoomRef = push(roomsRef);
  const roomId = newRoomRef.key;
  const playerId = push(ref(db, '_tmp')).key;
  await set(newRoomRef, {
    id: roomId, status: 'waiting', hostId: playerId,
    players: { [playerId]: { id: playerId, name: hostName, ready: false } },
    createdAt: serverTimestamp(),
  });
  return { roomId, playerId };
}

export async function joinRoom(roomId, playerName) {
  const snap = await get(ref(db, `rooms/${roomId}`));
  if (!snap.exists()) throw new Error('방을 찾을 수 없습니다.');
  const room = snap.val();
  if (room.status !== 'waiting') throw new Error('이미 시작된 방입니다.');
  const count = Object.keys(room.players || {}).length;
  if (count >= 5) throw new Error('방이 가득 찼습니다.');
  const playerId = push(ref(db, '_tmp')).key;
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), { id: playerId, name: playerName, ready: false });
  return { roomId, playerId };
}

export async function toggleReady(roomId, playerId, ready) {
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), { ready });
}

// 방 나가기: 방장이면 방 전체 삭제, 아니면 해당 플레이어만 제거
export async function leaveRoom(roomId, playerId) {
  const snap = await get(ref(db, `rooms/${roomId}`));
  if (!snap.exists()) return;
  const room = snap.val();
  if (room.hostId === playerId) {
    // 방장이면 방 전체 삭제
    await remove(ref(db, `rooms/${roomId}`));
  } else {
    // 일반 플레이어면 본인만 제거
    await remove(ref(db, `rooms/${roomId}/players/${playerId}`));
  }
}

export async function saveGameState(roomId, gameState, status = 'playing') {
  await update(ref(db, `rooms/${roomId}`), {
    status,
    gameState: JSON.parse(JSON.stringify(gameState, (_, v) => v === undefined ? null : v)),
    updatedAt: serverTimestamp(),
  });
}

// 감정표현 전송
export async function sendEmoji(roomId, playerId, emoji, playerName) {
  const emojiRef = push(ref(db, `rooms/${roomId}/emojis`));
  await set(emojiRef, {
    playerId, playerName, emoji, ts: serverTimestamp()
  });
  // 3초 후 자동 삭제
  setTimeout(() => remove(emojiRef), 3000);
}

// 라운드 종료 확인 (다음 라운드 준비)
export async function confirmRoundReady(roomId, playerId) {
  await update(ref(db, `rooms/${roomId}/roundReady`), { [playerId]: true });
}
export async function clearRoundReady(roomId) {
  await remove(ref(db, `rooms/${roomId}/roundReady`));
}

export function subscribeToRoom(roomId, cb) {
  return onValue(ref(db, `rooms/${roomId}`), snap => cb(snap.val()));
}

export function subscribeToRooms(cb) {
  return onValue(ref(db, 'rooms'), snap => {
    const all = snap.val() || {};
    cb(Object.values(all).filter(r => r.status === 'waiting'));
  });
}

export function subscribeToAllRooms(cb) {
  return onValue(ref(db, 'rooms'), snap => {
    const all = snap.val() || {};
    cb(Object.values(all));
  });
}

export async function deleteRoom(roomId) {
  await remove(ref(db, `rooms/${roomId}`));
}
