import datetime
import pandas as pd
from config_banco import ler_tabela_dataframe, obter_conexao

def processar_insights_alunos():
    print("Buscando dados de submissões e regras de limite das categorias...")
    
    # Query ajustada perfeitamente com as colunas reais da sua tabela submissions (s)
    query = """
        SELECT 
            s.user_course_id, 
            s.status, 
            coalesce(s.approved_hours, 0) as horas,
            s.category_id,
            coalesce(r.max_hours, 999) as limite_categoria
        FROM submissions s
        LEFT JOIN course_activity_rules r ON s.category_id = r.id;
    """
    df = ler_tabela_dataframe(query)

    if df is None or df.empty:
        print("Nenhuma submissão encontrada para processar alunos.")
        return

    print("Analisando o progresso real de cada aluno com Pandas...")
    
    lista_insights = []
    lista_recomendacoes = []
    
    total_registros_lidos = len(df)
    alunos_unicos = df['user_course_id'].dropna().unique()

    for aluno_id in alunos_unicos:
        df_aluno = df[df['user_course_id'] == aluno_id]
        
        total_geral = len(df_aluno)
        total_rejeitados = len(df_aluno[df_aluno['status'] == 'rejected'])
        taxa_rejeicao_aluno = (total_rejeitados / total_geral) * 100 if total_geral > 0 else 0
        
        
        df_aprovado = df_aluno[df_aluno['status'] == 'approved']
        horas_validas_reais = 0.0
        
        if not df_aprovado.empty:
            por_categoria = df_aprovado.groupby(['category_id', 'limite_categoria'])['horas'].sum().reset_index()
            
            for _, row in por_categoria.iterrows():
                soma_enviada = row['horas']
                teto_permitido = row['limite_categoria']
                
                horas_aproveitadas = min(soma_enviada, teto_permitido)
                horas_validas_reais += horas_aproveitadas

        if total_geral >= 3 and taxa_rejeicao_aluno > 40:
            lista_insights.append({
                "perfil_destino": "aluno",
                "referencia_tipo": "aluno",
                "referencia_id": int(aluno_id),
                "tipo_insight": "alta_rejeicao_individual",
                "titulo": "Alto Índice de Recusa nos seus Envios",
                "descricao": f"Atenção: {taxa_rejeicao_aluno:.0f}% dos seus certificados foram recusados pela coordenação.",
                "nivel_alerta": "alto",
                "valor_numerico": float(taxa_rejeicao_aluno)
            })
            
            lista_recomendacoes.append({
                "perfil_destino": "aluno",
                "referencia_id": int(aluno_id),
                "nome_regra": "ajuda_envio_aluno",
                "titulo": "Revise o Edital de Horas Complementares",
                "recomendacao": "Verifique os motivos de recusa nos seus certificados antigos e consulte o manual da faculdade antes de fazer novos envios.",
                "motivo": "Detectamos um padrão repetido de reprovação nos seus documentos anexados.",
                "prioridade": "alta"
            })

        
        if not df_aprovado.empty:
            for _, row in por_categoria.iterrows():
                if row['horas'] >= row['limite_categoria']:
                    lista_insights.append({
                        "perfil_destino": "aluno",
                        "referencia_tipo": "aluno",
                        "referencia_id": int(aluno_id),
                        "tipo_insight": "limite_categoria_atingido",
                        "titulo": "Limite de Categoria Atingido",
                        "descricao": "Você já atingiu a pontuação máxima permitida para um dos tipos de atividade.",
                        "nivel_alerta": "medio",
                        "valor_numerico": float(row['horas'])
                    })
                    
                    lista_recomendacoes.append({
                        "perfil_destino": "aluno",
                        "referencia_id": int(aluno_id),
                        "nome_regra": "diversificar_atividades",
                        "titulo": "Busque Outros Tipos de Atividades",
                        "recomendacao": "Novos envios para esta mesma categoria não irão pontuar. Procure fazer atividades de áreas diferentes para continuar somando horas.",
                        "motivo": "A inteligência detectou que você estourou o teto de aproveitamento de uma categoria.",
                        "prioridade": "media"
                    })
                    break


        if 140 <= horas_validas_reais < 180:
            lista_insights.append({
                "perfil_destino": "aluno",
                "referencia_tipo": "aluno",
                "referencia_id": int(aluno_id),
                "tipo_insight": "reta_final_horas",
                "titulo": "Você está na Reta Final!",
                "descricao": f"Você já acumulou {horas_validas_reais:.0f} horas válidas (após aplicação dos limites por categoria).",
                "nivel_alerta": "info",
                "valor_numerico": float(horas_validas_reais)
            })

    return lista_insights, lista_recomendacoes