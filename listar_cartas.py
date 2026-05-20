import os

# CONFIGURAÇÃO: Se o script estiver no mesmo local que a pasta 'cartas', deixa assim.
# Se a pasta estiver noutro sítio, podes colar o caminho completo, ex: "C:/Users/tiago/Desktop/cartas"
caminho_pasta = "cartas"

try:
    # Lê todos os ficheiros da pasta
    todos_ficheiros = os.listdir(caminho_pasta)
    
    # Filtra apenas por ficheiros que terminam em .png
    imagens_png = [f for f in todos_ficheiros if f.lower().endswith('.png')]
    
    print(f"=== ENCONTRADOS {len(imagens_png)} FICHEIROS PNG ===")
    print("Copia as linhas abaixo e cola-as na nossa conversa:\n")
    
    for img in sorted(imagens_png):
        print(img)
        
except FileNotFoundError:
    print(f"❌ Erro: A pasta '{caminho_pasta}' não foi encontrada.")
    print("Garante que o ficheiro .py está na mesma pasta onde está a pasta 'cartas',")
    print("ou altera a variável 'caminho_pasta' para o caminho correto.")