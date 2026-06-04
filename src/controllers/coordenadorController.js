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

exports.getListaCategorias = async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY name');
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getTodasRegras = async (req, res) => {
    try {
        const isSuperAdmin = req.usuario.perfis && req.usuario.perfis.includes('super_admin');
        let query;
        let params = [];

        if (isSuperAdmin) {
            query = `SELECT * FROM view_regras_atividades`;
        } else {
            query = `SELECT * FROM view_regras_atividades WHERE coordinator_user_id = $1`;
            params = [req.usuario.id];
        }

        const resultado = await pool.query(query, params);
        res.status(200).json(resultado.rows);
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
    const isSuperAdmin = req.usuario.perfis && req.usuario.perfis.includes('super_admin');

    const courseIdNum = parseInt(course_id);
    if (isNaN(courseIdNum)) {
        return res.status(400).json({ erro: "ID de curso inválido." });
    }

    if (!isSuperAdmin) {
        const acesso = await pool.query(
            `SELECT id FROM course_coordinators 
             WHERE user_id = $1 AND course_id = $2 AND is_active = true`,
            [req.usuario.id, courseIdNum]
        );
        if (acesso.rows.length === 0) {
            return res.status(403).json({ erro: "Você não tem acesso a este curso." });
        }
    }

    try {
        const resultado = await pool.query(
            `SELECT car.*, cat.name AS category_name, cat.description AS category_description
             FROM course_activity_rules car
             JOIN categories cat ON cat.id = car.category_id
             WHERE car.course_id = $1`,
            [courseIdNum]
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
    const isSuperAdmin = req.usuario.perfis && req.usuario.perfis.includes('super_admin');

    if (!isSuperAdmin) {
        const acesso = await pool.query(
            `SELECT id FROM course_coordinators 
             WHERE user_id = $1 AND course_id = $2 AND is_active = true`,
            [req.usuario.id, course_id]
        );
        if (acesso.rows.length === 0) {
            return res.status(403).json({ erro: "Você não tem acesso a este curso." });
        }
    }

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
    const isSuperAdmin = req.usuario.perfis && req.usuario.perfis.includes('super_admin');

    if (!isSuperAdmin) {
        const acesso = await pool.query(
            `SELECT id FROM course_coordinators 
             WHERE user_id = $1 AND course_id = $2 AND is_active = true`,
            [req.usuario.id, course_id]
        );
        if (acesso.rows.length === 0) {
            return res.status(403).json({ erro: "Você não tem acesso a este curso." });
        }
    }

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
    const { 
        full_name, email, phone, ra, status_matricula, course_id, cpf 
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const aluno = await client.query(`SELECT * FROM users WHERE id = $1`, [id]);
        if (aluno.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }

        // 1. Atualizar Usuário
        await client.query(
            `UPDATE users SET full_name = $1, email = $2, phone = $3, cpf = $4, updated_at = NOW()
             WHERE id = $5`,
            [full_name, email, phone, cpf, id]
        );

        // 2. Atualizar Perfil (RA)
        await client.query(
            `INSERT INTO student_profiles (user_id, ra, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET 
                ra = EXCLUDED.ra, 
                updated_at = NOW()`,
            [id, ra]
        );

        // 3. Atualizar Vínculo com Curso (Status)
        if (course_id) {
            await client.query(
                `UPDATE user_courses SET 
                    status_matricula = COALESCE($1, status_matricula),
                    updated_at = NOW()
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

exports.getAlunoById = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT u.id, u.full_name, u.email, u.phone, u.cpf,
                   sp.ra,
                   uc.course_id, uc.status_matricula, uc.enrollment_date,
                   c.name as course_name
            FROM users u
            LEFT JOIN student_profiles sp ON u.id = sp.user_id
            LEFT JOIN user_courses uc ON u.id = uc.user_id
            LEFT JOIN courses c ON uc.course_id = c.id
            WHERE u.id = $1
        `;
        const result = await pool.query(query, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getMeusCursos = async (req, res) => {
    try {
        const isSuperAdmin = req.usuario.perfis && req.usuario.perfis.includes('super_admin');
        
        let query;
        let params = [];

        if (isSuperAdmin) {
            query = `SELECT id, name, code FROM courses WHERE is_active = true ORDER BY name`;
        } else {
            query = `SELECT c.id, c.name, c.code 
                     FROM courses c
                     JOIN course_coordinators cc ON cc.course_id = c.id
                     WHERE cc.user_id = $1 AND cc.is_active = true AND c.is_active = true
                     ORDER BY c.name`;
            params = [req.usuario.id];
        }

        const resultado = await pool.query(query, params);
        res.status(200).json(resultado.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.patchInativarAluno = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`UPDATE users SET status = 'inativo', updated_at = NOW() WHERE id = $1`, [id]);
        await pool.query(`UPDATE user_courses SET is_active = false WHERE user_id = $1`, [id]);
        await registrarLog(req.usuario.id, 'INATIVAR_ALUNO', 'users', id, {});
        res.status(200).json({ mensagem: "Aluno inativado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.patchStatusAluno = async (req, res) => {
    const { id } = req.params;
    const { status_matricula } = req.body;
    try {
        await pool.query(
            `UPDATE user_courses SET status_matricula = $1, updated_at = NOW() WHERE user_id = $2`,
            [status_matricula, id]
        );
        await registrarLog(req.usuario.id, 'ALTERAR_STATUS_ALUNO', 'user_courses', id, { status_matricula });
        res.status(200).json({ mensagem: "Status atualizado!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.deleteAluno = async (req, res) => {
    const { id } = req.params;

    try {
        const aluno = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
        if (aluno.rows.length === 0) {
            return res.status(404).json({ erro: "Aluno não encontrado." });
        }

        await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
        await registrarLog(req.usuario.id, 'DELETAR_ALUNO', 'users', id, {});
        res.status(200).json({ mensagem: "Aluno deletado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
};

exports.getSubmissoes = async (req, res) => {
    let { course_id } = req.params;
    const { status, pagina = 1 } = req.query;

    const itensPorPagina = 10;
    const offset = (pagina - 1) * itensPorPagina;

    const isSuperAdmin =
        req.usuario.perfis &&
        req.usuario.perfis.includes('super_admin');

    let course_ids = [];

    try {
        if (course_id) {
            // Se course_id foi informado, valida acesso do coordenador
            if (!isSuperAdmin) {
                const acesso = await pool.query(
                    `SELECT id
                     FROM course_coordinators
                     WHERE user_id = $1
                       AND course_id = $2
                       AND is_active = true`,
                    [req.usuario.id, course_id]
                );

                if (acesso.rows.length === 0) {
                    return res.status(403).json({
                        erro: 'Você não tem acesso a este curso.'
                    });
                }
            }
            course_ids = [parseInt(course_id)];
        } else {
            // Se course_id NÃO foi informado, busca todos os cursos do coordenador
            if (isSuperAdmin) {
                const todosCursos = await pool.query(
                    `SELECT id FROM courses WHERE is_active = true`
                );
                course_ids = todosCursos.rows.map(r => r.id);
            } else {
                const acesso = await pool.query(
                    `SELECT course_id
                     FROM course_coordinators
                     WHERE user_id = $1
                       AND is_active = true`,
                    [req.usuario.id]
                );
                course_ids = acesso.rows.map(r => r.course_id);
            }

            if (course_ids.length === 0) {
                return res.status(200).json({
                    submissoes: [],
                    contadores: { pendentes: 0, aprovadas: 0, reprovadas: 0, total: 0 },
                    pagina: parseInt(pagina),
                    total_paginas: 0
                });
            }
        }

        let params = [course_ids];
        let filtroStatus = '';

        if (status && status === 'PENDENTE') {
            filtroStatus = `
                AND status NOT IN ('approved', 'rejected')
            `;

            params.push(itensPorPagina, offset);
        } else if (status && status !== 'TODAS') {
            filtroStatus = `
                AND status = $2::submission_status_enum
            `;

            params.push(status, itensPorPagina, offset);
        } else {
            params.push(itensPorPagina, offset);
        }

        const resultado = await pool.query(
            `SELECT *
             FROM view_submissoes_completo
             WHERE course_id = ANY($1::bigint[])
             ${filtroStatus}
             ORDER BY submitted_at DESC
             LIMIT $${params.length - 1}
             OFFSET $${params.length}`,
            params
        );

        const contadores = await pool.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE status NOT IN ('approved', 'rejected')
                ) AS pendentes,

                COUNT(*) FILTER (
                    WHERE status = 'approved'
                ) AS aprovadas,

                COUNT(*) FILTER (
                    WHERE status = 'rejected'
                ) AS reprovadas,

                COUNT(*) AS total

             FROM view_submissoes_completo
             WHERE course_id = ANY($1::bigint[])`,
            [course_ids]
        );

        res.status(200).json({
            submissoes: resultado.rows,
            contadores: contadores.rows[0],
            pagina: parseInt(pagina),
            total_paginas: Math.ceil(
                (parseInt(contadores.rows[0].total) || 0) / itensPorPagina
            )
        });

    } catch (err) {
        res.status(500).json({
            erro: err.message
        });
    }
};

exports.getSubmissaoPorId = async (req, res) => {
    const { id } = req.params;

    const idNum = parseInt(id);
    if (isNaN(idNum)) {
        return res.status(400).json({ erro: "ID de submissão inválido." });
    }

    try {
        const resultado = await pool.query(
            `SELECT *
             FROM view_submissoes_detalhes
             WHERE submission_id = $1`,
            [idNum]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                erro: "Submissão não encontrada."
            });
        }

        res.status(200).json(resultado.rows[0]);

    } catch (err) {
        res.status(500).json({
            erro: err.message
        });
    }
};

exports.patchValidarSubmissao = async (req, res) => {
    const { id } = req.params;
    const { status_final, comment, approved_hours } = req.body;
    const validator_user_id = req.usuario.id;

    const statusValidos = [
        'approved',
        'rejected',
        'returned_for_adjustment'
    ];

    if (!statusValidos.includes(status_final)) {
        return res.status(400).json({
            erro: `Status deve ser: ${statusValidos.join(', ')}.`
        });
    }

    const client = await pool.connect();

    try {
        console.time('validacao_total');

        await client.query('BEGIN');

        console.time('buscar_status_atual');

        const submissaoAtual = await client.query(
            `SELECT status
             FROM submissions
             WHERE id = $1`,
            [id]
        );

        console.timeEnd('buscar_status_atual');

        if (submissaoAtual.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                erro: 'Submissão não encontrada.'
            });
        }

        const previousStatus = submissaoAtual.rows[0].status;

        console.time('update_submissao');

        const submissao = await client.query(
            `UPDATE submissions
             SET status = $1::submission_status_enum,
                 approved_hours = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [status_final, approved_hours, id]
        );

        console.timeEnd('update_submissao');

        console.time('insert_validation');

        await client.query(
            `INSERT INTO validations (
                submission_id,
                validator_user_id,
                validation_status,
                previous_status,
                comment,
                approved_hours
            )
            VALUES (
                $1,
                $2,
                $3::validation_status_enum,
                $4::submission_status_enum,
                $5,
                $6
            )`,
            [
                id,
                validator_user_id,
                status_final,
                previousStatus,
                comment,
                approved_hours
            ]
        );

        console.timeEnd('insert_validation');

        console.time('commit');

        await client.query('COMMIT');

        console.timeEnd('commit');

        console.time('buscar_aluno');

        const aluno = await pool.query(
            `SELECT
                u.id,
                u.full_name,
                u.email
             FROM submissions s
             JOIN user_courses uc
                ON uc.id = s.user_course_id
             JOIN users u
                ON u.id = uc.user_id
             WHERE s.id = $1`,
            [id]
        );

        console.timeEnd('buscar_aluno');

        if (aluno.rows.length > 0) {

            console.time('envio_email');

            emailResultadoSubmissao(
                aluno.rows[0].email,
                aluno.rows[0].full_name,
                status_final,
                submissao.rows[0].title,
                comment
            ).catch(err => {
                console.error('Erro ao enviar email:', err);
            });

            console.time('insert_notification');

            const notificationTypeMap = {
                approved: 'submission_approved',
                rejected: 'submission_rejected',
                returned_for_adjustment: 'submission_returned'
            };

            const notificationTitle =
                status_final === 'approved'
                    ? 'Sua submissão foi aprovada'
                    : status_final === 'rejected'
                        ? 'Sua submissão foi reprovada'
                        : 'Sua submissão foi devolvida para ajuste';

            await pool.query(
                `INSERT INTO notifications (
                    user_id,
                    submission_id,
                    type,
                    title,
                    message
                )
                VALUES (
                    $1,
                    $2,
                    $3::notification_type_enum,
                    $4,
                    $5
                )`,
                [
                    aluno.rows[0].id,
                    submissao.rows[0].id,
                    notificationTypeMap[status_final],
                    notificationTitle,
                    comment || ''
                ]
            );

            console.timeEnd('insert_notification');
        }

        await registrarLog(
            req.usuario.id,
            'VALIDAR_SUBMISSAO',
            'submissions',
            id,
            {
                status_final,
                approved_hours
            }
        );

        console.timeEnd('validacao_total');

        return res.status(200).json({
            mensagem: 'Submissão validada!',
            dados: submissao.rows[0]
        });

    } catch (err) {
        await client.query('ROLLBACK');

        console.error(err);

        return res.status(500).json({
            erro: err.message
        });

    } finally {
        client.release();
    }
};

exports.getResumoGeral = async (req, res) => {
    const user_id = parseInt(req.usuario.id);
    const isSuperAdmin =
        req.usuario.perfis &&
        req.usuario.perfis.includes('super_admin');

    try {
        let course_ids = [];

        if (isSuperAdmin) {
            const todos = await pool.query(
                `SELECT id
                 FROM courses
                 WHERE is_active = true`
            );

            course_ids = todos.rows.map(r => parseInt(r.id));
        } else {
            const cursos = await pool.query(
                `SELECT course_id
                 FROM course_coordinators
                 WHERE user_id = $1
                   AND is_active = true`,
                [user_id]
            );

            course_ids = cursos.rows.map(r => parseInt(r.course_id));
        }

        if (course_ids.length === 0) {
            return res.status(200).json({
                alunos: [],
                categorias: [],
                contadores: {}
            });
        }

        const alunos = await pool.query(
            `SELECT *
             FROM view_resumo_aluno_por_curso
             WHERE course_id = ANY($1)
             ORDER BY full_name`,
            [course_ids]
        );

        const categorias = await pool.query(
            `SELECT *
             FROM view_resumo_por_categoria
             WHERE course_id = ANY($1)
             ORDER BY full_name, category_name`,
            [course_ids]
        );

        const contadores = await pool.query(
            `SELECT
                COUNT(DISTINCT user_id) AS total_alunos,

                SUM(
                    CASE
                        WHEN total_submissoes > 0
                        THEN total_submissoes
                        ELSE 0
                    END
                ) AS total_submissoes

             FROM view_resumo_aluno_por_curso
             WHERE course_id = ANY($1)`,
            [course_ids]
        );

        const pendentesAprovadas = await pool.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE status NOT IN ('approved', 'rejected')
                ) AS pendentes,

                COUNT(*) FILTER (
                    WHERE status = 'approved'
                ) AS aprovadas,

                COALESCE(SUM(CASE WHEN status = 'approved' THEN approved_hours ELSE 0 END), 0) AS horas_aprovadas,

                COALESCE(SUM(CASE WHEN status NOT IN ('approved', 'rejected') THEN approved_hours ELSE 0 END), 0) AS horas_pendentes

            FROM view_submissoes_completo
            WHERE course_id = ANY($1)`,
            [course_ids]
        );

        return res.status(200).json({
            alunos: alunos.rows,
            categorias: categorias.rows,
            contadores: {
            total_alunos:
                contadores.rows[0].total_alunos,

            total_submissoes:
                contadores.rows[0].total_submissoes || 0,

            pendentes:
                pendentesAprovadas.rows[0].pendentes || 0,

            aprovadas:
                pendentesAprovadas.rows[0].aprovadas || 0,

            horas_aprovadas:
                parseFloat(pendentesAprovadas.rows[0].horas_aprovadas) || 0,

            horas_pendentes:
                parseFloat(pendentesAprovadas.rows[0].horas_pendentes) || 0
            },
        });

    } catch (err) {
        console.error('ERRO RESUMO POR CATEGORIA:', err);
        console.error(err.stack);

        return res.status(500).json({
            erro: err.message
        });
    }
};