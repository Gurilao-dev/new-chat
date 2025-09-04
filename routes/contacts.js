const express = require('express');
const jwt = require('jsonwebtoken');
const FirestoreUser = require('../models/FirestoreUser');
const FirestoreContact = require('../models/FirestoreContact');

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

// Buscar contato por número virtual
router.get('/search/:virtualNumber', async (req, res) => {
  try {
    const { virtualNumber } = req.params;

    const user = await FirestoreUser.findByVirtualNumber(virtualNumber);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Remover senha da resposta
    const { password, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erro ao buscar contato:', error);
    res.status(500).json({ error: 'Erro ao buscar contato' });
  }
});

// Adicionar contato
router.post('/add', async (req, res) => {
  try {
    const { contactId, name } = req.body;

    // Verificar se o contato já existe
    const existingContact = await FirestoreContact.findByOwnerAndContact(req.user.userId, contactId);

    if (existingContact) {
      return res.status(400).json({ error: 'Contato já adicionado' });
    }

    // Verificar se o usuário existe
    const contactUser = await FirestoreUser.findById(contactId);
    if (!contactUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Criar contato
    const newContact = await FirestoreContact.create({
      owner: req.user.userId,
      contact: contactId,
      name
    });

    // Retornar contato com dados do usuário
    const { password, ...contactUserWithoutPassword } = contactUser;

    res.status(201).json({
      id: newContact.id,
      name: newContact.name,
      is_blocked: newContact.is_blocked,
      contact: contactUserWithoutPassword,
      created_at: newContact.created_at
    });
  } catch (error) {
    console.error('Erro ao adicionar contato:', error);
    res.status(500).json({ error: 'Erro ao adicionar contato' });
  }
});

// Listar contatos
router.get('/', async (req, res) => {
  try {
    const contacts = await FirestoreContact.findByOwner(req.user.userId);

    const formattedContacts = [];

    for (const contact of contacts) {
      const contactUser = await FirestoreUser.findById(contact.contact);
      if (contactUser) {
        const { password, ...contactUserWithoutPassword } = contactUser;
        formattedContacts.push({
          id: contact.id,
          name: contact.name,
          is_blocked: contact.is_blocked,
          contact: contactUserWithoutPassword,
          created_at: contact.created_at
        });
      }
    }

    res.json(formattedContacts);
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    res.status(500).json({ error: 'Erro ao listar contatos' });
  }
});

// Atualizar nome do contato
router.put('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { name } = req.body;

    const contact = await FirestoreContact.findById(contactId);
    
    if (!contact || contact.owner !== req.user.userId) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    const updatedContact = await FirestoreContact.update(contactId, { name });

    // Buscar dados do usuário do contato
    const contactUser = await FirestoreUser.findById(updatedContact.contact);
    const { password, ...contactUserWithoutPassword } = contactUser;

    res.json({
      id: updatedContact.id,
      name: updatedContact.name,
      is_blocked: updatedContact.is_blocked,
      contact: contactUserWithoutPassword,
      updated_at: updatedContact.updated_at
    });
  } catch (error) {
    console.error('Erro ao atualizar contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Bloquear/desbloquear contato
router.put('/:contactId/block', async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await FirestoreContact.findById(contactId);
    
    if (!contact || contact.owner !== req.user.userId) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    const updatedContact = await FirestoreContact.toggleBlock(req.user.userId, contact.contact);

    // Buscar dados do usuário do contato
    const contactUser = await FirestoreUser.findById(updatedContact.contact);
    const { password, ...contactUserWithoutPassword } = contactUser;

    res.json({
      id: updatedContact.id,
      name: updatedContact.name,
      is_blocked: updatedContact.is_blocked,
      contact: contactUserWithoutPassword,
      updated_at: updatedContact.updated_at
    });
  } catch (error) {
    console.error('Erro ao bloquear/desbloquear contato:', error);
    res.status(500).json({ error: 'Erro ao bloquear/desbloquear contato' });
  }
});

// Listar contatos bloqueados
router.get('/blocked', async (req, res) => {
  try {
    const blockedContacts = await FirestoreContact.findBlockedByOwner(req.user.userId);

    const formattedContacts = [];

    for (const contact of blockedContacts) {
      const contactUser = await FirestoreUser.findById(contact.contact);
      if (contactUser) {
        const { password, ...contactUserWithoutPassword } = contactUser;
        formattedContacts.push({
          id: contact.id,
          name: contact.name,
          is_blocked: contact.is_blocked,
          contact: contactUserWithoutPassword,
          created_at: contact.created_at
        });
      }
    }

    res.json(formattedContacts);
  } catch (error) {
    console.error('Erro ao listar contatos bloqueados:', error);
    res.status(500).json({ error: 'Erro ao listar contatos bloqueados' });
  }
});

// Remover contato
router.delete('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;

    const contact = await FirestoreContact.findById(contactId);
    
    if (!contact || contact.owner !== req.user.userId) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    await FirestoreContact.delete(contactId);

    res.json({ message: 'Contato removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover contato:', error);
    res.status(500).json({ error: 'Erro ao remover contato' });
  }
});

module.exports = router;

