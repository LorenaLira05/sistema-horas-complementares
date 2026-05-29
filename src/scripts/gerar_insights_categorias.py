import pandas as pd
from config_banco import ler_tabela_dataframe

def processar_insights_categorias():
    print("[Categorias] Buscando dados de submissões para análise...")
    
    query = """
        SELECT 
            category_id,
            status,
            created_at,
            updated_at
        FROM submissions;
    """
    df = ler_tabela_dataframe(query)

    if df is None or df.empty:
        print("[Categorias] Nenhuma submissão encontrada para processar.")
        return [], []

    print("[Categorias] Calculando taxas de rejeição e SLAs com Pandas...")
    
    lista_insights = []
    lista_recomendacoes = []
    
    categorias_unicas = df['category_id'].dropna().unique()

    for cat_id in categorias_unicas:
        df_cat = df[df['category_id'] == cat_id]
        
        total_geral = len(df_cat)
        total_rejeitados = len(df_cat[df_cat['status'] == 'rejected'])
        total_analisados = len(df_cat[df_cat['status'].isin(['approved', 'rejected'])])
        
        # 1. Cálculo da Taxa de Rejeição por Categoria
        taxa_rejeicao_cat = (total_rejeitados / total_geral) * 100 if total_geral > 0 else 0

        # 2. Cálculo do Tempo Médio de Análise (SLA) em dias
        tempo_medio_dias = 0
        df_avaliados = df_cat[df_cat['status'].isin(['approved', 'rejected'])].copy()
        
        if not df_avaliados.empty:
            df_avaliados['created_at'] = pd.to_datetime(df_avaliados['created_at'])
            df_avaliados['updated_at'] = pd.to_datetime(df_avaliados['updated_at'])
            
            # Calcula a diferença em dias (fracionados)
            df_avaliados['tempo_analise'] = (df_avaliados['updated_at'] - df_avaliados['created_at']).dt.total_seconds() / 86400
            tempo_medio_dias = df_avaliados['tempo_analise'].mean()

       
        if total_geral >= 5 and taxa_rejeicao_cat > 30:
            lista_insights.append({
                "perfil_destino": "coordenador",
                "referencia_tipo": "categoria",
                "referencia_id": int(cat_id),
                "tipo_insight": "alta_rejeicao_categoria",
                "titulo": "Alerta: Categoria com Alta Rejeição",
                "descricao": f"Esta categoria específica está com {taxa_rejeicao_cat:.0f}% de reprovação nos envios.",
                "nivel_alerta": "alto",
                "valor_numerico": float(taxa_rejeicao_cat)
            })
            
            lista_recomendacoes.append({
                "perfil_destino": "coordenador",
                "referencia_id": int(cat_id),
                "nome_regra": "revisao_regras_categoria",
                "titulo": "Flexibilizar ou Esclarecer Critérios desta Atividade",
                "recomendacao": "Avalie se as regras descritas no edital para este tipo de atividade estão confusas ou se a exigência documental está muito rigorosa.",
                "motivo": "Os alunos estão errando massivamente os envios atrelados a esta categoria.",
                "prioridade": "media"
            })

       
        if total_analisados >= 3 and tempo_medio_dias > 7:
            lista_insights.append({
                "perfil_destino": "coordenador",
                "referencia_tipo": "categoria",
                "referencia_id": int(cat_id),
                "tipo_insight": "analise_lenta_categoria",
                "titulo": "Gargalo de Tempo na Avaliação",
                "descricao": f"Os certificados desta categoria estão demorando em média {tempo_medio_dias:.1f} dias para serem analisados.",
                "nivel_alerta": "medio",
                "valor_numerico": float(tempo_medio_dias)
            })

    return lista_insights, lista_recomendacoes