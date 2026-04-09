const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();


app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const rotasAdmin = require('./routes/admin');
const rotasCoordenador = require('./routes/coordenador');
const rotasAluno = require('./routes/aluno');
const rotasAuth = require('./routes/authRoutes');
const rotasDashboard = require('./routes/dashboard');

app.use('/admin', rotasAdmin);
app.use('/coordenador', rotasCoordenador);
app.use('/aluno', rotasAluno);
app.use('/auth', rotasAuth);
app.use('/dashboard', rotasDashboard);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server rodando na porta ${PORT}`);
});