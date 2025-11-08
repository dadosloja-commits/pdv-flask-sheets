import gspread
from google.oauth2.service_account import Credentials
from flask import Flask, render_template, request, jsonify
import datetime
import time

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
]
URL_DA_SUA_PLANILHA = "https://docs.google.com/spreadsheets/d/1E8KKLRqzhm5S5Y6kNj2kIybRGrH-Kawe8qKrusP3-h8/edit?gid=1674555204#gid=1674555204"

try:
    creds = Credentials.from_service_account_file('credentials.json', scopes=SCOPES)
    gc = gspread.authorize(creds)
    sh = gc.open_by_url(URL_DA_SUA_PLANILHA)
    ws_estoque = sh.worksheet("Estoque")
    ws_vendas = sh.worksheet("Vendas")
except Exception as e:
    print(f"ERRO CRÍTICO ao iniciar: {e}")
    print("Verifique 'credentials.json', a URL da planilha e o compartilhamento.")
    exit()

app = Flask(__name__)

CACHE_DURATION = 60
cache_estoque = {"data": None, "timestamp": 0}
cache_vendas = {"data": None, "timestamp": 0}

def invalidar_cache_estoque():
    global cache_estoque
    cache_estoque["timestamp"] = 0

def invalidar_cache_vendas():
    global cache_vendas
    cache_vendas["timestamp"] = 0

@app.route('/')
def rota_pdv():
    return render_template('pdv.html')

@app.route('/consulta')
def rota_consulta():
    return render_template('consulta.html')

@app.route('/recebimento')
def rota_recebimento():
    return render_template('recebimento.html')

@app.route('/relatorios')
def rota_relatorios():
    return render_template('relatorios.html')

@app.route('/cupom/<id_venda>')
def rota_cupom(id_venda):
    try:
        vendas_data = get_relatorio_vendas_data()
        itens_venda = [v for v in vendas_data if v["id_venda"] == id_venda]
        
        if not itens_venda:
            return "Venda não encontrada", 404
            
        total = sum(float(item['total_item']) for item in itens_venda)
        data_venda = itens_venda[0]['data_hora']
        
        return render_template('cupom.html', 
                               itens=itens_venda, 
                               total=total, 
                               id_venda=id_venda, 
                               data_venda=data_venda)
    except Exception as e:
        return str(e), 500

@app.route('/api/estoque', methods=['GET'])
def get_estoque():
    global cache_estoque
    agora = time.time()
    if not cache_estoque["data"] or (agora - cache_estoque["timestamp"] > CACHE_DURATION):
        try:
            cache_estoque["data"] = ws_estoque.get_all_records()
            cache_estoque["timestamp"] = agora
        except Exception as e:
            return jsonify({"erro": str(e)}), 500
            
    return jsonify(cache_estoque["data"]), 200

@app.route('/api/produto/<codigo_barras>', methods=['GET'])
def get_produto(codigo_barras):
    try:
        celula_produto = ws_estoque.find(codigo_barras, in_column=1)
        if celula_produto is None:
            return jsonify({"erro": "Produto não encontrado"}), 404

        linha_produto = ws_estoque.row_values(celula_produto.row)
        produto = {
            "codigo_barras": linha_produto[0],
            "nome": linha_produto[1],
            "descricao": linha_produto[2],
            "categoria": linha_produto[3],
            "preco": float(linha_produto[4]),
            "quantidade": int(linha_produto[5])
        }
        return jsonify(produto), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

@app.route('/api/produto', methods=['POST'])
def add_produto():
    try:
        data = request.json
        codigo = data['codigo_barras']

        celula_existente = ws_estoque.find(codigo, in_column=1)
        if celula_existente:
            return jsonify({"erro": "Produto com este código já cadastrado"}), 409

        novo_produto = [
            codigo,
            data['nome'],
            data.get('descricao', ''),
            data.get('categoria', ''),
            float(data['preco']),
            int(data['quantidade'])
        ]
        ws_estoque.append_row(novo_produto)
        invalidar_cache_estoque()
        return jsonify({"sucesso": "Produto cadastrado!"}), 201
    except KeyError:
        return jsonify({"erro": "Dados incompletos"}), 400
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

