# GIRO — Ajustes ao MVP: Autenticação, Dados de Teste e Sidebar

> **Como usar este documento**: este é um adendo ao `plano_mvp.md` já entregue. Ele **substitui** a decisão de autenticação anteriormente definida (magic link) e **adiciona** instruções de dados de teste e de UI da sidebar. Entregar este arquivo junto com o `plano_mvp.md` original para o Claude Code, deixando claro que as seções abaixo têm prioridade sobre o que conflitar no plano original.

---

## 1. Autenticação: trocar Magic Link por Email + Senha

**Decisão revisada**: o plano original definia magic link (sem senha). Essa decisão está revogada — o login agora é **email + senha**.

Requisitos:

- **Login**: tela com campos e-mail e senha, usando `supabase.auth.signInWithPassword`.
- **Criação de usuários**: não haverá autocadastro público. Usuários (Supervisor, QSMS, Admin) são criados por um Admin via Supabase Admin API (`auth.admin.createUser`) ou painel do Supabase, com senha temporária definida no ato da criação.
- **Recuperação de senha**: tela "Esqueci minha senha" (`resetPasswordForEmail`) + tela de redefinição de nova senha via link recebido por e-mail.
- **Requisito mínimo de senha**: 8+ caracteres, validado no front e no back.
- **Mensagens de erro**: genéricas em caso de falha de login (não revelar se o e-mail existe na base) — evita enumeração de contas.
- **Sessão**: mantém-se o uso de cookies/JWT do Supabase Auth já previsto; as regras de RLS continuam baseadas em `auth.uid()`, sem alteração de schema.
- **Remover** completamente o fluxo de magic link: rota de callback, textos de UI ("enviaremos um link de acesso"), etc.

**Pendência em aberto**: quem pode criar novos usuários — assumir que é exclusividade do Admin, pela tela "Gestão de Usuários" (já prevista na sidebar). Se não for esse o comportamento desejado, ajustar antes de implementar.

---

## 2. Dados de teste: limpar dados reais e popular com dados fictícios

**Remover completamente** qualquer dado real de colaborador hoje presente no banco, seeds, migrations ou arquivos de fixture — isso inclui os 261 colaboradores reais e seus CPFs, nomes e matrículas (originados de `Colaboradores_211_2.xlsx` e `ASO_Proximos_vencimentos.CSV`). Nenhum dado real de pessoa deve permanecer em nenhum ambiente após esse ajuste.

Substituir por um **seed fictício** de ~15 colaboradores cobrindo os cenários reais de operação: todos os status do semáforo, todos os estágios do fluxo, e o "ponto cego" (sem data de ASO) que hoje afeta 177 dos 261 colaboradores reais.

**Regra para CPFs fictícios**: usar CPFs de dígitos repetidos (111.111.111-11, 222.222.222-22, etc.) — são automaticamente inválidos pelo algoritmo de checagem do CPF, então nunca colidem com uma pessoa real. Se o formulário de cadastro validar CPF por checksum, inserir esses registros direto via seed script/SQL, sem passar pela validação de formulário.

**Regra para datas**: usar datas **relativas à execução do seed** (`hoje + N dias`), nunca datas fixas, para que os status do semáforo continuem corretos conforme o tempo passa.

Sugestão de seed (ajustar nomes/cargos se preferir outros, mas manter a cobertura de cenários):

| # | Nome (fictício) | Cargo | CPF fictício | Estágio do fluxo | Prox. Exame | Status esperado |
|---|---|---|---|---|---|---|
| 1 | Carlos Eduardo Ramos | Instalador Reparador Rede I | 111.111.111-11 | Concluído | hoje + 90d | Verde |
| 2 | Juliana Aparecida Ferreira | Instalador Serviços Comerc I | 222.222.222-22 | Concluído | hoje + 50d | Amarelo |
| 3 | Renato Costa Almeida | Instalador Reparador Rede III | 333.333.333-33 | Agendado | hoje + 25d | Laranja |
| 4 | Patrícia Souza Lima | Instalador Reparador Rede II | 444.444.444-44 | Data Proposta | hoje + 10d | Vermelho |
| 5 | Fábio Henrique Barros | Instalador Reparador Rede IV | 555.555.555-55 | Aguardando Documento | hoje − 5d | Preto (vencido) |
| 6 | Marcelo Vinícius Teixeira | Instalador Serviços Comerc II | 666.666.666-66 | Previsto | sem data | Preto (sem registro) |
| 7 | Ana Beatriz Nogueira | Assistente Administrativo III | 777.777.777-77 | Previsto | sem data | Preto (sem registro) |
| 8 | Diego Martins Rocha | Supervisor Comercial I | 888.888.888-88 | Concluído | hoje + 120d | Verde |
| 9 | Bruna Castro Pereira | Instalador Reparador Rede V | 999.999.999-99 | Agendado | hoje + 20d | Laranja |
| 10 | Thiago Nunes Cardoso | Instalador Reparador Rede I | 121.212.121-21 | Aguardando Documento | hoje − 40d | Preto (vencido) |
| 11 | Camila Rezende Pinto | Instalador Serviços Comerc III | 232.323.232-32 | Concluído | hoje + 65d | Amarelo |
| 12 | Rodrigo Almeida Vasconcelos | Instalador Reparador Rede III | 343.434.343-43 | Agendado | hoje + 14d | Laranja |
| 13 | Fernanda Lopes Guimarães | Assistente Administrativo V | 454.545.454-54 | Previsto | sem data | Preto (sem registro) |
| 14 | Vinícius Tavares Correia | Instalador Reparador Rede II | 565.656.565-65 | Data Proposta | hoje + 5d | Vermelho |
| 15 | Igor Barbosa Siqueira | Supervisor Comercial II | 676.767.676-76 | Concluído | hoje + 100d | Verde |

