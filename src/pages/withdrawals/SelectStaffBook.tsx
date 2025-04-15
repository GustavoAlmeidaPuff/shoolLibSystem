import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { collection, query, getDocs, where, doc, updateDoc, addDoc, getDoc, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  FunnelIcon, 
  XMarkIcon,
  HandRaisedIcon
} from '@heroicons/react/24/outline';
import styles from './Withdrawals.module.css';

interface Book {
  id: string;
  code: string;
  title: string;
  authors?: string[];
  genres?: string[];
  publisher?: string;
  acquisitionDate?: string;
  shelf?: string;
  collection?: string;
  quantity?: number;
  available?: boolean;
}

interface Filters {
  title: string;
  code: string;
  author: string;
}

interface LocationState {
  staffName: string;
}

const SelectStaffBook = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;
  const staffName = state?.staffName || "Funcionário";

  const [books, setBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    title: '',
    code: '',
    author: ''
  });
  const [error, setError] = useState('');
  
  const { currentUser } = useAuth();

  useEffect(() => {
    fetchBooks();
  }, [currentUser]);

  const fetchBooks = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      setError(''); // Limpa mensagens de erro anteriores
      const booksRef = collection(db, `users/${currentUser.uid}/books`);
      
      // Buscar todos os livros primeiro
      const q = query(booksRef);
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError('Não há livros cadastrados no sistema.');
        setBooks([]);
        setFilteredBooks([]);
        return;
      }
      
      // Filtrar livros disponíveis
      const availableBooks = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }) as Book)
        .filter(book => book.available !== false); // Considera disponível se o campo não existir ou for true
      
      if (availableBooks.length === 0) {
        setError('Não há livros disponíveis para empréstimo no momento.');
      } else {
        // Ordenar por título
        availableBooks.sort((a, b) => {
          return (a.title || '').localeCompare(b.title || '');
        });
        
        setBooks(availableBooks);
        setFilteredBooks(availableBooks);
      }
    } catch (error) {
      console.error('Erro ao buscar livros:', error);
      setError('Erro ao carregar lista de livros. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: keyof Filters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      applyFilters();
    }
  };

  const applyFilters = () => {
    const titleFilter = filters.title.toLowerCase().trim();
    const codeFilter = filters.code.toLowerCase().trim();
    const authorFilter = filters.author.toLowerCase().trim();
    
    if (!titleFilter && !codeFilter && !authorFilter) {
      setFiltersApplied(false);
      setFilteredBooks(books);
      return;
    }
    
    const filtered = books.filter(book => {
      const matchesTitle = !titleFilter || (book.title && book.title.toLowerCase().includes(titleFilter));
      const matchesCode = !codeFilter || (book.code && book.code.toLowerCase().includes(codeFilter));
      const matchesAuthor = !authorFilter || (book.authors && book.authors.some(author => 
        author.toLowerCase().includes(authorFilter)
      ));
      return matchesTitle && matchesCode && matchesAuthor;
    });
    
    setFilteredBooks(filtered);
    setFiltersApplied(true);
  };

  const clearFilters = () => {
    setFilters({ title: '', code: '', author: '' });
    setFiltersApplied(false);
    setFilteredBooks(books);
  };

  const handleSelectBook = (bookId: string, bookTitle: string) => {
    navigate(`/staff-withdrawals/${staffId}/confirm/${bookId}`, { 
      state: { 
        staffName,
        bookTitle,
        bookId
      } 
    });
  };

  const currentBooks = filtersApplied ? filteredBooks : books;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Retirada para <span className={styles.highlightName}>{staffName}</span></h2>
        <div className={styles.headerActions}>
          <button
            className={styles.filterButton}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? (
              <>
                <XMarkIcon className={styles.buttonIcon} />
                Ocultar
              </>
            ) : (
              <>
                <FunnelIcon className={styles.buttonIcon} />
                {filtersApplied ? 'Filtros' : 'Filtrar'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
          <button 
            className={styles.dismissButton}
            onClick={() => setError('')}
          >
            &times;
          </button>
        </div>
      )}

      {showFilters && (
        <div className={styles.filters}>
          <form onSubmit={handleSubmit} className={styles.filterGrid}>
            <div className={styles.filterGroup}>
              <label htmlFor="title">Título</label>
              <input
                type="text"
                id="title"
                value={filters.title}
                onChange={(e) => handleFilterChange('title', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Filtrar por título..."
              />
            </div>

            <div className={styles.filterGroup}>
              <label htmlFor="code">Código</label>
              <input
                type="text"
                id="code"
                value={filters.code}
                onChange={(e) => handleFilterChange('code', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Filtrar por código..."
              />
            </div>

            <div className={styles.filterGroup}>
              <label htmlFor="author">Autor</label>
              <input
                type="text"
                id="author"
                value={filters.author}
                onChange={(e) => handleFilterChange('author', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Filtrar por autor..."
              />
            </div>
          </form>

          <div className={styles.filterActions}>
            <button
              className={styles.applyFiltersButton}
              onClick={applyFilters}
            >
              Aplicar Filtros
            </button>
            <button
              className={styles.clearFiltersButton}
              onClick={clearFilters}
              disabled={!filtersApplied}
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>Carregando livros...</div>
        ) : books.length === 0 ? (
          <div className={styles.emptyState}>
            <HandRaisedIcon className={styles.emptyIcon} />
            <h3>Não há livros disponíveis</h3>
            <p>Não existem livros disponíveis para empréstimo no momento.</p>
          </div>
        ) : (
          <div className={styles.bookListContainer}>
            {filtersApplied && filteredBooks.length === 0 ? (
              <div className={styles.noResults}>
                <p>Nenhum livro encontrado com os filtros aplicados.</p>
                <button
                  className={styles.clearFiltersButton}
                  onClick={clearFilters}
                >
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <div className={styles.bookList}>
                {currentBooks.map(book => (
                  <div key={book.id} className={styles.bookItem}>
                    <div className={styles.bookInfo}>
                      <h3 className={styles.bookTitle}>{book.title}</h3>
                      {book.code && <p className={styles.bookCode}>Código: {book.code}</p>}
                      {book.authors && book.authors.length > 0 && (
                        <p className={styles.bookAuthors}>
                          Autores: {book.authors.join(', ')}
                        </p>
                      )}
                      {book.publisher && (
                        <p className={styles.bookPublisher}>
                          Editora: {book.publisher}
                        </p>
                      )}
                      {book.genres && book.genres.length > 0 && (
                        <div className={styles.bookGenres}>
                          {book.genres.map((genre, index) => (
                            <span key={index} className={styles.genreTag}>
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.bookActions}>
                      <button
                        className={styles.selectButton}
                        onClick={() => handleSelectBook(book.id, book.title)}
                      >
                        Selecionar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectStaffBook; 