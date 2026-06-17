<div align="center">

# ✈️ Trippin — V1

**Tudo da sua viagem, num lugar só.**

Protótipo funcional do aplicativo de viagens *Trippin*, construído a partir da Visão de Negócio pelo time de agentes do projeto **Tripping - Claude**.

</div>

---

## 🚀 Como rodar

O app V1 é uma aplicação React autocontida que **roda offline em qualquer navegador** — sem build, sem instalação.

```bash
# Opção 1 — abrir direto
abra app/index.html no seu navegador

# Opção 2 — servir localmente (recomendado)
cd app
python3 -m http.server 8000
# acesse http://localhost:8000
```

> Os dados ficam salvos no seu navegador (offline-first). Para recomeçar do zero, use **Sair** no menu lateral.

---

## 🧭 O que dá para fazer no V1

- **Onboarding** — escolher idioma (10 opções) e criar perfil (gera código de 6 dígitos)
- **Home** — viagens ativas, criar nova, participar por código, viagens anteriores
- **Criar viagem** — nome, datas, múltiplos destinos com busca (≥3 letras), código de 12 dígitos copiável
- **Cronograma** — calendário mês/semana/dia, adicionar atividades, conflitos visíveis, ingressar em atividade
- **Interpretador de passagem (PDF) ⭐** — anexe o PDF em **Docs → Passagens**: o roteiro é lido (origem, escalas e destino), os cards são exibidos e, ao clicar **Adicionar ao cronograma**, uma confirmação envia os cards para o **cronograma nas datas corretas** (partida e chegada de cada trecho)
- **Mapa, Galeria, Sugestões, Integrantes** — rota da viagem, fotos por cidade, recomendações, convite por e-mail e despesas
- **Notificações** e **menu lateral** acionáveis

---

## 📂 Estrutura

```
tripping-claude-v1/
├── app/
│   ├── index.html              # ← o aplicativo V1 (abra este arquivo)
│   └── interpretador-passagem.html  # interpretador de passagem aérea (PDF → etapas)
├── docs/
│   ├── 01-VN-revisada.md    # VN-Reviewer
│   ├── 02-UXUI-spec.md      # UX/UI Specialist
│   ├── 03-backlog.md        # Task-Creator
│   ├── 04-qa-report.md      # QA
│   ├── 05-vv-report.md      # V-V tester
│   └── 06-rollout-plan.md   # Rollout team
├── README.md
├── LICENSE
└── .gitignore
```

Cada documento em `docs/` foi produzido por um dos agentes do fluxo, na ordem:
**VN-Reviewer → UX/UI Specialist → Task-Creator → Backend/Frontend Dev (app) → QA → V&V → Rollout.**

---

## 🏨 Interpretador de hospedagem

Em **Docs → Estadias**, anexe o **PDF** ou um **print (imagem)** da reserva (Airbnb, Booking, hotel). O interpretador lê **nome do lugar, localização, endereço, anfitrião/contato, preço, check-in/out, noites, hóspedes e código**. Ao tocar **Adicionar ao cronograma** e confirmar, a hospedagem passa a aparecer **junto ao pin de localização do dia, acima dos horários** — clique para ver todos os detalhes. PDFs usam pdf.js; imagens usam OCR (Tesseract.js, requer rede no 1º uso); há sempre o preenchimento manual como alternativa.

## 🧭 Navegação e configurações

- **Barra inferior**: menu (esquerda), **Início** (centro) e notificações (direita).
- **Menu**: abre em tela cheia de baixo para cima; o **✕** no topo volta para onde você estava.
- **Configurações**: receber notificações, tema **claro/escuro**, compartilhar localização.
- **Apps de viagem**: atalhos para parceiros (integração futura).
- **Home**: o administrador vê um **✕** no card para excluir a viagem (com confirmação).
- **Galeria**: seções por local da viagem; o **＋** abre a galeria do dispositivo para adicionar fotos.
- **Mapa**: mostra todos os lugares por onde você vai passar (origem, escalas e destino do interpretador).

## 🗺️ Roadmap (próximas versões)

- **v1.1** — avaliação de atividades, aprovação de pedidos de ingresso por código, acessibilidade completa.
- **v2** — backend real (API + banco + logs por funcionalidade), sincronização multiusuário, OCR/LLM real na leitura de documentos, mapa com percurso em tempo real (cores quentes/frias), Recomendações Trippin baseadas na base de usuários, tradução dos 10 idiomas.
- **Produção mobile** — port para React Native (Android/iOS), conforme requisito da VN.

---

## 📤 Como subir este projeto para o GitHub

Este repositório já está com Git inicializado e um commit inicial. Para publicá-lo:

```bash
# 1. Crie um repositório vazio no GitHub chamado "Tripping---Claude-V1" (sem README)
# 2. No terminal, dentro desta pasta:
git remote add origin https://github.com/SEU_USUARIO/Tripping---Claude-V1.git
git branch -M main
git push -u origin main
```

> Não foi possível criar o repositório remoto automaticamente (requer suas credenciais do GitHub). Os comandos acima fazem isso em segundos.

---

<div align="center">
<sub>Projeto <b>Tripping - Claude</b> · V1 gerado a partir de <code>VN_-_Trippin_V1_-_Amadeu_14_06_26.docx</code></sub>
</div>
