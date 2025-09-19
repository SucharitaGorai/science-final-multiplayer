import io from 'socket.io-client';

// Use env variable for backend URL in production; fallback to localhost for dev
const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000');

export default socket;
