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
};

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

export async function saveGameState(roomId, gameState, status = 'playing') {
  await update(ref(db, `rooms/${roomId}`), {
    status,
    gameState: JSON.parse(JSON.stringify(gameState, (_, v) => v === undefined ? null : v)),
    updatedAt: serverTimestamp(),
  });
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

// 모든 방 구독 (관리자용)
export function subscribeToAllRooms(cb) {
  return onValue(ref(db, 'rooms'), snap => {
    const all = snap.val() || {};
    cb(Object.values(all));
  });
}

// 방 삭제 (관리자용)
export async function deleteRoom(roomId) {

  await remove(ref(db, `rooms/${roomId}`));
}
