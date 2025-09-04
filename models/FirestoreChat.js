const { getFirestore } = require('../config/firebase');

class FirestoreChat {
  constructor() {
    this.db = getFirestore();
    this.collection = 'chats';
  }

  // Criar um novo chat
  async create(chatData) {
    try {
      const { name, description, type, participants, avatar = null } = chatData;
      
      const chat = {
        name: name ? name.trim() : null,
        description: description ? description.trim() : null,
        type, // 'individual' ou 'group'
        participants: participants.map(p => ({
          user: p.user,
          role: p.role || 'member',
          joined_at: new Date()
        })),
        avatar,
        last_message: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      const docRef = await this.db.collection(this.collection).add(chat);
      return { id: docRef.id, ...chat };
    } catch (error) {
      throw new Error(`Erro ao criar chat: ${error.message}`);
    }
  }

  // Buscar chat por ID
  async findById(id) {
    try {
      const doc = await this.db.collection(this.collection).doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar chat por ID: ${error.message}`);
    }
  }

  // Buscar chats de um usuário
  async findByUser(userId) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('participants', 'array-contains-any', [
          { user: userId, role: 'admin' },
          { user: userId, role: 'member' }
        ])
        .where('is_active', '==', true)
        .orderBy('updated_at', 'desc')
        .get();
      
      const chats = [];
      snapshot.forEach(doc => {
        const chatData = doc.data();
        // Verificar se o usuário está realmente nos participantes
        const isParticipant = chatData.participants.some(p => p.user === userId);
        if (isParticipant) {
          chats.push({ id: doc.id, ...chatData });
        }
      });
      
      return chats;
    } catch (error) {
      // Fallback para busca sem orderBy se o índice não existir
      try {
        const snapshot = await this.db.collection(this.collection)
          .where('is_active', '==', true)
          .get();
        
        const chats = [];
        snapshot.forEach(doc => {
          const chatData = doc.data();
          const isParticipant = chatData.participants.some(p => p.user === userId);
          if (isParticipant) {
            chats.push({ id: doc.id, ...chatData });
          }
        });
        
        // Ordenar manualmente por updated_at
        chats.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        return chats;
      } catch (fallbackError) {
        throw new Error(`Erro ao buscar chats do usuário: ${fallbackError.message}`);
      }
    }
  }

  // Buscar chat individual entre dois usuários
  async findIndividualChat(user1Id, user2Id) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('type', '==', 'individual')
        .where('is_active', '==', true)
        .get();
      
      let chat = null;
      snapshot.forEach(doc => {
        const chatData = doc.data();
        const participantIds = chatData.participants.map(p => p.user);
        if (participantIds.includes(user1Id) && participantIds.includes(user2Id) && participantIds.length === 2) {
          chat = { id: doc.id, ...chatData };
        }
      });
      
      return chat;
    } catch (error) {
      throw new Error(`Erro ao buscar chat individual: ${error.message}`);
    }
  }

  // Atualizar chat
  async update(id, updateData) {
    try {
      const updateObj = {
        ...updateData,
        updated_at: new Date()
      };
      
      await this.db.collection(this.collection).doc(id).update(updateObj);
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Erro ao atualizar chat: ${error.message}`);
    }
  }

  // Adicionar participante ao chat
  async addParticipant(chatId, userId, role = 'member') {
    try {
      const chat = await this.findById(chatId);
      if (!chat) {
        throw new Error('Chat não encontrado');
      }

      // Verificar se o usuário já é participante
      const isAlreadyParticipant = chat.participants.some(p => p.user === userId);
      if (isAlreadyParticipant) {
        throw new Error('Usuário já é participante do chat');
      }

      const newParticipant = {
        user: userId,
        role,
        joined_at: new Date()
      };

      const updatedParticipants = [...chat.participants, newParticipant];
      
      await this.update(chatId, { participants: updatedParticipants });
      return true;
    } catch (error) {
      throw new Error(`Erro ao adicionar participante: ${error.message}`);
    }
  }

  // Remover participante do chat
  async removeParticipant(chatId, userId) {
    try {
      const chat = await this.findById(chatId);
      if (!chat) {
        throw new Error('Chat não encontrado');
      }

      const updatedParticipants = chat.participants.filter(p => p.user !== userId);
      
      await this.update(chatId, { participants: updatedParticipants });
      return true;
    } catch (error) {
      throw new Error(`Erro ao remover participante: ${error.message}`);
    }
  }

  // Atualizar última mensagem
  async updateLastMessage(chatId, messageId) {
    try {
      await this.update(chatId, { last_message: messageId });
      return true;
    } catch (error) {
      throw new Error(`Erro ao atualizar última mensagem: ${error.message}`);
    }
  }

  // Desativar chat (soft delete)
  async deactivate(id) {
    try {
      await this.update(id, { is_active: false });
      return true;
    } catch (error) {
      throw new Error(`Erro ao desativar chat: ${error.message}`);
    }
  }

  // Deletar chat permanentemente
  async delete(id) {
    try {
      await this.db.collection(this.collection).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Erro ao deletar chat: ${error.message}`);
    }
  }
}

module.exports = new FirestoreChat();
