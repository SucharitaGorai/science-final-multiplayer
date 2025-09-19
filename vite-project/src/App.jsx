import React, { useState, useEffect, useRef } from 'react';
import './App.css'
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


import socket from './socket.js';
 
 // socket is imported from shared socket.js
function App() {
  const [name, setName] = useState(null);
  const [room, setRoom] = useState(null);
  const [info, setInfo] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([]);
  const [answered, setAnswered] = useState(false);
 
  const [seconds, setSeconds] = useState(); // Set the initial duration in seconds
  const [scores, setScores] = useState([]);
  const [winner, setWinner] = useState();
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  // Escape game start toggle (for old inline view; now we open in new page, but keep for sync/compat)
  const [escapeStarted, setEscapeStarted] = useState(false);
  // Chat state (ported from maths-final-git)
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatBoxRef = useRef(null);
  // Floating emoji local effect state
  const [floatEmojis, setFloatEmojis] = useState([]);
  const gamifyPresets = [
    '🔥 On fire!',
    '💪 Nice try!',
    '🚀 Speed run!',
    '🎯 Bullseye!',
    '🤝 Good luck everyone!',
  ];
  const emojiList = ['😀','😂','🥳','😎','😱','🔥','💯','👏','🏆','🚀'];

  // Check room participants when room number changes
  useEffect(() => {
    if (room && room.trim() !== '') {
      socket.emit('checkRoom', room);
    } else {
      setParticipants([]);
      setParticipantCount(0);
    }
  }, [room]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setIsCountingDown(false);
      setCountdown(null);
      setInfo(true);
    }
  }, [countdown]);



const handleSubmit = (e) => {
  e.preventDefault();

  if (name && room) {
    socket.emit('joinRoom', room, name);
    setInfo(true);
  }
};

const handleStartGame = () => {
  socket.emit('startGame', room);
};
// Start treasure hunt button handler (new page)
const handleStartEscape = () => {
  if (!room || !name) return;
  // Signal room and auto-start staged hunt, then open new slide
  socket.emit('escapeStart', room);
  socket.emit('escapeStartGame', room);
  const url = new URL(window.location.href);
  url.pathname = '/escape';
  url.searchParams.set('room', room);
  url.searchParams.set('name', name);
  window.open(url.toString(), '_blank', 'noopener');
};
useEffect(() => {
  // Exit the effect when the timer reaches 0
  if (seconds === 0) return;

  // Create an interval to decrement the time every second
  const timerInterval = setInterval(() => {
    setSeconds(prevTime => prevTime - 1);
  }, 1000);

  // Clean up the interval when the component unmounts
  return () => {
    clearInterval(timerInterval);
  };
}, [seconds]); 
  // Remove auto-join effect since we now join manually


  useEffect(() => {
    socket.on('message', (message) => {
     
      toast(`${message} joined`,{
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
        });


    });
    return ()=>{
      socket.off('message')
    }
  }, []);

// useEffect(()=>{


//   const intervalId = setInterval(() => {
//     setSeconds((prevSeconds) => prevSeconds - 1);
//   }, 1000);
//   setSeconds(initialDuration)

