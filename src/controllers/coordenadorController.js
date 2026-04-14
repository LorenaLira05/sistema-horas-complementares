const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const registrarLog = require('../utils/logger');
const { emailResultadoSubmissao } = require('../services/emailService');

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
        await registrarLog(req.usuario.id, req.usuario.perfil, 'CRIAR_REGRA', `Regra criada: ${nome_categoria}`, req.ip);
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
        await registrarLog(req.usuario.id, req.usuario.perfil, 'CRIAR_ALUNO', `Aluno criado: ${resultado.rows[0].email}`, req.ip);
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


exports.getSubmissoes = async (req, res) => {
    const { curso_id } = req.params;
    const { status, pagina = 1 } = req.query;
    const itensPorPagina = 10;
    const offset = (pagina - 1) * itensPorPagina;

    if (req.usuario.curso_id != curso_id) {
        return res.status(403).json({
            erro: "Você não tem acesso a este curso."
        });
    }

    try {
        let filtroStatus = '';
        let params = [curso_id];

        if (status && status !== 'TODAS') {
            filtroStatus = `AND a.status = $2`;
            params.push(status);
            params.push(itensPorPagina);
            params.push(offset);
        } else {
            params.push(itensPorPagina);
            params.push(offset);
        }

        const query = `
            SELECT 
                a.*,
                u.nome as nome_aluno,
                u.matricula,
                c.nome_curso,
                r.nome_categoria as categoria
            FROM atividades_enviadas a
            JOIN usuarios u ON a.aluno_id = u.id
            JOIN cursos c ON c.id = $1
            LEFT JOIN regras_atividades r ON a.regra_id = r.id
            WHERE u.curso_id = $1
            ${filtroStatus}
            ORDER BY a.data_envio DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const resultado = await pool.query(query, params);

        const contadores = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'PENDENTE') as pendentes,
                COUNT(*) FILTER (WHERE status = 'APROVADO') as aprovadas,
                COUNT(*) FILTER (WHERE status = 'REJEITADO') as reprovadas,
                COUNT(*) as total
            FROM atividades_enviadas a
            JOIN usuarios u ON a.aluno_id = u.id
            WHERE u.curso_id = $1`,
            [curso_id]
        );

        res.status(200).json({
            submissoes: resultado.rows,
            contadores: contadores.rows[0],
            pagina: parseInt(pagina),
            total_paginas: Math.ceil(contadores.rows[0].total / itensPorPagina)
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getSubmissaoPorId = async (req, res) => {
    const { id } = req.params;

    try {
        const resultado = await pool.query(`
            SELECT 
                a.*,
                u.nome as nome_aluno,
                u.email as email_aluno,
                u.matricula,
                c.nome_curso,
                r.nome_categoria as categoria,
                cert.caminho_arquivo,
                cert.nome_arquivo
            FROM atividades_enviadas a
            JOIN usuarios u ON a.aluno_id = u.id
            JOIN cursos c ON c.id = u.curso_id
            LEFT JOIN regras_atividades r ON a.regra_id = r.id
            LEFT JOIN certificados cert ON cert.atividade_id = a.id
            WHERE a.id = $1`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: "Submissão não encontrada." });
        }

        res.status(200).json(resultado.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.patchValidarSubmissao = async (req, res) => {
    const { id } = req.params;
    const { status_final, feedback, horas_aprovadas } = req.body;
    const coordenador_id = req.usuario.id;

    if (!['APROVADO', 'REJEITADO'].includes(status_final)) {
        return res.status(400).json({ 
            erro: "Status deve ser APROVADO ou REJEITADO." 
        });
    }

    try {
        const query = `
            UPDATE atividades_enviadas 
            SET status = $1,
                feedback = $2,
                horas_aprovadas = $3,
                coordenador_id = $4,
                data_validacao = NOW()
            WHERE id = $5 
            RETURNING *`;
        
        const resultado = await pool.query(query, [
            status_final, 
            feedback, 
            horas_aprovadas, 
            coordenador_id, 
            id
        ]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: "Submissão não encontrada." });
        }


    const aluno = await pool.query(
    'SELECT nome, email FROM usuarios WHERE id = $1',
    [resultado.rows[0].aluno_id]
    );

    // Envia e-mail para o aluno com o resultado
    if (aluno.rows.length > 0) {
    await emailResultadoSubmissao(
        aluno.rows[0].email,
        aluno.rows[0].nome,
        status_final,
        resultado.rows[0].descricao,
        feedback
    );
    }
        await registrarLog(req.usuario.id, req.usuario.perfil, 'VALIDAR_SUBMISSAO', `Submissão id ${id} marcada como ${status_final}`, req.ip);
        res.status(200).json({ 
            mensagem: "Status atualizado!", 
            dados: resultado.rows[0] 
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.putAtualizarRegra = async (req, res) => {
    const { id } = req.params;
    const { nome_categoria, limite_horas } = req.body;

    try {
        const regra = await pool.query(
            'SELECT * FROM regras_atividades WHERE id = $1',
            [id]
        );

        if (regra.rows.length === 0) {
            return res.status(404).json({ erro: "Regra não encontrada." });
        }

        if (req.usuario.curso_id != regra.rows[0].curso_id) {
            return res.status(403).json({ erro: "Você não tem acesso a esta regra." });
        }

        const query = `
            UPDATE regras_atividades 
            SET nome_categoria = $1, limite_horas = $2
            WHERE id = $3
            RETURNING *`;

        const resultado = await pool.query(query, [nome_categoria, limite_horas, id]);
        await registrarLog(req.usuario.id, req.usuario.perfil, 'ATUALIZAR_REGRA', `Regra atualizada: id ${id}`, req.ip);
        res.status(200).json({ mensagem: "Regra atualizada!", regra: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.putAtualizarAluno = async (req, res) => {
    const { id } = req.params;
    const { nome, email, matricula } = req.body;

    try {
        
        const aluno = await pool.query(
            "SELECT * FROM usuarios WHERE id = $1 AND perfil = 'ALUNO'",
            [id]
        );

        if (aluno.rows.length === 0) {
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }

        if (req.usuario.curso_id != aluno.rows[0].curso_id) {
            return res.status(403).json({ erro: "Você não tem acesso a este aluno." });
        }

        const query = `
            UPDATE usuarios 
            SET nome = $1, email = $2, matricula = $3
            WHERE id = $4 AND perfil = 'ALUNO'
            RETURNING id, nome, email, matricula`;

        const resultado = await pool.query(query, [nome, email, matricula, id]);
        await registrarLog(req.usuario.id, req.usuario.perfil, 'ATUALIZAR_ALUNO', `Aluno atualizado: id ${id}`, req.ip);
        res.status(200).json({ mensagem: "Aluno atualizado!", aluno: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.deleteAluno = async (req, res) => {
    const { id } = req.params;
    try {
        const aluno = await pool.query(
            "SELECT * FROM usuarios WHERE id = $1 AND perfil = 'ALUNO'", [id]
        );
        if (aluno.rows.length === 0) {
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }
        if (req.usuario.curso_id != aluno.rows[0].curso_id) {
            return res.status(403).json({ erro: "Você não tem acesso a este aluno." });
        }
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        await registrarLog(req.usuario.id, req.usuario.perfil, 'DELETAR_ALUNO', `Aluno deletado: id ${id}`, req.ip);
        res.status(200).json({ mensagem: "Aluno deletado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.deleteRegra = async (req, res) => {
    const { id } = req.params;
    try {
        const regra = await pool.query(
            'SELECT * FROM regras_atividades WHERE id = $1', [id]
        );
        if (regra.rows.length === 0) {
            return res.status(404).json({ erro: "Regra não encontrada." });
        }
        if (req.usuario.curso_id != regra.rows[0].curso_id) {
            return res.status(403).json({ erro: "Você não tem acesso a esta regra." });
        }
        await pool.query('DELETE FROM regras_atividades WHERE id = $1', [id]);
        await registrarLog(req.usuario.id, req.usuario.perfil, 'DELETAR_REGRA', `Regra deletada: id ${id}`, req.ip);
        res.status(200).json({ mensagem: "Regra deletada com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};