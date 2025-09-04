const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const FirestoreMessage = require('../models/FirestoreMessage');
const FirestoreChat = require('../models/FirestoreChat');
const FirestoreUser = require('../models/FirestoreUser');

const router = express.Router();

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt|mp3|wav|ogg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// Middleware de autenticação
router.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Enviar mensagem
router.post('/send', async (req, res) => {
  try {
    const { 
      chatId, 
      content, 
      messageType = 'text', 
      replyToId = null,
      isForwarded = false,
      forwardedFrom = null
    } = req.body;

    // Verificar se o chat existe e o usuário é participante
    const chat = await FirestoreChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Criar mensagem
    const newMessage = await FirestoreMessage.create({
      chat: chatId,
      sender: req.user.userId,
      content,
      message_type: messageType,
      reply_to: replyToId,
      is_forwarded: isForwarded,
      forwarded_from: forwardedFrom
    });

    // Atualizar última mensagem do chat
    await FirestoreChat.updateLastMessage(chatId, newMessage.id);

    // Buscar dados do remetente
    const sender = await FirestoreUser.findById(req.user.userId);
    const { password, ...senderWithoutPassword } = sender;

    // Buscar mensagem de resposta se existir
    let replyToMessage = null;
    if (replyToId) {
      replyToMessage = await FirestoreMessage.findById(replyToId);
    }

    res.status(201).json({
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
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Obter mensagens de um chat
router.get('/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const lastMessageId = req.query.lastMessageId || null;

    // Verificar se o chat existe e o usuário é participante
    const chat = await FirestoreChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Buscar mensagens
    const messages = await FirestoreMessage.findByChatId(chatId, limit, lastMessageId);

    const formattedMessages = [];

    for (const message of messages) {
      // Verificar se a mensagem foi deletada para este usuário
      if (message.deleted_for.includes(req.user.userId)) {
        continue;
      }

      // Buscar dados do remetente
      const sender = await FirestoreUser.findById(message.sender);
      const { password, ...senderWithoutPassword } = sender;

      // Buscar mensagem de resposta se existir
      let replyToMessage = null;
      if (message.reply_to) {
        replyToMessage = await FirestoreMessage.findById(message.reply_to);
      }

      formattedMessages.push({
        id: message.id,
        chat_id: message.chat,
        sender: senderWithoutPassword,
        content: message.content,
        message_type: message.message_type,
        reply_to: replyToMessage,
        reactions: message.reactions,
        is_starred: message.is_starred,
        is_forwarded: message.is_forwarded,
        forwarded_from: message.forwarded_from,
        read_by: message.read_by,
        delivered_to: message.delivered_to,
        is_deleted: message.is_deleted,
        is_edited: message.is_edited,
        edit_history: message.edit_history,
        status: message.status,
        created_at: message.created_at,
        updated_at: message.updated_at
      });
    }

    res.json({
      messages: formattedMessages,
      limit,
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Marcar mensagem como lida
router.post('/read/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é participante do chat
    const chat = await FirestoreChat.findById(message.chat);
    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Marcar como lida
    await FirestoreMessage.markAsRead(messageId, req.user.userId);

    res.json({ message: 'Mensagem marcada como lida' });
  } catch (error) {
    console.error('Erro ao marcar mensagem como lida:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagem como lida' });
  }
});

// Marcar mensagem como entregue
router.post('/delivered/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é participante do chat
    const chat = await FirestoreChat.findById(message.chat);
    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Marcar como entregue
    await FirestoreMessage.markAsDelivered(messageId, req.user.userId);

    res.json({ message: 'Mensagem marcada como entregue' });
  } catch (error) {
    console.error('Erro ao marcar mensagem como entregue:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagem como entregue' });
  }
});

// Adicionar reação à mensagem
router.post('/:messageId/reaction', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é participante do chat
    const chat = await FirestoreChat.findById(message.chat);
    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Adicionar reação
    await FirestoreMessage.addReaction(messageId, req.user.userId, emoji);

    res.json({ message: 'Reação adicionada com sucesso' });
  } catch (error) {
    console.error('Erro ao adicionar reação:', error);
    res.status(500).json({ error: 'Erro ao adicionar reação' });
  }
});

// Remover reação da mensagem
router.delete('/:messageId/reaction', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é participante do chat
    const chat = await FirestoreChat.findById(message.chat);
    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Remover reação
    await FirestoreMessage.removeReaction(messageId, req.user.userId);

    res.json({ message: 'Reação removida com sucesso' });
  } catch (error) {
    console.error('Erro ao remover reação:', error);
    res.status(500).json({ error: 'Erro ao remover reação' });
  }
});

// Marcar/desmarcar mensagem como favorita
router.post('/:messageId/star', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é participante do chat
    const chat = await FirestoreChat.findById(message.chat);
    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Você não é participante deste chat' });
    }

    // Marcar/desmarcar como favorita
    await FirestoreMessage.toggleStar(messageId, req.user.userId);

    res.json({ message: 'Status de favorita alterado com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar status de favorita:', error);
    res.status(500).json({ error: 'Erro ao alterar status de favorita' });
  }
});

// Editar mensagem
router.put('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Editar mensagem
    const updatedMessage = await FirestoreMessage.edit(messageId, content, req.user.userId);

    res.json({
      id: updatedMessage.id,
      content: updatedMessage.content,
      is_edited: updatedMessage.is_edited,
      edit_history: updatedMessage.edit_history,
      updated_at: updatedMessage.updated_at
    });
  } catch (error) {
    console.error('Erro ao editar mensagem:', error);
    res.status(500).json({ error: 'Erro ao editar mensagem' });
  }
});

// Deletar mensagem
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteForEveryone = false } = req.body;

    const message = await FirestoreMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // Deletar mensagem
    await FirestoreMessage.delete(messageId, req.user.userId, deleteForEveryone);

    res.json({ message: 'Mensagem deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar mensagem:', error);
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
});

// Buscar mensagens favoritas
router.get('/starred', async (req, res) => {
  try {
    const starredMessages = await FirestoreMessage.findStarredByUser(req.user.userId);

    const formattedMessages = [];

    for (const message of starredMessages) {
      // Buscar dados do remetente
      const sender = await FirestoreUser.findById(message.sender);
      const { password, ...senderWithoutPassword } = sender;

      // Buscar dados do chat
      const chat = await FirestoreChat.findById(message.chat);

      formattedMessages.push({
        id: message.id,
        chat: {
          id: chat.id,
          name: chat.name,
          type: chat.type
        },
        sender: senderWithoutPassword,
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at
      });
    }

    res.json(formattedMessages);
  } catch (error) {
    console.error('Erro ao buscar mensagens favoritas:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens favoritas' });
  }
});

// Upload de mídia
router.post('/upload', upload.single('media'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      url: fileUrl,
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro no upload do arquivo' });
  }
});

module.exports = router;