// },[question])
  

  useEffect(() => {
    socket.on('newQuestion', (data) => {
      setQuestion(data.question);
      setOptions(data.answers);
      setAnswered(false);
      setSeconds(data.timer)
      setSelectedAnswerIndex();
      // Keep chat history; no reset on new question

  
    });

    socket.on('answerResult', (data) => {
      if (data.isCorrect) {
        
        toast(`Correct! ${data.playerName} got it right.`, {
          position: "bottom-center",
          autoClose: 2000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
          });
      } 
      setScores(data.scores);

      // else {
        // setResult(`Incorrect. The correct answer was: ${data.answers[data.correctAnswer]}`);
      // }

    });

    socket.on('gameOver', (data)=>{
      setWinner(data.winner);
    });

    socket.on('participantList', (data) => {
      setParticipants(data.participants);
      setParticipantCount(data.count);
      setIsHost(data.isYouHost);
    });

    socket.on('gameStarting', () => {
      setIsCountingDown(true);
      setCountdown(5);
      setGameStarted(true);
    });

    // Chat message listener
    socket.on('chatMessage', (payload) => {
      setChatMessages((prev) => [...prev, payload]);
    });

    // Escape game start listener (sync across room)
    socket.on('escapeStarted', () => {
      setEscapeStarted(true);
    });

    return () => {
      socket.off('newQuestion');
      socket.off('answerResult');
      socket.off('gameOver');
      socket.off('participantList');
      socket.off('gameStarting');
      socket.off('escapeStarted');
      socket.off('chatMessage');
    };
  }, []);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleAnswer = (answerIndex) => {
    if (!answered) {
      
      
      
      setSelectedAnswerIndex(answerIndex);

      socket.emit('submitAnswer', room, answerIndex);
      setAnswered(true);
    }
  };

  // Chat handlers
  const sendChat = () => {
    const text = (chatInput || '').trim();
    if (!text || !room || !name) return;
    const payload = { room, name, text, ts: Date.now(), type: 'text' };
    socket.emit('chatMessage', payload);
    setChatInput('');
  };

  const sendPreset = (text) => {
    if (!room || !name) return;
    const payload = { room, name, text, ts: Date.now(), type: 'preset' };
    socket.emit('chatMessage', payload);
  };

  const sendEmoji = (evt, emoji) => {
    // Create a burst of local floating emojis from the clicked button position
    const rect = evt.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const baseX = (cx / vw) * 100; // percentage
    const baseY = (cy / vh) * 100; // percentage

    const count = 6 + Math.floor(Math.random() * 4); // 6-9
    const items = [];
    for (let i = 0; i < count; i++) {
      const id = `${Date.now()}-${Math.random()}-${i}`;
      const jitterX = (Math.random() - 0.5) * 12; // -6% to +6%
      const jitterY = (Math.random() - 0.5) * 4;  // small y jitter
      const size = 20 + Math.random() * 18; // 20-38px
      const duration = 1100 + Math.floor(Math.random() * 800); // 1.1s - 1.9s
      items.push({ id, emoji, x: baseX + jitterX, y: baseY + jitterY, size, duration });
      // schedule removal
      setTimeout(() => {
        setFloatEmojis((prev) => prev.filter((e) => e.id !== id));
      }, duration + 150);
    }
    setFloatEmojis((prev) => [...prev, ...items]);
  };

    if(winner){
      return (
        <div className="winner-display">
          <h1>🏆 WINNER IS {winner.toUpperCase()} 🏆</h1>
        </div>
      )
    }

  return (
    <div className="App">
      {!info && (
        <>
          <div className="space-background"></div>
          <div className="floating-char">⚡</div>
          <div className="floating-char">🚀</div>
          <div className="floating-char">⭐</div>
          <div className="floating-char">🌟</div>
          <div className="floating-char">💫</div>
          <div className="floating-char">✨</div>
        </>
      )}
      {!info && !isCountingDown ? (
        <div className='join-div'>
          <h1>QuizClash 💡</h1>
          <form onSubmit={handleSubmit}>
     <input required placeholder='Enter your name' value={name} onChange={(e)=>setName(e.target.value)}/>
     <input required placeholder='Enter room no' value={room} onChange={(e)=>setRoom(e.target.value)} />
     <button type='submit' className='join-btn'>JOIN</button>
     </form>
     
     {room && (
       <div className='participants-section'>
         <h3>Players in Room {room} ({participantCount})</h3>
         {participantCount > 0 ? (
           <div className='participants-list'>
             {participants.map((participant, index) => (
               <div key={index} className='participant-item'>
                 {participant.isHost ? '👑' : '👤'} {participant.name}
               </div>
             ))}
           </div>
         ) : (
           <div className='no-participants'>
             <p>No players yet. Enter room number to see participants.</p>
           </div>
         )}
       </div>
     )}
     </div>
      ) : isCountingDown ? (
        <div className='countdown-container'>
          <div className='countdown-display'>
            <h1>Get Ready!</h1>
            <div className='countdown-number'>{countdown}</div>
            <p>Quiz starting in...</p>
          </div>
        </div>
      ) : (
        <div>
          <h1>QuizClash 💡</h1>
          <p className='room-id'>Room Id: {room}</p>
          <ToastContainer />
          
          {/* Show participant list and start button for host */}
          {!question && (
            <div className='lobby-section'>
              <div className='participants-section'>
                <h3>Players in Room {room} ({participantCount})</h3>
                {participantCount > 0 ? (
                  <div className='participants-list'>
                    {participants.map((participant, index) => (
                      <div key={index} className='participant-item'>
                        {participant.isHost ? '👑' : '👤'} {participant.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='no-participants'>
                    <p>Waiting for players to join...</p>
                  </div>
                )}
              </div>
              
              {participantCount > 0 && (
                <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
                  <button onClick={handleStartGame} className='start-game-btn'>
                    🔥 CHALLENGE YOUR FRIENDS
                  </button>
                  <button onClick={handleStartEscape} className='start-game-btn'>
                    🕯️ START TREASURE HUNT
                  </button>
                </div>
              )}
            </div>
          )}
        
          {question ? (
            <div className='quiz-div'>
              <div className='quiz-layout'>
                <div className='quiz-left'>
                  <div className={`timer-display ${seconds <= 5 ? 'timer-urgent' : ''}`}>
                    ⏰ TIME: {seconds}s
                  </div>
                  <div className='question'>
                    <p className='question-text'>{question}</p>
                  </div>
                  <ul>
                    {options.map((answer, index) => (
                      <li key={index}>
                        <button className={`options ${selectedAnswerIndex === index ? 'selected' : ''}`}
                          onClick={() => handleAnswer(index)} disabled={answered}>
                          {answer}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {scores.map((player, index) => (
                    <p key={index}>{player.name}: {player.score}</p>
                  ))}
                </div>
                <div className='quiz-right'>
                  {/* Chat panel on the right */}
                  <div className='chat-panel'>
                    {/* Emoji row above Live Chat */}
                    <div className='chat-emojis' style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 8}}>
                      {emojiList.map((e, idx) => (
                        <button key={idx} onClick={(ev) => sendEmoji(ev, e)} className='emoji-btn' style={{padding: '6px 8px', borderRadius: 10}}>{e}</button>
                      ))}
                    </div>
                    {/* Preset quick messages */}
                    <div className='chat-presets' style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
                      {gamifyPresets.map((p, idx) => (
                        <button key={idx} onClick={() => sendPreset(p)} className='preset-btn' style={{padding: '6px 10px', borderRadius: 20}}>{p}</button>
                      ))}
                    </div>
                    <h3>Live Chat</h3>
                    <div
                      ref={chatBoxRef}
                      className='chat-messages'
                      id='chat-messages'
                      style={{maxHeight: '180px', overflowY: 'auto', border: '1px solid #333', borderRadius: 8, padding: 8, background: '#0d0d14'}}
                    >
                      {chatMessages.length === 0 ? (
                        <div className='chat-empty'>No messages yet. Say hi! 👋</div>
                      ) : (
                        chatMessages.map((m, i) => (
                          <div
                            key={i}
                            className='chat-message'
                            style={{
                              display: 'flex',
                              gap: 6,
                              margin: '4px 0',
                              background: m.name === name ? '#1f2540' : '#14192e',
                              border: '1px solid #2a335a',
                              padding: '6px 8px',
                              borderRadius: 8
                            }}
                          >
                            <span className='chat-name' style={{fontWeight: '700', color: '#9ab1ff'}}>
                              {m.name}
                            </span>
                            <span className='chat-sep'>:</span>
                            <span className='chat-text' style={{whiteSpace: 'pre-wrap'}}>
                              {m.text}
                              {m.type === 'preset' && <span style={{marginLeft: 6, opacity: 0.7, fontSize: 12}}>(preset)</span>}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className='chat-input-row' style={{display: 'flex', gap: 8, marginTop: 8}}>
                      <input
                        type='text'
                        placeholder='Type a message...'
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                        className='chat-input'
                        style={{flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #444', background: '#141420', color: '#eee'}}
                      />
                      <button onClick={sendChat} className='chat-send-btn' style={{padding: '10px 14px', borderRadius: 8}}>Send</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="loading-text">Loading question...</p>
          )}

          {/* Treasure Hunt opens in a new page at /escape */}
        </div>
      )}
      {/* Floating emoji overlay */}
      <div className='emoji-float-overlay'>
        {floatEmojis.map((e) => (
          <div
            key={e.id}
            className='emoji-float'
            style={{ left: `${e.x}%`, top: `${e.y}%`, fontSize: e.size ? `${e.size}px` : undefined, animationDuration: e.duration ? `${e.duration}ms` : undefined }}
          >
            {e.emoji}
          </div>
        ))}
      </div>
    </div>
    
  );
}

export default App;


