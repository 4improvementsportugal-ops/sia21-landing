#!/usr/bin/env python3
"""Build the live storytelling landings. Source of layout: assets/sia21-story.css.
Home copy follows the approved storytelling draft, with the PDF at 55 pages.
Each angle keeps its own pain. Do not edit v3/storytelling from here.
"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
STRIPE = "https://buy.stripe.com/aFa5kF1OFc4D1fNb6mgrS02"
PROOF = "Mais de 1000 compras em ofertas semelhantes da 4Improvements"
TRUST = "Pagamento seguro na Stripe. Recebes o PDF por email, normalmente em menos de 30 minutos. Dúvidas?"
TOOLS = "Funciona com o ChatGPT grátis ou com o Claude; os planos pagos são opcionais."
JOIN = '<div class="scene-join" aria-hidden="true"><span><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>'

POSTHOG = r'''<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
if(window.SIA21_onHuman){SIA21_onHuman(function(){if(window.SIA21_bootPosthog)SIA21_bootPosthog();});}
</script>
<script>
(function () {
  var orig = window.SIA21_captureWhenHuman;
  if (typeof orig !== "function") return;
  window.SIA21_captureWhenHuman = function (name, props, options) {
    var next = {};
    if (props) {
      for (var key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) next[key] = props[key];
      }
    }
    next.format = "storytelling";
    return orig.call(window, name, next, options);
  };
})();
</script>'''


def e(text):
    return html.escape(text, quote=True)


def beats(lines):
    return "\n".join('<p class="beat">{0}</p>'.format(e(line)) for line in lines)


def scene(number, title, antes, depois, ref):
    return """
        <article class="scene">
          <header class="scene-head">
            <h3><span class="scene-no">Cena {n}</span> {title}</h3>
          </header>
          <div class="scene-pair">
            <div class="pane pane-antes">
              <p class="pane-label">Antes</p>
              {antes}
            </div>
            {join}
            <div class="pane pane-depois">
              <p class="pane-label">Depois</p>
              {depois}
            </div>
          </div>
          <p class="scene-ref">{ref}</p>
        </article>""".format(n=number, title=e(title), antes=beats(antes), depois=beats(depois), join=JOIN, ref=e(ref))


def paras(lines, cls):
    return "\n".join('<p class="{0}">{1}</p>'.format(cls, e(line)) for line in lines)


NOTE_HOURS = "Exemplos ilustrativos. O tempo que ganhas depende de aplicares o método. O e-book estima até cerca de 8 horas por semana, e és tu que medes."
NOTE_PLAIN = "Exemplos ilustrativos. Não são casos de clientes."
SCENES_LEAD = "Exemplos ilustrativos do dia a dia de um consultor. Não são casos de clientes."

PAGES = [
    {
        "path": "index.html",
        "title": "Pedes tudo à IA do zero? | Sistema IA do Consultor",
        "description": "Cinco momentos que já viveste esta semana. E como ficam com um plano de 21 dias, 80 prompts prontos a copiar e checklists simples. Em português de Portugal, sem pôr dados de clientes em risco.",
        "lead": "Como recuperar horas sem escrever tudo do zero mesmo que a IA te confunda.",
        "h1": "Pedes tudo à IA do zero? Vê o teu dia antes e depois de teres prompts prontos.",
        "sub": "Cinco momentos que já viveste esta semana. E como ficam com um plano de 21 dias, 80 prompts prontos a copiar e checklists simples. Em português de Portugal, sem pôr dados de clientes em risco.",
        "night": ["Estás no sofá com o portátil no colo.", "Ainda tens um anúncio para pôr no Idealista.", "Tens três leads de hoje sem resposta.", "E não te lembras se ligaste ao senhor da visita de terça.", "Abres o ChatGPT.", "Escreves «faz um anúncio de um T2».", "Sai um texto bonito, cheio de «oportunidade única».", "Não diz a área certa.", "Inventa uma varanda que não existe.", "Apagas tudo e escreves tu."],
        "same": "Amanhã é igual.",
        "turn": ["O problema não és tu.", "E o problema não é a IA.", "O problema é começar do zero todos os dias.", "Este e-book dá-te o que falta: uma tarefa por dia durante 21 dias, prompts prontos para o teu trabalho e checklists para não te esqueceres de nada."],
        "payoff": "Tu mandas nos factos. A IA ajuda na escrita.",
        "scenes_title": "Cinco momentos da tua semana. Antes e depois.",
        "note": NOTE_HOURS,
        "scenes": [
            ("O lead do Idealista que fica para amanhã",
             ["Chega um pedido do Idealista às 9h.", "Estás numa visita.", "Ao almoço já tens mais quatro.", "Respondes a um, depois a outro, cada vez com um texto diferente.", "Ao fim do dia, dois ficaram sem resposta."],
             ["Fazes dois blocos curtos por dia para emails e mensagens.", "Colas os pedidos sem nomes nem telefones.", "O prompt diz-te o que é urgente e dá-te um rascunho de resposta.", "Revês em um minuto. Envias.", "Para o WhatsApp tens uma primeira mensagem curta, com uma só pergunta."],
             "No e-book: Cap. 2 (triagem de emails e template de resposta a lead novo), Cap. 3 (primeira mensagem de WhatsApp), Bloco B de prompts."),
            ("O anúncio escrito à mão à meia-noite",
             ["Angariaste um T3 hoje.", "O anúncio fica para a noite.", "Abres um anúncio antigo e mudas as palavras.", "Demora uma hora.", "E no dia seguinte reparas que puseste a área errada."],
             ["Colas a ficha do imóvel no prompt do Idealista e Casa Sapo.", "Recebes título, 5 destaques e descrição.", "O prompt não inventa: se falta um dado, deixa um espaço para preencheres.", "Antes de publicar, passas a checklist de 6 pontos.", "Do mesmo texto tiras a versão para WhatsApp e para email."],
             "No e-book: Cap. 3, Bloco C de prompts (Idealista e Casa Sapo), Checklist C (antes de publicar anúncio)."),
            ("O follow-up que só existia na tua cabeça",
             ["Na semana passada mostraste um T2 a um casal.", "Gostaram.", "Disseste «falo convosco na sexta».", "Sexta passou.", "Hoje vês que compraram com outra pessoa."],
             ["Cada lead quente tem uma próxima ação com data no teu CRM.", "Tens uma sequência de 7 contactos já escrita, cada um com uma razão para falar.", "O último contacto pergunta, com educação, se podes arquivar.", "Não insistes sem motivo. E não te esqueces."],
             "No e-book: Cap. 5 (porque o follow-up falha, sequência de 7 toques, quando parar), Bloco G de prompts, Checklist E."),
            ("A visita preparada no carro",
             ["Estás estacionado à porta do prédio.", "Faltam 5 minutos.", "Procuras no telemóvel o que o comprador te disse ao telefone.", "Depois da visita, as notas ficam num papel no banco do carro."],
             ["Na véspera geras um briefing de 1 página para o telemóvel.", "Tem 5 factos do imóvel, 5 perguntas a fazer e 3 dúvidas prováveis com resposta curta.", "No fim, colas as tuas notas soltas.", "O prompt transforma-as numa nota limpa para o CRM e num email de pós-visita."],
             "No e-book: Cap. 2 (briefing de visita e resumo de notas), Exemplo trabalhado 1, Checklist B (antes de cada visita)."),
            ("A semana que não para",
             ["Segunda é emails. Terça é emails. Quarta também.", "Os anúncios ficam para a noite.", "Ao domingo tentas pôr tudo em dia.", "Não sabes para onde foi o tempo."],
             ["Tens uma semana tipo: um dia para anúncios, blocos curtos para admin, sexta para fechar a semana.", "Quando o dia rebenta, usas o protocolo de 15 minutos.", "Apontas as horas numa folha simples durante 4 semanas.", "Assim vês, com os teus números, quanto tempo ganhaste."],
             "No e-book: Cap. 6 (mapa das horas, calendário tipo, checklist semanal), Protocolo de 15 minutos, Folha de medição de 4 semanas."),
        ],
        "price": ["Pensa no anúncio que escreveste ontem à noite.", "Ou no lead que ficou sem resposta.", "Este e-book foi feito para esses momentos."],
        "close_h": "Amanhã há mais leads, mais anúncios e mais visitas.",
        "close": ["A diferença é se começas do zero outra vez.", "Ou se abres o prompt certo e tratas do assunto."],
        "ps": "Se já tens uma equipa grande com processos fechados, isto não é para ti. É para o consultor que faz quase tudo sozinho e quer ganhar tempo na semana.",
    },
    {
        "path": "angles-v2/01-tempo/index.html",
        "title": "Recupera horas na semana | Sistema IA do Consultor",
        "description": "O dia começa no WhatsApp e acaba em admin. Vê o antes e o depois com um plano de 21 dias, 80 prompts prontos e checklists. Em português de Portugal. €37.",
        "lead": "Volta a ser tu a decidir onde vão as tuas horas.",
        "h1": "O dia começa no WhatsApp e acaba em admin. Vê o antes e o depois com prompts prontos.",
        "sub": "Cinco momentos em que as horas se perdem em texto e admin. E como ficam com um plano de 21 dias, 80 prompts prontos a copiar e checklists simples. Em português de Portugal.",
        "night": ["O telemóvel ainda tem conversas de hoje por responder.", "O anúncio ficou para a noite.", "Amanhã o dia começa outra vez no WhatsApp.", "E o admin fica para o fim, outra vez.", "Abres o chat e pedes um texto do zero.", "Sai qualquer coisa.", "Reescreves tu."],
        "same": "Amanhã é igual.",
        "turn": ["O problema não és tu.", "O problema é escrever o mesmo texto do zero, outra vez.", "Este e-book dá-te uma tarefa por dia durante 21 dias, prompts prontos e checklists para o admin não comer a semana."],
        "payoff": "Volta a ser tu a decidir onde vão as tuas horas.",
        "scenes_title": "Cinco momentos em que as horas se perdem. Antes e depois.",
        "note": NOTE_HOURS,
        "scenes": [
            ("A manhã que começa no WhatsApp",
             ["Acordas e o telemóvel já manda.", "Respondes a um, depois a outro, cada vez com um texto diferente.", "Ao almoço o admin ainda nem começou.", "O dia já não é teu."],
             ["Fazes dois blocos curtos para emails e mensagens.", "Colas os pedidos sem nomes nem telefones.", "O prompt diz o que é urgente e dá um rascunho.", "Revês. Envias.", "O resto do dia começa na tarefa que tu escolheste."],
             "No e-book: Cap. 2 (triagem de emails), Cap. 3 (primeira mensagem de WhatsApp), Bloco B de prompts."),
            ("O mesmo texto, escrito do zero outra vez",
             ["O mesmo email. O mesmo anúncio. As mesmas palavras.", "Abres um documento antigo e mudas o que calha.", "Demora.", "No dia seguinte falta um dado."],
             ["Tens o prompt da tarefa já escrito.", "Colas os factos.", "Recebes um rascunho no teu tom, em português de Portugal.", "Se falta um dado, fica um espaço.", "Não reescreves a página toda."],
             "No e-book: 80 prompts prontos a copiar, em 8 blocos. Deixas de escrever do zero."),
            ("O admin que come o fim do dia",
             ["As visitas estão feitas.", "O CRM, os emails e as notas ficam para a noite.", "Quando fechas o portátil, o dia ainda não fechou."],
             ["Blocos curtos de admin, no sítio da semana.", "Cada nota solta passa por um prompt.", "Sai uma nota limpa para o CRM.", "Fechas a semana com a operação em ordem."],
             "No e-book: Cap. 6 (calendário tipo e checklist semanal), Cap. 2 (resumo de notas)."),
            ("A semana sem mapa",
             ["Segunda é mensagens. Terça também.", "Os anúncios empurram-se para a noite.", "Não sabes para onde foi o tempo."],
             ["Tens uma semana tipo: um dia para anúncios, blocos curtos para admin, sexta para fechar.", "Quando o dia rebenta, usas o protocolo de 15 minutos.", "Apontas as horas numa folha durante 4 semanas.", "Vês, com os teus números, quanto tempo ganhaste."],
             "No e-book: Cap. 6, Protocolo de 15 minutos, Folha de medição de 4 semanas."),
            ("A hora que volta para vender",
             ["Visitas e angariação ficam espremidas entre textos.", "O trabalho que só tu podes fazer espera.", "O dia acaba em admin."],
             ["Os textos partem de prompts prontos.", "Tu revês os factos.", "O dia começa com a tarefa que escolheste.", "O tempo que sobra é teu para vender."],
             "No e-book: plano D1 a D21, com tempo e entregável de cada dia."),
        ],
        "price": ["Pensa no texto que reescreveste do zero hoje.", "Ou na hora que foi para admin.", "Este e-book foi feito para esses momentos."],
        "close_h": "Amanhã o dia pode começar outra vez no WhatsApp.",
        "close": ["Ou pode começar na tarefa que tu escolheste.", "Com o prompt certo já aberto."],
        "ps": "É para o consultor que faz quase tudo sozinho e quer as horas de volta na semana.",
    },
    {
        "path": "angles-v2/02-rgpd/index.html",
        "title": "Usa IA sem pôr dados de clientes em jogo | Sistema IA do Consultor",
        "description": "Ou evitas a IA, ou colas e ficas na dúvida. Em 21 dias ficas com a lista do que nunca sai do CRM, códigos e placeholders. 80 prompts e checklists. €37.",
        "lead": "Usa IA todos os dias sem pôr os dados do teu cliente em jogo.",
        "h1": "Ou evitas a IA, ou colas e ficas na dúvida. Vê o antes e o depois com regras escritas.",
        "sub": "Cinco momentos em que os dados do cliente travam o dia. E como ficam com uma lista do que nunca colar, códigos, placeholders e prompts prontos. Em português de Portugal.",
        "night": ["Tens um email de cliente para responder.", "O nome, o telefone e a morada estão na mensagem.", "Abres o ChatGPT.", "Paras.", "Ou colas tudo e ficas com a dúvida o resto da noite.", "Apagas.", "Escreves tu, à mão."],
        "same": "Amanhã é igual.",
        "turn": ["O problema não é ter cuidado.", "O problema é decidir de cabeça, todos os dias, o que pode sair do CRM.", "Nos primeiros dias escreves essa lista. Depois usas a IA no trabalho real."],
        "payoff": "Usas a IA e continuas a olhar o cliente nos olhos.",
        "scenes_title": "Cinco momentos em que os dados travam o dia. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("O email com nome e telefone",
             ["O pedido chega com dados pessoais.", "Evitas a IA por medo de fazer asneira.", "Ou colas o que aparece e arrependes-te a seguir."],
             ["Tiras nomes e contactos antes de colar.", "O prompt trabalha com códigos e placeholders.", "A resposta sai.", "Os dados ficaram no CRM."],
             "No e-book: Cap. 1 (setup seguro), lista do que nunca colar, Bloco de prompts de setup."),
            ("A lista que não existia",
             ["Cada vez decides de cabeça o que é seguro.", "NIF, contrato, morada com nome: às vezes entra.", "Não tens nada escrito para consultar."],
             ["Nos dias 1 a 3 escreves a lista do que nunca colar.", "NIF, contratos, moradas com nomes.", "A lista fica à mão, também no telemóvel.", "Deixas de decidir no escuro."],
             "No e-book: dias 1 a 3, checklist de setup, regras de segurança."),
            ("A ficha colada inteira",
             ["A ficha tem a morada e o nome do proprietário.", "Colas a ficha inteira para ir mais depressa.", "O chat fica com a pessoa lá dentro."],
             ["Colas só os factos do imóvel.", "O que identifica a pessoa não entra.", "Se falta um dado, o prompt deixa um espaço.", "Tu preenches fora da IA."],
             "No e-book: Cap. 3 (anúncios), prompts que não inventam e não pedem dados pessoais."),
            ("A nota de visita com o nome da pessoa",
             ["As notas têm o nome do comprador e o que ele disse.", "Ficam no chat, à mistura com o resto.", "Amanhã já não sabes o que foi parar onde."],
             ["Resumes sem nomes.", "O prompt devolve uma nota limpa para o CRM.", "O chat não fica com a ficha da pessoa."],
             "No e-book: Cap. 2 (resumo de notas de visita), Checklist B."),
            ("O dia em que já não paras a meio",
             ["Ou trabalhas devagar, à mão.", "Ou aceleras com um nó no estômago.", "As duas coisas cansam."],
             ["A regra está escrita.", "Usas a IA nos emails, anúncios e follow-up.", "A decisão do que publicar continua a ser tua."],
             "No e-book: plano D1 a D21. A IA ajuda na escrita. Tu mandas nos factos."),
        ],
        "price": ["Pensa no email que não colaste, por medo.", "Ou no que colaste e te deixou a dúvida.", "Este e-book começa por aí."],
        "close_h": "Amanhã podes voltar a evitar a IA.",
        "close": ["Ou abrir o prompt com a lista já feita.", "E tratar do email sem pôr o cliente em jogo."],
        "ps": "Isto não é autorização para colar dados pessoais. É a lista do que fica de fora, e o método para trabalhar mesmo assim.",
    },
    {
        "path": "angles-v2/03-idealista/index.html",
        "title": "Publica no Idealista no mesmo dia | Sistema IA do Consultor",
        "description": "A ficha espera e a página em branco come a tarde. Publica no mesmo dia em que angarias, sem inventar um único facto. Plano de 21 dias e 80 prompts. €37.",
        "lead": "Publica no mesmo dia em que angarias, sem inventar um único facto.",
        "h1": "A ficha espera e a página em branco come a tarde. Vê o anúncio antes e depois.",
        "sub": "Cinco momentos entre a angariação e o Idealista. E como ficam quando colas os factos num prompt que não inventa. Título, 5 destaques, descrição e checklist antes de publicar.",
        "night": ["Angariaste hoje.", "O anúncio do Idealista ainda não existe.", "Abres um anúncio antigo e mudas as palavras.", "Ou escreves «faz um anúncio de um T2».", "Sai um texto bonito, cheio de «oportunidade única».", "Não diz a área certa.", "Inventa uma varanda que não existe.", "Apagas tudo e escreves tu."],
        "same": "Amanhã a ficha continua à espera.",
        "turn": ["O problema não é falta de jeito para escrever.", "O problema é começar do zero, sem os factos à frente.", "O prompt do Idealista e Casa Sapo pede a ficha. Se falta um dado, deixa um espaço."],
        "payoff": "Tu mandas nos factos. A IA ajuda na escrita.",
        "scenes_title": "Cinco momentos do anúncio. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("A ficha que fica dias à espera",
             ["Angariaste. A ficha está no telemóvel.", "O texto fica para quando houver tempo.", "Passam dias. O imóvel não está no ar."],
             ["No próprio dia colas os factos no prompt do Idealista e Casa Sapo.", "Recebes título, 5 destaques e descrição.", "Revês. Publicas.", "A ficha não dorme na gaveta."],
             "No e-book: Cap. 3, Bloco C de prompts (Idealista e Casa Sapo)."),
            ("A página em branco que come a tarde",
             ["Abres o Idealista.", "O cursor pisca.", "A tarde vai nisso.", "Saís com um parágrafo e a sensação de que falta tudo."],
             ["Não partes da página em branco.", "Partes da ficha.", "A estrutura já vem: título, destaques, descrição.", "Tu fechas os factos. Não inventas o texto do zero."],
             "No e-book: prompt de anúncio e exemplo trabalhado de anúncio a partir de uma ficha seca."),
            ("O anúncio antigo com a área errada",
             ["Abres um anúncio que correu bem.", "Mudas as palavras.", "Demora uma hora.", "No dia seguinte a área está errada."],
             ["Cada anúncio parte dos factos deste imóvel.", "Se um dado não está na ficha, fica um espaço para preencheres.", "Não herdas a varanda do anúncio anterior."],
             "No e-book: prompts que não inventam áreas, preços nem certificados."),
            ("O facto que a IA inventou",
             ["Pediste um anúncio bonito.", "Saiu «oportunidade única».", "Apareceu uma divisão que o imóvel não tem.", "Apagaste tudo."],
             ["O prompt diz à IA para não inventar.", "O que falta aparece como espaço.", "Antes de publicar, passas a checklist de 6 pontos.", "A decisão final é tua."],
             "No e-book: Checklist C (antes de publicar anúncio)."),
            ("Um texto, três sítios",
             ["O Idealista ficou feito à noite.", "O WhatsApp e o email ficam para amanhã.", "Acabas a reescrever a mesma casa três vezes."],
             ["Do mesmo texto tiras a versão para WhatsApp e para email.", "Os factos são os mesmos.", "Não abres outra página em branco."],
             "No e-book: Cap. 3, versões do anúncio para WhatsApp e email."),
        ],
        "price": ["Pensa na ficha que ainda não virou anúncio.", "Ou no texto que inventou uma varanda.", "Este e-book foi feito para esses momentos."],
        "close_h": "Amanhã podes voltar a escrever o anúncio à noite.",
        "close": ["Ou colar a ficha no prompt e publicar no dia em que angarias.", "Sem inventar um único facto."],
        "ps": "Não promete que o imóvel se vende. Dá-te o texto pronto a rever, com os factos no sítio.",
    },
    {
        "path": "angles-v2/04-whatsapp/index.html",
        "title": "Nenhum lead volta a morrer no telemóvel | Sistema IA do Consultor",
        "description": "Lembras-te do lead quando já arrefeceu. Troca mensagens improvisadas por 7 toques, do D0 ao D21, com próxima ação e saída educada. €37.",
        "lead": "Nenhum lead volta a morrer no teu telemóvel.",
        "h1": "Lembras-te do lead quando já arrefeceu. Vê o telemóvel antes e depois.",
        "sub": "Cinco momentos em que a mensagem se improvisa ou se esquece. E como ficam com uma primeira mensagem curta, 7 toques do D0 ao D21 e uma próxima ação com data.",
        "night": ["Três leads de hoje continuam sem resposta.", "Cada mensagem foi diferente, escrita na hora.", "Um deles já não se lembra de ti.", "Amanhã vais improvisar outra vez.", "E outro vai arrefecer em silêncio."],
        "same": "O telemóvel não avisa quando um lead morre.",
        "turn": ["O problema não é falta de vontade.", "O problema é não teres a próxima mensagem escrita, nem uma data para a enviar.", "A sequência tem 7 contactos. Cada um com uma razão para falar. Sem pressão."],
        "payoff": "Cada lead tem próxima ação e data. Nenhum fica só na memória.",
        "scenes_title": "Cinco momentos no telemóvel. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("A primeira mensagem, inventada na hora",
             ["O lead chega.", "Ficas a olhar para o ecrã.", "Escreves qualquer coisa.", "Ou ficas sem escrever."],
             ["Tens uma primeira mensagem curta, com uma só pergunta.", "Colas. Revês o nome fora do prompt, se fizer falta.", "Envias no bloco de mensagens, não à meia-noite."],
             "No e-book: Cap. 3 (primeira mensagem de WhatsApp), Bloco B de prompts."),
            ("O lead de que só te lembras tarde",
             ["A conversa ficou a meio.", "Lembraste quando o lead já arrefeceu.", "A mensagem de hoje soa a desculpa."],
             ["Cada lead quente tem uma próxima ação com data no CRM.", "Não dependes da memória.", "Quando a data chega, a mensagem já está escrita."],
             "No e-book: Cap. 5, próxima ação com data, Checklist E."),
            ("Sete toques que não existiam",
             ["Um contactas. Outro não.", "Não há segunda mensagem pensada.", "Quem não responde desaparece."],
             ["Tens uma sequência de 7 contactos, do D0 ao D21.", "Cada toque tem uma razão para falar.", "Não é a mesma frase repetida."],
             "No e-book: Cap. 5 (sequência de 7 toques), Bloco G de prompts."),
            ("A mensagem que insiste sem motivo",
             ["Quando finalmente escreves, pressionas.", "Ou não escreves, para não parecer pesado.", "As duas saídas perdem o lead."],
             ["Não há pressão agressiva.", "O último contacto pergunta, com educação, se podes arquivar.", "Ou segues, ou fechas. Não ficas no meio."],
             "No e-book: Cap. 5 (quando parar), saída educada da sequência."),
            ("O follow-up que só estava na tua cabeça",
             ["Disseste que falavas na sexta.", "Sexta passou.", "Não havia nada escrito para te lembrar."],
             ["A sexta está no CRM, com a mensagem pronta.", "Abres, revês, envias.", "O follow-up deixa de viver só na cabeça."],
             "No e-book: Checklist E de follow-up e exemplo da sequência de 7 toques."),
        ],
        "price": ["Pensa no lead que ficou sem resposta hoje.", "Ou na mensagem que improvisaste.", "Este e-book foi feito para esses momentos."],
        "close_h": "Amanhã há mais mensagens no telemóvel.",
        "close": ["A diferença é se cada uma se inventa na hora.", "Ou se abres o toque certo e fechas com uma data."],
        "ps": "Não é um guião para pressionar ninguém. É a próxima mensagem, escrita, e a educação de parar.",
    },
    {
        "path": "angles-v2/05-angariacao/index.html",
        "title": "Entra na reunião de angariação a conduzir | Sistema IA do Consultor",
        "description": "A reunião salta para a comissão. Em 21 dias preparas diagnóstico, objeções e proposta de 1 página, sem inventar números nem prometer resultados. €37.",
        "lead": "Entra na reunião de angariação a conduzir a conversa.",
        "h1": "A reunião salta para a comissão. Vê-a antes e depois de entrares a conduzir.",
        "sub": "Cinco momentos da angariação em que a conversa te foge. E como ficam com diagnóstico antes do pitch, objeções preparadas e uma proposta de 1 página. Sem inventar números nem prometer resultados.",
        "night": ["Amanhã tens uma angariação.", "Ainda estás a pensar no que vais dizer quando falarem de comissão.", "As objeções vão aparecer.", "Vais respondê-las na hora.", "O pitch ainda está na tua cabeça."],
        "same": "A reunião começa contigo a reagir.",
        "turn": ["O problema não é saberes pouco do imóvel.", "O problema é entrares sem diagnóstico, sem objeções escritas e sem uma proposta de 1 página.", "O e-book prepara isso. Não inventa números. Não promete a angariação."],
        "payoff": "Entras a conduzir a conversa. Sais com proposta e data.",
        "scenes_title": "Cinco momentos da angariação. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("A reunião que salta para a comissão",
             ["Sentas-te. Em poucos minutos já se fala de preço e de comissão.", "O diagnóstico ficou por fazer.", "Passas o resto da hora a defender-te."],
             ["A conversa começa pelo diagnóstico.", "As perguntas já estão escritas.", "O pitch vem depois, não antes.", "A comissão chega quando a conversa já tem chão."],
             "No e-book: capítulo de angariação, perguntas de diagnóstico, Checklist de angariação."),
            ("A objeção que apanhas no ar",
             ["«O vizinho vendeu por mais.»", "Respondes com o que te ocorre.", "Saís a achar que faltou uma frase."],
             ["As objeções frequentes já têm resposta curta.", "O exemplo trabalhado inclui «o vizinho vendeu por mais».", "Tu adaptas aos factos deste imóvel. Não inventas um número."],
             "No e-book: exemplo trabalhado da objeção «o vizinho vendeu por mais»."),
            ("O pitch feito de memória",
             ["Cada reunião é um pitch diferente.", "Esquece-se uma parte.", "O proprietário fica com uma ideia vaga do que vais fazer."],
             ["O pitch parte de um prompt com os factos desta casa e deste proprietário.", "Tiras nomes antes de colar.", "Sai uma estrutura. Tu fechas as palavras.", "Não prometes um resultado."],
             "No e-book: prompts de angariação e lista de frases para falar de preço."),
            ("A proposta que nunca sai da mala",
             ["Disseste que enviavas a proposta.", "Ela ainda não existe.", "A noite vai nisso, ou não vai."],
             ["Sais com uma proposta de 1 página.", "O que vais fazer está escrito.", "A data do próximo passo também.", "Sem números inventados."],
             "No e-book: proposta de 1 página e checklist de angariação."),
            ("A data que ficou no ar",
             ["A reunião acaba com «falamos».", "Não há próximo passo.", "Daqui a uma semana já ninguém se lembra do que ficou dito."],
             ["Sais com proposta e data.", "O follow-up dessa reunião já tem sítio na sequência.", "A conversa não fica pendurada."],
             "No e-book: Cap. 5 (próxima ação com data) ligado à angariação."),
        ],
        "price": ["Pensa na última reunião em que a comissão chegou cedo demais.", "Este e-book prepara a conversa. Não promete que ganhas a angariação."],
        "close_h": "Amanhã podes entrar outra vez a reagir.",
        "close": ["Ou entrar com o diagnóstico, as objeções e a proposta de 1 página.", "Sem inventar números."],
        "ps": "Não promete angariações nem vendas. Dá-te um método para conduzir a conversa.",
    },
    {
        "path": "angles-v2/07-metodo-21-dias/index.html",
        "title": "21 dias. Uma tarefa por dia. | Sistema IA do Consultor",
        "description": "Guardas reels e paras à segunda semana. Do D1 ao D21 há uma tarefa, 25 a 45 minutos, e um entregável no fim. 80 prompts e checklists. €37.",
        "lead": "21 dias. Uma tarefa por dia. Um entregável no fim de cada uma.",
        "h1": "Guardas reels e paras à segunda semana. Vê os 21 dias antes e depois.",
        "sub": "Cinco momentos em que a formação não chega ao trabalho. E como ficam com uma tarefa por dia, do D1 ao D21, 25 a 45 minutos, e algo pronto no fim.",
        "night": ["Guardaste mais um reel para ver depois.", "A lista de coisas a experimentar cresceu.", "A segunda semana de cada tentativa acaba por parar.", "Amanhã ainda não sabes qual é a tarefa.", "E o trabalho real continua à mão."],
        "same": "Amanhã há mais uma lista. Não há um entregável.",
        "turn": ["O problema não é falta de informação.", "O problema é não teres uma tarefa só, com tempo e com um fim.", "Do D1 ao D21 sabes o que executar. Falhaste um dia? Retomas no seguinte."],
        "payoff": "No fim de cada dia fica uma coisa feita. No D21 ficam ativos, não apontamentos.",
        "scenes_title": "Cinco momentos do método. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("O reel que nunca chega ao trabalho",
             ["Guardas. Prometes ver à noite.", "A noite chega cheia.", "O reel continua guardado.", "Nada mudou no dia seguinte."],
             ["Não há uma lista interminável.", "Há a tarefa de hoje.", "Entre 25 e 45 minutos na maioria dos dias.", "Usas o teu trabalho real, não um exercício à parte."],
             "No e-book: plano dia a dia do D1 ao D21, com tempo e entregável de cada dia."),
            ("A energia que morre à segunda semana",
             ["Começas com força.", "À segunda semana já falhaste três dias.", "Ao domingo tentas compensar.", "Desistes."],
             ["Falhaste um dia? Retomas no seguinte.", "Não precisas de compensar ao domingo.", "A tarefa de amanhã não depende de teres sido perfeito hoje."],
             "No e-book: regra de retomar no dia seguinte, sem recuperar o atraso ao domingo."),
            ("O dia em que não sabes por onde pegar",
             ["Abres o portátil.", "Há dez coisas que podias fazer com IA.", "Escolhes nenhuma.", "Ou escolhes a mais fácil e não a que importa."],
             ["Antes de abrir o plano, já sabes a tarefa de hoje.", "O dia diz o que fazer, quanto tempo leva e o que tens no fim.", "Não escolhes entre vinte ideias."],
             "No e-book: cada dia do D1 ao D21 tem tempo e entregável."),
            ("Os apontamentos que não servem para nada",
             ["Tens notas. Tens links. Tens capturas.", "Na hora de escrever o anúncio, nada disso está pronto a usar."],
             ["Cada tarefa deixa um ativo: um prompt, uma checklist, uma mensagem, um anúncio revisto.", "No D21 tens peças de trabalho, não uma pasta de apontamentos."],
             "No e-book: entregável de cada dia, 80 prompts e 7 checklists para imprimir."),
            ("A rotina que finalmente cabe na semana",
             ["O método era mais uma coisa em cima do trabalho.", "Por isso não cabia."],
             ["Dias 19 a 21 montam a semana tipo e a checklist de sexta.", "A partir daí a tarefa já é o teu trabalho: emails, anúncios, follow-up.", "Não é um curso ao lado."],
             "No e-book: dias 19 a 21, rotina semanal, checklist de sexta."),
        ],
        "price": ["Pensa na última formação que ficou a meio.", "Aqui há uma tarefa por dia e um fim à vista. Não há reels para guardar."],
        "close_h": "Amanhã podes guardar mais uma ideia para depois.",
        "close": ["Ou abrir o dia de hoje e acabar com uma coisa feita.", "25 a 45 minutos. Uma tarefa. Um entregável."],
        "ps": "Não é um curso para ver. É um plano para executar no trabalho que já tens.",
    },
    {
        "path": "angles-v2/08-solo-escala/index.html",
        "title": "Tira o processo da cabeça | Sistema IA do Consultor",
        "description": "Só tu sabes como se faz, e o negócio para quando tu paras. Em 21 dias o processo fica em pastas, prompts e checklists. €37.",
        "lead": "Tira o teu processo da cabeça e põe-no onde pode crescer.",
        "h1": "Só tu sabes como se faz, e o negócio para quando tu paras. Vê o antes e o depois.",
        "sub": "Cinco momentos em que o processo vive só na tua cabeça. E como ficam com prompts, regras e checklists escritos, prontos a repetir e, mais tarde, a entregar.",
        "night": ["Mais um dia em que só tu sabias o passo seguinte.", "O anúncio, a mensagem, a nota de visita: o jeito está na tua cabeça.", "Se amanhã parares, o negócio para.", "Não há uma pasta que outra pessoa consiga abrir."],
        "same": "Amanhã continua tudo contigo.",
        "turn": ["O problema não é seres insubstituível.", "O problema é o processo não estar escrito.", "Em 21 dias ele passa para pastas, prompts e checklists. Primeiro para ti. Depois, se chegares a ter equipa, para quem trabalhar contigo."],
        "payoff": "Podes delegar sem perder o teu padrão. Até lá, deixas de depender da memória.",
        "scenes_title": "Cinco momentos do processo. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("O jeito que só tu sabes explicar",
             ["Perguntam como fazes um anúncio.", "Explicas de novo, de boca.", "Cada vez sai uma versão diferente."],
             ["O caminho fica escrito.", "A pasta de anúncios tem o prompt e a checklist.", "A explicação deixa de viver só na conversa."],
             "No e-book: pastas de trabalho, incluindo a de anúncios Idealista, com prompt e checklist."),
            ("O dia em que paras e o negócio para",
             ["Ficas doente um dia. Ou de férias.", "Ninguém sabe qual é o próximo toque.", "As tarefas esperam por ti."],
             ["A sequência, a checklist e o prompt estão fora da tua cabeça.", "O próximo passo lê-se.", "O negócio não depende de te lembrares."],
             "No e-book: checklists de visita, anúncio, angariação, follow-up e semana."),
            ("O prompt que não está em lado nenhum",
             ["Desta vez o chat correu bem.", "Fechaste a janela.", "Amanhã voltas a pedir do zero."],
             ["O prompt que funcionou fica guardado no bloco certo.", "Há um prompt-base com contexto, tom e regras.", "Não reconstróis o método todas as manhãs."],
             "No e-book: prompt-base em pt-PT e 80 prompts em 8 blocos."),
            ("A tarefa que não consegues passar",
             ["Até querias que alguém tratasse dos emails.", "Não há um modelo que essa pessoa possa seguir sem te ligar a cada frase."],
             ["O template de resposta e as regras do que nunca colar estão escritos.", "Passas a tarefa com o prompt e a checklist.", "O padrão continua a ser o teu."],
             "No e-book: Cap. 2 (template de resposta) e regras do que nunca colar na IA."),
            ("A pasta que finalmente existe",
             ["O processo são separadores, notas e memória.", "Nada tem nome. Nada se encontra."],
             ["Fica um sítio para cada frente: admin, anúncios, WhatsApp, angariação, follow-up, checklists.", "Abres a pasta certa. Não procuras na cabeça."],
             "No e-book: organização do plano D1 a D21 em rotina repetível."),
        ],
        "price": ["Pensa na última vez em que explicaste o mesmo processo de boca.", "Este e-book põe-no por escrito. Não promete uma equipa."],
        "close_h": "Amanhã o processo pode continuar só na tua cabeça.",
        "close": ["Ou começar a viver numa pasta, num prompt e numa checklist.", "Primeiro para ti. Depois para quem vier a trabalhar contigo."],
        "ps": "Não promete que vais escalar. Dá-te o processo documentado, para o negócio não parar quando tu paras.",
    },
    {
        "path": "angles-v2/09-early-37/index.html",
        "title": "Entras por €37 antes de €47 | Sistema IA do Consultor",
        "description": "Guardaste o link para ver com calma. O mesmo Sistema IA do Consultor: 21 Dias, pelo preço early de €37. A referência é €47. Sem escassez inventada. Pagamento único.",
        "lead": "Decide hoje. Entras por €37 antes do preço de referência de €47.",
        "h1": "Guardaste o link para ver com calma. Vê o antes e o depois de entrares hoje.",
        "sub": "O mesmo e-book: plano de 21 dias, 80 prompts e checklists. Só o preço de entrada muda. Hoje é €37. A referência é €47. Sem vagas inventadas e sem pressa falsa.",
        "night": ["O link ficou guardado.", "«Para ver com calma.»", "A calma foi a semana passada.", "E vai ser a próxima.", "O e-book é o mesmo de sempre.", "O que muda é entrares, ou adiares outra vez."],
        "same": "«Com calma» é sempre a próxima semana.",
        "turn": ["Não há um relógio falso nesta página.", "Não há últimas unidades.", "Há um preço early de €37 e uma referência de €47.", "O core, os prompts e as checklists são os mesmos."],
        "payoff": "Começas o D1 hoje. Entraste ao preço early.",
        "scenes_title": "Cinco momentos da decisão. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("O link guardado para ver com calma",
             ["Guardaste o link.", "A ideia era ler com tempo.", "O tempo não chegou.", "O separador continua lá."],
             ["A página diz o que está dentro e o que não está.", "O preço está escrito: €37 agora, €47 de referência.", "Decidir é ler isto e escolher. Não é esperar por um dia vazio."],
             "No e-book: o mesmo plano D1 a D21, 80 prompts e 7 checklists. O preço de entrada é que é early."),
            ("A próxima semana que nunca é esta",
             ["«Vejo na segunda.»", "A segunda traz visitas.", "A decisão muda outra vez para a frente."],
             ["Não precisas de uma semana livre.", "Cada dia do plano leva 25 a 45 minutos, na maioria dos dias, em cima do trabalho que já tens.", "A segunda serve. Hoje também."],
             "No e-book: tempo por dia no próprio plano. Alguns dias pedem 60 minutos."),
            ("A dúvida de que amanhã o preço conta outra história",
             ["Medo de entrar e de descobrir que faltava alguma coisa.", "Ou de que o preço era um truque."],
             ["O que recebes está listado nesta página.", "Não há mensalidade.", "O pagamento é único.", "Depois o preço de entrada passa para €47. O produto não encolhe para caber nos €37."],
             "No e-book: PDF de 55 páginas, prompts, checklists e plano. O early é o preço, não uma versão mais curta."),
            ("A página que parecia ter pressa",
             ["Já viste ofertas com contagem e com «só hoje».", "Fechaste. Não era uma decisão. Era um empurrão."],
             ["Aqui não há escassez inventada.", "Há o preço early e a referência.", "Se hoje não for o dia, a página não finge que as vagas acabaram."],
             "No e-book: o mesmo sistema, antes e depois do preço de entrada mudar."),
            ("O D1 que finalmente tem data",
             ["O link volta a ser «para depois».", "O D1 não existe no calendário."],
             ["Pagas uma vez.", "Recebes o PDF por email.", "O D1 é a primeira tarefa, não uma promessa para a próxima semana."],
             "No e-book: o dia 1 é setup, com o prompt-base e a lista do que nunca colar."),
        ],
        "price": ["O preço early é €37.", "A referência, mais à frente, é €47.", "O e-book é o mesmo."],
        "close_h": "Podes guardar o link outra vez.",
        "close": ["Ou entrar hoje por €37.", "O plano, os prompts e as checklists não mudam por esperares."],
        "ps": "Sem vagas contadas e sem relógio. O que muda, se adiares, é o preço de entrada.",
    },
    {
        "path": "angles-v2/10-visitas-ops/index.html",
        "title": "A visita acaba na visita | Sistema IA do Consultor",
        "description": "Chegas a casa com notas soltas e o CRM fica para amanhã. Briefing de 1 página antes de entrares e follow-up com o contexto fresco. Plano de 21 dias. €37.",
        "lead": "A visita acaba na visita, mas não às onze da noite.",
        "h1": "A visita acaba na visita e o CRM fica para amanhã. Vê o antes e o depois.",
        "sub": "Cinco momentos entre o carro e a meia-noite. E como ficam com um briefing de 1 página, notas limpas para o CRM e o follow-up enviado enquanto te lembras.",
        "night": ["A visita correu bem.", "As notas estão no telemóvel, aos bocados.", "O CRM fica para amanhã.", "São quase onze.", "Ainda falta o email de pós-visita.", "Amanhã o contexto já arrefeceu."],
        "same": "A visita acaba. A operação não.",
        "turn": ["O problema não é fazeres poucas visitas.", "O problema é cada visita deixar um rasto solto.", "O briefing cabe numa página. As notas saem limpas. O follow-up sai no próprio dia."],
        "payoff": "Entras preparado. Sais com o CRM em dia e o follow-up enviado.",
        "scenes_title": "Cinco momentos da visita. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("As notas soltas no caminho para casa",
             ["Chegas a casa com notas no telemóvel.", "Umas no papel, no banco do carro.", "Amanhã já não lês metade."],
             ["No fim da visita colas as notas soltas.", "O prompt transforma-as numa nota limpa para o CRM.", "O que interessa não fica no banco do carro."],
             "No e-book: Cap. 2 (resumo de notas), Exemplo trabalhado 1."),
            ("O CRM que fica para amanhã",
             ["«Amanhã trato do CRM.»", "Amanhã há outra visita.", "O registo de hoje não entra."],
             ["A nota já vem com o que o CRM precisa.", "Interesse, dúvidas, próximo passo, data.", "Registas enquanto a visita ainda está fresca."],
             "No e-book: nota de CRM e Checklist B, antes e depois da visita."),
            ("Os cinco minutos à porta do prédio",
             ["Estás estacionado.", "Faltam 5 minutos.", "Procuras no telemóvel o que o comprador te disse.", "Entras a improvisar."],
             ["Na véspera geras um briefing de 1 página.", "Tem 5 factos do imóvel, 5 perguntas a fazer e 3 dúvidas prováveis com resposta curta.", "Entras a saber o que ias perguntar."],
             "No e-book: briefing de visita para o telemóvel, Checklist B."),
            ("O follow-up que espera pela noite",
             ["A visita acaba às sete.", "O email de pós-visita fica para as onze.", "Às onze já estás a inventar o que foi dito."],
             ["Do mesmo resumo sai o email de pós-visita.", "Envias com o contexto fresco.", "A noite não é o CRM."],
             "No e-book: email de pós-visita a partir das notas, Cap. 2."),
            ("A visita seguinte, outra vez do zero",
             ["Cada visita começa sem briefing.", "Cada follow-up se escreve do zero.", "A operação da visita é sempre nova."],
             ["O briefing e o resumo são sempre os mesmos passos.", "Muda o imóvel e a pessoa. Não muda o método.", "A visita acaba na visita."],
             "No e-book: rotina de visitas dentro do plano de 21 dias."),
        ],
        "price": ["Pensa nas notas que ficaram no carro.", "Ou no CRM que ficou para amanhã.", "Este e-book foi feito para fechar a visita no próprio dia."],
        "close_h": "Amanhã a visita pode acabar outra vez às onze.",
        "close": ["Ou acabar quando sais do prédio.", "Com o briefing feito antes e o follow-up feito a seguir."],
        "ps": "Não promete mais visitas. Dá-te o rasto de cada uma, fechado no dia.",
    },
    {
        "path": "angles-v2/sobrecarga/index.html",
        "title": "Três frentes, um sistema | Sistema IA do Consultor",
        "description": "Anúncios, mensagens e CRM pedem a mesma hora. Em 21 dias cada frente parte de um prompt fechado. 80 prompts e checklists. €37.",
        "lead": "Três frentes ao mesmo tempo. Um sistema para as arrumar.",
        "h1": "Anúncios, mensagens e CRM pedem a mesma hora. Vê o dia antes e depois.",
        "sub": "Cinco momentos em que as três frentes caem ao mesmo tempo. E como ficam quando cada uma parte de um prompt fechado e o dia acaba sem levar o admin para casa.",
        "night": ["O anúncio não está feito.", "As mensagens de hoje continuam abertas.", "O CRM tem visitas por registar.", "Os separadores estão todos abertos.", "Nenhum está fechado.", "A noite vai nisso."],
        "same": "Amanhã as três frentes voltam a pedir a mesma hora.",
        "turn": ["O problema não é teres trabalho.", "O problema é cada frente começar do zero, à mesma hora.", "Um sistema: um prompt para o anúncio, um para a mensagem, um para a nota. O dia deixa de ser três páginas em branco."],
        "payoff": "Arruma as três frentes. Fica tempo para vender.",
        "scenes_title": "Cinco momentos das três frentes. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("A hora em que as três frentes batem à porta",
             ["O anúncio, a mensagem e o CRM pedem-te ao mesmo tempo.", "Saltas de separador em separador.", "Nenhum fica fechado."],
             ["Cada frente tem o seu bloco.", "Não as tratas todas no mesmo minuto.", "Quando entras numa, o prompt dessa frente já está escolhido."],
             "No e-book: semana tipo, com um dia para anúncios e blocos curtos para mensagens e admin."),
            ("A noite dos separadores abertos",
             ["À noite o ecrã continua cheio.", "Um anúncio a meio. Uma conversa sem resposta. Um CRM vazio.", "Fechas o portátil por cansaço, não porque acabou."],
             ["Cada frente parte de um prompt fechado, não de uma página em branco.", "Acabas uma. Passas à seguinte.", "O dia fecha sem levares o admin para casa."],
             "No e-book: prompts separados para Idealista, WhatsApp e notas de CRM."),
            ("O anúncio que ainda é uma ficha",
             ["A ficha está pronta desde a tarde.", "O texto não existe.", "Empurras para depois das mensagens. As mensagens não acabam."],
             ["Colas os factos no prompt do anúncio.", "Título, 5 destaques e descrição.", "Revês os factos. Publicas.", "Essa frente fecha."],
             "No e-book: Bloco C de prompts, Idealista e Casa Sapo, Checklist C."),
            ("A mensagem improvisada entre duas visitas",
             ["Respondes no carro, de qualquer maneira.", "Outra conversa fica para trás.", "Não há próxima data."],
             ["A primeira mensagem já está escrita, com uma só pergunta.", "O lead fica com próxima ação e data.", "Não inventas o texto no semáforo."],
             "No e-book: Cap. 3 e Cap. 5, mensagem curta e sequência de 7 toques."),
            ("O CRM que perde para as outras duas",
             ["Anúncio e mensagens ganham a noite.", "O CRM fica sempre para o fim.", "O fim não chega."],
             ["As notas da visita passam pelo prompt e saem limpas.", "O CRM deixa de ser a terceira tarefa infinita.", "Entra no bloco de admin, curto, com fim."],
             "No e-book: Cap. 2, resumo de notas, e o protocolo de 15 minutos para o dia que rebenta."),
        ],
        "price": ["Pensa na noite em que as três frentes ficaram abertas.", "Este e-book dá um começo fechado a cada uma."],
        "close_h": "Amanhã as três frentes voltam.",
        "close": ["A diferença é se cada uma começa do zero.", "Ou se abres o prompt dessa frente e a fechas."],
        "ps": "Arruma as três frentes. Fica tempo para vender.",
    },
    {
        "path": "angles/06-chatgpt-falhou/index.html",
        "title": "Já abriste o ChatGPT. Falta mandares nele. | Sistema IA do Consultor",
        "description": "Abres o chat e não sabes o que pedir. Em 21 dias o prompt-base fixa contexto, tom e regras, e cada tarefa tem um prompt fechado. €37.",
        "lead": "Já abriste o ChatGPT. Falta seres tu a mandar nele.",
        "h1": "Abres o chat e não sabes o que pedir. Vê o antes e o depois de mandares tu.",
        "sub": "Cinco momentos em que o ChatGPT responde ao lado. E como ficam com um prompt-base em português de Portugal, regras escritas e um prompt fechado para cada tarefa.",
        "night": ["Abres o ChatGPT outra vez.", "Escreves «faz um anúncio de um T2».", "Sai um texto bonito e genérico.", "Soa a outro país.", "Inventa um pormenor.", "Apagas.", "Escreves tu.", "A ferramenta fica aberta. Quem manda nela não és tu."],
        "same": "Amanhã a conversa começa do zero.",
        "turn": ["O problema não é o ChatGPT ser mau.", "O problema é pedires tudo sem contexto, sem tom e sem regras.", "O prompt-base fixa isso. Cada tarefa passa a ter o seu prompt, já escrito."],
        "payoff": "Passas a mandar na ferramenta, não a conversar à espera de sorte.",
        "scenes_title": "Cinco momentos com o chat aberto. Antes e depois.",
        "note": NOTE_PLAIN,
        "scenes": [
            ("O chat aberto sem pedido",
             ["Abres o ChatGPT.", "Ficas uns segundos sem saber o que escrever.", "Pedes uma coisa vaga.", "A resposta serve para qualquer consultor, logo não serve para ti."],
             ["Não partes de um chat vazio.", "Partes do prompt dessa tarefa.", "O contexto do teu trabalho já vai lá dentro.", "Tu preenches os espaços e revês."],
             "No e-book: prompt-base e 80 prompts fechados, um sítio para cada tarefa."),
            ("O texto que sai genérico, ou de outro país",
             ["O anúncio podia ser de qualquer imóvel.", "As palavras não são as tuas.", "Soa a português do Brasil.", "Reescreves quase tudo."],
             ["O prompt-base fixa contexto, tom e regras.", "O texto sai em português de Portugal.", "A estrutura é a da tarefa: anúncio, mensagem ou nota.", "Tu fechas. Não reescreves do zero."],
             "No e-book: dias 1 a 3, prompt-base em pt-PT."),
            ("O facto que ninguém pediu",
             ["Pediste ajuda a escrever.", "A resposta inventou uma área, um certificado ou um adjetivo a mais.", "Perdeste a confiança e fechaste o chat."],
             ["Os prompts dizem à IA para não inventar áreas, preços nem certificados.", "Se falta um dado, aparece um espaço.", "A checklist passa antes de publicares.", "A decisão final é tua."],
             "No e-book: regras dos prompts de anúncio e Checklist C."),
            ("A conversa que não fica para amanhã",
             ["Hoje o chat até ajudou.", "Amanhã abres uma conversa nova.", "Voltas a explicar quem és e o que não queres."],
             ["O prompt-base fica guardado.", "Não reconstruís as regras todas as manhãs.", "Cada tarefa chama o seu prompt, não uma conversa solta."],
             "No e-book: o prompt-base entra na rotina, não fica numa conversa perdida."),
            ("A ferramenta que trabalha no processo",
             ["O ChatGPT é uma janela ao lado do trabalho.", "O trabalho real continua noutro sítio, feito à mão."],
             ["Emails, anúncios, WhatsApp, angariação e follow-up têm prompt.", "A ferramenta entra na tarefa do dia.", "Deixas de conversar à espera de sorte."],
             "No e-book: dias 4 a 18, uma tarefa real por dia, com prompt fechado."),
        ],
        "price": ["Pensa na última resposta que apagaste.", "O que faltava não era outra ferramenta. Era um prompt fechado."],
        "close_h": "Amanhã podes abrir o chat outra vez sem saber o que pedir.",
        "close": ["Ou abrir o prompt da tarefa e mandar tu.", "Contexto, tom e regras já lá estão."],
        "ps": "Passas a mandar na ferramenta, não a conversar à espera de sorte.",
    },
]


def render(page):
    root = page["path"] == "index.html"
    asset = "assets" if root else "../../assets"
    legal = "" if root else "../../"
    scenes = "\n".join(scene(i + 1, *item) for i, item in enumerate(page["scenes"]))
    night = "\n".join("<p>{0}</p>".format(e(line)) for line in page["night"])
    turn = "\n".join("<p>{0}</p>".format(e(line)) for line in page["turn"])
    price = "\n".join("<p>{0}</p>".format(e(line)) for line in page["price"])
    close = "\n".join('<p class="close-lead">{0}</p>'.format(e(line)) for line in page["close"])
    pay = (
        '<p class="pay-note {dark}"><span aria-hidden="true">🔒</span> {trust} '
        '<a href="mailto:4improvementsportugal@gmail.com">4improvementsportugal@gmail.com</a></p>'
        '<p class="tool-note {dark}">{tools}</p>'
    )
    return """<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:locale" content="pt_PT">
