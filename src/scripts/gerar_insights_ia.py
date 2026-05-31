import os
import sys
import time
from groq import Groq
from concurrent.futures import ThreadPoolExecutor, as_completed

def processar_curso_individual(client, ins_curso):
    course_id = ins_curso.get('referencia_id')
    titulo_curso = ins_curso.get('titulo', f'Curso {course_id}')
    descricao_pandas = ins_curso.get('descricao', '')
    valor_num = ins_curso.get('valor_numerico', 0)

    prompt = (
        f"Considere a análise do curso: {titulo_curso}.\n"
        f"Métricas: {descricao_pandas}.\n\n"
        f"Gere um plano de ação estritamente curto com exatamente 2 tópicos rápidos para o Coordenador. "
        f"REGRAS VISUAIS CRÍTICAS:\n"
        f"1. NÃO use hifens, asteriscos ou a palavra 'Insight Executivo'.\n"
        f"2. Escreva os dois tópicos separados diretamente pela tag HTML <br>.\n"
        f"3. Cada tópico deve ter no máximo 10 palavras.\n"
        f"Exemplo de formato esperado:\n"
        f"• Revisar critérios de avaliação da categoria Eventos.<br>• Estabelecer prazos claros para reduzir o tempo médio."
    )

    tentativas = 3
    tempo_espera = 2.5

    for tentativa in range(tentativas):
        try:
            completion = client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "Você é um Analista de Dados Acadêmicos Sênior. Escreva análises executivas diretas, profissionais e sem enrolação em português do Brasil."
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                model="llama-3.1-8b-instant",
                temperature=0.4,
            )

            return {
                'perfil_destino': 'coordenador',
                'referencia_tipo': 'curso',
                'referencia_id': course_id,
                'tipo_insight': 'ia_generativa',
                'titulo': 'Análise Preditiva - IA',
                'descricao': completion.choices[0].message.content.strip(),
                'nivel_alerta': ins_curso.get('nivel_alerta', 'medio'),
                'valor_numerico': valor_num
            }

        except Exception as e:
            erro_str = str(e)
            if "429" in erro_str or "rate_limit" in erro_str:
                time.sleep(tempo_espera)
                tempo_espera *= 1.5
            else:
                print(f"[IA] Erro Groq no curso {course_id}: {e}")
                break
                
    return None

def gerar_e_salvar_insights_ia(lista_insights_cursos):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("[IA] Aviso: GROQ_API_KEY não encontrada.")
        return []

    client = Groq(api_key=api_key)
    novos_insights_ia = []

    # Filtra os cursos enviados
    insights_curso_pandas = [i for i in lista_insights_cursos if i.get('referencia_tipo') == 'curso']
    if not insights_curso_pandas:
        return []

    # Se veio apenas 1 curso (chamada direta do botão da tela do coordenador)
    if len(insights_curso_pandas) == 1:
        resultado = processar_curso_individual(client, insights_curso_pandas[0])
        if resultado:
            novos_insights_ia.append(resultado)
        return novos_insights_ia

    # Se vierem vários cursos, roda em lote em background usando poucas threads
    print(f"\n[IA] Processando lote de {len(insights_curso_pandas)} cursos em paralelo...")
    with ThreadPoolExecutor(max_workers=2) as executor:
        futuros = {
            executor.submit(processar_curso_individual, client, curso): curso 
            for curso in insights_curso_pandas
        }
        for futuro in as_completed(futuros):
            resultado = futuro.result()
            if resultado:
                novos_insights_ia.append(resultado)
                print(f"[IA] Insight concluído para o curso ID: {resultado['referencia_id']}")

    return novos_insights_ia

def salvar_insights_no_postgres(resultados):
    """
    Função dedicada a persistir o insight sob demanda direto no banco
    """
    try:
        import psycopg2
        import psycopg2.extensions
        
        psycopg2.extensions.register_type(psycopg2.extensions.UNICODE)
        psycopg2.extensions.register_type(psycopg2.extensions.UNICODEARRAY)

        DATABASE_URL = os.environ.get("DATABASE_URL")
        if not DATABASE_URL:
            raise ValueError("[Python] Erro crítico: A variável DATABASE_URL não foi fornecida pelo sistema.")
        
        conexao = psycopg2.connect(DATABASE_URL)
        conexao.set_client_encoding('UTF8')
        cursor = conexao.cursor()
        
        query_delete = """
            DELETE FROM insights 
            WHERE referencia_tipo = %s AND referencia_id = %s;
        """
        
        query_insert = """
            INSERT INTO insights (perfil_destino, referencia_tipo, referencia_id, tipo_insight, titulo, descricao, nivel_alerta, valor_numerico, data_geracao)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW());
        """
        
        for r in resultados:
            desc_texto = str(r['descricao'])
            
            # deleta registros duplicados anteriores para o curso (limpa o banco)
            cursor.execute(query_delete, (r['referencia_tipo'], r['referencia_id']))
            
            cursor.execute(query_insert, (
                r['perfil_destino'],
                r['referencia_tipo'],
                r['referencia_id'],
                r['tipo_insight'],
                r['titulo'],
                desc_texto,
                r['nivel_alerta'],
                r['valor_numerico']
            ))
        conexao.commit()
        cursor.close()
        conexao.close()
        print("[Python] Sucesso: Dados gravados com sucesso no banco.")
        
    except Exception as e:
        try:
            erro_msg = str(e)
        except UnicodeDecodeError:
            erro_msg = repr(e)
            
        print(f"[Python] Erro ao gravar dados no banco: {erro_msg}")

if __name__ == "__main__":
    if sys.stdout.encoding != 'utf-8':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

    # Valores padrão de contingência (caso o script seja executado manualmente sem o Node)
    id_arg = 1 
    titulo_arg = "Curso ID 1"
    descricao_arg = "Metricas de submissoes pendentes e analise de carga de validacao corrente."

    
    if len(sys.argv) > 3:
        try:
            id_arg = int(sys.argv[1])
            titulo_arg = sys.argv[2]
            descricao_arg = sys.argv[3]
            print(f"[Python] Executando atualizacao sob demanda para o curso ID: {id_arg}")
        except ValueError:
            print(f"[Python] Aviso: Falha ao converter argumentos. Usando padrões de contingência.")
    elif len(sys.argv) > 1:
        try:
            id_arg = int(sys.argv[1])
            print(f"[Python] Executando atualizacao parcial apenas para o ID: {id_arg}")
        except ValueError:
            pass

    dados_reais_curso = [{
        "referencia_tipo": "curso",
        "referencia_id": id_arg,
        "titulo": titulo_arg,
        "descricao": descricao_arg,
        "nivel_alerta": "medio",
        "valor_numerico": 0
    }]
    
    resultados = gerar_e_salvar_insights_ia(dados_reais_curso)
    
    if resultados:
        salvar_insights_no_postgres(resultados)
        print("[Python] Fluxo encerrado.")