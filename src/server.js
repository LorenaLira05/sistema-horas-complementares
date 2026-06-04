const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Servir arquivos de upload estáticos
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const rotasAuth = require('./routes/authRoutes');
const rotasAdmin = require('./routes/admin');
const rotasCoordenador = require('./routes/coordenador');
const rotasAluno = require('./routes/aluno');
const rotasDashboard = require('./routes/dashboard');
const rotasUpload = require('./routes/upload');

app.use('/auth', rotasAuth);
app.use('/admin', rotasAdmin);
app.use('/coordenador', rotasCoordenador);
app.use('/aluno', rotasAluno);
app.use('/dashboard', rotasDashboard);
app.use('/upload', rotasUpload);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'frontend','pages' ,'index.html'));
});

app.use((err, req, res, next) => {
    if (err.message?.includes('Tipo de arquivo não permitido')) {
        return res.status(400).json({ erro: err.message });
    }
    console.error(err.stack);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const scriptPath = path.join(__dirname, 'scripts', 'executar_pipeline.py');
const scriptDir  = path.join(__dirname, 'scripts');

cron.schedule('0 3 * * *', () => {
    exec(`python "${scriptPath}"`, { cwd: scriptDir }, (err, stdout, stderr) => {
        if (err) console.error('[CRON] Pipeline falhou:', err.message);
        else console.log('[CRON] Pipeline executada com sucesso');
        if (stderr) console.warn('[CRON] Avisos:', stderr);
    });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
