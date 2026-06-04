const pool = require('../config/database');
const { exec } = require('child_process');
const path = require('path');

exports.getDashboardCoordenador = async (req, res) => {
    const user_id = parseInt(req.usuario.id);
    const isSuperAdmin =
        req.usuario.perfis &&
        req.usuario.perfis.includes('super_admin');

    try {
        let course_ids = [];

        if (isSuperAdmin) {
            const todosCursos = await pool.query(
                `SELECT id FROM courses WHERE is_active = true`
            );
            course_ids = todosCursos.rows.map(r => r.id);
        } else {
            const cursosDoCoordenador = await pool.query(
                `SELECT course_id
                 FROM course_coordinators
                 WHERE user_id = $1 AND is_active = true`,
                [user_id]
            );
            course_ids = cursosDoCoordenador.rows.map(r => r.course_id);
        }

        if (course_ids.length === 0) {
            return res.status(200).json({
                metricas: { pendentes: 0, aprovadas: 0, reprovadas: 0, media_horas: 0 },
                total_alunos: 0,
                total_cursos: 0,
                por_categoria: [],
                cursos_mais_envios: [],
                ultimas_atividades: [],
                insights: [],
                recomendacoes: [],
                resumoRisco: []
            });
        }

        //  Métricas principais 
       const metricas = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status NOT IN ('approved', 'rejected')) AS pendentes,
            COUNT(*) FILTER (WHERE status = 'approved')                   AS aprovadas,
            COUNT(*) FILTER (WHERE status = 'rejected')                   AS reprovadas,
            COUNT(DISTINCT uc.user_id)                                     AS total_alunos,
            ROUND(
                SUM(s.approved_hours) / NULLIF(COUNT(DISTINCT uc.user_id), 0)
            , 1) AS media_horas_por_aluno
        FROM submissions s
        JOIN user_courses uc ON uc.id = s.user_course_id
        WHERE uc.course_id = ANY($1)`,
        [course_ids]
    );

        const metricasRow = metricas.rows[0] || {};
        const totalAlunos = parseInt(metricasRow.total_alunos || 0);

        
        let porCategoria = [];
        try {
            const periodo = req.query.periodo || 'total';
            let filtroPeriodo = '';
            if (periodo === 'mensal') {
                filtroPeriodo = `AND submitted_at >= date_trunc('month', NOW())`;
            } else if (periodo === 'anual') {
                filtroPeriodo = `AND submitted_at >= date_trunc('year', NOW())`;
            }

            const res1 = await pool.query(
                `SELECT category_name AS categoria, COUNT(*) AS total
                FROM view_submissoes_completo
                WHERE course_id = ANY($1)
                ${filtroPeriodo}
                GROUP BY category_name ORDER BY total DESC`,
                [course_ids]
            );
            porCategoria = res1.rows;
        } catch (e) {
            console.warn('[Dashboard] Erro categorias:', e.message);
        }

        let ultimasAtividades = [];
        try {
            const res2 = await pool.query(
                `SELECT submission_id, title, status, submitted_at,
                        student_name AS nome_aluno, category_name AS categoria
                 FROM view_submissoes_completo
                 WHERE course_id = ANY($1)
                 ORDER BY submitted_at DESC LIMIT 5`,
                [course_ids]
            );
            ultimasAtividades = res2.rows;
        } catch (e) {
            console.warn('[Dashboard] Erro atividades:', e.message);
        }

        //  Cursos com mais envios
        let cursosMaisEnvios = [];
        try {
            const res3 = await pool.query(
                `SELECT course_name AS nome_curso, COUNT(*) AS total_envios
                 FROM view_submissoes_completo
                 WHERE course_id = ANY($1)
                 GROUP BY course_name ORDER BY total_envios DESC LIMIT 5`,
                [course_ids]
            );
            cursosMaisEnvios = res3.rows;
        } catch (e) {}

        //  Cursos em risco
        let cursosEmRisco = [];
        try {
            const resRisco = await pool.query(
                `SELECT
                    c.name AS nome_curso,
                    cr.curso_id,
                    COUNT(*) FILTER (WHERE cr.nivel_risco IN ('alto', 'medio')) AS alunos_em_risco,
                    COUNT(*) AS total_alunos_risco,
                    ROUND(
                        COUNT(*) FILTER (WHERE cr.nivel_risco IN ('alto', 'medio'))::numeric
                        / NULLIF(COUNT(*), 0) * 100
                    , 1) AS percentual_risco
                 FROM classificacao_risco cr
                 JOIN courses c ON c.id = cr.curso_id
                 WHERE cr.curso_id = ANY($1)
                 GROUP BY cr.curso_id, c.name
                 HAVING COUNT(*) FILTER (WHERE cr.nivel_risco IN ('alto', 'medio')) > 0
                 ORDER BY alunos_em_risco DESC
                 LIMIT 5`,
                [course_ids]
            );
            cursosEmRisco = resRisco.rows;
        } catch (e) {
            console.warn('[Dashboard] classificacao_risco indisponível:', e.message);
        }

        //  Pipeline analítico 
        let insightsPipeline = [], recomendacoesPipeline = [], resumoRiscoPipeline = [];

        try {
            const r = await pool.query(
                `SELECT id, perfil_destino, referencia_tipo, referencia_id,
                        tipo_insight, titulo, descricao, nivel_alerta,
                        valor_numerico, data_geracao
                 FROM insights
                 WHERE (referencia_tipo = 'curso' AND referencia_id = ANY($1))
                    OR (referencia_tipo = 'aluno' AND referencia_id IN (
                        SELECT user_id FROM user_courses WHERE course_id = ANY($1)
                    ))
                    OR (perfil_destino = 'superadmin' AND $2 = true)
                 ORDER BY data_geracao DESC`,
                [course_ids, isSuperAdmin]
            );
            insightsPipeline = r.rows;
        } catch (e) {
            console.warn('[Dashboard] Tabela insights não encontrada.');
        }

        try {
            const r = await pool.query(
                `SELECT id, perfil_destino, referencia_id, nome_regra, titulo, recomendacao, motivo, prioridade
                 FROM recomendacoes
                 WHERE (perfil_destino = 'aluno' AND referencia_id IN (
                     SELECT user_id FROM user_courses WHERE course_id = ANY($1)
                 ))
                 OR (perfil_destino = 'superadmin' AND $2 = true)`,
                [course_ids, isSuperAdmin]
            );
            recomendacoesPipeline = r.rows;
        } catch (e) {
            console.warn('[Dashboard] Tabela recomendacoes não encontrada.');
        }

        try {
            const r = await pool.query(
                `SELECT nivel_risco, COUNT(*)::int as quantidade
                 FROM classificacao_risco
                 WHERE curso_id = ANY($1)
                 GROUP BY nivel_risco`,
                [course_ids]
            );
            resumoRiscoPipeline = r.rows;
        } catch (e) {
            console.warn('[Dashboard] Tabela classificacao_risco não encontrada.');
        }

        let cursoNome = null;
        try {
            const cursoInfo = await pool.query(
                `SELECT name FROM courses WHERE id = $1 LIMIT 1`,
                [course_ids[0]]
            );
            cursoNome = cursoInfo.rows[0]?.name || null;
        } catch (e) {}

        res.status(200).json({
            metricas: {
                pendentes:   parseInt(metricasRow.pendentes  || 0),
                aprovadas:   parseInt(metricasRow.aprovadas  || 0),
                reprovadas:  parseInt(metricasRow.reprovadas || 0),
                media_horas: parseFloat(metricasRow.media_horas_por_aluno || 0)
            },
            total_alunos:       totalAlunos,
            total_cursos:       course_ids.length,
            curso:              cursoNome,
            por_categoria:      porCategoria,
            cursos_mais_envios: cursosMaisEnvios,
            cursos_em_risco:    cursosEmRisco,
            ultimas_atividades: ultimasAtividades,
            insights:           insightsPipeline,
            recomendacoes:      recomendacoesPipeline,
            resumoRisco:        resumoRiscoPipeline,
            updated_at:         new Date().toISOString()
        });

let alunosHorasFaltantes = 0;
try {
    const horasFaltantes = await pool.query(`
        SELECT COUNT(DISTINCT uc.user_id) AS alunos_horas_faltantes
        FROM user_courses uc
        JOIN courses c ON c.id = uc.course_id
        LEFT JOIN (
            SELECT user_course_id, SUM(approved_hours) AS total_aprovado
            FROM submissions
            WHERE status = 'approved'
            GROUP BY user_course_id
        ) h ON h.user_course_id = uc.id
        WHERE uc.course_id = ANY($1)
          AND uc.is_active = true
          AND COALESCE(h.total_aprovado, 0) < c.minimum_required_hours
    `, [course_ids]);
    alunosHorasFaltantes = parseInt(horasFaltantes.rows[0].alunos_horas_faltantes || 0);
    } catch (e) {
        console.warn('[Dashboard] Erro horas faltantes:', e.message);
    }

    res.status(200).json({
        metricas: {
            pendentes:   parseInt(metricasRow.pendentes  || 0),
            aprovadas:   parseInt(metricasRow.aprovadas  || 0),
            reprovadas:  parseInt(metricasRow.reprovadas || 0),
            media_horas: parseFloat(metricasRow.media_horas_por_aluno || 0)
        },
        total_alunos:            totalAlunos,
        alunos_horas_faltantes:  alunosHorasFaltantes,
        total_cursos:            course_ids.length,
        curso:                   cursoNome,
        por_categoria:           porCategoria,
        cursos_mais_envios:      cursosMaisEnvios,
        cursos_em_risco:         cursosEmRisco,
        ultimas_atividades:      ultimasAtividades,
        insights:                insightsPipeline,
        recomendacoes:           recomendacoesPipeline,
        resumoRisco:             resumoRiscoPipeline,
        updated_at:              new Date().toISOString()
        });


        } catch (err) {
            console.error('Erro Dashboard Coordenador:', err);
            res.status(500).json({ erro: err.message });
        }
    };

exports.postAtualizarInsightSobDemanda = async (req, res) => {
    console.log('=== BOTÃO DE INSIGHTS ACIONADO ===');
    console.log('Curso:', req.params.course_id);
    const course_id = parseInt(req.params.course_id);
    const user_id = parseInt(req.usuario.id);

    try {
        const isSuperAdmin = req.usuario.perfis && req.usuario.perfis.includes('super_admin');

        if (!isSuperAdmin) {
            const permissao = await pool.query(
                `SELECT 1 FROM course_coordinators
                 WHERE user_id = $1 AND course_id = $2 AND is_active = true`,
                [user_id, course_id]
            );
            if (permissao.rows.length === 0) {
                return res.status(403).json({ erro: "Acesso negado: Você não coordena este curso." });
            }
        }

        const dadosCurso = await pool.query(
            `SELECT name FROM courses WHERE id = $1`, [course_id]
        );
        if (dadosCurso.rows.length === 0) {
            return res.status(404).json({ erro: "Curso não encontrado no sistema." });
        }
        const nomeCurso = dadosCurso.rows[0].name;

        const metricasBanco = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE status NOT IN ('approved', 'rejected')) AS pendentes,
                COUNT(*) FILTER (WHERE status = 'approved')  AS aprovadas,
                COUNT(*) FILTER (WHERE status = 'rejected')  AS reprovadas
             FROM view_submissoes_completo
             WHERE course_id = $1`,
            [course_id]
        );

        const m = metricasBanco.rows[0];
        const resumoMetricas = `O curso possui atualmente ${m.pendentes || 0} submissoes aguardando avaliacao, ${m.aprovadas || 0} aprovadas e ${m.reprovadas || 0} rejeitadas.`;

        const scriptPath = path.join(__dirname, '../scripts/gerar_insights_ia.py');
        const nomeCursoLimpo = nomeCurso.replace(/"/g, '\\"');
        const resumoMetricasLimpo = resumoMetricas.replace(/"/g, '\\"');
        const stringConexaoPostgres = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

        exec(`python "${scriptPath}" ${course_id} "${nomeCursoLimpo}" "${resumoMetricasLimpo}"`,
        {
            env: { ...process.env, DATABASE_URL: stringConexaoPostgres }
        },
        (error, stdout, stderr) => {
            if (error) {
                console.error(`[Node API] Erro ao executar script Python: ${error.message}`);
                return res.status(500).json({ erro: "Erro ao processar o motor analítico de IA." });
            }
            console.log(`[Node API] Saída do Python:\n${stdout}`);
            if (stderr) console.warn(`[Node API] Avisos do Python:\n${stderr}`);

            return res.status(200).json({
                sucesso: true,
                mensagem: `Insight cognitivo para "${nomeCurso}" gerado com sucesso.`
            });
        });

    } catch (err) {
        console.error('Erro no controller de insights sob demanda:', err);
        return res.status(500).json({ erro: err.message });
    }
};

