const pool = require('../config/database');
const bcrypt = require('bcryptjs');


exports.postCriarRegra = async (req, res) => {
    const { curso_id, nome_categoria, limite_horas } = req.body;

    if (req.usuario.curso_id != curso_id) {
        return res.status(403).json({ 
            erro: "Você não tem acesso a este curso." 
        });
    }

    try {
        const query = `
            INSERT INTO regras_atividades (curso_id, nome_categoria, limite_horas) 
            VALUES ($1, $2, $3) RETURNING *`;
        
        const resultado = await pool.query(query, [curso_id, nome_categoria, limite_horas]);
        
        res.status(201).json({
            mensagem: "Regra cadastrada com sucesso!",
            regra: resultado.rows[0]
        });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao criar regra: " + err.message });
    }
};


exports.getRegrasPorCurso = async (req, res) => {
    const { curso_id } = req.params;

    if (req.usuario.curso_id != curso_id) {
        return res.status(403).json({ 
            erro: "Você não tem acesso a este curso." 
        });
    }

    try {
        const resultado = await pool.query(
            'SELECT * FROM regras_atividades WHERE curso_id = $1', 
            [curso_id]
        );
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar regras: " + err.message });
    }
};


exports.postCadastrarAluno = async (req, res) => {
    const { nome, email, senha, matricula, curso_id } = req.body;

    if (req.usuario.curso_id != curso_id) {
        return res.status(403).json({ 
            erro: "Você não tem acesso a este curso." 
        });
    }

    try {
        const senhaCripto = await bcrypt.hash(senha, 10);
        const query = `
            INSERT INTO usuarios (nome, email, senha, matricula, perfil, curso_id) 
            VALUES ($1, $2, $3, $4, 'ALUNO', $5) RETURNING id, nome, email`;
        
        const resultado = await pool.query(query, [nome, email, senhaCripto, matricula, curso_id]);
        res.status(201).json({ mensagem: "Aluno cadastrado!", aluno: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

// Ver alunos do curso
exports.getAlunosDoCurso = async (req, res) => {
    const { curso_id } = req.params;

    if (req.usuario.curso_id != curso_id) {
        return res.status(403).json({ 
            erro: "Você só pode ver alunos do seu próprio curso." 
        });
    }

    try {
        const query = `SELECT id, nome, email, matricula FROM usuarios WHERE curso_id = $1 AND perfil = 'ALUNO'`;
        const resultado = await pool.query(query, [curso_id]);
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};


exports.getSubmissoesPendentes = async (req, res) => {
    const { curso_id } = req.params;

    if (req.usuario.curso_id != curso_id) {
        return res.status(403).json({ 
            erro: "Você não tem acesso a este curso." 
        });
    }

    try {
        const query = `
            SELECT a.*, u.nome as nome_aluno 
            FROM atividades_enviadas a
            JOIN usuarios u ON a.aluno_id = u.id
            WHERE u.curso_id = $1 AND a.status = 'PENDENTE'`;
        const resultado = await pool.query(query, [curso_id]);
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};


exports.patchValidarSubmissao = async (req, res) => {
    const { id } = req.params;
    const { status_final } = req.body;

    if (!['APROVADO', 'REJEITADO'].includes(status_final)) {
        return res.status(400).json({ 
            erro: "Status deve ser APROVADO ou REJEITADO." 
        });
    }

    try {
        const query = `
            UPDATE atividades_enviadas 
            SET status = $1 
            WHERE id = $2 
            RETURNING *`;
        const resultado = await pool.query(query, [status_final, id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: "Submissão não encontrada." });
        }

        res.status(200).json({ 
            mensagem: "Status atualizado!", 
            dados: resultado.rows[0] 
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
}; 
