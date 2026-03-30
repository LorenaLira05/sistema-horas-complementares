const pool = require('../config/database');
const bcrypt = require('bcryptjs');

exports.postCriarCurso = async (req, res) => {
    const { nome_curso, sigla } = req.body;
    try {
        const query = `INSERT INTO cursos (nome_curso, sigla) VALUES ($1, $2) RETURNING *`;
        const resultado = await pool.query(query, [nome_curso, sigla]);
        res.status(201).json({ mensagem: "Curso criado!", curso: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getListaCursos = async (req, res) => {
    try {
        // O gerente pede ao banco todos os cursos
        const resultado = await pool.query('SELECT * FROM cursos');
        
        // O gerente responde para o usuário com a lista
        res.status(200).json(resultado.rows);
    } catch (err) {
        // Se der erro (ex: tabela não existe), o gerente avisa
        res.status(500).json({ erro: "Erro ao buscar cursos: " + err.message });
    }
};
exports.postCadastrarCoordenador = async (req, res) => {
    const { nome, email, senha, curso_id } = req.body;

    try {
        // Protege a senha antes de salvar no banco
        const senhaCripto = await bcrypt.hash(senha, 10);

        const query = `
            INSERT INTO usuarios (nome, email, senha, perfil, curso_id) 
            VALUES ($1, $2, $3, 'COORDENADOR', $4) 
            RETURNING id, nome, email`;
        
        const resultado = await pool.query(query, [nome, email, senhaCripto, curso_id]);
        
        res.status(201).json({
            mensagem: "Coordenador cadastrado com sucesso!",
            dados: resultado.rows[0]
        });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao cadastrar: " + err.message });
    }
};

