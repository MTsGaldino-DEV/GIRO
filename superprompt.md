# GIRO — Super Prompt de Implementação

## Perfil do Colaborador em Painel Flutuante — V1

> **IMPORTANTE:** Este documento é um prompt de implementação para ser copiado e colado diretamente no **Claude Code**.
> 
> 
> O objetivo é implementar **somente o Perfil do Colaborador em um painel flutuante (Drawer/Modal)** dentro da estrutura atual do GIRO.
> 
> **NÃO refatore, redesenhe ou altere funcionalidades existentes que não estejam diretamente relacionadas a esta entrega.**
> 

---

# 1. CONTEXTO DO PROJETO

O projeto é o **GIRO — Gestão Integrada de Requisitos Ocupacionais**.

O sistema atualmente possui uma estrutura funcional para controle de colaboradores, ASO, pendências, supervisores, ausências, usuários e histórico.

### Stack atual

- Next.js 15
- App Router
- TypeScript
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Tailwind CSS 4
- Vercel
- Resend
- Cron Jobs

### Estrutura já existente

Entre as telas existentes estão:

- `/qsms`
- `/qsms/base`
- `/qsms/item/[id]`
- `/qsms/supervisores`
- `/qsms/ausencias`
- `/qsms/colaborador/[id]/[aba]`
- `/admin/usuarios`
- `/supervisor`
- `/supervisor/item/[id]`

A tela de colaborador já possui estrutura de abas, incluindo:

1. Visão geral
2. ASO
3. Treinamentos
4. Ausências
5. Cadastro
6. Histórico

O sistema também possui uma máquina de estados do ASO já implementada.

---

# 2. OBJETIVO DESTA ENTREGA

Criar uma experiência de **Perfil Completo do Colaborador em um Painel Flutuante**, acessível a partir da lista/base de colaboradores.

O painel deve permitir visualizar e, dentro do escopo definido abaixo, gerenciar as principais informações do colaborador sem que o usuário precise abandonar a tela atual.

O conceito visual deve ser:

**Lista de colaboradores → clicar no colaborador → abrir Painel Flutuante → visualizar/gerenciar informações → fechar → continuar exatamente de onde estava.**

O painel pode ser implementado como:

- Drawer lateral;
- Side Panel;
- Modal grande;

**Escolha a solução que melhor se encaixa no design e nos componentes já utilizados no projeto.**

Priorize consistência com a interface atual.

---

# 3. REGRA ABSOLUTA: PRESERVAR O SISTEMA EXISTENTE

Esta é uma implementação **incremental**.

## NÃO fazer:

- Não refatorar o projeto inteiro.
- Não alterar a arquitetura sem necessidade.
- Não substituir componentes existentes sem necessidade.
- Não mudar o design global.
- Não alterar a máquina de estados do ASO.
- Não alterar regras de SLA existentes.
- Não alterar permissões existentes.
- Não alterar RLS existente, exceto se alguma política adicional for estritamente necessária para a nova funcionalidade.
- Não alterar cron jobs.
- Não alterar dashboards existentes.
- Não alterar a lógica de geração de pendências.
- Não alterar o funcionamento atual da lista de colaboradores.
- Não remover abas existentes.
- Não remover funcionalidades existentes.
- Não modificar fluxos que não estejam diretamente relacionados ao Perfil do Colaborador.

## PRINCÍPIO

> **Adicionar, não substituir.**
> 

Se algo já funciona, reutilize.

Se já existir componente, hook, função, query, tabela ou padrão visual adequado, reutilize-o.

Não crie uma segunda implementação da mesma lógica sem necessidade.

---

# 4. DESIGN SYSTEM — REGRA IMPORTANTE

## NÃO criar um design novo.

Antes de implementar qualquer interface:

1. Inspecione as telas existentes.
2. Identifique o design system já utilizado.
3. Identifique:
    - cores;
    - espaçamentos;
    - tipografia;
    - tamanhos;
    - bordas;
    - radius;
    - sombras;
    - botões;
    - inputs;
    - badges;
    - tabs;
    - cards;
    - ícones;
    - estados de loading;
    - estados vazios;
    - mensagens de erro;
    - componentes de modal/drawer já existentes.
