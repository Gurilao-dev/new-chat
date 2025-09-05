const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const admin = require('firebase-admin');

// ---- Inicializar Firebase ----
function initializeFirebase() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(json) });
    console.log('🔥 Firebase Admin inicializado com FIREBASE_SERVICE_ACCOUNT_JSON');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const path = '/etc/secrets/GOOGLE_APPLICATION_CREDENTIALS';
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(json) });
    console.log('🔥 Firebase Admin inicializado com GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    throw new Error(
      'Credenciais Firebase não encontradas. Configure FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS no Render.'
    );
  }
}

initializeFirebase();
const db = admin.firestore();

// ---- Configuração do Express ----
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// ---- Rotas ----
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contacts');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);

// ---- Socket.io ----
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

// ---- Servidor ----
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || '*'}`);
  console.log('🔥 Firebase Firestore configurado');
});

// ---- Servir frontend de teste ----
app.use('/test', express.static('../frontend'));

module.exports = { db, admin };
