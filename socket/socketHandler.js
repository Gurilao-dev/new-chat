const jwt = require('jsonwebtoken');

module.exports = (io, supabase) => {
  // Middleware de autenticação para Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Token de acesso requerido'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Buscar dados do usuário
      const { data: user } = await supabase
        .from('users')
        .select('id, name, virtual_number, avatar, status')
        .eq('id', decoded.userId)
        .single();

      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      socket.userId = user.id;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`👤 Usuário conectado: ${socket.user.name}`);

    // Atualizar status online
    await supabase
      .from('users')
      .update({ 
        is_online: true, 
        last_seen: new Date().toISOString() 
      })
      .eq('id', socket.userId);

    // Entrar nos chats do usuário
    const { data: userChats } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', socket.userId);

    userChats?.forEach(chat => {
      socket.join(chat.chat_id);
    });

    // Notificar contatos que usuário ficou online
    socket.broadcast.emit('user-online', {
      userId: socket.userId,
      user: socket.user
    });

    // Eventos de mensagem
    socket.on('send-message', async (data) => {
      try {
        const { chatId, content, messageType = 'text', replyToId = null } = data;

        // Verificar participação no chat
        const { data: participation } = await supabase
          .from('chat_participants')
          .select('id')
          .eq('chat_id', chatId)
          .eq('user_id', socket.userId)
          .single();

        if (!participation) {
          socket.emit('error', { message: 'Você não tem acesso a este chat' });
          return;
        }

        const messageId = require('uuid').v4();

        // Salvar mensagem no banco
        const { data: newMessage, error } = await supabase
          .from('messages')
          .insert([
            {
              id: messageId,
              chat_id: chatId,
              sender_id: socket.userId,
              content,
              message_type: messageType,
              reply_to_id: replyToId,
              sent_at: new Date().toISOString()
            }
          ])
          .select(`
            *,
            sender:users!messages_sender_id_fkey(
              id,
              name,
              avatar
            ),
            reply_to:messages!messages_reply_to_id_fkey(
              id,
              content,
              message_type,
              sender:users!messages_sender_id_fkey(name)
            )
          `)
          .single();

        if (error) {
          socket.emit('error', { message: 'Erro ao enviar mensagem' });
          return;
        }

        // Atualizar última mensagem do chat
        await supabase
          .from('chats')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', chatId);

        // Emitir mensagem para todos no chat
        io.to(chatId).emit('new-message', newMessage);

      } catch (error) {
        socket.emit('error', { message: 'Erro ao processar mensagem' });
      }
    });

    // Digitando
    socket.on('typing', (data) => {
      socket.to(data.chatId).emit('user-typing', {
        userId: socket.userId,
        userName: socket.user.name,
        chatId: data.chatId
      });
    });

    socket.on('stop-typing', (data) => {
      socket.to(data.chatId).emit('user-stop-typing', {
        userId: socket.userId,
        chatId: data.chatId
      });
    });

    // Chamadas WebRTC
    socket.on('call-user', (data) => {
      socket.to(data.chatId).emit('incoming-call', {
        from: socket.userId,
        fromUser: socket.user,
        callType: data.callType,
        chatId: data.chatId,
        offer: data.offer
      });
    });

    socket.on('accept-call', (data) => {
      socket.to(data.chatId).emit('call-accepted', {
        from: socket.userId,
        answer: data.answer
      });
    });

    socket.on('reject-call', (data) => {
      socket.to(data.chatId).emit('call-rejected', {
        from: socket.userId
      });
    });

    socket.on('ice-candidate', (data) => {
      socket.to(data.chatId).emit('ice-candidate', {
        from: socket.userId,
        candidate: data.candidate
      });
    });

    socket.on('end-call', (data) => {
      socket.to(data.chatId).emit('call-ended', {
        from: socket.userId
      });
    });

    // Marcar mensagens como lidas
    socket.on('mark-as-read', async (data) => {
      try {
        const { messageIds, chatId } = data;

        const readReceipts = messageIds.map(messageId => ({
          message_id: messageId,
          user_id: socket.userId,
          read_at: new Date().toISOString()
        }));

        await supabase
          .from('message_read_receipts')
          .upsert(readReceipts);

        socket.to(chatId).emit('messages-read', {
          userId: socket.userId,
          messageIds,
          readAt: new Date().toISOString()
        });

      } catch (error) {
        socket.emit('error', { message: 'Erro ao marcar mensagens como lidas' });
      }
    });

    // Desconexão
    socket.on('disconnect', async () => {
      console.log(`👋 Usuário desconectado: ${socket.user.name}`);

      // Atualizar status offline
      await supabase
        .from('users')
        .update({ 
          is_online: false, 
          last_seen: new Date().toISOString() 
        })
        .eq('id', socket.userId);

      // Notificar que usuário ficou offline
      socket.broadcast.emit('user-offline', {
        userId: socket.userId,
        lastSeen: new Date().toISOString()
      });
    });
  });
};