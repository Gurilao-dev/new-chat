const admin = require('firebase-admin');

// Configuração do Firebase Admin SDK
const firebaseConfig = {
  apiKey: "AIzaSyCZfELvY7UN7crnke7Dd5x8nIQbmn6eM2o",
  authDomain: "chat-msg-64e0b.firebaseapp.com",
  projectId: "chat-msg-64e0b",
  storageBucket: "chat-msg-64e0b.firebasestorage.app",
  messagingSenderId: "899098046795",
  appId: "1:899098046795:web:1b833d0a8b3ee132d438ce",
  measurementId: "G-X1BMJ4LCTW"
};

// Inicializar Firebase Admin SDK
let db;

const initializeFirebase = () => {
  try {
    // Verificar se já foi inicializado
    if (admin.apps.length === 0) {
      // Para produção, use service account key
      // Para desenvolvimento, use as credenciais padrão do ambiente
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: firebaseConfig.projectId
        });
      } else {
        // Para desenvolvimento local, você pode usar as credenciais padrão
        admin.initializeApp({
          projectId: firebaseConfig.projectId
        });
      }
    }

    db = admin.firestore();
    console.log('🔥 Firebase Admin SDK inicializado com sucesso');
    return db;
  } catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error.message);
    process.exit(1);
  }
};

const getFirestore = () => {
  if (!db) {
    return initializeFirebase();
  }
  return db;
};

module.exports = {
  initializeFirebase,
  getFirestore,
  admin
};

