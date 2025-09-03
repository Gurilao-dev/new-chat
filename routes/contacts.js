const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

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

// Buscar contato por número virtual
router.get('/search/:virtualNumber', async (req, res) => {
  try {
    const { virtualNumber } = req.params;

    const { data: user } = await supabase
      .from('users')
      .select('id, name, virtual_number, avatar, status, is_online, last_seen')
      .eq('virtual_number', virtualNumber)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contato' });
  }
});

// Adicionar contato
router.post('/add', async (req, res) => {
  try {
    const { contactId, name } = req.body;

    // Verificar se o contato existe
    const { data: contactUser } = await supabase
      .from('users')
      .select('id, name, virtual_number, avatar')
      .eq('id', contactId)
      .single();

    if (!contactUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar se já é contato
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', req.user.userId)
      .eq('contact_id', contactId)
      .single();

    if (existingContact) {
      return res.status(400).json({ error: 'Usuário já está nos seus contatos' });
    }

    // Adicionar contato
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert([
        {
          user_id: req.user.userId,
          contact_id: contactId,
          contact_name: name || contactUser.name,
          added_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: 'Contato adicionado com sucesso',
      contact: newContact
    });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar contato' });
  }
});

// Listar contatos
router.get('/', async (req, res) => {
  try {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select(`
        id,
        contact_name,
        added_at,
        contact_user:users!contacts_contact_id_fkey(
          id,
          name,
          virtual_number,
          avatar,
          status,
          is_online,
          last_seen
        )
      `)
      .eq('user_id', req.user.userId)
      .order('contact_name');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(contacts);

  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

// Remover contato
router.delete('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', req.user.userId)
      .eq('contact_id', contactId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Contato removido com sucesso' });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover contato' });
  }
});

module.exports = router;