<meta name="theme-color" content="#0f172a">
<script src="{asset}/human-gate.js"></script>
{posthog}
<link rel="stylesheet" href="{asset}/sia21-core.css">
<link rel="stylesheet" href="{asset}/sia21-offer.css">
<link rel="stylesheet" href="{asset}/sia21-consent.css">
<link rel="stylesheet" href="{asset}/sia21-story.css">
</head>
<body>
<div class="offer-page">
  <header>
    <div class="brand">4Improvements</div>
    <a class="head-cta" href="{stripe}" target="_blank" rel="noopener">Quero o sistema</a>
  </header>
  <main>
    <section class="hero">
      <div class="hero-shell">
        <div class="book-stage" aria-hidden="true">
          <div class="book">
            <div class="book-cover">
              <span>
                <span class="book-kicker">Sistema IA</span>
                <span class="book-sub">do Consultor</span>
              </span>
              <span class="book-mark">21 dias</span>
            </div>
          </div>
        </div>
        <div class="hero-copy">
          <p class="lead-in">{lead}</p>
          <h1>{h1}</h1>
          <p class="hero-sub">{sub}</p>
          <div class="cta-stack">
            <a id="hero-cta" class="cta" href="{stripe}" target="_blank" rel="noopener">Quero o sistema</a>
            <p class="pay-line">Pagamento único · Produto digital · Recebes o acesso por email</p>
            {pay_dark}
          </div>
          <p class="proof">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6l-7-3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 12 2 2 4-4"/></svg>
            <span>{proof}.</span>
          </p>
        </div>
      </div>
    </section>

    <section class="band night" id="abertura">
      <div class="night-inner">
        <p class="night-time">São 23h10.</p>
        <div class="night-beats">
          {night}
          <p class="night-same">{same}</p>
        </div>
        <div class="night-turn">
          {turn}
          <p class="payoff">{payoff}</p>
        </div>
      </div>
    </section>

    <section class="wide scenes" id="cenas">
      <div class="section-intro">
        <h2>{scenes_title}</h2>
        <p class="lead">{scenes_lead}</p>
      </div>
      <div class="scene-list">
        {scenes}
      </div>
      <p class="scene-note">{note}</p>
    </section>

    <section class="wide method" id="como-funciona">
      <div class="section-intro">
        <h2>21 dias. Uma tarefa por dia. 25 a 45 minutos.</h2>
      </div>
      <ol class="steps">
        <li class="step">
          <h3>Dias 1 a 3 · Prepara-te.</h3>
          <p>Configuras o teu assistente com um prompt-base em pt-PT. Escreves a tua lista do que nunca colar na IA (NIF, contratos, moradas com nomes).</p>
        </li>
        <li class="step">
          <h3>Dias 4 a 18 · Usa no trabalho real.</h3>
          <p>Emails, anúncios, WhatsApp, angariação e follow-up. Uma tarefa por dia, com algo pronto no fim.</p>
        </li>
        <li class="step">
          <h3>Dias 19 a 21 · Fica com uma rotina.</h3>
          <p>Montas a tua semana tipo e a checklist de sexta. Medes as horas.</p>
        </li>
      </ol>
      <div class="method-notes">
        <p>Falhaste um dia? Retomas no seguinte. Não precisas de compensar ao domingo.</p>
        <p>{tools} Dá para fazer só no telemóvel.</p>
      </div>
    </section>

    <section class="wide inside" id="conteudo">
      <div class="section-intro">
        <h2>O que está dentro do e-book</h2>
      </div>
      <ul class="gift-list">
        <li>E-book «Sistema IA do Consultor Imobiliário · 21 Dias» em PDF (55 páginas, pt-PT)</li>
        <li>7 capítulos: setup seguro, emails e CRM, anúncios e WhatsApp, angariação, follow-up, rotina semanal, limites da IA</li>
        <li>Plano dia a dia do D1 ao D21, com tempo e entregável de cada dia</li>
        <li>80 prompts prontos a copiar, em 8 blocos (do setup à angariação e ao follow-up)</li>
        <li>7 checklists para imprimir (setup, visita, anúncio, angariação, follow-up, semana, revisão mensal)</li>
        <li>5 exemplos trabalhados: notas de visita para email, anúncio a partir de uma ficha seca, objeção «o vizinho vendeu por mais», sequência de 7 toques, relatório semanal ao proprietário</li>
        <li>Folha de medição de 4 semanas e protocolo de 15 minutos para os dias difíceis</li>
        <li>Lista de frases certas para abrir conversa, qualificar e falar de preço</li>
      </ul>
      <p class="packs">Packs opcionais no checkout (WhatsApp e Follow-up &amp; Visitas). Não são obrigatórios.</p>
      <section class="receive" aria-labelledby="receive-title">
        <p class="receive-kicker">O que recebes</p>
        <h2 id="receive-title">O valor de cada parte</h2>
        <ul class="receive-list">
          <li><b>Plano D1 a D21.</b> Cada dia diz-te o que fazer, quanto tempo leva e o que tens no fim.</li>
          <li><b>Tempo por dia.</b> Entre 25 e 45 minutos na maioria dos dias. Alguns dias pedem 60.</li>
          <li><b>80 prompts.</b> 80 prompts em português de Portugal para emails, Idealista, WhatsApp, CRM e follow-up. Deixas de escrever do zero.</li>
          <li><b>7 checklists.</b> 7 listas para imprimir: setup, visita, anúncio, angariação, follow-up, semana e compliance.</li>
          <li><b>Regras de segurança.</b> Regras claras do que nunca colar na IA. Usas a IA sem pôr dados de clientes em risco.</li>
          <li><b>Rotina semanal e folha de horas.</b> Uma rotina para a semana e uma folha para anotares o tempo que poupas. Vês nos teus números.</li>
          <li><b>PDF.</b> PDF de 55 páginas, em português de Portugal. Lês no telemóvel ou imprimes.</li>
          <li><b>Ferramentas.</b> {tools}</li>
        </ul>
      </section>
      <div class="not-panel">
        <h3>O que este e-book não é</h3>
        <ul class="not-list">
          <li>Não é um curso de marketing.</li>
          <li>Não te pede para colar dados de clientes na IA.</li>
          <li>Não promete angariações nem vendas. Dá-te um método de trabalho e textos prontos a usar.</li>
        </ul>
      </div>
    </section>

    <section class="band price-band" id="checkout">
      <div class="price-context">
        {price}
      </div>