Todos os registros usam **UEN 211** (fora de escopo trocar de UEN no MVP).

**Usuários de teste (login)** — criar 3 contas via Admin API para validar o novo fluxo de email + senha:

| Perfil | E-mail | Senha temporária |
|---|---|---|
| Admin | teste.admin@giro.local | Giro@Teste123 |
| Supervisor | teste.supervisor@giro.local | Giro@Teste123 |
| QSMS | teste.qsms@giro.local | Giro@Teste123 |

(Documentar essas credenciais para Matheus poder testar o login logo após o deploy.)

---

## 3. Sidebar — redesenho visual

Referência: captura de tela anexada (app "TraceOne"). Reproduzir o **padrão de layout**, adaptando cores à identidade visual do GIRO (petroleum `#0E7C74` e graphite `#23262B`) — não copiar as cores literais do exemplo.

**Estrutura**:
- Sidebar fixa à esquerda, altura total da viewport, largura ~240–260px.
- Logo/wordmark no topo (ex.: "GIRO." no mesmo estilo do exemplo — nome + ponto de destaque).
- Lista de itens de navegação, ícone + rótulo, espaçamento generoso entre itens (~16–20px).
- **Item ativo**: fundo em retângulo arredondado na cor petroleum (ou uma variação um pouco mais clara dela), texto branco em negrito, ícone branco, seta/chevron `>` alinhada à direita.
- **Itens inativos**: ícone + texto em tom acinzentado/azulado apagado, sem fundo.
- **Cartão de usuário fixo no rodapé**: separado por uma linha divisória sutil, avatar circular com inicial do nome sobre fundo colorido, nome + papel (ex.: "Administrador") em duas linhas, e dois botões de ícone à direita (chave = trocar senha, seta de saída = logout).
- Fundo geral da sidebar em tom escuro (usar graphite ou uma variação levemente mais escura dele) — **atenção**: esse tom escuro é apenas cromia de UI, não deve ser confundido visualmente com a cor reservada do status "Preto" (ASO vencido/sem registro) usada em badges de status em outras telas. Manter os dois visualmente distintos.
- Fonte: usar uma sans-serif geométrica limpa e arredondada, no espírito da referência (ex.: Inter, Manrope ou Plus Jakarta Sans — usar a que já estiver configurada no projeto se houver uma definida; senão, adotar Inter como padrão via Google Fonts).

**Itens de navegação sugeridos** (adaptar aos nomes de tela reais já implementados, se diferentes):

| Ícone | Rótulo | Tela |
|---|---|---|
| grade | Painel | Visão geral / dashboard com contagem por status |
| pessoas | Colaboradores | Lista principal com semáforo (equivalente à "Lista de Medidores" do exemplo — deve ser o item de destaque/ativo por padrão) |
| calendário | Agendamentos ASO | Gestão do fluxo Previsto → Concluído |
| sino/envelope | Notificações | Histórico de e-mails semanais enviados |
| pessoas+engrenagem | Gestão de Usuários | Admin: criar/editar usuários (só visível para Admin) |

Opcional (não obrigatório para o MVP): colapsar a sidebar para modo ícone-apenas ou virar um drawer em telas estreitas (mobile).

---

## Checklist de aceite

- [ ] Login funciona com e-mail + senha; magic link removido por completo.
- [ ] Fluxo de "esqueci minha senha" funcional ponta a ponta.
- [ ] Nenhum dado real de colaborador (nome, CPF, matrícula) presente em nenhum ambiente.
- [ ] Seed fictício populado cobrindo todos os status do semáforo e todos os estágios do fluxo, incluindo o cenário "sem data" (ponto cego).
- [ ] 3 contas de teste (Admin, Supervisor, QSMS) criadas e funcionais.
- [ ] Sidebar nova no ar, com item ativo destacado, cartão de usuário no rodapé e cores dentro da paleta petroleum/graphite (não usando a paleta reservada de status).