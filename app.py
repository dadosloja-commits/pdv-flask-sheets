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

# --- ROTAS DE PÁGINAS (HTML) ---

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

# --- ROTA DO CUPOM (MODIFICADA) ---
# Modificada para tratar vírgulas ANTES de enviar ao template
@app.route('/cupom/<id_venda>')
def rota_cupom(id_venda):
    try:
        vendas_data = get_relatorio_vendas_data()
        itens_venda_bruto = [v for v in vendas_data if v["id_venda"] == id_venda]
        
        if not itens_venda_bruto:
            return "Venda não encontrada", 404
        
        itens_processados = []
        total = 0
        for item in itens_venda_bruto:
            # NOVO: Converte valores para float aqui, tratando vírgula
            item['total_item'] = float(str(item['total_item']).replace(',', '.'))
            item['preco_unitario'] = float(str(item['preco_unitario']).replace(',', '.'))
            total += item['total_item']
            itens_processados.append(item)

        data_venda = itens_processados[0]['data_hora']
        
        return render_template('cupom.html', 
                               itens=itens_processados, 
                               total=total, 
                               id_venda=id_venda, 
                               data_venda=data_venda)
    except Exception as e:
        return str(e), 500

# --- APIS DE PRODUTO/VENDA (Sem mudança) ---

@app.route('/api/estoque', methods=['GET'])
def get_estoque():
    return jsonify(get_estoque_data()), 200

@app.route('/api/produto/<codigo_barras>', methods=['GET'])
def get_produto(codigo_barras):
    try:
        # Usamos a função de cache para otimizar
        estoque_data = get_estoque_data()
        produto_encontrado = next((p for p in estoque_data if p['codigo_barras'] == codigo_barras), None)
        
        if produto_encontrado is None:
            return jsonify({"erro": "Produto não encontrado"}), 404

        # Precisamos garantir que os tipos de dados estão corretos
        produto_encontrado['preco'] = float(str(produto_encontrado['preco']).replace(',', '.'))
        produto_encontrado['quantidade'] = int(produto_encontrado['quantidade'])

        return jsonify(produto_encontrado), 200
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
        ws_estoque.append_row(novo_produto, value_input_option='USER_ENTERED')
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
                    "preco": float(str(row[col_map['preco']]).replace(',', '.')), # Correção de vírgula
                    "quantidade": int(row[col_map['quantidade']]),
                    "categoria": row[col_map['categoria']] # NOVO: Captura a categoria
                }
            except (IndexError, ValueError, KeyError):
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
                produto_em_stoque['preco'], total_item,
                produto_em_estoque.get('categoria', '') # NOVO: Salva a categoria na venda
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
            # Assumindo que a coluna 'categoria' é a H (índice 8)
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

# --- NOVAS FUNÇÕES DE CACHE ---

def get_relatorio_vendas_data():
    global cache_vendas
    agora = time.time()
    if not cache_vendas["data"] or (agora - cache_vendas["timestamp"] > CACHE_DURATION):
        print("ATUALIZANDO CACHE VENDAS")
        cache_vendas["data"] = ws_vendas.get_all_records()
        cache_vendas["timestamp"] = agora
    return cache_vendas["data"]

# NOVO: Função de cache para estoque
def get_estoque_data():
    global cache_estoque
    agora = time.time()
    if not cache_estoque["data"] or (agora - cache_estoque["timestamp"] > CACHE_DURATION):
        print("ATUALIZANDO CACHE ESTOQUE")
        cache_estoque["data"] = ws_estoque.get_all_records()
        cache_estoque["timestamp"] = agora
    return cache_estoque["data"]

# --- NOVAS APIS DE RELATÓRIO (O CÉREBRO) ---

