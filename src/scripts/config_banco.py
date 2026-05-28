import os
import psycopg2
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

def obter_conexao():
    try:
        conexao = psycopg2.connect(
            host=os.getenv('DB_HOST'),
            port=os.getenv('DB_PORT'),
            database=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD')
        )
        return conexao
    except Exception as e:
        print(f"Erro ao conectar ao banco de dados: {e}")
        return None
    
def ler_tabela_dataframe(query_sql):
    conexao = obter_conexao()
    if conexao is None:
        return None
    try:
        df = pd.read_sql_query(query_sql, conexao)
        return df
    except Exception as e:
        print(f"Erro ao ler tabela do banco de dados: {e}")
        return None
    finally:
        conexao.close()