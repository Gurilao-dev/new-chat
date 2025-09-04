const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const FirestoreUser = require('../models/FirestoreUser');

const router = express.Router();

// Gerar número virtual único
function generateVirtualNumber() {
  const prefix = '+55';
  const area = Math.floor(Math.random() * 89) + 11; // 11-99
  const number = Math.floor(Math.random() * 900000000) + 100000000; // 9 dígitos
  return `${prefix}${area}${number}`;
}

// Registro
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, avatar } = req.body;

    // Verificar se email já existe
    const existingUser = await FirestoreUser.findByEmail(email);

    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Gerar número virtual único
    let virtualNumber;
    let isUnique = false;
    
    while (!isUnique) {
      virtualNumber = generateVirtualNumber();
      const existingNumber = await FirestoreUser.findByVirtualNumber(virtualNumber);
      
      if (!existingNumber) isUnique = true;
    }

    // Criar usuário
    const newUser = await FirestoreUser.create({
      name,
      email,
      password,
      virtual_number: virtualNumber,
      avatar: avatar || null,
      status: 'Disponível'
    });

    // Gerar token JWT
    const token = jwt.sign(
      { userId: newUser.id, virtualNumber: newUser.virtual_number },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        virtual_number: newUser.virtual_number,
        avatar: newUser.avatar,
        status: newUser.status
      }
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuário
    const user = await FirestoreUser.findByEmail(email);

    if (!user) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    // Verificar senha
    const isValidPassword = await FirestoreUser.comparePassword(password, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    // Atualizar status online
    await FirestoreUser.updateOnlineStatus(user.id, true);

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, virtualNumber: user.virtual_number },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        virtual_number: user.virtual_number,
        avatar: user.avatar,
        status: user.status
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
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

// Perfil do usuário
router.get('/profile', async (req, res) => {
  try {
    const user = await FirestoreUser.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Remover senha da resposta
    const { password, ...userWithoutPassword } = user;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// Atualizar perfil
router.put('/profile', async (req, res) => {
  try {
    const { name, avatar, status } = req.body;

    const updatedUser = await FirestoreUser.update(req.user.userId, {
      name,
      avatar,
      status
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Remover senha da resposta
    const { password, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    // Atualizar status offline
    await FirestoreUser.updateOnlineStatus(req.user.userId, false);

    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro no logout' });
  }
});

module.exports = router;