@app.route('/api/produto/<codigo_barras>', methods=['PUT'])
def update_produto(codigo_barras):
    try:
        celula_produto = ws_estoque.find(codigo_barras, in_column=1)
        if celula_produto is None:
            return jsonify({"erro": "Produto não encontrado"}), 404
        
        data = request.json
        updates = []
        
        if 'nome' in data:
            updates.append({'range': f'B{celula_produto.row}', 'values': [[data['nome']]]})
        if 'descricao' in data:
            updates.append({'range': f'C{celula_produto.row}', 'values': [[data['descricao']]]})
        if 'categoria' in data:
            updates.append({'range': f'D{celula_produto.row}', 'values': [[data['categoria']]]})
        if 'preco' in data:
            updates.append({'range': f'E{celula_produto.row}', 'values': [[float(data['preco'])]]})
        if 'quantidade' in data:
            updates.append({'range': f'F{celula_produto.row}', 'values': [[int(data['quantidade'])]]})
        
        if updates:
            ws_estoque.batch_update(updates, value_input_option='USER_ENTERED')
            invalidar_cache_estoque()
            return jsonify({"sucesso": "Produto atualizado"}), 200
        else:
            return jsonify({"info": "Nenhum dado para atualizar"}), 304

    except Exception as e:
        return jsonify({"erro": str(e)}), 500

@app.route('/api/venda', methods=['POST'])
def realizar_venda():
    try:
        data = request.json
        itens_venda_req = data['itens']
        
        if not itens_venda_req:
            return jsonify({"erro": "Nenhum item na venda."}), 400
        
        all_stock_data = ws_estoque.get_all_values()
        header = all_stock_data[0]
        col_map = {name: i for i, name in enumerate(header)}
        
        stock_map = {}
        for i, row in enumerate(all_stock_data[1:]):
            row_num = i + 2
            try:
                codigo = row[col_map['codigo_barras']]
                stock_map[codigo] = {
                    "row": row_num,
                    "nome": row[col_map['nome']],
                    "preco": float(row[col_map['preco']]),
                    "quantidade": int(row[col_map['quantidade']])
                }
            except (IndexError, ValueError):
                continue

        id_venda_nova = f"V{len(ws_vendas.get_all_records()) + 1}"
        data_hora_agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        vendas_para_registrar = []
        estoque_para_atualizar = []
        itens_registrados_resp = []

        for item in itens_venda_req:
            codigo_venda = item['codigo_barras']
            quantidade_venda = int(item['quantidade'])
            
            if codigo_venda not in stock_map:
                nome_item_falho = item.get('nome', codigo_venda)
                return jsonify({"erro": f"Produto '{nome_item_falho}' não encontrado no estoque."}), 404
            
            produto_em_estoque = stock_map[codigo_venda]
            
            if produto_em_estoque['quantidade'] < quantidade_venda:
                return jsonify({"erro": f"Estoque insuficiente para '{produto_em_estoque['nome']}'. Disponível: {produto_em_estoque['quantidade']}"}), 400
            
            novo_estoque = produto_em_estoque['quantidade'] - quantidade_venda
            produto_em_estoque['quantidade'] = novo_estoque
            
            total_item = produto_em_estoque['preco'] * quantidade_venda
            
            nova_venda_planilha = [
                id_venda_nova, data_hora_agora, codigo_venda,
                produto_em_estoque['nome'], quantidade_venda, 
                produto_em_estoque['preco'], total_item
            ]
            vendas_para_registrar.append(nova_venda_planilha)
            
            estoque_para_atualizar.append({
                'range': f'F{produto_em_estoque["row"]}',
                'values': [[novo_estoque]]
            })
            
            itens_registrados_resp.append({
                "nome": produto_em_estoque['nome'],
                "qtd": quantidade_venda,
                "total": total_item
            })

        if estoque_para_atualizar:
            ws_estoque.batch_update(estoque_para_atualizar, value_input_option='USER_ENTERED')
        
        if vendas_para_registrar:
            ws_vendas.append_rows(vendas_para_registrar, value_input_option='USER_ENTERED')

        invalidar_cache_estoque()
        invalidar_cache_vendas()

        return jsonify({
            "sucesso": "Venda registrada!",
            "id_venda": id_venda_nova,
            "itens": itens_registrados_resp
        }), 200

    except KeyError:
        return jsonify({"erro": "Dados incompletos"}), 400
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

def get_relatorio_vendas_data():
    global cache_vendas
    agora = time.time()
    if not cache_vendas["data"] or (agora - cache_vendas["timestamp"] > CACHE_DURATION):
        cache_vendas["data"] = ws_vendas.get_all_records()
        cache_vendas["timestamp"] = agora
    return cache_vendas["data"]

@app.route('/api/relatorio/vendas', methods=['GET'])
def get_relatorio_vendas():
    try:
        vendas_data = get_relatorio_vendas_data()
        return jsonify(vendas_data), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)