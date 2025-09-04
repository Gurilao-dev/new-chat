const jwt = require('jsonwebtoken');
const FirestoreUser = require('../models/FirestoreUser');
const FirestoreChat = require('../models/FirestoreChat');
const FirestoreMessage = require('../models/FirestoreMessage');

module.exports = (io) => {
  // Middleware de autenticação para Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Token de acesso requerido'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      
      // Buscar dados do usuário
      const user = await FirestoreUser.findById(decoded.userId);

      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      socket.userId = user.id;
      socket.user = {
        id: user.id,
        name: user.name,
        virtual_number: user.virtual_number,
        avatar: user.avatar,
        status: user.status
      };
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`👤 Usuário conectado: ${socket.user.name} (${socket.userId})`);

    // Atualizar status online
    try {
      await FirestoreUser.updateOnlineStatus(socket.userId, true);

      // Notificar contatos sobre status online
      socket.broadcast.emit('user-online', {
        userId: socket.userId,
        user: socket.user
      });
    } catch (error) {
      console.error('Erro ao atualizar status online:', error);
    }

    // Entrar nas salas dos chats do usuário
    try {
      const userChats = await FirestoreChat.findByUser(socket.userId);

      userChats.forEach(chat => {
        socket.join(chat.id);
      });
    } catch (error) {
      console.error('Erro ao entrar nas salas:', error);
    }

    // Enviar mensagem
    socket.on('send-message', async (data) => {
      try {
        const { 
          chatId, 
          content, 
          messageType = 'text', 
          replyToId = null,
          isForwarded = false,
          forwardedFrom = null
        } = data;

        // Verificar se o chat existe e o usuário é participante
        const chat = await FirestoreChat.findById(chatId);
        if (!chat) {
          socket.emit('error', { message: 'Chat não encontrado' });
          return;
        }

        const isParticipant = chat.participants.some(p => p.user === socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Criar mensagem
        const newMessage = await FirestoreMessage.create({
          chat: chatId,
          sender: socket.userId,
          content,
          message_type: messageType,
          reply_to: replyToId,
          is_forwarded: isForwarded,
          forwarded_from: forwardedFrom
        });

        // Atualizar última mensagem do chat
        await FirestoreChat.updateLastMessage(chatId, newMessage.id);

        // Buscar dados do remetente
        const sender = await FirestoreUser.findById(socket.userId);
        const { password, ...senderWithoutPassword } = sender;

        // Buscar mensagem de resposta se existir
        let replyToMessage = null;
        if (replyToId) {
          replyToMessage = await FirestoreMessage.findById(replyToId);
        }

        const formattedMessage = {
          id: newMessage.id,
          chat_id: newMessage.chat,
          sender: senderWithoutPassword,
          content: newMessage.content,
          message_type: newMessage.message_type,
          reply_to: replyToMessage,
          reactions: newMessage.reactions,
          is_starred: newMessage.is_starred,
          is_forwarded: newMessage.is_forwarded,
          forwarded_from: newMessage.forwarded_from,
          read_by: newMessage.read_by,
          delivered_to: newMessage.delivered_to,
          is_deleted: newMessage.is_deleted,
          status: newMessage.status,
          created_at: newMessage.created_at,
          updated_at: newMessage.updated_at
        };

        // Enviar mensagem para todos os participantes do chat
        io.to(chatId).emit('new-message', formattedMessage);

        // Marcar como entregue para outros participantes
        const otherParticipants = chat.participants.filter(p => p.user !== socket.userId);
        for (const participant of otherParticipants) {
          await FirestoreMessage.markAsDelivered(newMessage.id, participant.user);
        }

      } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        socket.emit('error', { message: 'Erro ao enviar mensagem' });
      }
    });

    // Indicador de digitação
    socket.on('typing', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user-typing', {
        chatId,
        userId: socket.userId,
        userName: socket.user.name
      });
    });

    socket.on('stop-typing', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user-stop-typing', {
        chatId,
        userId: socket.userId
      });
    });

    // Marcar mensagem como lida
    socket.on('mark-as-read', async (data) => {
      try {
        const { messageId } = data;

        const message = await FirestoreMessage.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Mensagem não encontrada' });
          return;
        }

        // Verificar se o usuário é participante do chat
        const chat = await FirestoreChat.findById(message.chat);
        const isParticipant = chat.participants.some(p => p.user === socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Marcar como lida
        await FirestoreMessage.markAsRead(messageId, socket.userId);

        // Notificar outros participantes
        socket.to(message.chat).emit('message-read', {
          messageId,
          userId: socket.userId,
          readAt: new Date()
        });

      } catch (error) {
        console.error('Erro ao marcar mensagem como lida:', error);
        socket.emit('error', { message: 'Erro ao marcar mensagem como lida' });
      }
    });

    // Adicionar reação
    socket.on('add-reaction', async (data) => {
      try {
        const { messageId, emoji } = data;

        const message = await FirestoreMessage.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Mensagem não encontrada' });
          return;
        }

        // Verificar se o usuário é participante do chat
        const chat = await FirestoreChat.findById(message.chat);
        const isParticipant = chat.participants.some(p => p.user === socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Adicionar reação
        await FirestoreMessage.addReaction(messageId, socket.userId, emoji);

        // Notificar outros participantes
        io.to(message.chat).emit('reaction-added', {
          messageId,
          userId: socket.userId,
          emoji,
          userName: socket.user.name
        });

      } catch (error) {
        console.error('Erro ao adicionar reação:', error);
        socket.emit('error', { message: 'Erro ao adicionar reação' });
      }
    });

    // Remover reação
    socket.on('remove-reaction', async (data) => {
      try {
        const { messageId } = data;

        const message = await FirestoreMessage.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Mensagem não encontrada' });
          return;
        }

        // Verificar se o usuário é participante do chat
        const chat = await FirestoreChat.findById(message.chat);
        const isParticipant = chat.participants.some(p => p.user === socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Você não é participante deste chat' });
          return;
        }

        // Remover reação
        await FirestoreMessage.removeReaction(messageId, socket.userId);

        // Notificar outros participantes
        io.to(message.chat).emit('reaction-removed', {
          messageId,
          userId: socket.userId
        });

      } catch (error) {
        console.error('Erro ao remover reação:', error);
        socket.emit('error', { message: 'Erro ao remover reação' });
      }
    });

    // Editar mensagem
    socket.on('edit-message', async (data) => {
      try {
        const { messageId, newContent } = data;

        const message = await FirestoreMessage.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Mensagem não encontrada' });
          return;
        }

        // Editar mensagem
        const updatedMessage = await FirestoreMessage.edit(messageId, newContent, socket.userId);

        // Notificar outros participantes
        io.to(message.chat).emit('message-edited', {
          messageId,
          newContent,
          isEdited: true,
          editedAt: new Date()
        });

      } catch (error) {
        console.error('Erro ao editar mensagem:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Deletar mensagem
    socket.on('delete-message', async (data) => {
      try {
        const { messageId, deleteForEveryone = false } = data;

        const message = await FirestoreMessage.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Mensagem não encontrada' });
          return;
        }

        // Deletar mensagem
        await FirestoreMessage.delete(messageId, socket.userId, deleteForEveryone);

        if (deleteForEveryone) {
          // Notificar todos os participantes
          io.to(message.chat).emit('message-deleted-for-everyone', {
            messageId
          });
        } else {
          // Notificar apenas o usuário
          socket.emit('message-deleted-for-me', {
            messageId
          });
        }

      } catch (error) {
        console.error('Erro ao deletar mensagem:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Chamadas WebRTC
    socket.on('call-user', (data) => {
      const { chatId, callType, offer } = data;
      socket.to(chatId).emit('incoming-call', {
        chatId,
        callType,
        offer,
        caller: socket.user
      });
    });

    socket.on('accept-call', (data) => {
      const { chatId, answer } = data;
      socket.to(chatId).emit('call-accepted', {
        chatId,
        answer,
        accepter: socket.user
      });
    });

    socket.on('reject-call', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('call-rejected', {
        chatId,
        rejector: socket.user
      });
    });

    socket.on('end-call', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('call-ended', {
        chatId,
        ender: socket.user
      });
    });

    socket.on('ice-candidate', (data) => {
      const { chatId, candidate } = data;
      socket.to(chatId).emit('ice-candidate', {
        chatId,
        candidate,
        sender: socket.user
      });
    });

    // Status de usuário (online/offline/digitando)
    socket.on('update-status', async (data) => {
      try {
        const { status } = data;
        
        await FirestoreUser.update(socket.userId, { status });
        
        // Notificar contatos sobre mudança de status
        socket.broadcast.emit('user-status-updated', {
          userId: socket.userId,
          status
        });
      } catch (error) {
        console.error('Erro ao atualizar status:', error);
      }
    });

    // Desconexão
    socket.on('disconnect', async () => {
      console.log(`👋 Usuário desconectado: ${socket.user.name} (${socket.userId})`);

      try {
        // Atualizar status offline
        await FirestoreUser.updateOnlineStatus(socket.userId, false);

        // Notificar contatos sobre status offline
        socket.broadcast.emit('user-offline', {
          userId: socket.userId,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Erro ao atualizar status offline:', error);
      }
    });
  });
};

