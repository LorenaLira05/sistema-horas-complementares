# Sistema de Gestão de Atividades Complementares

Sistema web para digitalizar e automatizar o processo de gestão de atividades complementares do SENAC, eliminando planilhas manuais e e-mails descentralizados.

---

## Sobre o Projeto

As Instituições de Ensino Superior exigem o cumprimento de atividades complementares para integralização curricular. Atualmente, esse processo é predominantemente manual e descentralizado, envolvendo planilhas, documentos físicos e trocas de e-mail entre alunos e coordenadores.

Essa solução digitaliza todo o processo, oferecendo:
- Submissão e acompanhamento de atividades pelos alunos
- Validação e análise de certificados pelos coordenadores
- Gestão completa de cursos e usuários pelo Super Admin
- Dashboard com métricas em tempo real

---

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco de Dados | PostgreSQL |
| Autenticação | JWT (JSON Web Token) |
| Upload de Arquivos | Multer |
| E-mails | Nodemailer |
| Frontend | HTML + CSS + JavaScript |

---

## Estrutura do Projeto

```
sistema-horas-complementares/
├── src/
│   ├── config/
│   │   └── database.js         → Conexão com PostgreSQL
│   ├── controllers/
│   │   ├── authController.js   → Login e setup
│   │   ├── adminController.js  → Funções do Super Admin
│   │   └── coordenadorController.js → Funções do Coordenador
│   ├── middleware/
│   │   └── auth.js             → Autenticação JWT
│   └── routes/
│       ├── authRoutes.js       → Rotas de autenticação
│       ├── admin.js            → Rotas do Super Admin
│       ├── coordenador.js      → Rotas do Coordenador
│       └── aluno.js            → Rotas do Aluno
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── uploads/                    → Arquivos enviados
├── .env.example
├── package.json
└── README.md
```

---

## Perfis de Usuário

| Perfil | Permissões |
|--------|-----------|
| **Super Admin** | Cadastrar cursos, coordenadores e configurar o sistema |
| **Coordenador** | Gerenciar alunos, validar e reprovar submissões |
| **Aluno** | Submeter atividades e acompanhar o status *(Entrega 2)* |

---

## Como Rodar o Projeto

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+

### 1. Clonar o repositório
```bash
git clone https://github.com/LorenaLira05/sistema-horas-complementares.git
cd sistema-horas-complementares
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:
```
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atividades_complementares
DB_USER=postgres
DB_PASSWORD=sua_senha
JWT_SECRET=sua_chave_secreta
```

### 4. Criar o banco de dados
No pgAdmin ou psql:
```sql
CREATE DATABASE atividades_complementares;
```

### 5. Criar as tabelas
```sql
CREATE TABLE cursos (
    id SERIAL PRIMARY KEY,
    nome_curso VARCHAR(255) NOT NULL,
    sigla VARCHAR(20),
    carga_horaria INTEGER,
    duracao INTEGER
);

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    perfil VARCHAR(50) NOT NULL,
    curso_id INTEGER REFERENCES cursos(id),
    matricula VARCHAR(50)
);

CREATE TABLE regras_atividades (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER REFERENCES cursos(id),
    nome_categoria VARCHAR(255) NOT NULL,
    limite_horas INTEGER NOT NULL
);

CREATE TABLE atividades_enviadas (
    id SERIAL PRIMARY KEY,
    aluno_id INTEGER REFERENCES usuarios(id),
    regra_id INTEGER REFERENCES regras_atividades(id),
    curso_id INTEGER REFERENCES cursos(id),
    descricao TEXT,
    categoria VARCHAR(100),
    horas_solicitadas INTEGER,
    horas_aprovadas INTEGER,
    status VARCHAR(50) DEFAULT 'PENDENTE',
    feedback TEXT,
    coordenador_id INTEGER REFERENCES usuarios(id),
    data_envio TIMESTAMP DEFAULT NOW(),
    data_validacao TIMESTAMP
);

CREATE TABLE certificados (
    id SERIAL PRIMARY KEY,
    atividade_id INTEGER REFERENCES atividades_enviadas(id),
    nome_arquivo VARCHAR(255) NOT NULL,
    caminho_arquivo VARCHAR(500) NOT NULL,
    tipo_arquivo VARCHAR(50),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE coordenador_curso (
    coordenador_id INTEGER REFERENCES usuarios(id),
    curso_id INTEGER REFERENCES cursos(id),
    PRIMARY KEY (coordenador_id, curso_id)
);
```

### 6. Criar o primeiro Super Admin
Com o servidor rodando, faça uma requisição POST:
```
POST http://localhost:3001/auth/setup
Body: { "email": "admin@senac.br", "senha": "sua_senha" }
```
> ⚠️ Essa rota se desativa automaticamente após criar o primeiro Super Admin!

### 7. Iniciar o servidor
```bash
npm run dev
```

Acesse: **http://localhost:3001**

---

## Rotas da API

### Autenticação
| Método | Rota | Descrição | Perfil |
|--------|------|-----------|--------|
| POST | `/auth/login` | Login | Público |
| POST | `/auth/setup` | Criar Super Admin | Público (1x) |

### Admin
| Método | Rota | Descrição | Perfil |
|--------|------|-----------|--------|
| GET | `/admin/cursos` | Listar cursos | Super Admin |
| POST | `/admin/curso` | Criar curso | Super Admin |
| GET | `/admin/coordenadores` | Listar coordenadores | Super Admin |
| POST | `/admin/coordenador` | Cadastrar coordenador | Super Admin |

### Coordenador
| Método | Rota | Descrição | Perfil |
|--------|------|-----------|--------|
| POST | `/coordenador/aluno` | Cadastrar aluno | Coordenador |
| GET | `/coordenador/alunos/:curso_id` | Listar alunos | Coordenador |
| GET | `/coordenador/submissoes/:curso_id` | Ver submissões pendentes | Coordenador |
| PATCH | `/coordenador/validar/:id` | Aprovar ou reprovar | Coordenador |
| POST | `/coordenador/regras` | Criar regra | Coordenador |
| GET | `/coordenador/regras/:curso_id` | Listar regras | Coordenador |

---

## Funcionalidades Implementadas

- [x] Autenticação com JWT
- [x] Controle de perfis (Super Admin, Coordenador)
- [x] Cadastro e listagem de cursos
- [x] Cadastro de coordenadores com senha protegida
- [x] Cadastro de alunos
- [x] Regras de atividades por curso
- [x] Validação e reprovação de submissões
- [x] Segurança — coordenador acessa apenas seu próprio curso

## Em Desenvolvimento

- [ ] Frontend conectado ao backend
- [ ] Dashboard de métricas
- [ ] Upload de certificados 
- [ ] OCR para leitura de certificados 
- [ ] E-mails automáticos 
- [ ] Logs e rastreabilidade 
- [ ] Filtros e paginação nas submissões

---

## Licença

Este projeto foi desenvolvido para fins acadêmicos — SENAC 2026.
