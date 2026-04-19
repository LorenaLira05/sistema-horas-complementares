const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const registrarLog = require('../utils/logger');
const { emailResultadoSubmissao } = require('../services/emailService');

exports.postCriarCategoria = async (req, res) => {
    const { name, description } = req.body;

    try {
        const resultado = await pool.query(
            `INSERT INTO categories (name, description)
             VALUES ($1, $2)
             RETURNING *`,
            [name, description]
        );

        await registrarLog(req.usuario.id, 'CRIAR_CATEGORIA', 'categories', resultado.rows[0].id, { name });
        res.status(201).json({ mensagem: "Categoria criada!", categoria: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.postCriarRegra = async (req, res) => {
    const { course_id, category_id, min_hours, max_hours, is_required, notes } = req.body;

    try {
        const categoria = await pool.query(
            `SELECT * FROM categories WHERE id = $1 AND is_active = true`,
            [category_id]
        );
        if (categoria.rows.length === 0) {
            return res.status(404).json({ erro: "Categoria não encontrada." });
        }

        const resultado = await pool.query(
            `INSERT INTO course_activity_rules (course_id, category_id, min_hours, max_hours, is_required, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [course_id, category_id, min_hours, max_hours, is_required, notes]
        );

        await registrarLog(req.usuario.id, 'CRIAR_REGRA', 'course_activity_rules', resultado.rows[0].id, { course_id, category_id });
        res.status(201).json({ mensagem: "Regra cadastrada com sucesso!", regra: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao criar regra: " + err.message });
    }
};

exports.getRegrasPorCurso = async (req, res) => {
    const { course_id } = req.params;

    try {
        const resultado = await pool.query(
            `SELECT car.*, cat.name AS category_name, cat.description AS category_description
             FROM course_activity_rules car
             JOIN categories cat ON cat.id = car.category_id
             WHERE car.course_id = $1`,
            [course_id]
        );
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar regras: " + err.message });
    }
};

exports.putAtualizarRegra = async (req, res) => {
    const { id } = req.params;
    const { min_hours, max_hours, is_required, notes } = req.body;

    try {
        const regra = await pool.query(
            `SELECT * FROM course_activity_rules WHERE id = $1`,
            [id]
        );
        if (regra.rows.length === 0) {
            return res.status(404).json({ erro: "Regra não encontrada." });
        }

        const resultado = await pool.query(
            `UPDATE course_activity_rules
             SET min_hours = $1, max_hours = $2, is_required = $3, notes = $4, updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [min_hours, max_hours, is_required, notes, id]
        );

        await registrarLog(req.usuario.id, 'ATUALIZAR_REGRA', 'course_activity_rules', id, { min_hours, max_hours });
        res.status(200).json({ mensagem: "Regra atualizada!", regra: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.deleteRegra = async (req, res) => {
    const { id } = req.params;

    try {
        const regra = await pool.query(
            `SELECT * FROM course_activity_rules WHERE id = $1`, [id]
        );
        if (regra.rows.length === 0) {
            return res.status(404).json({ erro: "Regra não encontrada." });
        }

        await pool.query(`DELETE FROM course_activity_rules WHERE id = $1`, [id]);
        await registrarLog(req.usuario.id, 'DELETAR_REGRA', 'course_activity_rules', id, {});
        res.status(200).json({ mensagem: "Regra deletada com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.postCadastrarAluno = async (req, res) => {
    const { full_name, email, cpf, phone, course_id, ra, status_matricula } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const senhaCripto = await bcrypt.hash('123456', 10);
        const novoUsuario = await client.query(
            `INSERT INTO users (full_name, email, password_hash, cpf, phone)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, full_name, email`,
            [full_name, email, senhaCripto, cpf, phone]
        );
        const userId = novoUsuario.rows[0].id;

        const role = await client.query(`SELECT id FROM roles WHERE name = 'student'`);
        await client.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
            [userId, role.rows[0].id]
        );

        await client.query(
            `INSERT INTO student_profiles (user_id, ra) VALUES ($1, $2)`,
            [userId, ra]
        );

        await client.query(
            `INSERT INTO user_courses (user_id, course_id, status_matricula)
             VALUES ($1, $2, $3)`,
            [userId, course_id, status_matricula || 'ativo']
        );

        await client.query('COMMIT');
        await registrarLog(req.usuario.id, 'CRIAR_ALUNO', 'users', userId, { full_name, email, course_id, ra });
        res.status(201).json({ mensagem: "Aluno cadastrado com sucesso!", aluno: novoUsuario.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ erro: err.message });
    } finally {
        client.release();
    }
};

exports.getAlunosDoCurso = async (req, res) => {
    const { course_id } = req.params;

    try {
        const resultado = await pool.query(
            `SELECT
                u.id, u.full_name, u.email, u.phone, u.status,
                sp.ra,
                uc.enrollment_date, uc.status_matricula
             FROM users u
             JOIN user_courses uc ON uc.user_id = u.id
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             LEFT JOIN student_profiles sp ON sp.user_id = u.id
             WHERE uc.course_id = $1 AND r.name = 'student' AND uc.is_active = true`,
            [course_id]
        );
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.putAtualizarAluno = async (req, res) => {
    const { id } = req.params;
    const { full_name, email, phone, ra, status_matricula, course_id } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const aluno = await client.query(`SELECT * FROM users WHERE id = $1`, [id]);
        if (aluno.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }

        await client.query(
            `UPDATE users SET full_name = $1, email = $2, phone = $3, updated_at = NOW()
             WHERE id = $4`,
            [full_name, email, phone, id]
        );

        await client.query(
            `INSERT INTO student_profiles (user_id, ra, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET ra = $2, updated_at = NOW()`,
            [id, ra]
        );

        if (status_matricula && course_id) {
            await client.query(
                `UPDATE user_courses SET status_matricula = $1
                 WHERE user_id = $2 AND course_id = $3`,
                [status_matricula, id, course_id]
            );
        }

        await client.query('COMMIT');
        await registrarLog(req.usuario.id, 'ATUALIZAR_ALUNO', 'users', id, { full_name, email, ra });
        res.status(200).json({ mensagem: "Aluno atualizado!" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ erro: err.message });
    } finally {
        client.release();
    }
};

exports.deleteAluno = async (req, res) => {
    const { id } = req.params;

    try {
        const aluno = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
        if (aluno.rows.length === 0) {
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }

        // ON DELETE CASCADE cuida de user_roles, user_courses, submissions
        await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
        await registrarLog(req.usuario.id, 'DELETAR_ALUNO', 'users', id, {});
        res.status(200).json({ mensagem: "Aluno deletado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};


exports.getSubmissoes = async (req, res) => {
    const { course_id } = req.params;
    const { status, pagina = 1 } = req.query;
    const itensPorPagina = 10;
    const offset = (pagina - 1) * itensPorPagina;

    try {
        let params = [course_id];
        let filtroStatus = '';

        if (status && status !== 'TODAS') {
            filtroStatus = `AND s.status = $2::submission_status_enum`;
            params.push(status, itensPorPagina, offset);
        } else {
            params.push(itensPorPagina, offset);
        }

        const resultado = await pool.query(
            `SELECT
                s.*,
                u.full_name AS student_name,
                u.email AS student_email,
                c.name AS course_name,
                cat.name AS category_name
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN users u ON u.id = uc.user_id
             JOIN courses c ON c.id = uc.course_id
             JOIN categories cat ON cat.id = s.category_id
             WHERE uc.course_id = $1
             ${filtroStatus}
             ORDER BY s.submitted_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const contadores = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE s.status = 'submitted') AS pendentes,
                COUNT(*) FILTER (WHERE s.status = 'approved') AS aprovadas,
                COUNT(*) FILTER (WHERE s.status = 'rejected') AS reprovadas,
                COUNT(*) AS total
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             WHERE uc.course_id = $1`,
            [course_id]
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
        const resultado = await pool.query(
            `SELECT
                s.*,
                u.full_name AS student_name,
                u.email AS student_email,
                c.name AS course_name,
                cat.name AS category_name,
                sf.original_filename,
                sf.storage_path,
                sf.file_type,
                sf.ocr_extracted_text,
                sf.ocr_confidence
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN users u ON u.id = uc.user_id
             JOIN courses c ON c.id = uc.course_id
             JOIN categories cat ON cat.id = s.category_id
             LEFT JOIN submission_files sf ON sf.submission_id = s.id
             WHERE s.id = $1`,
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
    const { status_final, comment, approved_hours } = req.body;
    const validator_user_id = req.usuario.id; // vem do token

    const statusValidos = ['approved', 'rejected', 'returned_for_adjustment'];
    if (!statusValidos.includes(status_final)) {
        return res.status(400).json({ erro: `Status deve ser: ${statusValidos.join(', ')}.` });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Busca status atual antes de atualizar
        const submissaoAtual = await client.query(
            `SELECT status FROM submissions WHERE id = $1`, [id]
        );
        if (submissaoAtual.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: "Submissão não encontrada." });
        }

        const previousStatus = submissaoAtual.rows[0].status;

        const submissao = await client.query(
            `UPDATE submissions
             SET status = $1::submission_status_enum,
                 approved_hours = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [status_final, approved_hours, id]
        );

        await client.query(
            `INSERT INTO validations (submission_id, validator_user_id, validation_status, previous_status, comment, approved_hours)
             VALUES ($1, $2, $3::validation_status_enum, $4::submission_status_enum, $5, $6)`,
            [id, validator_user_id, status_final, previousStatus, comment, approved_hours]
        );

        await client.query('COMMIT');

        const aluno = await pool.query(
            `SELECT u.full_name, u.email
             FROM submissions s
             JOIN user_courses uc ON uc.id = s.user_course_id
             JOIN users u ON u.id = uc.user_id
             WHERE s.id = $1`,
            [id]
        );

        if (aluno.rows.length > 0) {
            await emailResultadoSubmissao(
                aluno.rows[0].email,
                aluno.rows[0].full_name,
                status_final,
                submissao.rows[0].title,
                comment
            );

            await pool.query(
                `INSERT INTO notifications (user_id, submission_id, type, title, message)
                 VALUES (
                    (SELECT user_id FROM user_courses WHERE id = $1),
                    $2,
                    $3::notification_type_enum,
                    $4,
                    $5
                 )`,
                [
                    submissao.rows[0].user_course_id,
                    id,
                    `submission_${status_final}`,
                    `Sua submissão foi ${status_final === 'approved' ? 'aprovada' : status_final === 'rejected' ? 'reprovada' : 'devolvida para ajuste'}`,
                    comment || ''
                ]
            );
        }

        await registrarLog(req.usuario.id, 'VALIDAR_SUBMISSAO', 'submissions', id, { status_final, approved_hours });
        res.status(200).json({ mensagem: "Submissão validada!", dados: submissao.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ erro: err.message });
    } finally {
        client.release();
    }
};