<!-- BLOCO PREÇO: INÍCIO (versão 37 €) · trocar só com OK do Pedro -->
<section id="preco">
  <h2>Hoje entras por 37 €</h2>
  <p class="ancora"><s class="line-through">€47</s> <strong>€37</strong></p>
  <p>Preço early. Depois passa para 47 €.</p>
  <p>Pagamento único. Sem mensalidades.</p>
  <a href="{stripe}" class="cta">Quero o sistema por 37 €</a>
  <p class="micro">Pagamento seguro no Stripe. Recebes o acesso por email.</p>
  {pay_light}
</section>
<!-- BLOCO PREÇO: FIM -->
    </section>

    <section class="narrow objections" id="objecoes">
      <div class="section-intro">
        <h2>Talvez estejas a pensar...</h2>
      </div>
      <div class="qa-card">
        <article class="qa-item">
          <h3>«Já uso o ChatGPT.»</h3>
          <p>Ótimo, já tens a ferramenta. Mas usar a IA sem método é pedir tudo do zero, todos os dias. Aqui tens os prompts já escritos para o teu trabalho e um plano para os pôr na tua rotina.</p>
        </article>
        <article class="qa-item">
          <h3>«Não tenho tempo para mais nada.»</h3>
          <p>Cada dia leva 25 a 45 minutos e usa o teu trabalho real. Não estudas à parte. Respondes aos teus emails e escreves os teus anúncios, só que com ajuda.</p>
        </article>
        <article class="qa-item">
          <h3>«E os dados dos meus clientes?»</h3>
          <p>O primeiro capítulo é sobre isso. Tens a lista do que nunca colar e uma forma simples de tirar nomes e contactos antes de usar a IA. Prepara-te antes de começar.</p>
        </article>
        <article class="qa-item">
          <h3>«A IA vai inventar coisas no anúncio.»</h3>
          <p>Os prompts dizem à IA para não inventar áreas, preços nem certificados. Se falta um dado, aparece um espaço para preencheres. Tens também uma checklist antes de publicar. A decisão final é sempre tua.</p>
        </article>
        <article class="qa-item">
          <h3>«Não sou bom com tecnologia.»</h3>
          <p>Copias, preenches os espaços entre parênteses e colas. Funciona no telemóvel.</p>
        </article>
      </div>
    </section>

    <section class="narrow faq" id="faq">
      <div class="section-intro">
        <h2>Perguntas frequentes</h2>
      </div>
      <div class="qa-card">
        <article class="qa-item">
          <h3>Preciso de pagar o ChatGPT?</h3>
          <p>Não. {tools}</p>
        </article>
        <article class="qa-item">
          <h3>Posso usar só o telemóvel?</h3>
          <p>Sim. ChatGPT ou Claude no telemóvel, WhatsApp Business e uma pasta com os teus prompts favoritos. Para os dias de anúncios, um ecrã maior ajuda.</p>
        </article>
        <article class="qa-item">
          <h3>A minha agência já tem textos padrão. Serve?</h3>
          <p>Serve. Usas o sistema para personalizar mais depressa e para o follow-up. Não precisas de mudar nada na agência no primeiro dia.</p>
        </article>
        <article class="qa-item">
          <h3>Funciona para arrendamento?</h3>
          <p>Sim. A parte de emails, anúncios e follow-up é a mesma.</p>
        </article>
        <article class="qa-item">
          <h3>Como recebo o e-book?</h3>
          <p>Pagas no Stripe e recebes o acesso por email. Recebes o PDF por email, normalmente em menos de 30 minutos.</p>
        </article>
        <article class="qa-item">
          <h3>É uma subscrição?</h3>
          <p>Não. É um pagamento único.</p>
        </article>
      </div>
    </section>

    <section class="band close" id="fecho">
      <div class="close-inner">
        <h2>{close_h}</h2>
        {close}
        <div class="cta-stack">
          <a class="cta" href="{stripe}" target="_blank" rel="noopener">Quero o sistema</a>
          <p class="pay-line">Pagamento único · Produto digital · Recebes o acesso por email</p>
          {pay_dark}
        </div>
        <p class="ps"><strong>P.S.</strong> {ps}</p>
      </div>
    </section>

    <footer class="legal-foot" aria-label="Informação legal">
      <a href="{legal}termos.html">Termos e Condições</a>
      <a href="{legal}privacidade.html">Política de Privacidade</a>
      <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener">Livro de Reclamações</a>
      <a href="#" data-ck-open>Preferências de cookies</a>
    </footer>
    <p class="legal-note">Autor: Pedro Ferreira · 4Improvements · pt-PT · produto digital</p>
    <div class="mobile-spacer" aria-hidden="true"></div>
  </main>
  <div class="mobile-cta">
    <p class="sticky-price"><b>€37</b><s class="line-through">€47</s></p>
    <a id="sticky-cta" href="{stripe}" target="_blank" rel="noopener">Quero o sistema</a>
  </div>
