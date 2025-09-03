const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Middleware de autenticação
router.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Criar ou buscar chat individual
router.post('/individual', async (req, res) => {
  try {
    const { participantId } = req.body;

    // Verificar se já existe chat entre os usuários
    const { data: existingChat } = await supabase
      .from('chat_participants')
      .select(`
        chat_id,
        chats!inner(*)
      `)
      .eq('user_id', req.user.userId)
      .eq('chats.type', 'individual');

    if (existingChat.length > 0) {
      for (const participant of existingChat) {
        const { data: otherParticipant } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('chat_id', participant.chat_id)
          .eq('user_id', participantId);

        if (otherParticipant.length > 0) {
          return res.json(participant.chats);
        }
      }
    }

    // Criar novo chat
    const chatId = uuidv4();
    
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert([
        {
          id: chatId,
          type: 'individual',
          created_by: req.user.userId,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (chatError) {
      return res.status(400).json({ error: chatError.message });
    }

    // Adicionar participantes
    const { error: participantsError } = await supabase
      .from('chat_participants')
      .insert([
        {
          chat_id: chatId,
          user_id: req.user.userId,
          joined_at: new Date().toISOString()
        },
        {
          chat_id: chatId,
          user_id: participantId,
          joined_at: new Date().toISOString()
        }
      ]);

    if (participantsError) {
      return res.status(400).json({ error: participantsError.message });
    }

    res.status(201).json(newChat);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar chat' });
  }
});

// Criar grupo
router.post('/group', async (req, res) => {
  try {
    const { name, description, avatar, participantIds } = req.body;

    const chatId = uuidv4();

    // Criar chat de grupo
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert([
        {
          id: chatId,
          type: 'group',
          name,
          description,
          avatar,
          created_by: req.user.userId,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (chatError) {
      return res.status(400).json({ error: chatError.message });
    }

    // Adicionar criador como administrador
    const participants = [
      {
        chat_id: chatId,
        user_id: req.user.userId,
        role: 'admin',
        joined_at: new Date().toISOString()
      }
    ];

    // Adicionar outros participantes
    participantIds.forEach(participantId => {
      participants.push({
        chat_id: chatId,
        user_id: participantId,
        role: 'member',
        joined_at: new Date().toISOString()
      });
    });

    const { error: participantsError } = await supabase
      .from('chat_participants')
      .insert(participants);

    if (participantsError) {
      return res.status(400).json({ error: participantsError.message });
    }

    res.status(201).json(newChat);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

// Listar chats do usuário
router.get('/', async (req, res) => {
  try {
    const { data: userChats, error } = await supabase
      .from('chat_participants')
      .select(`
        chat_id,
        role,
        joined_at,
        chats!inner(
          id,
          type,
          name,
          description,
          avatar,
          created_by,
          created_at,
          last_message_at
        )
      `)
      .eq('user_id', req.user.userId)
      .order('chats(last_message_at)', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Para chats individuais, buscar informações do outro participante
    const chats = [];
    
    for (const userChat of userChats) {
      const chat = userChat.chats;
      
      if (chat.type === 'individual') {
        // Buscar o outro participante
        const { data: otherParticipant } = await supabase
          .from('chat_participants')
          .select(`
            users!inner(
              id,
              name,
              virtual_number,
              avatar,
              status,
              is_online,
              last_seen
            )
          `)
          .eq('chat_id', chat.id)
          .neq('user_id', req.user.userId)
          .single();

        if (otherParticipant) {
          chat.participant = otherParticipant.users;
        }
      } else if (chat.type === 'group') {
        // Para grupos, buscar número de participantes
        const { data: participantsCount } = await supabase
          .from('chat_participants')
          .select('user_id', { count: 'exact' })
          .eq('chat_id', chat.id);

        chat.participants_count = participantsCount?.length || 0;
      }

      // Buscar última mensagem
      const { data: lastMessage } = await supabase
        .from('messages')
        .select('content, message_type, sent_at, sender_id')
        .eq('chat_id', chat.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      chat.last_message = lastMessage;
      chats.push({ ...userChat, chats: chat });
    }

    res.json(chats);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar chats' });
  }
});

// Buscar detalhes do chat
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;

    // Verificar se usuário faz parte do chat
    const { data: participation } = await supabase
      .from('chat_participants')
      .select('role')
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId)
      .single();

    if (!participation) {
      return res.status(403).json({ error: 'Você não tem acesso a este chat' });
    }

    // Buscar detalhes do chat
    const { data: chat, error } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Buscar participantes
    const { data: participants } = await supabase
      .from('chat_participants')
      .select(`
        role,
        joined_at,
        users!inner(
          id,
          name,
          virtual_number,
          avatar,
          status,
          is_online,
          last_seen
        )
      `)
      .eq('chat_id', chatId);

    chat.participants = participants;
    chat.user_role = participation.role;

    res.json(chat);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar chat' });
  }
});

// Adicionar participante ao grupo
router.post('/:chatId/participants', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { participantId } = req.body;

    // Verificar se usuário é admin do grupo
    const { data: participation } = await supabase
      .from('chat_participants')
      .select('role')
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId)
      .single();

    if (!participation || participation.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem adicionar participantes' });
    }

    // Adicionar participante
    const { data: newParticipant, error } = await supabase
      .from('chat_participants')
      .insert([
        {
          chat_id: chatId,
          user_id: participantId,
          role: 'member',
          joined_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(newParticipant);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar participante' });
  }
});

// Remover participante do grupo
router.delete('/:chatId/participants/:participantId', async (req, res) => {
  try {
    const { chatId, participantId } = req.params;

    // Verificar se usuário é admin do grupo
    const { data: participation } = await supabase
      .from('chat_participants')
      .select('role')
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId)
      .single();

    if (!participation || participation.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem remover participantes' });
    }

    // Remover participante
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chatId)
      .eq('user_id', participantId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Participante removido com sucesso' });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover participante' });
  }
});

// Sair do grupo
router.post('/:chatId/leave', async (req, res) => {
  try {
    const { chatId } = req.params;

    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Você saiu do grupo com sucesso' });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao sair do grupo' });
  }
});

module.exports = router;