import datetime
import pandas as pd
from config_banco import ler_tabela_dataframe

def classificar_risco_alunos():
    print("[Risco] Buscando dados para classificação com 4 critérios...")

    # Busca submissões com a carga exigida do curso para calcular % real
    query_submissoes = """
        SELECT
            s.user_course_id,
            s.status,
            coalesce(s.approved_hours, 0) AS horas_aprovadas,
            s.created_at
        FROM submissions s;
    """
    df = ler_tabela_dataframe(query_submissoes)
    if df is None or df.empty:
        print("[Risco] Nenhuma submissão encontrada.")
        return [], [], []

    # Busca a carga horária exigida por user_course (vínculo aluno-curso)
    query_carga = """
        SELECT
            uc.id AS user_course_id,
            uc.user_id AS aluno_id,
            uc.course_id,
            coalesce(c.minimum_required_hours, 200) AS carga_exigida
        FROM user_courses uc
        JOIN courses c ON c.id = uc.course_id;
    """
    df_carga = ler_tabela_dataframe(query_carga)
    if df_carga is None or df_carga.empty:
        print("[Risco] Tabela user_courses/courses não encontrada. Usando carga padrão de 200h.")
        ids = df['user_course_id'].dropna().unique()
        df_carga = pd.DataFrame({
            'user_course_id': ids,
            'aluno_id': ids,
            'course_id': [None] * len(ids),
            'carga_exigida': [200] * len(ids)
        })

    df['created_at'] = pd.to_datetime(df['created_at'])
    hoje = pd.Timestamp.now()

    lista_riscos   = []   
    lista_insights = []   
    lista_recomendacoes = []

    for _, linha_carga in df_carga.iterrows():
        user_course_id = linha_carga['user_course_id']
        aluno_id       = linha_carga['aluno_id']
        course_id      = linha_carga['course_id']
        carga_exigida  = float(linha_carga['carga_exigida'])

        df_aluno = df[df['user_course_id'] == user_course_id]
        if df_aluno.empty:
            continue

        # Percentual de Conclusão
        horas_aprovadas   = df_aluno[df_aluno['status'] == 'approved']['horas_aprovadas'].sum()
        percentual        = (horas_aprovadas / carga_exigida * 100) if carga_exigida > 0 else 0

        # Submissões Pendentes
        pendentes = len(df_aluno[df_aluno['status'] == 'submitted'])

        # Quantidade de Rejeições
        rejeicoes = len(df_aluno[df_aluno['status'] == 'rejected'])

        # Dias Sem Submeter
        ultima_submissao  = df_aluno['created_at'].max()
        dias_sem_submeter = (hoje - ultima_submissao).days if pd.notna(ultima_submissao) else 999


        if percentual < 40 and (dias_sem_submeter > 30 or rejeicoes > 3):
            nivel_risco  = "alto"
            justificativa = (
                f"Crítico: Aluno com apenas {percentual:.0f}% concluído, "
                f"{rejeicoes} rejeição(ões) e há {dias_sem_submeter} dias sem atividade."
            )
        elif (40 <= percentual < 75) or pendentes >= 3:
            nivel_risco  = "medio"
            justificativa = (
                f"Atenção: Aluno com {percentual:.0f}% concluído e "
                f"{pendentes} submissão(ões) aguardando análise."
            )
        else:
            nivel_risco  = "baixo"
            justificativa = (
                f"Estável: Aluno com ótimo progresso ({percentual:.0f}% concluído) "
                f"e menos de 3 pendências."
            )

        id_curso_limpo = None if pd.isna(course_id) else int(course_id)

        lista_riscos.append({
            "aluno_id":               int(aluno_id),
            "course_id":              id_curso_limpo,
            "percentual_conclusao":   round(float(percentual), 2),
            "submissoes_pendentes":   int(pendentes),
            "submissoes_rejeitadas":  int(rejeicoes),
            "dias_sem_submeter":      int(dias_sem_submeter),
            "nivel_risco":            nivel_risco,
            "justificativa":          justificativa,
        })

        if nivel_risco in ("alto", "medio"):
            lista_insights.append({
                "perfil_destino":  "coordenador",
                "referencia_tipo": "aluno",
                "referencia_id":   int(aluno_id),
                "tipo_insight":    f"risco_{nivel_risco}",
                "titulo":          f"Aluno em risco {nivel_risco}",
                "descricao":       justificativa,
                "nivel_alerta":    "alto" if nivel_risco == "alto" else "medio",
                "valor_numerico":  round(float(percentual), 2),
            })

        if nivel_risco == "alto":
            lista_recomendacoes.append({
                "perfil_destino": "aluno",
                "referencia_id":  int(aluno_id),
                "nome_regra":     "aluno_risco_alto_retomada",
                "titulo":         "Retome suas submissões urgentemente",
                "recomendacao":   (
                    f"Você está com apenas {percentual:.0f}% da carga exigida e "
                    f"há {dias_sem_submeter} dias sem enviar. Submeta novas atividades o quanto antes."
                ),
                "motivo":         "Percentual de conclusão crítico e inatividade prolongada.",
                "prioridade":     "alta",
            })

    print(f"[Risco] {len(lista_riscos)} alunos classificados na memória.")
    
    return lista_riscos, lista_insights, lista_recomendacoes