const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/chatApp', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log('MongoDB connection error: ', error));

// Room Schema
const Room = mongoose.model('Room', new mongoose.Schema({
  name: String,
  users: [String],
}));

app.use(express.json());

// Create Room API
app.post('/create-room', async (req, res) => {
  const { roomName } = req.body;
  const room = new Room({ name: roomName, users: [] });
  await room.save();
  res.json({ message: 'Room created', room });
});

// Join Room API
app.post('/join-room', async (req, res) => {
  const { roomName, userName } = req.body;
  const room = await Room.findOne({ name: roomName });
  if (room) {
    room.users.push(userName);
    await room.save();
    res.json({ message: 'User joined room', room });
  } else {
    res.status(404).json({ message: 'Room not found' });
  }
});

// Socket.io events
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle room join event
  socket.on('join-room', (data) => {
    const { roomName, userName , } = data;
    socket.join(roomName);
    io.to(roomName).emit('message', `${userName} has joined the room.`);
    console.log(`${userName} joined room: ${roomName}`);
  });

  // Handle message sending
  socket.on('send-message', (data) => {
    const { roomName, userName, message } = data;
    io.to(roomName).emit('message',  { userName, message });
    console.log(`${userName} sent a message in room ${roomName}: `);
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server on port 3000
server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});