4. Reutilize os componentes existentes sempre que possível.

### Regra

O novo Perfil do Colaborador deve parecer que **sempre fez parte do GIRO**.

Não quero uma interface visualmente diferente do restante do sistema.

Se o projeto já possuir um componente de:

- Dialog;
- Drawer;
- Sheet;
- Modal;
- Tabs;
- Card;
- Button;
- Badge;
- Avatar;
- Table;
- Dropdown;
- Tooltip;

utilize os componentes existentes.

Caso exista mais de uma opção, escolha a que estiver sendo usada de forma mais consistente nas telas atuais.

---

# 5. RESPONSIVIDADE

O painel deve funcionar adequadamente nos tamanhos de tela suportados pelo sistema atual.

Em desktop:

- preferência por painel lateral amplo ou modal grande;
- a lista original deve continuar contextualizada atrás do painel.

Em telas menores:

- adaptar para ocupar praticamente toda a tela;
- evitar conteúdo cortado;
- manter navegação das abas utilizável.

Não criar um comportamento mobile completamente diferente sem necessidade.

---

# 6. ACESSO AO PERFIL

A partir da lista/base de colaboradores, o usuário deve conseguir abrir o perfil.

Exemplo:

```
Lista de colaboradores

┌────────────────────────────────────────────────────────────┐
│ Nome        Matrícula    Supervisor    ASO       Status    │
├────────────────────────────────────────────────────────────┤
│ João        12345        Carlos        APTO      Regular   │
│ Maria       12346        João          Pendente  Atenção   │
└────────────────────────────────────────────────────────────┘
```

Ao clicar:

```
┌────────────────────────────────────────────────────────────┐
│ Lista de colaboradores                    ┌────────────────┤
│                                           │ Perfil          │
│ João                                      │                │
│ Maria                               →     │ João Silva      │
│ Carlos                                    │                │
│                                           │ [Geral] [ASO]  │
│                                           │ [Docs] [Cad.]   │
│                                           │ [Histórico]     │
│                                           │                │
│                                           │ conteúdo       │
│                                           │                │
└───────────────────────────────────────────┴────────────────┘
```

O fechamento deve retornar o usuário à lista no mesmo contexto possível.

---

# 7. URL E ESTRUTURA EXISTENTE

O projeto já possui:

`/qsms/colaborador/[id]/[aba]`

Não quebrar essa estrutura.

Sempre que possível, manter compatibilidade com ela.

Se tecnicamente adequado, o painel pode ser aberto utilizando essa rota como estado de navegação.

Exemplo:

```
/qsms/colaborador/123/visao-geral
/qsms/colaborador/123/aso
/qsms/colaborador/123/documentos
/qsms/colaborador/123/cadastro
/qsms/colaborador/123/historico
```

A implementação deve respeitar o padrão arquitetural já utilizado no projeto.

---

# 8. ESCOPO MÍNIMO V1

O painel terá somente estas cinco áreas:

1. **Visão Geral**
2. **ASO**
3. **Documentos**
4. **Cadastro**
5. **Histórico**

---

# 9. CABEÇALHO DO PERFIL

O cabeçalho deve apresentar as informações mais importantes do colaborador.

Exibir, quando disponíveis:

- Foto;
- Nome completo;
- Matrícula;
- Cargo;
- Setor;
- Polo/UEN;
- Supervisor;
- Status geral;
- Indicador de situação/compliance.

Exemplo conceitual:

```
┌─────────────────────────────────────────────┐
│ [FOTO] João da Silva                       │
│        Matrícula: 12345                    │
│        Eletricista                         │
│                                            │
│ Supervisor: Carlos                         │
│ Setor: Operacional                         │
│                                            │
│ [REGULAR]                                 │
└─────────────────────────────────────────────┘
```

Não inventar campos que não existem na base.

Utilizar os dados reais disponíveis.

---

# 10. INDICADORES RESUMIDOS

Logo abaixo do cabeçalho, exibir indicadores simples, aproveitando os padrões visuais existentes.

Sugestões:

- ASO;
- Requisitos;
- Treinamentos;
- Documentos;
- Pendências.

