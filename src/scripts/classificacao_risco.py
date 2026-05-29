import datetime
import pandas as pd
from config_banco import ler_tabela_dataframe, obter_conexao

def classificar_risco_alunos():
    print("[Risco] Buscando dados para classificação...")
    query = """
        SELECT s.user_course_id, s.status, coalesce(s.approved_hours, 0) as horas
        FROM submissions s;
    """
    df = ler_tabela_dataframe(query)
    if df is None or df.empty:
        return

    lista_insights = []
    lista_recomendacoes = []
    alunos = df['user_course_id'].dropna().unique()

    for aluno_id in alunos:
        df_aluno = df[df['user_course_id'] == aluno_id]
        total_envios = len(df_aluno)
        total_rejeitados = len(df_aluno[df_aluno['status'] == 'rejected'])
        horas_aprovadas = df_aluno[df_aluno['status'] == 'approved']['horas'].sum()
        
        taxa_rejeicao = (total_rejeitados / total_envios) * 100 if total_envios > 0 else 0

        # Regra de Classificação de Risco
        nivel_risco = "baixo"
        motivo_risco = ""
        
        if horas_aprovadas < 20 and total_envios >= 3 and taxa_rejeicao > 60:
            nivel_risco = "alto"
            motivo_risco = f"Aluno com {taxa_rejeicao:.0f}% de rejeição e apenas {horas_aprovadas:.0f}h válidas."
        elif horas_aprovadas < 50 and total_envios >= 4:
            nivel_risco = "medio"
            motivo_risco = f"Aluno estagnado com baixo acúmulo de horas ({horas_aprovadas:.0f}h)."

        if nivel_risco in ["alto", "medio"]:
            lista_insights.append({
                "perfil_destino": "coordenador",
                "referencia_tipo": "aluno",
                "referencia_id": int(aluno_id),
                "tipo_insight": f"risco_{nivel_risco}",
                "titulo": f"Aluno em Risco {nivel_risco.capitalize()}",
                "descricao": motivo_risco,
                "nivel_alerta": "alto" if nivel_risco == "alto" else "medio",
                "valor_numerico": float(horas_aprovadas)
            })

    return lista_insights, lista_recomendacoes