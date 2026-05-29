import datetime
import pandas as pd
from config_banco import ler_tabela_dataframe, obter_conexao

def gerar_diretrizes_recomendacoes():
    print("[Recomendações] Rodando motor de regras de negócio...")
    
    # Puxamos os insights de risco que o primeiro script gerou para criar ações para eles
    query = "SELECT referencia_id, tipo_insight FROM insights WHERE tipo_insight IN ('risco_alto', 'risco_medio');"
    df_insights = ler_tabela_dataframe(query)
    
    lista_insights = []
    lista_recomendacoes = []
    
    if df_insights is not None and not df_insights.empty:
        for _, row in df_insights.iterrows():
            aluno_id = row['referencia_id']
            tipo = row['tipo_insight']
            
            if tipo == 'risco_alto':
                lista_recomendacoes.append({
                    "perfil_destino": "coordenador",
                    "referencia_id": int(aluno_id),
                    "nome_regra": "convocacao_aluno",
                    "titulo": "Agendar Mentoria Pedagógica Emergencial",
                    "recomendacao": "Chame este aluno para uma conversa individual. Ele está errando os envios e acumulando rejeições na reta final.",
                    "motivo": "Sistema detectou risco crítico de retenção por quebra de regras de envio.",
                    "prioridade": "alta"
                })

    conexao = obter_conexao()
    if conexao:
        cursor = conexao.cursor()
        try:
            cursor.execute("DELETE FROM recomendacoes WHERE nome_regra = 'convocacao_aluno';")
            for rec in lista_recomendacoes:
                cursor.execute("""
                    INSERT INTO recomendacoes (perfil_destino, referencia_id, nome_regra, titulo, recomendacao, motivo, prioridade)
                    VALUES (%s::perfil_destino_enum, %s, %s, %s, %s, %s, %s::prioridade_enum);
                """, (rec['perfil_destino'], rec['referencia_id'], rec['nome_regra'], rec['titulo'], rec['recomendacao'], rec['motivo'], rec['prioridade']))
            conexao.commit()
            print(f"[Recomendações] Engine finalizada. {len(lista_recomendacoes)} diretrizes geradas.")
        except Exception as e:
            conexao.rollback()
            print(f"[Recomendações] Erro no script de recomendações: {e}")
        finally:
            cursor.close()
            conexao.close()

    return lista_insights, lista_recomendacoes