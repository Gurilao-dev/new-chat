const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Gerar número virtual único
    let virtualNumber;
    let isUnique = false;
    
    while (!isUnique) {
      virtualNumber = generateVirtualNumber();
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('virtual_number', virtualNumber)
        .single();
      
      if (!data) isUnique = true;
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12);

    // Criar usuário
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          id: uuidv4(),
          name,
          email,
          password: hashedPassword,
          virtual_number: virtualNumber,
          avatar: avatar || null,
          last_seen: new Date().toISOString(),
          is_online: false,
          status: 'Disponível'
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { userId: newUser.id, virtualNumber: newUser.virtual_number },
      process.env.JWT_SECRET,
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
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuário
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    // Atualizar status online
    await supabase
      .from('users')
      .update({ 
        is_online: true, 
        last_seen: new Date().toISOString() 
      })
      .eq('id', user.id);

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, virtualNumber: user.virtual_number },
      process.env.JWT_SECRET,
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Perfil do usuário
router.get('/profile', async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, virtual_number, avatar, status, last_seen, is_online')
      .eq('id', req.user.userId)
      .single();

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// Atualizar perfil
router.put('/profile', async (req, res) => {
  try {
    const { name, avatar, status } = req.body;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ name, avatar, status })
      .eq('id', req.user.userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

module.exports = router;