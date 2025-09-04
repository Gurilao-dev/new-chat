const { getFirestore } = require('../config/firebase');

class FirestoreContact {
  constructor() {
    this.db = getFirestore();
    this.collection = 'contacts';
  }

  // Criar um novo contato
  async create(contactData) {
    try {
      const { owner, contact, name, is_blocked = false } = contactData;
      
      const contactObj = {
        owner,
        contact,
        name: name.trim(),
        is_blocked,
        created_at: new Date(),
        updated_at: new Date()
      };

      const docRef = await this.db.collection(this.collection).add(contactObj);
      return { id: docRef.id, ...contactObj };
    } catch (error) {
      throw new Error(`Erro ao criar contato: ${error.message}`);
    }
  }

  // Buscar contato por ID
  async findById(id) {
    try {
      const doc = await this.db.collection(this.collection).doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar contato por ID: ${error.message}`);
    }
  }

  // Buscar contatos de um usuário
  async findByOwner(ownerId) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('owner', '==', ownerId)
        .orderBy('name', 'asc')
        .get();
      
      const contacts = [];
      snapshot.forEach(doc => {
        contacts.push({ id: doc.id, ...doc.data() });
      });
      
      return contacts;
    } catch (error) {
      // Fallback sem orderBy se o índice não existir
      try {
        const snapshot = await this.db.collection(this.collection)
          .where('owner', '==', ownerId)
          .get();
        
        const contacts = [];
        snapshot.forEach(doc => {
          contacts.push({ id: doc.id, ...doc.data() });
        });
        
        // Ordenar manualmente por nome
        contacts.sort((a, b) => a.name.localeCompare(b.name));
        return contacts;
      } catch (fallbackError) {
        throw new Error(`Erro ao buscar contatos: ${fallbackError.message}`);
      }
    }
  }

  // Buscar contato específico entre dois usuários
  async findByOwnerAndContact(ownerId, contactId) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('owner', '==', ownerId)
        .where('contact', '==', contactId)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Erro ao buscar contato específico: ${error.message}`);
    }
  }

  // Atualizar contato
  async update(id, updateData) {
    try {
      const updateObj = {
        ...updateData,
        updated_at: new Date()
      };
      
      await this.db.collection(this.collection).doc(id).update(updateObj);
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Erro ao atualizar contato: ${error.message}`);
    }
  }

  // Bloquear/desbloquear contato
  async toggleBlock(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      if (!contact) {
        throw new Error('Contato não encontrado');
      }

      return await this.update(contact.id, { is_blocked: !contact.is_blocked });
    } catch (error) {
      throw new Error(`Erro ao bloquear/desbloquear contato: ${error.message}`);
    }
  }

  // Verificar se um contato está bloqueado
  async isBlocked(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      return contact ? contact.is_blocked : false;
    } catch (error) {
      throw new Error(`Erro ao verificar se contato está bloqueado: ${error.message}`);
    }
  }

  // Buscar contatos não bloqueados
  async findUnblockedByOwner(ownerId) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('owner', '==', ownerId)
        .where('is_blocked', '==', false)
        .get();
      
      const contacts = [];
      snapshot.forEach(doc => {
        contacts.push({ id: doc.id, ...doc.data() });
      });
      
      // Ordenar por nome
      contacts.sort((a, b) => a.name.localeCompare(b.name));
      return contacts;
    } catch (error) {
      throw new Error(`Erro ao buscar contatos não bloqueados: ${error.message}`);
    }
  }

  // Buscar contatos bloqueados
  async findBlockedByOwner(ownerId) {
    try {
      const snapshot = await this.db.collection(this.collection)
        .where('owner', '==', ownerId)
        .where('is_blocked', '==', true)
        .get();
      
      const contacts = [];
      snapshot.forEach(doc => {
        contacts.push({ id: doc.id, ...doc.data() });
      });
      
      // Ordenar por nome
      contacts.sort((a, b) => a.name.localeCompare(b.name));
      return contacts;
    } catch (error) {
      throw new Error(`Erro ao buscar contatos bloqueados: ${error.message}`);
    }
  }

  // Deletar contato
  async delete(id) {
    try {
      await this.db.collection(this.collection).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Erro ao deletar contato: ${error.message}`);
    }
  }

  // Deletar contato por owner e contact
  async deleteByOwnerAndContact(ownerId, contactId) {
    try {
      const contact = await this.findByOwnerAndContact(ownerId, contactId);
      if (!contact) {
        throw new Error('Contato não encontrado');
      }

      return await this.delete(contact.id);
    } catch (error) {
      throw new Error(`Erro ao deletar contato: ${error.message}`);
    }
  }
}

module.exports = new FirestoreContact();

