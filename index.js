const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const roomUsers = {};
mongoose.connect('mongodb://localhost:27017/chatApp')
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log('MongoDB connection error: ', error));

// Room Schema
const Room = mongoose.model('Room', new mongoose.Schema({
  name: String,
  users: [String],
}));

// Message Schema (Supports Text & Images)
const Message = mongoose.model('Message', new mongoose.Schema({
  roomName: String,
  userName: String,
  message: String,  
  imageUrl: String, // Stores image URL (if image is sent)
  timestamp: { type: Date, default: Date.now },
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Multer Config for Image Uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

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


    // Fetch chat history (Text + Images)
    const messages = await Message.find({ roomName }).sort({ timestamp: 1 });
    res.json({ message: 'User joined room', room, chatHistory: messages });
  } else {
    res.status(404).json({ message: 'Room not found' });
  }
});

// Image Upload API
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });

  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ message: 'Image uploaded', imageUrl });
});

// Delete Message API
app.delete('/delete-message/:messageId', async (req, res) => {
  const { messageId } = req.params;
  try {
    const message = await Message.findByIdAndDelete(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    io.to(message.roomName).emit('message-deleted', { messageId }); // Notify clients

    
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting message', error });
  }
});

let typingUsers = new Set();
// Socket.io Events
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join-room', async (data) => {
    const { roomName, userName } = data;
    socket.join(roomName);
    io.to(roomName).emit('joineduser', { userName, roomName });
    if (!roomUsers[roomName]) {
      roomUsers[roomName] = new Set();
    }
    roomUsers[roomName].add(userName);

    // Emit updated user count
    io.to(roomName).emit('room-user-count', { roomName, count: roomUsers[roomName].size });

    // Fetch previous messages (both text & images)
    const messages = await Message.find({ roomName }).sort({ timestamp: 1 });
    socket.emit('chat-history', messages);
    console.log(`${userName} joined room: ${roomName}`);
  });
  

  // Handle text & image messages
  socket.on('send-message', async (data) => {
    const { roomName, userName, message, imageUrl } = data;

    // Save message to MongoDB
    const newMessage = new Message({ roomName, userName, message, imageUrl ,timestamp: new Date()});
    await newMessage.save();

    // Fetch the saved message (with `_id`)
    const savedMessage = await Message.findById(newMessage._id);

    // Emit the complete message, including `_id`
    io.to(roomName).emit('message', savedMessage);
    
    console.log(`${userName} sent: ${message || '[Image]'} `);
});



  socket.on("typing", (username) => {
    typingUsers.add(username);
    io.emit("typing_users", Array.from(typingUsers));
});

socket.on("stopped_typing", (username) => {
  if (typingUsers.has(username)) {
      typingUsers.delete(username); // Remove user from Set
      io.emit("typing_users", Array.from(typingUsers)); // Send updated list
      console.log('users is list ${typingUsers}')
  }
});


  socket.on('disconnect', () => {
    typingUsers.clear();
    io.emit("typing_users", []);
    for (const room in roomUsers) {
      roomUsers[room].delete(socket.id);
      io.to(room).emit('room-user-count', { room, count: roomUsers[room].size });
    }
    console.log('User disconnected:', socket.id);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});