Esses indicadores devem ser compactos.

Não transformar isso em um dashboard complexo.

Se algum dado ainda não estiver estruturado no banco, não criar uma lógica complexa apenas para preencher o indicador.

---

# 11. ABA — VISÃO GERAL

A Visão Geral deve funcionar como resumo do colaborador.

Mostrar:

### Identificação

- Nome;
- Matrícula;
- Cargo;
- Setor;
- Polo/UEN;
- Supervisor;
- Vínculo, se existente;
- Status.

### Situação atual

Mostrar de forma resumida:

- situação do ASO;
- próximas pendências relevantes;
- documentos relevantes;
- requisitos complementares conhecidos;
- treinamentos disponíveis, se já existirem dados.

### Regra

A Visão Geral deve ser um **resumo**, não duplicar todas as informações das outras abas.

---

# 12. ABA — ASO

## MUITO IMPORTANTE

A funcionalidade de ASO **já existe**.

Não recriar a máquina de estados.

Não alterar a lógica existente.

Não alterar:

- estados;
- SLA;
- transições;
- regras de conclusão;
- regras de inapto;
- cron;
- geração de itens;
- histórico operacional.

A aba ASO do painel deve **reutilizar a implementação existente**.

Se já houver componentes para mostrar o ASO, reutilizá-los.

---

# 13. ESTADOS DO ASO EXISTENTES

Preservar exatamente os estados já existentes:

- `previsto`
- `data_solicitada`
- `data_proposta`
- `agendado`
- `enviado_clinica`
- `aguardando_documento`
- `concluido`
- `inapto_em_tratativa`
- `cancelado`

Não modificar nomenclatura ou comportamento.

---

# 14. RESULTADOS DO EXAME

Preservar as regras existentes:

- `fez_apto`
- `fez_inapto`
- `faltou`
- `incompleto`
- `retorno_necessario`

Somente `fez_apto` encerra o ciclo.

Não alterar essa regra.

---

# 15. ABA — DOCUMENTOS / ANEXOS

Esta é uma das principais funcionalidades novas desta entrega.

Criar a aba:

**Documentos**

ou, se o padrão visual do projeto indicar:

**Anexos**

A aba deve permitir visualizar os documentos associados ao colaborador.

---

# 16. DOCUMENTOS — LISTAGEM

Exibir:

- Nome do documento;
- Tipo;
- Data do documento, quando existir;
- Validade, quando existir;
- Status;
- Quem anexou;
- Data/hora do envio;
- Ações disponíveis.

Exemplo:

```
Documentos

┌─────────────────────────────────────────────────────────┐
│ Documento             Tipo        Validade    Anexado por│
├─────────────────────────────────────────────────────────┤
│ Avaliação Psicológica Complementar  10/2027   Maria      │
│ RG                    Cadastro      —         João       │
│ Certificado NR-10     Treinamento   03/2027   Carlos     │
└─────────────────────────────────────────────────────────┘
```

---

# 17. ANEXAR DOCUMENTO

Permitir adicionar um documento.

Campos mínimos:

- Arquivo;
- Tipo do documento;
- Data do documento — opcional;
- Data de validade — opcional;
- Descrição — opcional.

Após anexar:

- salvar arquivo no Supabase Storage;
- salvar metadados no banco;
- registrar quem anexou;
- registrar data/hora;
- registrar ação no histórico/auditoria.

---

# 18. STORAGE

O armazenamento deve respeitar o padrão de segurança já utilizado.

Se já existir bucket privado:

- reutilizar o bucket adequado.

Os documentos não devem ficar públicos.

Para visualização/download:

- utilizar URL assinada;
- manter o padrão de segurança atual;
- evitar exposição direta do arquivo.

Não criar bucket público apenas para facilitar a implementação.

---

# 19. DOCUMENTOS — EDIÇÃO

Permitir editar metadados quando fizer sentido.

Exemplo:

- tipo;
- validade;
- descrição;
- data.

Ao alterar:

registrar no histórico:

```
Maria alterou a validade de "Certificado NR-10"
de 03/2027 para 06/2027.
```

Não é necessário implementar um sistema completo de versionamento de documentos nesta V1.

---

