const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Servir arquivos de upload estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const rotasAuth = require('./routes/authRoutes');
const rotasAdmin = require('./routes/admin');
const rotasCoordenador = require('./routes/coordenador');
const rotasAluno = require('./routes/aluno');
const rotasDashboard = require('./routes/dashboard');

app.use('/auth', rotasAuth);
app.use('/admin', rotasAdmin);
app.use('/coordenador', rotasCoordenador);
app.use('/aluno', rotasAluno);
app.use('/dashboard', rotasDashboard);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use((err, req, res, next) => {
    if (err.message?.includes('Tipo de arquivo não permitido')) {
        return res.status(400).json({ erro: err.message });
    }
    console.error(err.stack);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});