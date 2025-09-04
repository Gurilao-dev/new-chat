const { getFirestore } = require('../config/firebase');
const bcrypt = require('bcryptjs');

class FirestoreUser {
  constructor() {
    this.db = getFirestore();
    this.collection = 'users';
  }

  // Criar um novo usuário
  async create(userData) {
    try {
      const { name, email, password, virtual_number, avatar = null, status = 'Disponível' } = userData;
      
      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        virtual_number,
        avatar,
        status,
        is_online: false,
        last_seen: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      const docRef = await this.db.collection(this.collection).add(user);
      return { id: docRef.id, ...user };
    } catch (error) {
      throw new Error(`Erro ao criar usuário: ${error.message}`);
    }
  }

  // Buscar usuário por ID
  async findById(id) {
    try {
      const doc = await this.db.collection(this.collection).doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar usuário por ID: ${error.message}`);
    }
  }

  // Buscar usuário por email
  async findByEmail(email) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('email', '==', email.toLowerCase().trim())
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar usuário por email: ${error.message}`);
    }
  }

  // Buscar usuário por número virtual
  async findByVirtualNumber(virtual_number) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('virtual_number', '==', virtual_number)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar usuário por número virtual: ${error.message}`);
    }
  }

  // Atualizar usuário
  async update(id, updateData) {
    try {
      const updateObj = {
        ...updateData,
        updated_at: new Date()
      };
      
      await this.db.collection(this.collection).doc(id).update(updateObj);
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Erro ao atualizar usuário: ${error.message}`);
    }
  }

  // Atualizar status online
  async updateOnlineStatus(id, is_online) {
    try {
      const updateData = {
        is_online,
        updated_at: new Date()
      };
      
      if (!is_online) {
        updateData.last_seen = new Date();
      }
      
      await this.db.collection(this.collection).doc(id).update(updateData);
      return true;
    } catch (error) {
      throw new Error(`Erro ao atualizar status online: ${error.message}`);
    }
  }

  // Verificar senha
  async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Buscar todos os usuários (para contatos)
  async findAll(excludeId = null) {
    try {
      let query = this.db.collection(this.collection);
      
      const snapshot = await query.get();
      const users = [];
      
      snapshot.forEach(doc => {
        if (!excludeId || doc.id !== excludeId) {
          users.push({ id: doc.id, ...doc.data() });
        }
      });
      
      return users;
    } catch (error) {
      throw new Error(`Erro ao buscar usuários: ${error.message}`);
    }
  }

  // Deletar usuário
  async delete(id) {
    try {
      await this.db.collection(this.collection).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Erro ao deletar usuário: ${error.message}`);
    }
  }
}

module.exports = new FirestoreUser();