# 20. DOCUMENTOS — EXCLUSÃO

Se a exclusão for permitida pelo modelo de permissões atual:

- registrar quem excluiu;
- registrar qual documento foi removido;
- registrar data/hora;
- respeitar RLS/permissões.

Não apagar silenciosamente.

Se o projeto já utiliza soft delete, seguir esse padrão.

Não criar uma estratégia diferente sem necessidade.

---

# 21. REQUISITOS COMPLEMENTARES

## IMPORTANTE

O GIRO atualmente está fortemente estruturado ao redor de ASO.

Porém, nem todos os colaboradores possuem somente ASO.

Alguns podem exigir:

- avaliação psicológica;
- exames complementares;
- requisitos específicos;
- outros documentos ocupacionais.

### Nesta V1 NÃO criar um motor completo de requisitos.

O objetivo agora é apenas permitir que essas informações possam existir no perfil através de:

- documentos;
- informações do cadastro;
- histórico.

Exemplo:

```
Tipo:
Avaliação Psicológica

Validade:
12/2027
```

Isso permite que o sistema comece a acomodar requisitos complementares sem transformar esta entrega em um novo módulo.

---

# 22. ABA — CADASTRO

Exibir os dados cadastrais atuais.

Campos relevantes, conforme existirem na base:

- Nome;
- Matrícula;
- Cargo;
- Setor;
- Polo;
- Supervisor;
- Vínculo;
- Foto;
- Demais informações cadastrais já existentes.

---

# 23. EDIÇÃO DO CADASTRO

Permitir alteração somente dos campos que o usuário já possui permissão para alterar.

Especialmente:

- Cargo;
- Setor;
- Polo;
- Supervisor;
- Vínculo;
- Foto.

Não permitir que a nova interface contorne RLS ou permissões existentes.

---

# 24. AUDITORIA DO CADASTRO

Toda alteração relevante deve gerar registro.

Exemplo:

```
Maria alterou o supervisor:
Carlos → João
```

Ou:

```
Carlos alterou o cargo:
Eletricista → Eletricista Líder
```

Registrar:

- usuário;
- data/hora;
- ação;
- campo alterado;
- valor anterior;
- valor novo.

---

# 25. ABA — HISTÓRICO

Criar uma visão unificada do histórico relevante do colaborador.

A ideia é que o usuário consiga responder:

> “O que aconteceu com esse colaborador e quem fez cada coisa?”
> 

---

# 26. HISTÓRICO — EVENTOS

O histórico deve reunir, quando disponíveis:

### Cadastro

- criação;
- alteração;
- alteração de supervisor;
- alteração de cargo;
- alteração de setor;
- alteração de polo;
- alteração de vínculo;
- alteração de foto.

### Documentos

- documento anexado;
- documento alterado;
- documento excluído.

### ASO

Utilizar o histórico operacional já existente.

Não duplicar a lógica da máquina de estados.

---

# 27. EXEMPLO DO HISTÓRICO

Visualmente, utilizar o padrão de timeline existente no sistema, se houver.

Exemplo:

```
04/09/2026 — 10:32
Maria anexou:
"Avaliação Psicológica.pdf"

03/09/2026 — 16:20
Carlos alterou o supervisor:
Carlos Souza → João Silva

02/09/2026 — 09:10
QSMS registrou resultado do ASO:
APTO

01/09/2026 — 14:40
Maria alterou o cargo:
Eletricista → Eletricista Líder
```

O histórico deve deixar claro:

**QUEM + O QUE + QUANDO + DE ONDE/QUAL CAMPO, quando aplicável.**

---

# 28. AUDITORIA — REGRA

Não registrar apenas:

> “Cadastro atualizado.”
> 

Registrar algo útil.

Preferir:

> “João alterou o setor de Operacional para Manutenção.”
> 

em vez de:

> “Cadastro atualizado.”
> 

O objetivo é permitir rastreabilidade.

---

# 29. ORIGEM DA ALTERAÇÃO

Sempre que tecnicamente possível, registrar o contexto da alteração.

Exemplo:

```
Usuário: João
Ação: Alteração de cadastro
Campo: Supervisor
Antes: Carlos
Depois: Maria
Origem: Perfil do Colaborador
Data: 04/09/2026 14:32
```

