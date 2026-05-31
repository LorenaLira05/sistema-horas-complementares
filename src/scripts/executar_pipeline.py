import datetime
from config_banco import obter_conexao

from gerar_insights import processar_insights
from gerar_insights_alunos import processar_insights_alunos
from gerar_insights_categorias import processar_insights_categorias
from classificacao_risco import classificar_risco_alunos
from calcular_tempo_medio import calcular_metricas_tempo
from gerar_recomendacoes import gerar_diretrizes_recomendacoes
from gerar_insights_cursos import processar_insights_cursos
from gerar_insights_ia import gerar_e_salvar_insights_ia

def rodar_sistema_analitico_completo():

    conexao = obter_conexao()
    if conexao is None:
        print("Não foi possível conectar ao banco de dados.")
        return
        
    cursor = conexao.cursor()
    inicio_tempo = datetime.datetime.now()
    
    cursor.execute("""
        INSERT INTO pipeline_execucoes (nome_pipeline, status_execucao, inicio_execucao, quantidade_registros_lidos)
        VALUES (%s, %s, %s, %s) RETURNING id;
    """, ("Pipeline Unificada de IA e Analytics", "em_andamento", inicio_tempo, 0))
    pipeline_id = cursor.fetchone()[0]
    conexao.commit()

    todos_insights = []
    todas_recomendacoes = []

    try:
       
        print("Processando Visão Institucional...")
        ins_inst, rec_inst = processar_insights()
        todos_insights.extend(ins_inst)
        todas_recomendacoes.extend(rec_inst)
        print("-" * 50)
        
        print("Processando Visão por Aluno...")
        ins_aluno, rec_aluno = processar_insights_alunos()
        todos_insights.extend(ins_aluno)
        todas_recomendacoes.extend(rec_aluno)
        print("-" * 50)
        
        print("Processando Visão por Categoria...")
        ins_cat, rec_cat = processar_insights_categorias()
        todos_insights.extend(ins_cat)
        todas_recomendacoes.extend(rec_cat)
        print("-" * 50)

        print("Processando Visão por Curso (pandas)")
        ins_cursos, rec_cursos = processar_insights_cursos()
        todos_insights.extend(ins_cursos)
        todas_recomendacoes.extend(rec_cursos)
        print("-" * 50)

        print("Gerando Insights IA...")
        try:
            insights_da_ia = gerar_e_salvar_insights_ia(ins_cursos)
            todos_insights.extend(insights_da_ia)
        except Exception as ia_err:
            print(f"[Aviso IA] Falha não impeditiva ao gerar insights com Groq: {ia_err}")
        print("-" * 50)

        print("Executando Classificação de Risco...")
        dados_riscos, ins_risco, rec_risco = classificar_risco_alunos()
        todos_insights.extend(ins_risco)
        todas_recomendacoes.extend(rec_risco)
        print("-" * 50)
        
        print("Calculando SLAs e Métricas de Tempo...")
        ins_tempo, rec_tempo = calcular_metricas_tempo()
        todos_insights.extend(ins_tempo)
        todas_recomendacoes.extend(rec_tempo)
        print("-" * 50)
        
        print("Gerando Recomendações de Ação Direta...")
        ins_rec, rec_rec = gerar_diretrizes_recomendacoes()
        todos_insights.extend(ins_rec)
        todas_recomendacoes.extend(rec_rec)

        print("\n Gravando resultados no PostgreSQL...")
        
        cursor.execute("TRUNCATE TABLE insights RESTART IDENTITY CASCADE;")
        cursor.execute("TRUNCATE TABLE recomendacoes RESTART IDENTITY CASCADE;")
        
        query_insert_insight = """
            INSERT INTO insights (perfil_destino, referencia_tipo, referencia_id, tipo_insight, titulo, descricao, nivel_alerta, valor_numerico)
            VALUES (%s::perfil_destino_enum, %s, %s, %s, %s, %s, %s::nivel_alerta_enum, %s);
        """
        for ins in todos_insights:
            cursor.execute(query_insert_insight, (
                ins['perfil_destino'], ins['referencia_tipo'], ins['referencia_id'],
                ins['tipo_insight'], ins['titulo'], ins['descricao'], ins['nivel_alerta'], ins['valor_numerico']
            ))
            
        query_insert_recom = """
            INSERT INTO recomendacoes (perfil_destino, referencia_id, nome_regra, titulo, recomendacao, motivo, prioridade)
            VALUES (%s::perfil_destino_enum, %s, %s, %s, %s, %s, %s::prioridade_enum);
        """
        for rec in todas_recomendacoes:
            cursor.execute(query_insert_recom, (
                rec['perfil_destino'], rec['referencia_id'], rec['nome_regra'],
                rec['titulo'], rec['recomendacao'], rec['motivo'], rec['prioridade']
            ))
            
        fim_tempo = datetime.datetime.now()
        total_gravado = len(todos_insights) + len(todas_recomendacoes)
        
        cursor.execute("""
            UPDATE pipeline_execucoes 
            SET status_execucao = 'sucesso', fim_execucao = %s, quantidade_registros_gravados = %s, mensagem = %s
            WHERE id = %s;
        """, (fim_tempo, total_gravado, "Engine completa executada com sucesso.", pipeline_id))
        
        # Só salva de verdade se NENHUM script falhou
        conexao.commit()
        
        print(f"Total de Insights salvos: {len(todos_insights)}")
        print(f"Total de Recomendações salvas: {len(todas_recomendacoes)}")
        
    except Exception as e:
        conexao.rollback()
        fim_tempo = datetime.datetime.now()
        
        cursor.execute("""
            UPDATE pipeline_execucoes 
            SET status_execucao = 'falha', fim_execucao = %s, mensagem = %s
            WHERE id = %s;
        """, (fim_tempo, f"Erro crítico na pipeline: {str(e)}", pipeline_id))
        conexao.commit()
        
        print(f"\nERRO  NA EXECUÇÃO DA PIPELINE: {e}")
        
    finally:
        cursor.close()
        conexao.close()

if __name__ == "__main__":
    rodar_sistema_analitico_completo()