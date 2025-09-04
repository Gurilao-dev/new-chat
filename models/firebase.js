// ... (código existente)

let db; // Declarar db aqui para ser acessível globalmente no módulo

const initializeFirebase = () => {
  try {
    if (admin.apps.length === 0) {
      // ... (sua lógica de inicialização existente)
      admin.initializeApp({
        // ... (suas credenciais)
      });
    }
    db = admin.firestore(); // Atribuir a instância do firestore a db
    console.log("🔥 Firebase Admin SDK inicializado com sucesso");
    return db;
  } catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error.message);
    process.exit(1);
  }
};

const getFirestore = () => {
  if (!db) { // Se db ainda não foi inicializado, chame initializeFirebase
    initializeFirebase();
  }
  return db;
};

module.exports = {
  initializeFirebase,
  getFirestore,
  admin,
  db // Exportar db diretamente após a inicialização
};
