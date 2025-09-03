const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Configurar multer para upload de arquivos
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

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

// Enviar mensagem
router.post('/send', async (req, res) => {
  try {
    const { chatId, content, messageType = 'text', replyToId = null } = req.body;

    // Verificar se usuário faz parte do chat
    const { data: participation } = await supabase
      .from('chat_participants')
      .select('id')
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId)
      .single();

    if (!participation) {
      return res.status(403).json({ error: 'Você não tem acesso a este chat' });
    }

    const messageId = uuidv4();

    // Criar mensagem
    const { data: newMessage, error } = await supabase
      .from('messages')
      .insert([
        {
          id: messageId,
          chat_id: chatId,
          sender_id: req.user.userId,
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
      return res.status(400).json({ error: error.message });
    }

    // Atualizar última mensagem do chat
    await supabase
      .from('chats')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', chatId);

    res.status(201).json(newMessage);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Buscar mensagens do chat
router.get('/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verificar se usuário faz parte do chat
    const { data: participation } = await supabase
      .from('chat_participants')
      .select('id')
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId)
      .single();

    if (!participation) {
      return res.status(403).json({ error: 'Você não tem acesso a este chat' });
    }

    const offset = (page - 1) * limit;

    const { data: messages, error } = await supabase
      .from('messages')
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
      .eq('chat_id', chatId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(messages.reverse());

  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Marcar mensagens como lidas
router.post('/read/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageIds } = req.body;

    // Verificar se usuário faz parte do chat
    const { data: participation } = await supabase
      .from('chat_participants')
      .select('id')
      .eq('chat_id', chatId)
      .eq('user_id', req.user.userId)
      .single();

    if (!participation) {
      return res.status(403).json({ error: 'Você não tem acesso a este chat' });
    }

    // Marcar mensagens como lidas
    const readReceipts = messageIds.map(messageId => ({
      message_id: messageId,
      user_id: req.user.userId,
      read_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('message_read_receipts')
      .upsert(readReceipts);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Mensagens marcadas como lidas' });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
  }
});

// Upload de mídia
router.post('/upload', upload.single('media'), async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Aqui você pode integrar com serviço de armazenamento como AWS S3 ou Supabase Storage
    // Por simplicidade, vamos retornar um URL fictício
    const mediaUrl = `/uploads/${file.filename}`;

    res.json({
      url: mediaUrl,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer upload do arquivo' });
  }
});

// Deletar mensagem
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Verificar se a mensagem pertence ao usuário
    const { data: message } = await supabase
      .from('messages')
      .select('sender_id, chat_id')
      .eq('id', messageId)
      .single();

    if (!message || message.sender_id !== req.user.userId) {
      return res.status(403).json({ error: 'Você só pode deletar suas próprias mensagens' });
    }

    // Deletar mensagem (soft delete)
    const { error } = await supabase
      .from('messages')
      .update({ 
        deleted_at: new Date().toISOString(),
        content: 'Esta mensagem foi apagada'
      })
      .eq('id', messageId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Mensagem deletada com sucesso' });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
});

module.exports = router;