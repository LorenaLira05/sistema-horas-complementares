import datetime
import pandas as pd
from config_banco import ler_tabela_dataframe, obter_conexao

def calcular_metricas_tempo():
    print("[Tempo] Analisando velocidade de validação...")
    query = "SELECT status, created_at, updated_at FROM submissions WHERE status IN ('approved', 'rejected');"
    df = ler_tabela_dataframe(query)
    
    if df is None or df.empty:
        print("Sem registros avaliados para calcular tempo.")
        return

    df['created_at'] = pd.to_datetime(df['created_at'])
    df['updated_at'] = pd.to_datetime(df['updated_at'])
    
    # Diferença em dias
    df['dias_analise'] = (df['updated_at'] - df['created_at']).dt.total_seconds() / 86400
    tempo_medio_global = df['dias_analise'].mean()

    lista_insights = []
    if tempo_medio_global > 5:
        lista_insights.append({
            "perfil_destino": "superadmin",
            "referencia_tipo": "institucional",
            "referencia_id": None,
            "tipo_insight": "tempo_medio_elevado",
            "titulo": "SLA de Validação Elevado",
            "descricao": f"O tempo médio global para analisar um certificado está em {tempo_medio_global:.1f} dias.",
            "nivel_alerta": "alto" if tempo_medio_global > 10 else "medio",
            "valor_numerico": float(tempo_medio_global)
        })
    return lista_insights, [] # Retorna a lista de recomendações vazia de propósito