</div>
<div id="ck" class="ck" role="dialog" aria-live="polite" aria-label="Consentimento de cookies" hidden>
  <div class="ck-in">
    <p><b>Usamos cookies.</b> Os necessários fazem a página funcionar. Com a tua autorização, o Meta Pixel mede as campanhas. <a href="{legal}privacidade.html#cookies">Política de Privacidade</a></p>
    <div class="ck-btns"><button type="button" class="ck-b" data-ck="rejected">Rejeitar</button><button type="button" class="ck-b" data-ck="accepted">Aceitar</button></div>
  </div>
</div>
<script src="{asset}/mthd-pixel.js"></script>
<script src="{asset}/sia21-conv.js"></script>
<script>
(function () {{
  var META_PIXEL_ID = "1506988540335331";
  var KEY = "4i_cookie_consent_v1";
  function get() {{ try {{ return localStorage.getItem(KEY); }} catch (e) {{ return null; }} }}
  function put(v) {{ try {{ localStorage.setItem(KEY, v); }} catch (e) {{}} }}
  var box = document.getElementById("ck");
  function show() {{ box.hidden = false; }}
  function hide() {{ box.hidden = true; }}
  function startMTHD() {{
    if (typeof window.SIA21_trackingSuppressed === "function" && window.SIA21_trackingSuppressed()) return;
    if (typeof window.SIA21_startHumanGatedPixel !== "function") return;
    window.SIA21_startHumanGatedPixel({{
      pixelId: META_PIXEL_ID,
      instantPaths: ["/obrigado.html", "/obrigado", "/ghl-agencias/obrigado.html"]
    }});
  }}
  function clearMeta() {{
    ["_fbp", "_fbc"].forEach(function (n) {{
      var h = location.hostname.split("."), d;
      document.cookie = n + "=; Max-Age=0; path=/";
      for (var i = 0; i < h.length - 1; i++) {{
        d = "." + h.slice(i).join(".");
        document.cookie = n + "=; Max-Age=0; path=/; domain=" + d;
      }}
    }});
  }}
  function decide(v) {{
    put(v);
    hide();
    if (v === "accepted") startMTHD();
    else if (window.fbq && !(typeof window.SIA21_trackingSuppressed === "function" && window.SIA21_trackingSuppressed())) {{
      fbq("consent", "revoke");
      clearMeta();
    }}
  }}
  box.addEventListener("click", function (e) {{
    var b = e.target.closest("[data-ck]");
    if (b) decide(b.getAttribute("data-ck"));
  }});
  document.addEventListener("click", function (e) {{
    if (e.target.closest("[data-ck-open]")) {{
      e.preventDefault();
      show();
    }}
  }});
  var c = get();
  if (c === "accepted") startMTHD();
  else if (c !== "rejected") show();
}})();
</script>
</body>
</html>
""".format(
        title=e(page["title"]),
        description=e(page["description"]),
        asset=asset,
        legal=legal,
        posthog=POSTHOG,
        stripe=STRIPE,
        lead=e(page["lead"]),
        h1=e(page["h1"]),
        sub=e(page["sub"]),
        proof=e(PROOF),
        night=night,
        same=e(page["same"]),
        turn=turn,
        payoff=e(page["payoff"]),
        scenes_title=e(page["scenes_title"]),
        scenes_lead=e(SCENES_LEAD),
        scenes=scenes,
        note=e(page["note"]),
        tools=e(TOOLS),
        price=price,
        close_h=e(page["close_h"]),
        close=close,
        ps=e(page["ps"]),
        pay_dark=pay.format(dark="pay-note-on-dark", trust=TRUST, tools=TOOLS).replace("tool-note pay-note-on-dark", "tool-note tool-note-on-dark"),
        pay_light=pay.format(dark="", trust=TRUST, tools=TOOLS),
    )


def main():
    bad_dash = re.compile("[—–]")
    for page in PAGES:
        html_out = render(page)
        if bad_dash.search(html_out):
            raise SystemExit("dash in " + page["path"])
        if "58 páginas" in html_out or "€27" in html_out or "garantia" in html_out.lower() or "reembolso" in html_out.lower():
            raise SystemExit("forbidden copy in " + page["path"])
        if "55 páginas" not in html_out or PROOF not in html_out or 'next.format = "storytelling"' not in html_out:
            raise SystemExit("missing required copy in " + page["path"])
        dest = ROOT / page["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html_out)
        print("wrote", page["path"])


if __name__ == "__main__":
    main()
