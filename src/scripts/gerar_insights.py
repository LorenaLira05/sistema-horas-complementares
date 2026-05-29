import datetime
from config_banco import ler_tabela_dataframe, obter_conexao

def processar_insights():
    print("Processando insights...")

    query = "SELECT id, status FROM submissions;"
    df_submissions = ler_tabela_dataframe(query)

    if df_submissions is None or df_submissions.empty:
        print("Nenhuma submissão encontrada.")
        return
    
    print("Dados carregados com sucesso!")

    total_pendentes = len(df_submissions[df_submissions['status'] == 'submitted'])
    total_rejeitadas = len(df_submissions[df_submissions['status'] == 'rejected'])
    total_aceitas = len(df_submissions[df_submissions['status'] == 'approved'])
    total_geral = len(df_submissions)
    
    print(f"Total geral de submissões: {total_geral}")

    taxa_rejeicao = (total_rejeitadas / total_geral) * 100 if total_geral > 0 else 0
    print(f"Métricas extraídas: {total_pendentes} pendentes, {total_rejeitadas} rejeitadas.")

    # Listas que armazenarão as deduções 
    lista_insights = []
    lista_recomendacoes = []

    # Insight 1: Sobrecarga de fila
    if total_pendentes > 20:
        lista_insights.append({
            "perfil_destino": "superadmin",
            "referencia_tipo": "institucional",
            "referencia_id": None,
            "tipo_insight": "alerta_sobrecarga",
            "titulo": "Fila de Análise Sobrecarregada",
            "descricao": f"Atenção: existem {total_pendentes} certificados aguardando avaliação no sistema.",
            "nivel_alerta": "alto",
            "valor_numerico": float(total_pendentes)
        })

    # Insight 2: Alta rejeição + Recomendação Pedagógica
    if taxa_rejeicao > 15:
        lista_insights.append({
            "perfil_destino": "coordenador",
            "referencia_tipo": "institucional",
            "referencia_id": None,
            "tipo_insight": "alta_rejeicao_global",
            "titulo": "Alto Índice de Certificados Recusados",
            "descricao": f"A taxa de prevenção da faculdade atingiu {taxa_rejeicao:.1f}%. Os alunos podem estar com dúvidas.",
            "nivel_alerta": "medio",
            "valor_numerico": float(taxa_rejeicao)
        })
        
        lista_recomendacoes.append({
            "perfil_destino": "coordenador",
            "referencia_id": 0,  # 0 representa nível institucional genérico
            "nome_regra": "rejeicao_limite_alerta",
            "titulo": "Criar Workshop ou Cartilha de Atividades Complementares",
            "recomendacao": "Desenvolver um guia visual em PDF explicando quais documentos são aceitos e rejeitados, e disparar por e-mail para os alunos.",
            "motivo": f"A inteligência detectou que a taxa de rejeição institucional atingiu {taxa_rejeicao:.1f}%.",
            "prioridade": "alta"
        })

    # Insight 3: Gargalo de atendimento
    total_analisados = total_geral - total_pendentes
    if total_pendentes > (total_analisados * 3) and total_analisados > 0:
        lista_insights.append({
            "perfil_destino": "superadmin",
            "referencia_tipo": "institucional",
            "referencia_id": None,
            "tipo_insight": "gargalo_atendimento",
            "titulo": "Gargalo Crítico na Avaliação",
            "descricao": "O ritmo de envio dos alunos está muito superior à velocidade de análise dos coordenadores.",
            "nivel_alerta": "alto",
            "valor_numerico": float(total_pendentes)
        })

    # Insight 4: Alto volume de dados
    if total_geral > 100:
        lista_insights.append({
            "perfil_destino": "coordenador",
            "referencia_tipo": "institucional",
            "referencia_id": None,
            "tipo_insight": "alto_volume_dados",
            "titulo": "Grande Volume de Certificados Ativos",
            "descricao": f"O sistema já processou {total_geral} certificados históricos com sucesso nesta gestão.",
            "nivel_alerta": "info",
            "valor_numerico": float(total_geral)
        })

    return lista_insights, lista_recomendacoes