# MODIFICADO: Rota de vendas agora é inteligente
@app.route('/api/relatorio/vendas', methods=['GET'])
def get_relatorio_vendas_processado():
    try:
        vendas_data = get_relatorio_vendas_data()
        
        hoje_str = datetime.date.today().strftime("%Y-%m-%d")
        mes_atual_str = datetime.date.today().strftime("%Y-%m")

        faturamento_hoje = 0
        faturamento_mes = 0
        ids_pedidos_hoje = set()
        ids_pedidos_mes = set()
        vendas_por_categoria = {}
        vendas_por_produto = {}
        faturamento_30_dias = {}

        # Precisamos de um mapa de categorias se a aba 'Vendas' não tiver
        # Mas vamos assumir que a coluna 8 ('H') agora tem a categoria
        
        for venda in vendas_data:
            try:
                data_venda_str = venda['data_hora'].split(' ')[0]
                total_item = float(str(venda['total_item']).replace(',', '.'))
                quantidade = int(venda['quantidade_vendida'])
                id_venda = venda['id_venda']
                nome_produto = venda['nome_produto']
                
                # Assume que a categoria está na coluna 'H' (índice 7)
                categoria = venda.get('categoria', 'Sem Categoria')
                if not categoria:
                    categoria = 'Sem Categoria'

                # 1. KPIs de Hoje
                if data_venda_str == hoje_str:
                    faturamento_hoje += total_item
                    ids_pedidos_hoje.add(id_venda)

                # 2. KPIs do Mês
                if data_venda_str.startswith(mes_atual_str):
                    faturamento_mes += total_item
                    ids_pedidos_mes.add(id_venda)
                
                # 3. Gráfico de Vendas por Categoria
                vendas_por_categoria[categoria] = vendas_por_categoria.get(categoria, 0) + quantidade
                
                # 4. Gráfico de Vendas por Produto
                vendas_por_produto[nome_produto] = vendas_por_produto.get(nome_produto, 0) + quantidade
                
                # 5. Gráfico de Faturamento por Dia (Últimos 30 dias)
                data_venda_obj = datetime.date.fromisoformat(data_venda_str)
                dias_atras = (datetime.date.today() - data_venda_obj).days
                if 0 <= dias_atras <= 30:
                    faturamento_30_dias[data_venda_str] = faturamento_30_dias.get(data_venda_str, 0) + total_item

            except Exception as e:
                print(f"Erro ao processar linha da venda: {venda} - Erro: {e}")
                continue
        
        # Ordena o gráfico de faturamento por dia
        faturamento_30_dias_ordenado = sorted(faturamento_30_dias.items())

        # Pega os 5 produtos mais vendidos
        produtos_mais_vendidos = sorted(vendas_por_produto.items(), key=lambda item: item[1], reverse=True)[:5]
        
        return jsonify({
            "kpis": {
                "faturamento_hoje": faturamento_hoje,
                "pedidos_hoje": len(ids_pedidos_hoje),
                "faturamento_mes": faturamento_mes,
                "pedidos_mes": len(ids_pedidos_mes)
            },
            "graficos": {
                "vendas_por_categoria": vendas_por_categoria,
                "produtos_mais_vendidos": dict(produtos_mais_vendidos),
                "faturamento_ultimos_30_dias": dict(faturamento_30_dias_ordenado)
            }
        }), 200

    except Exception as e:
        return jsonify({"erro": str(e)}), 500

# NOVO: Rota de Relatório de Estoque
@app.route('/api/relatorio/estoque', methods=['GET'])
def get_relatorio_estoque():
    try:
        estoque_data = get_estoque_data()
        
        valor_total_estoque = 0
        itens_baixo_estoque = []
        total_itens_estoque = 0
        LIMITE_BAIXO_ESTOQUE = 5 # Você pode mudar isso

        for item in estoque_data:
            try:
                # Usando preço de venda, como solicitado
                preco = float(str(item['preco']).replace(',', '.'))
                quantidade = int(item['quantidade'])
                
                valor_total_estoque += (preco * quantidade)
                total_itens_estoque += quantidade
                
                if 0 < quantidade <= LIMITE_BAIXO_ESTOQUE:
                    itens_baixo_estoque.append(f"{item['nome']} (Qtd: {quantidade})")
            
            except Exception as e:
                print(f"Erro ao processar linha do estoque: {item} - Erro: {e}")
                continue

        return jsonify({
            "kpis": {
                "valor_total_estoque": valor_total_estoque,
                "total_itens_estoque": total_itens_estoque,
                "itens_baixo_estoque_contagem": len(itens_baixo_estoque)
            },
            "listas": {
                "itens_baixo_estoque_nomes": itens_baixo_estoque[:10] # Limita a 10 para não lotar a tela
            }
        }), 200

    except Exception as e:
        return jsonify({"erro": str(e)}), 500

# --- FIM DAS NOVAS APIS DE RELATÓRIO ---

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
