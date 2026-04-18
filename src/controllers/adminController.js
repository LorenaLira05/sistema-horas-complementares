const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const registrarLog = require('../utils/logger');

exports.postCriarCurso = async (req, res) => {
    const { name, code, minimum_required_hours, description, modalidade, turno, semestres } = req.body;

    try {
        const resultado = await pool.query(
            `INSERT INTO courses (name, code, minimum_required_hours, description, modalidade, turno, semestres)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, code, minimum_required_hours, description, modalidade, turno, semestres]
        );

        await registrarLog(req.usuario.id, 'CRIAR_CURSO', 'courses', resultado.rows[0].id, { name, code });
        res.status(201).json({ mensagem: "Curso criado!", curso: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getListaCursos = async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT * FROM courses WHERE is_active = true ORDER BY name`
        );
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar cursos: " + err.message });
    }
};

exports.putAtualizarCurso = async (req, res) => {
    const { id } = req.params;
    const { name, code, minimum_required_hours, description, modalidade, turno, semestres } = req.body;

    try {
        const resultado = await pool.query(
            `UPDATE courses
             SET name = $1, code = $2, minimum_required_hours = $3, description = $4,
                 modalidade = $5, turno = $6, semestres = $7, updated_at = NOW()
             WHERE id = $8
             RETURNING *`,
            [name, code, minimum_required_hours, description, modalidade, turno, semestres, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: "Curso não encontrado." });
        }

        await registrarLog(req.usuario.id, 'ATUALIZAR_CURSO', 'courses', id, { name, code });
        res.status(200).json({ mensagem: "Curso atualizado!", curso: resultado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.deleteCurso = async (req, res) => {
    const { id } = req.params;

    try {
        const resultado = await pool.query(
            `UPDATE courses SET is_active = false, updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: "Curso não encontrado." });
        }

        await registrarLog(req.usuario.id, 'DELETAR_CURSO', 'courses', id, {});
        res.status(200).json({ mensagem: "Curso desativado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getListaCoordenadores = async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
                u.id, u.full_name, u.email, u.phone, u.cpf, u.status,
                cp.departamento, cp.cargo, cp.data_nascimento, cp.data_admissao, cp.observacoes_internas,
                array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL) AS course_ids,
                array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS course_names
             FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             LEFT JOIN coordinator_profiles cp ON cp.user_id = u.id
             LEFT JOIN course_coordinators cc ON cc.user_id = u.id AND cc.is_active = true
             LEFT JOIN courses c ON c.id = cc.course_id
             WHERE r.name = 'coordinator'
             GROUP BY u.id, cp.departamento, cp.cargo, cp.data_nascimento, cp.data_admissao, cp.observacoes_internas`
        );
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar coordenadores: " + err.message });
    }
};

exports.postCadastrarCoordenador = async (req, res) => {
    const {
        full_name, email, cpf, phone, course_ids,
        departamento, cargo, data_nascimento, data_admissao, observacoes_internas
    } = req.body;

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

        const role = await client.query(`SELECT id FROM roles WHERE name = 'coordinator'`);
        await client.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
            [userId, role.rows[0].id]
        );

        await client.query(
            `INSERT INTO coordinator_profiles
             (user_id, departamento, cargo, data_nascimento, data_admissao, observacoes_internas)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, departamento, cargo, data_nascimento, data_admissao, observacoes_internas]
        );
        
        if (course_ids && course_ids.length > 0) {
            for (const course_id of course_ids) {
                await client.query(
                    `INSERT INTO course_coordinators (user_id, course_id) VALUES ($1, $2)`,
                    [userId, course_id]
                );
            }
        }

        await client.query('COMMIT');
        await registrarLog(req.usuario.id, 'CRIAR_COORDENADOR', 'users', userId, { full_name, email });
        res.status(201).json({ mensagem: "Coordenador cadastrado com sucesso!", coordenador: novoUsuario.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ erro: "Erro ao cadastrar: " + err.message });
    } finally {
        client.release();
    }
};

exports.putAtualizarCoordenador = async (req, res) => {
    const { id } = req.params;
    const {
        full_name, email, phone, course_ids,
        departamento, cargo, data_nascimento, data_admissao, observacoes_internas
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const coord = await client.query(
            `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE u.id = $1 AND r.name = 'coordinator'`,
            [id]
        );

        if (coord.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: "Coordenador não encontrado." });
        }

        // Atualiza users
        await client.query(
            `UPDATE users SET full_name = $1, email = $2, phone = $3, updated_at = NOW()
             WHERE id = $4`,
            [full_name, email, phone, id]
        );

        await client.query(
            `INSERT INTO coordinator_profiles
             (user_id, departamento, cargo, data_nascimento, data_admissao, observacoes_internas, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET departamento = $2, cargo = $3, data_nascimento = $4,
                 data_admissao = $5, observacoes_internas = $6, updated_at = NOW()`,
            [id, departamento, cargo, data_nascimento, data_admissao, observacoes_internas]
        );

        if (course_ids && course_ids.length > 0) {
            await client.query(
                `UPDATE course_coordinators SET is_active = false WHERE user_id = $1`,
                [id]
            );
            for (const course_id of course_ids) {
                await client.query(
                    `INSERT INTO course_coordinators (user_id, course_id)
                     VALUES ($1, $2)
                     ON CONFLICT (user_id, course_id) DO UPDATE SET is_active = true, assigned_at = NOW()`,
                    [id, course_id]
                );
            }
        }

        await client.query('COMMIT');
        await registrarLog(req.usuario.id, 'ATUALIZAR_COORDENADOR', 'users', id, { full_name, email });
        res.status(200).json({ mensagem: "Coordenador atualizado!" });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ erro: err.message });
    } finally {
        client.release();
    }
};

exports.deleteCoordenador = async (req, res) => {
    const { id } = req.params;

    try {
        const coord = await pool.query(
            `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE u.id = $1 AND r.name = 'coordinator'`,
            [id]
        );

        if (coord.rows.length === 0) {
            return res.status(404).json({ erro: "Coordenador não encontrado." });
        }

        // ON DELETE CASCADE cuida de user_roles, course_coordinators e coordinator_profiles
        await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
        await registrarLog(req.usuario.id, 'DELETAR_COORDENADOR', 'users', id, {});
        res.status(200).json({ mensagem: "Coordenador deletado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};