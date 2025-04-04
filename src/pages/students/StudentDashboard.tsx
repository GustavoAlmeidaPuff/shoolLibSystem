import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, doc, getDoc, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import styles from './StudentDashboard.module.css';

// Registrando os componentes necessários do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

interface Student {
  id: string;
  name: string;
  classroom: string;
  contact?: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  notes?: string;
}

interface Loan {
  id: string;
  studentId: string;
  studentName: string;
  bookId: string;
  bookTitle: string;
  borrowDate: Date;
  dueDate: Date;
  returnDate?: Date;
  status: 'active' | 'returned';
  genres?: string[];
  createdAt: Date;
}

interface Book {
  id: string;
  title: string;
  genres?: string[];
  authors?: string[];
}

const StudentDashboard = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState<Student | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Dados processados para gráficos
  const [genresData, setGenresData] = useState<{labels: string[], data: number[]}>({ labels: [], data: [] });
  const [monthlyLoansData, setMonthlyLoansData] = useState<{labels: string[], data: number[]}>({ labels: [], data: [] });
  const [quarterlyData, setQuarterlyData] = useState<{labels: string[], data: number[]}>({ labels: [], data: [] });
  
  // Métricas calculadas
  const [totalBooksRead, setTotalBooksRead] = useState(0);
  const [favoriteGenre, setFavoriteGenre] = useState('');
  const [readingSpeed, setReadingSpeed] = useState(0);
  const [bestQuarter, setBestQuarter] = useState('');

  useEffect(() => {
    if (!currentUser || !studentId) return;
    
    const fetchStudentData = async () => {
      try {
        setLoading(true);
        
        // Buscar dados do estudante
        const studentRef = doc(db, `users/${currentUser.uid}/students/${studentId}`);
        const studentSnap = await getDoc(studentRef);
        
        if (!studentSnap.exists()) {
          setError('Estudante não encontrado');
          return;
        }
        
        const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student;
        setStudent(studentData);
        
        // Buscar todos os empréstimos do estudante
        const loansRef = collection(db, `users/${currentUser.uid}/loans`);
        const q = query(
          loansRef,
          where('studentId', '==', studentId)
        );
        
        const loansSnap = await getDocs(q);
        
        // Se não há empréstimos, parar por aqui
        if (loansSnap.empty) {
          setLoading(false);
          return;
        }
        
        // Processar todos os empréstimos
        const loansData = loansSnap.docs.map(doc => {
          const data = doc.data();
          
          // Converter timestamps para Dates
          const borrowDate = data.borrowDate?.toDate ? data.borrowDate.toDate() : new Date();
          const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : new Date();
          const returnDate = data.returnDate?.toDate ? data.returnDate.toDate() : undefined;
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
          
          return {
            id: doc.id,
            ...data,
            borrowDate,
            dueDate,
            returnDate,
            createdAt
          };
        }) as Loan[];
        
        setLoans(loansData);
        
        // Buscar detalhes dos livros emprestados para obter gêneros
        const bookIds = Array.from(new Set(loansData.map(loan => loan.bookId)));
        const booksData: Book[] = [];
        
        for (const bookId of bookIds) {
          const bookRef = doc(db, `users/${currentUser.uid}/books/${bookId}`);
          const bookSnap = await getDoc(bookRef);
          
          if (bookSnap.exists()) {
            booksData.push({
              id: bookSnap.id,
              ...bookSnap.data()
            } as Book);
          }
        }
        
        setBooks(booksData);
        
        // Processar dados para visualizações
        processData(loansData, booksData);
      } catch (error) {
        console.error('Erro ao buscar dados do estudante:', error);
        setError('Erro ao carregar dados. Por favor, tente novamente.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStudentData();
  }, [currentUser, studentId]);
  
  const processData = (loansData: Loan[], booksData: Book[]) => {
    if (loansData.length === 0) return;
    
    // Total de livros lidos (consideramos apenas os devolvidos)
    const completedLoans = loansData.filter(loan => loan.status === 'returned');
    setTotalBooksRead(completedLoans.length);
    
    // Calcular gêneros mais lidos
    const genreCounts: {[key: string]: number} = {};
    
    loansData.forEach(loan => {
      const book = booksData.find(b => b.id === loan.bookId);
      
      if (book?.genres) {
        book.genres.forEach(genre => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      }
    });
    
    // Ordenar gêneros por popularidade
    const sortedGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5 gêneros
    
    if (sortedGenres.length > 0) {
      setFavoriteGenre(sortedGenres[0][0]);
      
      setGenresData({
        labels: sortedGenres.map(([genre]) => genre),
        data: sortedGenres.map(([, count]) => count)
      });
    }
    
    // Empréstimos por mês (últimos 6 meses)
    const lastSixMonths = Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), i);
      return {
        label: format(date, 'MMM/yyyy', { locale: ptBR }),
        startDate: startOfMonth(date),
        endDate: endOfMonth(date)
      };
    }).reverse();
    
    const monthlyLoans = lastSixMonths.map(month => {
      const count = loansData.filter(loan => 
        isWithinInterval(loan.borrowDate, {
          start: month.startDate,
          end: month.endDate
        })
      ).length;
      
      return { label: month.label, count };
    });
    
    setMonthlyLoansData({
      labels: monthlyLoans.map(m => m.label),
      data: monthlyLoans.map(m => m.count)
    });
    
    // Determinar em qual trimestre o estudante leu mais
    const quarters = [
      { name: '1º Trimestre', months: [0, 1, 2] },
      { name: '2º Trimestre', months: [3, 4, 5] },
      { name: '3º Trimestre', months: [6, 7, 8] },
      { name: '4º Trimestre', months: [9, 10, 11] }
    ];
    
    const quarterCounts = quarters.map(quarter => {
      const count = loansData.filter(loan => {
        const month = loan.borrowDate.getMonth();
        return quarter.months.includes(month);
      }).length;
      
      return { name: quarter.name, count };
    });
    
    setQuarterlyData({
      labels: quarterCounts.map(q => q.name),
      data: quarterCounts.map(q => q.count)
    });
    
    // Determinar o melhor trimestre
    const bestQ = quarterCounts.reduce((best, current) => 
      current.count > best.count ? current : best, 
      { name: '', count: -1 }
    );
    
    if (bestQ.count > 0) {
      setBestQuarter(bestQ.name);
    }
    
    // Calcular velocidade média de leitura (dias)
    if (completedLoans.length > 0) {
      const totalDays = completedLoans.reduce((sum, loan) => {
        if (loan.returnDate) {
          // Diferença em dias entre empréstimo e devolução
          const diffTime = loan.returnDate.getTime() - loan.borrowDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return sum + diffDays;
        }
        return sum;
      }, 0);
      
      setReadingSpeed(Math.round(totalDays / completedLoans.length));
    }
  };
  
  const navigateBack = () => {
    navigate('/students');
  };
  
  if (loading) {
    return <div className={styles.loading}>Carregando...</div>;
  }
  
  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button onClick={navigateBack}>Voltar para a Lista de Estudantes</button>
      </div>
    );
  }
  
  if (!student) {
    return (
      <div className={styles.error}>
        <p>Estudante não encontrado</p>
        <button onClick={navigateBack}>Voltar para a Lista de Estudantes</button>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Dashboard do Aluno: {student.name}</h2>
        <p className={styles.classroom}>Turma: {student.classroom}</p>
        <button 
          className={styles.backButton}
          onClick={navigateBack}
        >
          Voltar para a Lista de Alunos
        </button>
      </div>
      
      {loans.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>Este aluno ainda não possui histórico de leitura</h3>
          <p>Quando o aluno começar a retirar livros, os dados aparecerão aqui.</p>
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <h3>Total de Livros Lidos</h3>
              <div className={styles.value}>{totalBooksRead}</div>
              <p>Livros devolvidos até o momento</p>
            </div>
            
            <div className={styles.statCard}>
              <h3>Categoria Favorita</h3>
              <div className={styles.value}>{favoriteGenre || "Não definido"}</div>
              <p>Categoria mais lida pelo aluno</p>
            </div>
            
            <div className={styles.statCard}>
              <h3>Tempo Médio de Leitura</h3>
              <div className={styles.value}>
                {readingSpeed > 0 
                  ? `${readingSpeed} dias`
                  : "Não disponível"}
              </div>
              <p>Tempo médio entre retirada e devolução</p>
            </div>
            
            <div className={styles.statCard}>
              <h3>Melhor Trimestre</h3>
              <div className={styles.value}>{bestQuarter || "Não definido"}</div>
              <p>Trimestre com mais retiradas</p>
            </div>
          </div>
          
          <div className={styles.chartGrid}>
            <div className={styles.chartCard}>
              <h3>Evolução de Leitura</h3>
              {monthlyLoansData.labels.length > 0 ? (
                <div className={styles.chart}>
                  <Line 
                    data={{
                      labels: monthlyLoansData.labels,
                      datasets: [
                        {
                          label: 'Livros retirados por mês',
                          data: monthlyLoansData.data,
                          borderColor: '#4a90e2',
                          backgroundColor: 'rgba(74, 144, 226, 0.5)',
                          tension: 0.3
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        title: {
                          display: false
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className={styles.noData}>Dados insuficientes</div>
              )}
            </div>
            
            <div className={styles.chartCard}>
              <h3>Categorias Lidas</h3>
              {genresData.labels.length > 0 ? (
                <div className={styles.chart}>
                  <Pie 
                    data={{
                      labels: genresData.labels,
                      datasets: [
                        {
                          data: genresData.data,
                          backgroundColor: [
                            '#4a90e2',
                            '#50c878',
                            '#f78fb3',
                            '#f5cd79',
                            '#778beb'
                          ],
                          borderWidth: 1
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'right',
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className={styles.noData}>Dados insuficientes</div>
              )}
            </div>
            
            <div className={styles.chartCard}>
              <h3>Leitura por Trimestre</h3>
              {quarterlyData.labels.length > 0 ? (
                <div className={styles.chart}>
                  <Bar 
                    data={{
                      labels: quarterlyData.labels,
                      datasets: [
                        {
                          label: 'Livros por trimestre',
                          data: quarterlyData.data,
                          backgroundColor: '#50c878',
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          display: false
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className={styles.noData}>Dados insuficientes</div>
              )}
            </div>
            
            <div className={styles.chartCard}>
              <h3>Histórico de Empréstimos</h3>
              <div className={styles.loansList}>
                <table className={styles.loansTable}>
                  <thead>
                    <tr>
                      <th>Livro</th>
                      <th>Data Retirada</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.slice(0, 5).map(loan => (
                      <tr key={loan.id}>
                        <td>{loan.bookTitle}</td>
                        <td>{format(loan.borrowDate, 'dd/MM/yyyy')}</td>
                        <td className={loan.status === 'returned' ? styles.returned : styles.active}>
                          {loan.status === 'returned' ? 'Devolvido' : 'Ativo'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loans.length > 5 && (
                  <p className={styles.moreLoans}>Exibindo 5 dos {loans.length} empréstimos</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StudentDashboard; 