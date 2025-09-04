const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const FirestoreChat = require('../models/FirestoreChat');
const FirestoreUser = require('../models/FirestoreUser');
const FirestoreMessage = require('../models/FirestoreMessage');

const router = express.Router();

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

// Criar chat individual
router.post('/individual', async (req, res) => {
  try {
    const { participantId } = req.body;

    // Verificar se já existe um chat entre os dois usuários
    const existingChat = await FirestoreChat.findIndividualChat(req.user.userId, participantId);

    if (existingChat) {
      // Buscar dados dos participantes
      const participants = [];
      for (const participant of existingChat.participants) {
        const user = await FirestoreUser.findById(participant.user);
        if (user) {
          const { password, ...userWithoutPassword } = user;
          participants.push({
            user: userWithoutPassword,
            role: participant.role,
            joined_at: participant.joined_at
          });
        }
      }

      return res.json({
        id: existingChat.id,
        type: existingChat.type,
        participants,
        created_at: existingChat.created_at,
        updated_at: existingChat.updated_at
      });
    }

    // Criar novo chat
    const newChat = await FirestoreChat.create({
      type: 'individual',
      participants: [
        { user: req.user.userId, role: 'member' },
        { user: participantId, role: 'member' }
      ]
    });

    // Buscar dados dos participantes
    const participants = [];
    for (const participant of newChat.participants) {
      const user = await FirestoreUser.findById(participant.user);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        participants.push({
          user: userWithoutPassword,
          role: participant.role,
          joined_at: participant.joined_at
        });
      }
    }

    res.status(201).json({
      id: newChat.id,
      type: newChat.type,
      participants,
      created_at: newChat.created_at,
      updated_at: newChat.updated_at
    });
  } catch (error) {
    console.error('Erro ao criar chat individual:', error);
    res.status(500).json({ error: 'Erro ao criar chat individual' });
  }
});

// Criar chat em grupo
router.post('/group', async (req, res) => {
  try {
    const { name, description, avatar, participantIds } = req.body;

    // Adicionar o criador como admin
    const participants = [
      { user: req.user.userId, role: 'admin' },
      ...participantIds.map(id => ({ user: id, role: 'member' }))
    ];

    const newChat = await FirestoreChat.create({
      name,
      description,
      type: 'group',
      participants,
      avatar
    });

    // Buscar dados dos participantes
    const participantsWithData = [];
    for (const participant of newChat.participants) {
      const user = await FirestoreUser.findById(participant.user);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        participantsWithData.push({
          user: userWithoutPassword,
          role: participant.role,
          joined_at: participant.joined_at
        });
      }
    }

    res.status(201).json({
      id: newChat.id,
      name: newChat.name,
      description: newChat.description,
      type: newChat.type,
      avatar: newChat.avatar,
      participants: participantsWithData,
      created_at: newChat.created_at,
      updated_at: newChat.updated_at
    });
  } catch (error) {
    console.error('Erro ao criar grupo:', error);
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// Listar chats do usuário
router.get('/', async (req, res) => {
  try {
    const chats = await FirestoreChat.findByUser(req.user.userId);

    const formattedChats = [];

    for (const chat of chats) {
      // Buscar dados dos participantes
      const participants = [];
      for (const participant of chat.participants) {
        const user = await FirestoreUser.findById(participant.user);
        if (user) {
          const { password, ...userWithoutPassword } = user;
          participants.push({
            user: userWithoutPassword,
            role: participant.role,
            joined_at: participant.joined_at
          });
        }
      }

      // Buscar última mensagem se existir
      let lastMessage = null;
      if (chat.last_message) {
        lastMessage = await FirestoreMessage.findById(chat.last_message);
      }

      formattedChats.push({
        id: chat.id,
        name: chat.name,
        description: chat.description,
        type: chat.type,
        avatar: chat.avatar,
        participants,
        last_message: lastMessage,
        created_at: chat.created_at,
        updated_at: chat.updated_at
      });
    }

    res.json(formattedChats);
  } catch (error) {
    console.error('Erro ao listar chats:', error);
    res.status(500).json({ error: 'Erro ao listar chats' });
  }
});

// Obter detalhes de um chat
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await FirestoreChat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    // Verificar se o usuário é participante
    const isParticipant = chat.participants.some(p => p.user === req.user.userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Buscar dados dos participantes
    const participants = [];
    for (const participant of chat.participants) {
      const user = await FirestoreUser.findById(participant.user);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        participants.push({
          user: userWithoutPassword,
          role: participant.role,
          joined_at: participant.joined_at
        });
      }
    }

    // Buscar última mensagem se existir
    let lastMessage = null;
    if (chat.last_message) {
      lastMessage = await FirestoreMessage.findById(chat.last_message);
    }

    res.json({
      id: chat.id,
      name: chat.name,
      description: chat.description,
      type: chat.type,
      avatar: chat.avatar,
      participants,
      last_message: lastMessage,
      created_at: chat.created_at,
      updated_at: chat.updated_at
    });
  } catch (error) {
    console.error('Erro ao obter chat:', error);
    res.status(500).json({ error: 'Erro ao obter chat' });
  }
});

// Adicionar participante ao grupo
router.post('/:chatId/participants', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { participantId } = req.body;

    const chat = await FirestoreChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível adicionar participantes em grupos' });
    }

    // Verificar se o usuário é admin
    const userParticipant = chat.participants.find(p => p.user === req.user.userId);
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem adicionar participantes' });
    }

    // Adicionar participante
    await FirestoreChat.addParticipant(chatId, participantId, 'member');

    res.json({ message: 'Participante adicionado com sucesso' });
  } catch (error) {
    console.error('Erro ao adicionar participante:', error);
    res.status(500).json({ error: 'Erro ao adicionar participante' });
  }
});

// Remover participante do grupo
router.delete('/:chatId/participants/:participantId', async (req, res) => {
  try {
    const { chatId, participantId } = req.params;

    const chat = await FirestoreChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível remover participantes de grupos' });
    }

    // Verificar se o usuário é admin
    const userParticipant = chat.participants.find(p => p.user === req.user.userId);
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem remover participantes' });
    }

    // Remover participante
    await FirestoreChat.removeParticipant(chatId, participantId);

    res.json({ message: 'Participante removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover participante:', error);
    res.status(500).json({ error: 'Erro ao remover participante' });
  }
});

// Sair do grupo
router.post('/:chatId/leave', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await FirestoreChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível sair de grupos' });
    }

    // Remover usuário dos participantes
    await FirestoreChat.removeParticipant(chatId, req.user.userId);

    res.json({ message: 'Você saiu do grupo' });
  } catch (error) {
    console.error('Erro ao sair do grupo:', error);
    res.status(500).json({ error: 'Erro ao sair do grupo' });
  }
});

// Atualizar informações do grupo
router.put('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name, description, avatar } = req.body;

    const chat = await FirestoreChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado' });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Só é possível atualizar informações de grupos' });
    }

    // Verificar se o usuário é admin
    const userParticipant = chat.participants.find(p => p.user === req.user.userId);
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem atualizar informações do grupo' });
    }

    // Atualizar chat
    const updatedChat = await FirestoreChat.update(chatId, {
      name,
      description,
      avatar
    });

    res.json({
      id: updatedChat.id,
      name: updatedChat.name,
      description: updatedChat.description,
      avatar: updatedChat.avatar,
      updated_at: updatedChat.updated_at
    });
  } catch (error) {
    console.error('Erro ao atualizar grupo:', error);
    res.status(500).json({ error: 'Erro ao atualizar grupo' });
  }
});

module.exports = router;