Não é necessário rastrear absolutamente toda navegação do usuário.

O foco é rastrear **alterações relevantes de dados**.

---

# 30. AUDITORIA NÃO DEVE DUPLICAR ASO

O ASO já possui histórico operacional.

Portanto:

- reutilizar `historico_item`;
- não criar uma segunda máquina de histórico do ASO;
- na interface do Histórico do colaborador, agregar esses eventos à timeline.

A origem do evento deve continuar identificável.

---

# 31. SEGURANÇA E RLS

Preservar o modelo de segurança existente.

### Supervisor

Deve continuar visualizando somente colaboradores permitidos pela regra atual.

### QSMS

Deve manter as permissões atuais.

### Admin

Deve manter as permissões atuais.

Documentos e histórico devem respeitar as mesmas regras de acesso.

Não criar uma query que permita contornar RLS.

Não utilizar `service_role` no frontend.

---

# 32. BANCO DE DADOS

Antes de criar novas tabelas:

1. Inspecione o schema existente.
2. Procure estruturas que possam ser reutilizadas.
3. Só crie uma nova tabela se realmente necessário.

Se for necessário criar estrutura para documentos, ela deve possuir no mínimo informações equivalentes a:

```
id
colaborador_id
nome_arquivo
tipo
storage_path
data_documento
data_validade
descricao
criado_por
criado_em
atualizado_por
atualizado_em
```

Os nomes devem seguir o padrão de nomenclatura já utilizado pelo projeto.

Não aplicar cegamente esse schema se já existir uma estrutura equivalente.

---

# 33. AUDITORIA NO BANCO

Se não existir estrutura adequada para auditoria de alterações cadastrais/documentais, criar uma estrutura mínima.

Ela deve permitir registrar:

```
id
colaborador_id
usuario_id
acao
entidade
entidade_id
campo
valor_anterior
valor_novo
metadata
created_at
```

Novamente:

**primeiro inspecione o banco existente.**

Se já existir uma tabela adequada, reutilize-a.

---

# 34. PERFORMANCE

Não carregar tudo imediatamente.

O perfil pode carregar inicialmente:

- dados principais;
- resumo;
- ASO.

Documentos e histórico podem ser carregados sob demanda ao abrir as respectivas abas.

Histórico deve possuir paginação ou carregamento incremental caso o volume seja grande.

Evitar:

- queries gigantes;
- múltiplas chamadas redundantes;
- N+1 queries;
- carregar todos os documentos de todos os colaboradores na lista.

---

# 35. ESTADOS DE INTERFACE

Implementar corretamente:

- loading;
- empty state;
- erro;
- sucesso;
- upload em andamento;
- documento sendo salvo;
- alteração de cadastro sendo salva.

Utilizar os componentes e padrões já existentes.

Não criar mensagens visuais fora do padrão do GIRO.

---

# 36. TREINAMENTOS

A aba Treinamentos existe no sistema atual, mas está fora do escopo principal desta V1.

Não implementar um módulo completo de treinamentos agora.

Na Visão Geral:

- se houver dados existentes, exibir resumo;
- se não houver, mostrar estado apropriado.

Não criar regras complexas de validade de treinamentos nesta entrega.

---

# 37. O QUE ESTÁ FORA DO ESCOPO

Não implementar nesta V1:

- motor completo de requisitos;
- motor completo de avaliação psicológica;
- gestão completa de exames complementares;
- módulo completo de treinamentos;
- notificações de documentos;
- alertas automáticos de validade de documentos;
- versionamento avançado de documentos;
- dashboard documental;
- relatórios;
- exportação;
- novos cron jobs;
- novas automações de ASO;
- alteração da máquina de estados;
- alteração de SLA;
- alteração dos fluxos existentes;
- auditoria de simples visualização/navegação;
- reconstrução do dashboard;
- redesign global do sistema.

---

# 38. CRITÉRIO DE IMPLEMENTAÇÃO

Antes de escrever código:

### ETAPA 1 — INSPEÇÃO

Inspecione o projeto atual.

Procure:

