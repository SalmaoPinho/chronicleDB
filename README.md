# 📜 chronicleDB

Bem-vindo ao **chronicleDB**—um motor de narrativa dinâmico orientado a banco de dados, painel interativo de construção de mundo (world-building) e sandbox local de IA para escritores, criadores de mundos e RPGistas.

Este motor de software é completamente desacoplado do conteúdo da história, permitindo que você gerencie múltiplas campanhas, fichas de personagens, linhas do tempo e facções de forma isolada, sem qualquer duplicação de código.

---

## 🚀 Principais Recursos

* **Motor de Linha do Tempo Interativa (`mr.html`)**: Rastreamento cronológico detalhado com filtros por meses, visualizações de densidade temporal (Heartbeat) e painel embutido para rascunhos instantâneos.
* **Auditor Demográfico e de Elenco**: Painel dedicado com filtros múltiplos por gênero, etnia, nacionalidade, presença de retrato e afiliação a grupos/facções, com cálculo de idade em tempo real.
* **Grafo de Relacionamentos Dinâmico**: Visualização de vínculos, parentescos e operações militares/narrativas em formato de nós interativos (utilizando Cytoscape.js), com editor integrado e autocompletar de IDs de personagens.
* **Sandbox Local de IA (`chat.html`)**: Chat interativo em primeira pessoa com compilação dinâmica de RAG (Retrieval-Augmented Generation) que gera dossiês de personagens, afiliação de facções e redirecionamento de codinomes diretamente para o contexto de LLMs locais (como LM Studio).
* **Criador de Cartas de Personagem SillyTavern**: Painel que reúne o histórico cronológico de até 15 eventos de um personagem, compacta imagens em base64 e exporta cartas de personagem compatíveis com a especificação CCv3 (em formato JSON ou PNG binário).
* **Arquitetura Modular Multihistórias**: Crie e gerencie histórias independentes apenas adicionando pastas dentro do diretório `stories/`.

---

## 🧠 Como o Sistema Funciona (Arquitetura Interna)

O **chronicleDB** funciona separando rigidamente o **código-fonte (o motor)** dos **dados da história (o conteúdo)**.

### 1. Banco de Dados e Fichas (`core.json` & `entities.json`)
* Toda a configuração dos personagens reside em `stories/<nome_da_historia>/core.json`.
* Atributos permanentes (datas de nascimento, nomes completos, cores representativas, gêneros, grupos) são centralizados no "Core". Em tempo de execução, o painel do navegador mescla esses dados permanentes com as planilhas anuais dinâmicas.
* O sistema de entidades (`entities.json`) cataloga locais, facções corporativas/militares e eventos globais de maneira análoga aos personagens.

### 2. O Pipeline da Linha do Tempo (Timeline Pipeline)
O sistema cronológico do chronicleDB é modular e escalável:
1. **Staging (Rascunho)**: O autor adiciona rascunhos de eventos brutos na página do painel ou editando o arquivo `stories/<nome_da_historia>/newtimeline.md` usando frontmatter YAML padrão:
   ```yaml
   ---
   date: "2026-07-13"
   title: "Reunião de Cúpula"
   tags:
     - "alex"
     - "alianca"
   ---
   Os líderes se reúnem na base operacional para definir a estratégia de contenção.
   ```
2. **Injeção e Ordenação**: Ao rodar o script `timeline_pipeline.bat`, o backend lê o rascunho, valida as datas e distribui os eventos automaticamente nas pastas de décadas corretas (ex: `timeline/2020s/07-treinamento-2026.md`). O pipeline ordena cronologicamente todos os eventos dentro de cada arquivo e limpa duplicatas.
3. **Compactação para IA (Compaction)**: O script `compact_timeline.bat` processa toda a cronologia da história e gera perfis compactados otimizados para LLMs em `tools/compact_timeline/` (arquivos compactados em YAML, JSONL e texto plano). Isso reduz drasticamente o consumo de tokens ao enviar a história como contexto para IAs.

### 3. Grafo de Vínculos e Eventos Sintéticos
* Os relacionamentos são descritos em arquivos markdown categorizados sob `stories/<nome_da_historia>/relationships/` (`personal.md`, `operational.md`, `historical.md`).
* Cada relacionamento pode possuir um bloco `<!-- block: history -->` com datas específicas do relacionamento. O backend compila essas datas e as injeta dinamicamente como "eventos sintéticos" na linha do tempo individual de cada participante!

### 4. Proxy de IA com Preflight-Bypass
* O servidor Node.js local (`backend/server.js`) atua como um túnel HTTP proxy para servidores LLM locais (ex: LM Studio na porta 1234). Ele intercepta as chamadas e gerencia o streaming de Server-Sent Events (SSE) ignorando restrições de CORS e preflight de navegadores, permitindo que a IA digite em tempo real no painel sem erros de rede.

---

## 📂 Estrutura de Diretórios do Projeto

```text
chronicleDB/
├── backend/                # Servidor Express local e endpoints do proxy de IA
├── docs/                   # Manuais de desenvolvimento e guias de formatação
├── scripts/                # Controladores do Vue.js, rotinas do Cytoscape e utilitários
├── styles/                 # Folhas de estilo CSS com tokens de cores HSL dinâmicos
├── tools/                  # Ferramentas de compilação, pipeline e auditorias automáticas
├── stories/                # Pasta de histórias (Ignorada pelo git para sua privacidade!)
│   └── template/           # Estrutura inicial em branco para novas histórias
│       ├── core.json       # Fichas permanentes de personagens
│       ├── entities.json   # Banco de dados de organizações e locais
│       ├── metadata.json   # Título, descrição e cabeçalhos do painel
│       ├── year_themes.json# Variáveis de estilo e cores HSL do ano ativo
│       └── timeline/       # Pastas estruturadas por décadas
├── mr.html                 # Ponto de entrada do Painel Principal (SPA)
├── chat.html               # Ponto de entrada do Chat de IA (SPA)
├── map.html                # Ponto de entrada do Mapa Interativo de Locais (SPA)
└── preamble.html           # Painel de Facções e Preâmbulos do Universo (SPA)
```

---

## 💻 Instalação e Execução Local

1. Instale as dependências necessárias executando no terminal:
   ```bash
   npm install
   ```
2. Inicialize o servidor de desenvolvimento local (ele iniciará o backend Express na porta 8787 e o proxy BrowserSync na porta 8080 em paralelo):
   ```bash
   npm run dev
   ```
3. Abra o navegador no endereço: **`http://localhost:8080`**.
