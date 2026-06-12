import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { problems } from '../data/problems.js';


const app = express();
const port = 3001;


const httpServer = createServer(app);
const io = new Server(httpServer, {
   cors: {
    origin: `http://localhost:3000`, 
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });

  socket.on('createRoom', () => {
    const roomCode = crypto.randomUUID()
    .replace(/-/g, "")
    .substring(0, 6)
    .toUpperCase();


    if (rooms[roomCode]) {
      socket.emit('roomExists', roomCode);
    } else {
      rooms[roomCode] = { players: [] };
      socket.join(roomCode);
      rooms[roomCode].players.push(socket.id);
      socket.emit('roomCreated', roomCode);
    }
  });

  socket.on("join-room", (roomCode) => {
  const room = rooms[roomCode];

  if (!room) {
    socket.emit("error", "room not found");
    return;
  }

  if (room.players.length >= 2) {
    socket.emit("error", "room is full");
    return;
  }

  room.players.push(socket.id);

  socket.join(roomCode);
  const problem = problems[Math.floor(Math.random() * problems.length)];
  rooms[roomCode].problem = problem;

  io.to(roomCode).emit("room-ready", {
    roomCode,
    problem
  });
});
socket.on('code-update', (data) => {
  console.log('code-update received', data) 
  const { roomCode, code } = data;
  socket.to(roomCode).emit('code-update', code);

});
 socket.on('get-problem', (roomCode) => {
  const room = rooms[roomCode];
  if (room && room.problem) {
    socket.emit('problem', room.problem);
  }
});
});



httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

