# scripts/teste_conexao.py
from config_banco import obter_conexao

print("Tentando conectar ao banco de dados")
con = obter_conexao()

if con is not None:
    print("Sucesso!")
    con.close() 
else:
    print("Falha na conexão.")