- componentes;
- layouts;
- páginas;
- hooks;
- queries;
- serviços;
- schemas;
- tabelas;
- migrations;
- RLS;
- componentes de modal/drawer;
- componentes de tabs;
- componentes de upload;
- componentes de avatar;
- sistema de toast;
- padrões de loading;
- sistema de auditoria existente.

### ETAPA 2 — MAPEAR REUTILIZAÇÃO

Determine:

```
O que já existe?
O que pode ser reutilizado?
O que realmente precisa ser criado?
```

### ETAPA 3 — IMPLEMENTAR

Faça somente as alterações necessárias para esta funcionalidade.

### ETAPA 4 — VALIDAR

Verifique:

- TypeScript;
- lint;
- build;
- migrations;
- RLS;
- permissões;
- fluxo de upload;
- URLs assinadas;
- histórico;
- navegação;
- fechamento do painel.

---

# 39. REGRA CONTRA OVERENGINEERING

Não transformar esta tarefa em uma grande refatoração.

Se houver duas soluções:

### Solução A

Simples, compatível com a arquitetura atual e suficiente para V1.

### Solução B

Mais complexa, genérica e “preparada para o futuro”.

Escolher:

**Solução A.**

O objetivo é entregar uma V1 funcional, segura e integrada ao sistema atual.

---

# 40. CRITÉRIOS DE ACEITE

A implementação será considerada correta quando o seguinte fluxo funcionar:

### Fluxo 1 — Abrir perfil

```
Lista
↓
Selecionar colaborador
↓
Painel flutuante abre
↓
Perfil carregado
```

### Fluxo 2 — Visualizar ASO

```
Perfil
↓
ASO
↓
Dados atuais do ASO aparecem
```

Sem alterar a máquina de estados existente.

### Fluxo 3 — Documentos

```
Perfil
↓
Documentos
↓
Visualizar documentos
↓
Anexar documento
↓
Documento aparece na lista
```

### Fluxo 4 — Rastreabilidade

```
Documento anexado
↓
Histórico
↓
"Usuário X anexou documento Y"
```

### Fluxo 5 — Alteração cadastral

```
Cadastro
↓
Alterar supervisor
↓
Salvar
↓
Histórico
↓
"Usuário X alterou Supervisor:
A → B"
```

### Fluxo 6 — Segurança

Usuário não pode visualizar ou alterar colaboradores/documentos fora de sua permissão.

---

# 41. RESULTADO ESPERADO

Ao final desta implementação, o GIRO deverá possuir:

```
                 GIRO
                   │
                   ▼
          Lista de Colaboradores
                   │
                   ▼
       ┌───────────────────────────┐
       │ Perfil do Colaborador     │
       │                           │
       │ Foto + Dados principais   │
       │                           │
       │ [Visão Geral]             │
       │ [ASO]                     │
       │ [Documentos]              │
       │ [Cadastro]                │
       │ [Histórico]               │
       │                           │
       └───────────────────────────┘
```

O usuário terá uma **visão centralizada e rastreável do colaborador**, sem abandonar a tela atual.

---

# 42. REGRA FINAL PARA O CLAUDE CODE

Antes de alterar qualquer arquivo, analise a implementação atual.

Não assuma que algo não existe.

Não crie uma segunda versão de algo que já existe.

Não altere funcionalidades fora do escopo.

Não faça redesign.

Não refatore por preferência pessoal.

Não altere a máquina de estados do ASO.

Não altere SLA.

Não altere cron.

Não quebre RLS.

Não introduza dependências desnecessárias.

Priorize reutilização.

Priorize consistência visual.

Priorize simplicidade.

## PRINCÍPIO CENTRAL

> **O GIRO já existe. Esta tarefa não é para reconstruir o GIRO. É para adicionar um Perfil do Colaborador em Painel Flutuante, integrado ao sistema existente, respeitando integralmente sua arquitetura, regras, segurança e design atual.**
> 

Ao finalizar, apresente um resumo objetivo contendo:

1. Arquivos criados;
2. Arquivos alterados;
3. Migrations criadas;
4. Componentes reutilizados;
5. Funcionalidades implementadas;
6. Validações executadas;
7. Eventuais pontos que ficaram fora do escopo.