import React, { useEffect, useRef, useState } from 'react';

export default function EscapeChat({ socket, room, name }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!socket || !room) return;
    const onMsg = (msg) => {
      // Accept only for our room scope; backend already scopes, but keep safe
      if (!msg) return;
      // If it's an emoji preset, float it only; do NOT add to chat list
      if (msg.type === 'preset' && msg.text) {
        spawnEmoji(msg.text);
        return;
      }
      // Keep only last 100, actual render will show only top 2
      setMessages((prev) => [...prev.slice(-99), msg]);
    };
    socket.on('chatMessage', onMsg);
    return () => socket.off('chatMessage', onMsg);
  }, [socket, room]);

  useEffect(() => {
    if (!listRef.current) return;
    // Auto-scroll to top since we display newest at the top
    listRef.current.scrollTop = 0;
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    socket.emit('chatMessage', { room, name, text: t, ts: Date.now(), type: 'text' });
    setText('');
  };

  const presets = ['😀','🎉','👍','🔥','🗝️','💡','😎','👻'];
  const sendEmoji = (emoji) => {
    socket.emit('chatMessage', { room, name, text: emoji, ts: Date.now(), type: 'preset' });
    spawnEmoji(emoji);
  };

  function spawnEmoji(emoji) {
    const overlay = document.querySelector('.emoji-float-overlay');
    if (!overlay) return;
    const span = document.createElement('span');
    span.className = 'emoji-float';
    span.textContent = emoji;
    const x = 10 + Math.random() * 80; // percentage across screen
    const y = 70 + Math.random() * 20; // start near bottom
    span.style.left = x + '%';
    span.style.top = y + '%';
    overlay.appendChild(span);
    setTimeout(() => overlay.removeChild(span), 1400);
  }

  const onKey = (e) => {
    if (e.key === 'Enter') send();
  };

  return (
    <div className="chat-panel" style={{marginTop: 12}}>
      <h3>Room Chat</h3>
      <div ref={listRef} className="chat-messages">
        {[...messages].reverse().slice(0, 2).map((m, i) => (
          <div key={i} className="chat-message">
            <span className="chat-name"><strong>{m.name}:</strong> </span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Type a message and press Enter"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="chat-send-btn" onClick={send}>Send</button>
      </div>
      <div className="chat-presets" style={{marginTop: 8}}>
        {presets.map((em, idx) => (
          <button key={idx} className="preset-btn" onClick={() => sendEmoji(em)}>
            {em}
          </button>
        ))}
      </div>
    </div>
  );
}