//dashboard geral para superadmin
exports.getDashboardGeral = async (req, res) => {
    try {
        // cards
        const metricas = await pool.query(`
            SELECT
                COUNT(DISTINCT uc.user_id)                                          AS total_alunos,
                COUNT(*) FILTER (WHERE s.status NOT IN ('approved', 'rejected'))    AS submissoes_pendentes,
                COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true)              AS cursos_ativos,
                ROUND(
                    SUM(s.approved_hours) / NULLIF(COUNT(DISTINCT uc.user_id), 0)
                , 1)                                                                AS media_horas
            FROM submissions s
            JOIN user_courses uc ON uc.id = s.user_course_id
            JOIN courses c ON c.id = uc.course_id
        `);

        const m = metricas.rows[0];

        //  cursos com maior risco
        const cursosRisco = await pool.query(`
            SELECT
                c.name                                                              AS curso,
                COUNT(*) FILTER (WHERE cr.nivel_risco IN ('alto', 'medio'))         AS alunos_em_risco,
                COUNT(*)                                                            AS total_alunos,
                ROUND(
                    COUNT(*) FILTER (WHERE cr.nivel_risco IN ('alto', 'medio'))::numeric
                    / NULLIF(COUNT(*), 0) * 100
                )                                                                   AS risco_percentual
            FROM classificacao_risco cr
            JOIN courses c ON c.id = cr.curso_id
            GROUP BY c.id, c.name
            HAVING COUNT(*) FILTER (WHERE cr.nivel_risco IN ('alto', 'medio')) > 0
            ORDER BY risco_percentual DESC, alunos_em_risco DESC
            LIMIT 5
        `);

        // Top 5 cursos com mais pendências
        const totalPendentes = parseInt(m.submissoes_pendentes || 0);

        const cursosPendencias = await pool.query(`
            SELECT
                c.name                                                              AS curso,
                COUNT(*) FILTER (WHERE s.status NOT IN ('approved', 'rejected'))    AS pendencias,
                ROUND(
                    COUNT(*) FILTER (WHERE s.status NOT IN ('approved', 'rejected'))::numeric
                    / NULLIF($1, 0) * 100
                , 1)                                                                AS percentual_total
            FROM submissions s
            JOIN user_courses uc ON uc.id = s.user_course_id
            JOIN courses c ON c.id = uc.course_id
            GROUP BY c.id, c.name
            HAVING COUNT(*) FILTER (WHERE s.status NOT IN ('approved', 'rejected')) > 0
            ORDER BY pendencias DESC
            LIMIT 5
        `, [totalPendentes]);

        // Dados do gráfico de barras (todos os cursos) 
        const grafico = await pool.query(`
            SELECT
                c.name                                                              AS curso,
                COUNT(*) FILTER (WHERE s.status NOT IN ('approved', 'rejected'))    AS pendencias
            FROM submissions s
            JOIN user_courses uc ON uc.id = s.user_course_id
            JOIN courses c ON c.id = uc.course_id
            GROUP BY c.id, c.name
            ORDER BY pendencias DESC
        `);

        // Insights superadmin do pipeline
        let insights = [];
        try {
            const r = await pool.query(`
                SELECT titulo, descricao, nivel_alerta, tipo_insight, valor_numerico
                FROM insights
                WHERE perfil_destino = 'superadmin'
                ORDER BY data_geracao DESC
                LIMIT 4
            `);
            insights = r.rows;
        } catch (e) {
            console.warn('[DashboardGeral] Tabela insights indisponível:', e.message);
        }

        res.status(200).json({
            metricas: {
                total_alunos:          parseInt(m.total_alunos || 0),
                submissoes_pendentes:  parseInt(m.submissoes_pendentes || 0),
                media_horas:           parseFloat(m.media_horas || 0),
                cursos_ativos:         parseInt(m.cursos_ativos || 0),
            },
            cursos_maior_risco:    cursosRisco.rows,
            top_pendencias:        cursosPendencias.rows,
            grafico_pendencias:    grafico.rows,
            insights,
            updated_at:            new Date().toISOString(),
        });

    } catch (err) {
        console.error('Erro DashboardGeral:', err);
        res.status(500).json({ erro: err.message });
    }
};