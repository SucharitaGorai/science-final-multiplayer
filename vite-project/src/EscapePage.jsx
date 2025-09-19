import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EscapeGame from './EscapeGame.jsx';
import EscapeChat from './EscapeChat.jsx';
import socket from './socket.js';
import './App.css';

export default function EscapePage() {
  const [params] = useSearchParams();
  const room = params.get('room') || '';
  const name = params.get('name') || '';
  const [started, setStarted] = useState(false);
  const [avatar, setAvatar] = useState('rogue');

  useEffect(() => {
    const onStage = () => setStarted(true);
    socket.on('escapeStage', onStage);
    return () => socket.off('escapeStage', onStage);
  }, []);

  // Join the room in this page so the player participates
  useEffect(() => {
    if (!room || !name) return;
    socket.emit('joinRoom', room, name);
    // no participant list rendering here
    return () => {};
  }, [room, name]);

  const beginHunt = () => {
    if (!room) return;
    // Start hunt for whole room; all clients will receive escapeStage and start
    socket.emit('escapeStartGame', room);
  };

  const goHome = () => {
    window.location.assign('/');
  };

  return (
    <div className="App" style={{paddingTop: 16}}>
      <div className="space-background"></div>
      {/* Emoji overlay for floating reactions */}
      <div className="emoji-float-overlay"></div>
      <div className='quiz-div' style={{ maxWidth: 1100 }}>
        <div className='escape-topbar'>
          <button className='join-btn' onClick={goHome}>← Back to Home</button>
          <h1 className='escape-title'>🕯️ Haunted Escape</h1>
          {!started ? (
            <button className='start-game-btn' onClick={beginHunt}>Begin Hunt</button>
          ) : (
            <div style={{width: 140}} />
          )}
        </div>
        <p className='room-id'>Room Id: {room} • Player: {name}</p>
        {!started && (
          <div style={{display:'flex', gap:12, justifyContent:'center', alignItems:'center', marginTop:8}}>
            <span style={{fontSize:12}}>Choose Avatar:</span>
            <label style={{display:'flex', alignItems:'center', gap:6}}>
              <input type="radio" name="avatar" value="rogue" checked={avatar==='rogue'} onChange={()=>setAvatar('rogue')} />
              <span>Rogue</span>
            </label>
            <label style={{display:'flex', alignItems:'center', gap:6}}>
              <input type="radio" name="avatar" value="knight" checked={avatar==='knight'} onChange={()=>setAvatar('knight')} />
              <span>Knight</span>
            </label>
            <label style={{display:'flex', alignItems:'center', gap:6}}>
              <input type="radio" name="avatar" value="commando" checked={avatar==='commando'} onChange={()=>setAvatar('commando')} />
              <span>Commando</span>
            </label>
          </div>
        )}
        <div style={{marginTop: 12}}>
          {started ? (
            <EscapeGame socket={socket} room={room} name={name} avatar={avatar} />
          ) : (
            <p className='loading-text'>Press Begin Hunt to start for everyone in this room.</p>
          )}
        </div>
        {/* Chat section pinned under the game so it fits on one page */}
        <div style={{marginTop: 10}}>
          <EscapeChat socket={socket} room={room} name={name} />
        </div>
      </div>
    </div>
  );
}
