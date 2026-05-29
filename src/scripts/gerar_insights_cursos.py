import pandas as pd
from config_banco import ler_tabela_dataframe

def processar_insights_cursos():
    print("[Cursos] Calculando métricas por curso...")

    # submissões com vínculo ao curso
    query = """
        SELECT
            s.user_course_id,
            s.status,
            coalesce(s.approved_hours, 0) AS horas_aprovadas,
            uc.course_id,
            coalesce(c.name, 'Curso ' || uc.course_id::text) AS nome_curso,
            coalesce(c.minimum_required_hours, 200) AS carga_exigida
        FROM submissions s
        JOIN user_courses uc ON uc.id = s.user_course_id
        JOIN courses c       ON c.id  = uc.course_id;
    """
    df = ler_tabela_dataframe(query)
    if df is None or df.empty:
        print("[Cursos] Nenhuma submissão encontrada.")
        return [], []

    lista_insights      = []
    lista_recomendacoes = []

    cursos = df['course_id'].dropna().unique()

    for course_id in cursos:
        df_curso    = df[df['course_id'] == course_id]
        nome_curso  = df_curso['nome_curso'].iloc[0]
        carga       = float(df_curso['carga_exigida'].iloc[0])

        # total de submissões por curso
        total_subs    = len(df_curso)
        total_pend    = len(df_curso[df_curso['status'] == 'submitted'])
        total_aprov   = len(df_curso[df_curso['status'] == 'approved'])
        total_rejeit  = len(df_curso[df_curso['status'] == 'rejected'])

        lista_insights.append({
            "perfil_destino":  "superadmin",
            "referencia_tipo": "curso",
            "referencia_id":   int(course_id),
            "tipo_insight":    "volume_submissoes_curso",
            "titulo":          f"Volume de submissões — {nome_curso}",
            "descricao": (
                f"O curso {nome_curso} possui {total_subs} submissão(ões) no total: "
                f"{total_aprov} aprovadas, {total_rejeit} rejeitadas e {total_pend} pendentes."
            ),
            "nivel_alerta":  "alto" if total_pend > 20 else "info",
            "valor_numerico": float(total_subs),
        })

        # Recomendação para superadmin se pendências altas (cobre o requisito faltante)
        if total_pend > 20:
            lista_recomendacoes.append({
                "perfil_destino": "superadmin",
                "referencia_id":  int(course_id),
                "nome_regra":     "curso_alta_fila_pendencias",
                "titulo":         f"Acompanhar fila do curso {nome_curso}",
                "recomendacao": (
                    f"O curso {nome_curso} possui {total_pend} submissões pendentes. "
                    "Recomenda-se verificar se os coordenadores deste curso precisam de suporte."
                ),
                "motivo":     "Fila de pendências acima de 20 submissões.",
                "prioridade": "alta",
            })

        # horas médias aprovadas por submissão 
        df_aprov_rows = df_curso[df_curso['status'] == 'approved']
        if not df_aprov_rows.empty:
            media_horas = df_aprov_rows['horas_aprovadas'].mean()

            lista_insights.append({
                "perfil_destino":  "coordenador",
                "referencia_tipo": "curso",
                "referencia_id":   int(course_id),
                "tipo_insight":    "media_horas_aprovadas",
                "titulo":          f"Média de horas aprovadas — {nome_curso}",
                "descricao": (
                    f"Cada submissão aprovada no curso {nome_curso} "
                    f"equivale em média a {media_horas:.1f} hora(s)."
                ),
                "nivel_alerta":  "info",
                "valor_numerico": round(float(media_horas), 2),
            })

        #  Métrica C: alunos com progresso abaixo de 40% 
        alunos_do_curso = df_curso['user_course_id'].dropna().unique()
        alunos_criticos = 0

        for uc_id in alunos_do_curso:
            horas_aluno = (
                df_curso[(df_curso['user_course_id'] == uc_id) & (df_curso['status'] == 'approved')]
                ['horas_aprovadas'].sum()
            )
            percentual = (horas_aluno / carga * 100) if carga > 0 else 0
            if percentual < 40:
                alunos_criticos += 1

        total_alunos = len(alunos_do_curso)
        if total_alunos > 0 and alunos_criticos > 0:
            pct_criticos = (alunos_criticos / total_alunos) * 100
            lista_insights.append({
                "perfil_destino":  "coordenador",
                "referencia_tipo": "curso",
                "referencia_id":   int(course_id),
                "tipo_insight":    "alunos_baixo_progresso",
                "titulo":          f"Alunos com baixo progresso — {nome_curso}",
                "descricao": (
                    f"{alunos_criticos} de {total_alunos} aluno(s) do curso {nome_curso} "
                    f"estão abaixo de 40% da carga exigida ({pct_criticos:.0f}% dos alunos)."
                ),
                "nivel_alerta":  "alto" if pct_criticos > 30 else "medio",
                "valor_numerico": float(alunos_criticos),
            })

    print(f"[Cursos] {len(lista_insights)} insights gerados para {len(cursos)} curso(s).")
    return lista_insights, lista_recomendacoes