const { getFirestore } = require('../config/firebase');

class FirestoreMessage {
  constructor() {
    this.db = getFirestore();
    this.collection = 'messages';
  }

  // Criar uma nova mensagem
  async create(messageData) {
    try {
      const { 
        chat, 
        sender, 
        content, 
        message_type = 'text', 
        reply_to = null,
        reactions = [],
        is_starred = false,
        is_forwarded = false,
        forwarded_from = null
      } = messageData;
      
      const message = {
        chat,
        sender,
        content,
        message_type, // 'text', 'image', 'audio', 'video', 'document', 'emoji', 'sticker', 'gif'
        reply_to,
        reactions, // Array de { user: userId, emoji: '👍', created_at: Date }
        is_starred,
        is_forwarded,
        forwarded_from,
        read_by: [], // Array de { user: userId, read_at: Date }
        delivered_to: [], // Array de { user: userId, delivered_at: Date }
        is_deleted: false,
        deleted_at: null,
        deleted_for: [], // Array de userIds que deletaram a mensagem para si
        edit_history: [], // Array de { content: string, edited_at: Date }
        is_edited: false,
        status: 'sent', // 'pending', 'sent', 'delivered', 'read'
        created_at: new Date(),
        updated_at: new Date()
      };

      const docRef = await this.db.collection(this.collection).add(message);
      return { id: docRef.id, ...message };
    } catch (error) {
      throw new Error(`Erro ao criar mensagem: ${error.message}`);
    }
  }

  // Buscar mensagem por ID
  async findById(id) {
    try {
      const doc = await this.db.collection(this.collection).doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar mensagem por ID: ${error.message}`);
    }
  }

  // Buscar mensagens de um chat
  async findByChatId(chatId, limit = 50, lastMessageId = null) {
    try {
      let query = this.db.collection(this.collection)
        .where('chat', '==', chatId)
        .where('is_deleted', '==', false)
        .orderBy('created_at', 'desc')
        .limit(limit);

      if (lastMessageId) {
        const lastDoc = await this.db.collection(this.collection).doc(lastMessageId).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const snapshot = await query.get();
      const messages = [];
      
      snapshot.forEach(doc => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      
      return messages.reverse(); // Retornar em ordem cronológica
    } catch (error) {
      throw new Error(`Erro ao buscar mensagens do chat: ${error.message}`);
    }
  }

  // Atualizar mensagem
  async update(id, updateData) {
    try {
      const updateObj = {
        ...updateData,
        updated_at: new Date()
      };
      
      await this.db.collection(this.collection).doc(id).update(updateObj);
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Erro ao atualizar mensagem: ${error.message}`);
    }
  }

  // Marcar mensagem como lida
  async markAsRead(messageId, userId) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      // Verificar se já foi marcada como lida por este usuário
      const alreadyRead = message.read_by.some(r => r.user === userId);
      if (alreadyRead) {
        return message;
      }

      const readEntry = {
        user: userId,
        read_at: new Date()
      };

      const updatedReadBy = [...message.read_by, readEntry];
      
      return await this.update(messageId, { 
        read_by: updatedReadBy,
        status: 'read'
      });
    } catch (error) {
      throw new Error(`Erro ao marcar mensagem como lida: ${error.message}`);
    }
  }

  // Marcar mensagem como entregue
  async markAsDelivered(messageId, userId) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      // Verificar se já foi marcada como entregue para este usuário
      const alreadyDelivered = message.delivered_to.some(d => d.user === userId);
      if (alreadyDelivered) {
        return message;
      }

      const deliveredEntry = {
        user: userId,
        delivered_at: new Date()
      };

      const updatedDeliveredTo = [...message.delivered_to, deliveredEntry];
      
      return await this.update(messageId, { 
        delivered_to: updatedDeliveredTo,
        status: 'delivered'
      });
    } catch (error) {
      throw new Error(`Erro ao marcar mensagem como entregue: ${error.message}`);
    }
  }

  // Adicionar reação à mensagem
  async addReaction(messageId, userId, emoji) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      // Remover reação anterior do mesmo usuário se existir
      const filteredReactions = message.reactions.filter(r => r.user !== userId);
      
      const newReaction = {
        user: userId,
        emoji,
        created_at: new Date()
      };

      const updatedReactions = [...filteredReactions, newReaction];
      
      return await this.update(messageId, { reactions: updatedReactions });
    } catch (error) {
      throw new Error(`Erro ao adicionar reação: ${error.message}`);
    }
  }

  // Remover reação da mensagem
  async removeReaction(messageId, userId) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      const updatedReactions = message.reactions.filter(r => r.user !== userId);
      
      return await this.update(messageId, { reactions: updatedReactions });
    } catch (error) {
      throw new Error(`Erro ao remover reação: ${error.message}`);
    }
  }

  // Marcar/desmarcar mensagem como favorita
  async toggleStar(messageId, userId) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      return await this.update(messageId, { is_starred: !message.is_starred });
    } catch (error) {
      throw new Error(`Erro ao marcar/desmarcar como favorita: ${error.message}`);
    }
  }

  // Editar mensagem
  async edit(messageId, newContent, userId) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      if (message.sender !== userId) {
        throw new Error('Apenas o remetente pode editar a mensagem');
      }

      const editEntry = {
        content: message.content,
        edited_at: new Date()
      };

      const updatedEditHistory = [...message.edit_history, editEntry];
      
      return await this.update(messageId, { 
        content: newContent,
        edit_history: updatedEditHistory,
        is_edited: true
      });
    } catch (error) {
      throw new Error(`Erro ao editar mensagem: ${error.message}`);
    }
  }

  // Deletar mensagem (para todos ou apenas para o usuário)
  async delete(messageId, userId, deleteForEveryone = false) {
    try {
      const message = await this.findById(messageId);
      if (!message) {
        throw new Error('Mensagem não encontrada');
      }

      if (deleteForEveryone) {
        // Verificar se o usuário é o remetente
        if (message.sender !== userId) {
          throw new Error('Apenas o remetente pode deletar para todos');
        }
        
        return await this.update(messageId, { 
          is_deleted: true,
          deleted_at: new Date()
        });
      } else {
        // Deletar apenas para o usuário
        const updatedDeletedFor = [...message.deleted_for, userId];
        return await this.update(messageId, { deleted_for: updatedDeletedFor });
      }
    } catch (error) {
      throw new Error(`Erro ao deletar mensagem: ${error.message}`);
    }
  }

  // Buscar mensagens favoritas de um usuário
  async findStarredByUser(userId) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('is_starred', '==', true)
        .where('is_deleted', '==', false)
        .orderBy('created_at', 'desc')
        .get();
      
      const messages = [];
      snapshot.forEach(doc => {
        const messageData = doc.data();
        // Verificar se a mensagem não foi deletada para este usuário
        if (!messageData.deleted_for.includes(userId)) {
          messages.push({ id: doc.id, ...messageData });
        }
      });
      
      return messages;
    } catch (error) {
      throw new Error(`Erro ao buscar mensagens favoritas: ${error.message}`);
    }
  }

  // Deletar mensagem permanentemente
  async permanentDelete(id) {
    try {
      await this.db.collection(this.collection).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Erro ao deletar mensagem permanentemente: ${error.message}`);
    }
  }
}

module.exports = new FirestoreMessage();

