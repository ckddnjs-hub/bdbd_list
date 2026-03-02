import { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import './styles/global.css';

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | room | game
  const [roomInfo, setRoomInfo] = useState(null); // { roomId, playerId }

  const handleJoinRoom = (info) => {
    setRoomInfo(info);
    setScreen('room');
  };

  const handleLeaveRoom = () => {
    setRoomInfo(null);
    setScreen('lobby');
  };

  return (
    <div className="app">
      {screen === 'lobby' && (
        <Lobby onJoinRoom={handleJoinRoom} />
      )}
      {screen === 'room' && roomInfo && (
        <GameRoom
          roomId={roomInfo.roomId}
          playerId={roomInfo.playerId}
          onLeave={handleLeaveRoom}
        />
      )}
    </div>
  );
}
