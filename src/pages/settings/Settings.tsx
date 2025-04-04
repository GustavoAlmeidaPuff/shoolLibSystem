import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  doc, 
  collection, 
  query, 
  getDocs, 
  deleteDoc,
  getFirestore, 
  getDoc, 
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import styles from './Settings.module.css';

interface LibrarySettings {
  loanDuration: number;
  maxBooksPerStudent: number;
  enableNotifications: boolean;
  showOverdueWarnings: boolean;
  allowDashboard: boolean;
}

const Settings = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', isError: false });
  const [settings, setSettings] = useState<LibrarySettings>({
    loanDuration: 14,
    maxBooksPerStudent: 3,
    enableNotifications: true,
    showOverdueWarnings: true,
    allowDashboard: true
  });
  
  // Estado para restauração
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  
  // Função para restaurar todos os dados
  const restoreAllData = async () => {
    if (!currentUser) return;
    
    const db = getFirestore();
    const collections = ['books', 'students', 'loans'];
    
    for (const collectionName of collections) {
      const collectionRef = collection(db, `users/${currentUser.uid}/${collectionName}`);
      const querySnapshot = await getDocs(query(collectionRef));
      
      // Deletar todos os documentos na coleção
      const deletePromises = querySnapshot.docs.map(docSnapshot => 
        deleteDoc(doc(db, `users/${currentUser.uid}/${collectionName}/${docSnapshot.id}`))
      );
      
      await Promise.all(deletePromises);
    }
  };
  
  // Carregar configurações
  useEffect(() => {
    const loadSettings = async () => {
      if (!currentUser) return;
      
      try {
        const db = getFirestore();
        const settingsRef = doc(db, `users/${currentUser.uid}/settings/library`);
        const settingsDoc = await getDoc(settingsRef);
        
        if (settingsDoc.exists()) {
          const data = settingsDoc.data() as LibrarySettings;
          setSettings(data);
        } else {
          // Criar documento de configurações padrão se não existir
          await setDoc(settingsRef, {
            ...settings,
            createdAt: new Date()
          });
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      }
    };
    
    loadSettings();
  }, [currentUser]);
  
  // Funções para gerenciar as configurações
  const handleSettingChange = (setting: keyof LibrarySettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };
  
  const saveSettings = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      setMessage({ text: '', isError: false });
      
      const db = getFirestore();
      const settingsRef = doc(db, `users/${currentUser.uid}/settings/library`);
      
      await updateDoc(settingsRef, {
        ...settings,
        updatedAt: new Date()
      });
      
      setMessage({ text: 'Configurações salvas com sucesso!', isError: false });
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      setMessage({ text: 'Erro ao salvar configurações. Tente novamente.', isError: true });
    } finally {
      setLoading(false);
    }
  };
  
  // Funções para restauração de dados
  const handleRestoreDataClick = () => {
    setShowRestoreConfirm(true);
    setPassword('');
    setConfirmPhrase('');
    setRestoreError('');
  };
  
  const cancelRestore = () => {
    setShowRestoreConfirm(false);
    setPassword('');
    setConfirmPhrase('');
    setRestoreError('');
  };
  
  const handleRestoreConfirm = async () => {
    if (!currentUser || !currentUser.email) {
      setRestoreError('Usuário não autenticado.');
      return;
    }
    
    // Verificar a frase de confirmação
    const expectedPhrase = 'eu quero restaurar todos os dados da minha biblioteca';
    if (confirmPhrase.toLowerCase().trim() !== expectedPhrase) {
      setRestoreError('A frase de confirmação não corresponde exatamente ao esperado.');
      return;
    }
    
    try {
      setRestoreLoading(true);
      setRestoreError('');
      
      // Reautenticar o usuário com a senha fornecida
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
      
      // Proceder com a restauração de dados
      await restoreAllData();
      
      setShowRestoreConfirm(false);
      setMessage({ text: 'Todos os dados foram restaurados com sucesso!', isError: false });
    } catch (error) {
      console.error('Erro ao restaurar dados:', error);
      
      if (error instanceof Error) {
        // Verificar se é erro de autenticação
        if (error.message.includes('auth')) {
          setRestoreError('Senha incorreta. Por favor, verifique e tente novamente.');
        } else {
          setRestoreError(`Erro ao restaurar dados: ${error.message}`);
        }
      } else {
        setRestoreError('Erro desconhecido ao restaurar dados.');
      }
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>Configurações da Biblioteca</h2>
      
      {message.text && (
        <div className={message.isError ? styles.errorMessage : styles.successMessage}>
          {message.text}
        </div>
      )}
      
      <div className={styles.content}>
        <div className={styles.settingsSection}>
          <h3>Configurações Gerais</h3>
          
          <div className={styles.settingGroup}>
            <label htmlFor="loanDuration">Duração padrão do empréstimo (dias)</label>
            <input
              type="number"
              id="loanDuration"
              min="1"
              max="90"
              value={settings.loanDuration}
              onChange={(e) => handleSettingChange('loanDuration', parseInt(e.target.value))}
            />
          </div>
          
          <div className={styles.settingGroup}>
            <label htmlFor="maxBooksPerStudent">Máximo de livros por aluno</label>
            <input
              type="number"
              id="maxBooksPerStudent"
              min="1"
              max="10"
              value={settings.maxBooksPerStudent}
              onChange={(e) => handleSettingChange('maxBooksPerStudent', parseInt(e.target.value))}
            />
          </div>
          
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.enableNotifications}
                onChange={(e) => handleSettingChange('enableNotifications', e.target.checked)}
              />
              Habilitar notificações
            </label>
          </div>
          
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.showOverdueWarnings}
                onChange={(e) => handleSettingChange('showOverdueWarnings', e.target.checked)}
              />
              Mostrar alertas de atraso
            </label>
          </div>
          
          <div className={styles.settingGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.allowDashboard}
                onChange={(e) => handleSettingChange('allowDashboard', e.target.checked)}
              />
              Habilitar dashboard de estatísticas
            </label>
          </div>
          
          <div className={styles.buttonContainer}>
            <button 
              className={styles.saveButton}
              onClick={saveSettings}
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
        
        <div className={styles.settingsSection}>
          <h3>Backup e Restauração</h3>
          
          <div className={styles.dangerZone}>
            <h4>Zona de Perigo</h4>
            <p>
              As ações abaixo são irreversíveis. Tenha certeza do que está fazendo antes de prosseguir.
            </p>
            
            <button 
              className={styles.dangerButton}
              onClick={handleRestoreDataClick}
            >
              Restaurar Todos os Dados
            </button>
            <p className={styles.helpText}>
              Esta ação apagará todos os livros, alunos, empréstimos e outros registros do sistema.
            </p>
          </div>
        </div>
      </div>
      
      {showRestoreConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Confirmar Restauração de Dados</h3>
            
            <p className={styles.warningText}>
              <strong>Atenção:</strong> Esta ação apagará <strong>permanentemente</strong> todos os
              registros da sua biblioteca, incluindo livros, alunos e histórico de empréstimos.
              Esta ação é irreversível!
            </p>
            
            <div className={styles.formGroup}>
              <label htmlFor="password">Digite sua senha para confirmar:</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
              />
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="confirmPhrase">Digite a frase abaixo exatamente como aparece:</label>
              <div className={styles.confirmationPhrase}>
                eu quero restaurar todos os dados da minha biblioteca
              </div>
              <input
                type="text"
                id="confirmPhrase"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="Digite a frase de confirmação..."
              />
            </div>
            
            {restoreError && (
              <div className={styles.errorMessage}>
                {restoreError}
              </div>
            )}
            
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelButton}
                onClick={cancelRestore}
                disabled={restoreLoading}
              >
                Cancelar
              </button>
              <button 
                className={styles.confirmDangerButton}
                onClick={handleRestoreConfirm}
                disabled={!password || !confirmPhrase || restoreLoading}
              >
                {restoreLoading ? 'Restaurando...' : 'Confirmar Restauração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings; 