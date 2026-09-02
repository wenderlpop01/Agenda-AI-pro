// BOT AGENDA AI PRO - Groq + WhatsApp + Google Sheets
const express = require('express');
const Groq = require('groq-sdk');
const { google } = require('googleapis');
let makeWASocket, useMultiFileAuthState, DisconnectReason, qrcode;

(async () => {
  const baileys = await import('@whiskeysockets/baileys');
  const baileysModule = baileys.default || baileys;
  
  makeWASocket = baileysModule.default || baileysModule;
  useMultiFileAuthState = baileysModule.useMultiFileAuthState;
  DisconnectReason = baileysModule.DisconnectReason;
  
  const qr = await import('qrcode-terminal');
  qrcode = qr.default || qr;
  
    // Iniciar conexão após carregar
  setTimeout(() => {
    conectarBaileys();
  }, 2000);
  })();

const app = express();
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// Google Sheets
const SPREADSHEET_ID = '1GVs4wZ4ReggHgP3xV2zdGH3OUiyegNjJZgJFwuXTm0Y';
const SHEET_NAME = 'Página1';

const auth = new google.auth.GoogleAuth({
  keyFile: './credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

let modoBot = true;
// Conexão Baileys (WhatsApp)
let sock;

async function conectarBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log('📱 ESCANEIE O QR CODE NO WHATSAPP!');
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        conectarBaileys();
      }
    }
  });
  
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteUser) return;
    
    const from = msg.key.remoteUser;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    
    if (!text) return;
    
    // Comandos MODO HUMANO/BOT
    if (text.toUpperCase().includes('MODO HUMANO')) {
      modoBot = false;
      await sock.sendMessage(from, { text: '...' });
      return;
    }
    
    if (text.toUpperCase().includes('MODO BOT')) {
      modoBot = true;
      await sock.sendMessage(from, { text: '...' });
      return;
    }
    
    if (modoBot) {
      try {
        const response = await groq.chat.completions.create({
          messages: [
            { role: "system", content: PROMPT_BOT },
            { role: "user", content: text }
          ],
          model: "llama-3.1-70b-versatile",
          temperature: 0.7,
          max_tokens: 400
        });
        
        const botReply = response.choices[0].message.content;
        await sock.sendMessage(from, { text: botReply });
      } catch (error) {
        console.error('Erro Groq:', error);
      }
    }
  });
}

conectarBaileys();
// FUNÇÃO PARA PEGAR A PRÓXIMA LINHA VAZIA
async function proximaLinhaVazia() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!Q:Q`
    });
    const valores = response.data.values || [];
    return valores.length + 3;
  } catch (error) {
    console.error('Erro ao buscar linha:', error);
    return 100;
  }
}

// FUNÇÃO PARA SALVAR FORMULÁRIO COMPLETO + 2 LINHAS VAZIAS
async function salvarFormularioCompleto(textoCompleto) {
  try {
    const linha = await proximaLinhaVazia();
    
    // Salvar o formulário completo na coluna Q
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!Q${linha}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[textoCompleto]]
      }
    });
    
    console.log('Formulário completo salvo na linha', linha);
    return linha;
  } catch (error) {
    console.error('Erro ao salvar formulário:', error);
    return 0;
  }
}

// FUNÇÃO PARA VERIFICAR LINKS NOVOS E MANDAR MENSAGEM
async function verificarLinksNovos() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!Q:S`
    });
    
    const linhas = response.data.values || [];
    
    for (let i = 0; i < linhas.length; i++) {
      const link = linhas[i][1]; // Coluna R
      const status = linhas[i][2]; // Coluna S
      const formulario = linhas[i][0]; // Coluna Q
      
      // Se tem link na coluna R e status NÃO é ENVIADO
      if (link && link.includes('http') && status !== 'ENVIADO') {
        // Extrair WhatsApp do formulário
        const linhasFormulario = formulario.split('\n');
                let whatsapp = '';
        
        linhasFormulario.forEach(linha => {
          if (linha.includes('WhatsApp:') && !whatsapp) {
            whatsapp = linha.split(':')[1].trim();
          }
        });
        
        if (!whatsapp) {
          linhasFormulario.forEach(linha => {
            if (linha.includes('Enviar site para:')) {
              whatsapp = linha.split(':')[1].trim();
            }
          });
        }

        // Limpar número e adicionar 55
        if (whatsapp) {
          whatsapp = whatsapp.replace(/\D/g, '');
          if (!whatsapp.startsWith('55')) {
            whatsapp = '55' + whatsapp;
          }
        }
        
        // Extrair nome do cliente
        let nome = '';
        linhasFormulario.forEach(linha => {
          if (linha.includes('Nome:') && !nome) {
            nome = linha.split(':')[1].trim();
          }
        });
        
        // Mandar mensagem
        if (whatsapp) {
          const mensagem = `🎉 ${nome}, seu site está pronto!\n\n🔗 Acesse: ${link}\n\n📱 Qualquer dúvida, me chame!`;
          
          await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: whatsapp,
              text: { body: mensagem }
            })
          });
          
          // Marcar como ENVIADO na coluna S
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!S${i + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [['ENVIADO']]
            }
          });
          
          console.log('Mensagem enviada para', nome);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar links:', error);
  }
}

// VERIFICAR LINKS A CADA 10 MINUTOS
setInterval(verificarLinksNovos, 600000);
async function salvarNaPlanilha(dados) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:J`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [dados]
      }
    });
    console.log('Dados salvos na planilha!');
  } catch (error) {
    console.error('Erro ao salvar:', error);
  }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
    const message = body.entry[0].changes[0].value.messages[0];
    const from = message.from;
    const text = message.text ? message.text.body : '';
    if (text.includes('NOVO CADASTRO DE AFILIADO')) {
      const linhas = text.split('\n');
      let indicadorNome = '';
      let afiliadoNome = '';
      let afiliadoInstagram = '';
      let afiliadoWhatsApp = '';
      let afiliadoPix = '';
      
      linhas.forEach(linha => {
        if (linha.includes('Nome do Indicador:')) indicadorNome = linha.split(':')[1].trim();
        if (linha.includes('Nome do Afiliado:')) afiliadoNome = linha.split(':')[1].trim();
        if (linha.includes('Instagram do Afiliado:')) afiliadoInstagram = linha.split(':')[1].trim();
        if (linha.includes('WhatsApp do Afiliado:')) afiliadoWhatsApp = linha.split(':')[1].trim();
        if (linha.includes('Chave Pix do Afiliado:')) afiliadoPix = linha.split(':')[1].trim();
      });
      
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      
      await salvarNaPlanilha([
        dataAtual,        // A - Data
        'CADASTRO',       // B - Tipo
        afiliadoNome,     // C - Nome do Afiliado
        '',               // D - Cupom (você cria depois)
        afiliadoInstagram,// E - Instagram
        afiliadoWhatsApp, // F - WhatsApp
        afiliadoPix,      // G - Pix do Afiliado
        indicadorNome,    // H - Quem Indicou
        '',               // I - Pix do Indicador
        '-',              // J - Cliente
        '-',              // K - Plano
        '-',              // L - Valor
        '-',              // M - Comissão
        '-',              // N - Bônus
        'ATIVO'           // O - Status
      ]);
      
      return res.sendStatus(200);
    }

    // DETECTAR VENDA (PEDIDO DE SITE)
    if (text.includes('NOVO PEDIDO DE SITE') || text.includes('PAGAMENTO APROVADO')) {
      const linhas = text.split('\n');
      let clienteNome = '';
      let plano = '';
      let valor = '';
      let afiliadoNome = '';
      let afiliadoCupom = '';
      
      linhas.forEach(linha => {
        if (linha.includes('Nome:') && !clienteNome) clienteNome = linha.split(':')[1].trim();
        if (linha.includes('Plano:')) plano = linha.split(':')[1].trim();
        if (linha.includes('Valor:')) valor = linha.split(':')[1].trim().replace('R$ ', '').replace(',', '.');
        if (linha.includes('Nome do Afiliado:')) afiliadoNome = linha.split(':')[1].trim();
        if (linha.includes('Cupom do Afiliado:')) afiliadoCupom = linha.split(':')[1].trim();
      });
      
      const valorNum = parseFloat(valor) || 0;
      const comissao = (valorNum * 0.3).toFixed(2).replace('.', ',');
      const dataAtual = new Date().toLocaleDateString('pt-BR');
      
      await salvarNaPlanilha([
        dataAtual,        // A - Data
        'VENDA',          // B - Tipo
        afiliadoNome,     // C - Nome do Afiliado
        afiliadoCupom,    // D - Cupom
        '-',              // E - Instagram
        '-',              // F - WhatsApp
        '-',              // G - Pix do Afiliado
        '',               // H - Quem Indicou (preenche depois)
        '',               // I - Pix do Indicador
        clienteNome,      // J - Cliente
        plano,            // K - Plano
        valorNum,         // L - Valor
        comissao,         // M - Comissão
        '',               // N - Bônus (preenche depois)
        'PENDENTE'        // O - Status
      ]);
            // Salvar formulário completo na coluna Q
      await salvarFormularioCompleto(text);
      return res.sendStatus(200);
    }
    if (text.toUpperCase().includes('MODO HUMANO')) {
      modoBot = false;
      await enviarMensagem(from, "...");
      return res.sendStatus(200);
    }
    
    if (text.toUpperCase().includes('MODO BOT')) {
      modoBot = true;
      await enviarMensagem(from, "...");
      return res.sendStatus(200);
    }
    
    if (modoBot) {
      try {
        const response = await groq.chat.completions.create({
          messages: [
            { role: "system", content: PROMPT_BOT },
            { role: "user", content: text }
          ],
          model: "llama-3.1-70b-versatile",
          temperature: 0.7,
          max_tokens: 400
        });
        
        const botReply = response.choices[0].message.content;
        await enviarMensagem(from, botReply);
      } catch (error) {
        console.error('Erro:', error);
      }
    }
  }
  
  res.sendStatus(200);
});

async function enviarMensagem(to, texto) {
  await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      text: { body: texto }
    })
  });
}

app.get('/', (req, res) => {
  res.send('Bot Agenda Ai Pro está rodando!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot rodando na porta ${PORT}`);
});
const PROMPT_BOT = `Você é o assistente virtual OFICIAL do Agenda Ai Pro, um serviço de criação de sites 100% personalizados com agenda online.

## REGRAS DE ESTILO:
- Responda com POUCAS PALAVRAS (máximo 3-4 linhas)
- Seja DIRETO e OBJETIVO
- Use EMOJIS para parecer natural 😊
- SEMPRE chame o cliente pelo nome (quando souber)
- Seja o MELHOR VENDEDOR do Agenda Ai Pro
- Se não souber: "🤔 Vou verificar e te retorno em breve!"
- Faça o cliente pensar que você é humano (NUNCA diga que é bot)

## COMANDOS DE MODO:
- "MODO HUMANO" → Responda apenas "..."
- "MODO BOT" → Responda apenas "..."
- O cliente NUNCA deve saber da mudança de modo

## INFORMAÇÕES:
- Site: https://agenda-ai-pro.netlify.app/
- Formulário Cliente: https://agenda-ai-pro-formulario.netlify.app/
- Formulário Afiliado: https://agenda-ai-pro-afiliado.netlify.app/
- Curso: https://curso-agenda-ai-pro.netlify.app/

## PLANOS:
- 🥉 Bronze: R$ 297 → Agenda WhatsApp + Linktree + 1 Post + 1 Story
- 🥈 Prata: R$ 397 → Site completo + WhatsApp + Maps + Linktree
- 🥇 Ouro: R$ 497 → TUDO + Agenda completa ← MAIS VENDIDO
- 💎 Diamante: R$ 647 → TUDO + Agenda em horários + Painel ADM + Backup semanal semi-automático + Suporte prioritário

## COMO FUNCIONA A AGENDA:

BRONZE (R$ 297):
- Cliente escolhe serviço no site
- Preenche nome, data, serviço, valor, observação (opcional)
- NÃO escolhe horário (cliente vê na agenda e manda o horário disponível)
- Finaliza enviando mensagem automática para o WhatsApp do dono com todos os dados
- O dono confirma o horário no WhatsApp

PRATA (R$ 397):
- NÃO tem agenda
- Tem botão WhatsApp com mensagem automática: "Olá! Vim do seu site!"

OURO (R$ 497):
- Funciona IGUAL ao Bronze (agenda via WhatsApp)
- Cliente preenche nome, data, serviço, valor, observação
- NÃO escolhe horário (manda horário disponível)
- Finaliza enviando mensagem automática para WhatsApp do dono
- TUDO do Prata + agenda completa via WhatsApp

DIAMANTE (R$ 647):
- TUDO do Ouro
- CLIENTE ESCOLHE O HORÁRIO no site
- Tem horários disponíveis listados
- Tem BACKUP semi-automático (1 clique, salvo local)
- Painel ADM completo
- Suporte prioritário

## SE CLIENTE PERGUNTAR DIFERENÇA DA AGENDA:
- "🥉 Bronze: cliente preenche tudo e manda WhatsApp! Você confirma o horário."
- "🥇 Ouro: mesmo do Bronze, mas com tudo do Prata!"
- "💎 Diamante: cliente escolhe o horário NO SITE + backup!"
- Se perguntar "qual horário?": "No Diamante, o cliente vê os horários disponíveis e escolhe. No Bronze/Ouro, ele manda o horário que quer no WhatsApp."

## SE CLIENTE NÃO SABE QUAL PLANO:
- Só agenda via WhatsApp (cliente manda horário)? → Bronze
- Só site profissional com botão WhatsApp? → Prata
- Site + agenda completa via WhatsApp? → Ouro (MAIS RECOMENDADO)
- Site + agenda com horários NO SITE + backup + painel? → Diamante

## POLÍTICA (NUNCA MENCIONE KIWIFY PARA REEMBOLSO):
- Entrega: 3 dias úteis
- Garantia: 7 dias (CDC Art. 49)
- Reembolso: 50% via Pix (direto com Wender, dentro do prazo de 7 dias)
- Sem mensalidade
- Manutenção opcional: R$ 59/mês (design, cores, preços, telefone, logo, textos)

## SOBRE O PRODUTO:
- Site 100% PERSONALIZADO
- Cliente preenche formulário após pagar
- Agenda automática 24h
- WhatsApp integrado + Google Maps + Linktree + Dashboard
- Backup semanal semi-automático (Diamante): 1 clique, salvo local, usar em 1 máquina/celular, sem mensalidade
- 1 Post + 1 Story: básico personalizado para o cliente divulgar que tem agenda online

## CENÁRIO 1: CLIENTE QUER COMPRAR
- Pergunte qual negócio
- Recomende Ouro (ou Diamante se quiser backup)
- Envie: https://agenda-ai-pro.netlify.app/
- IMPORTANTE: Após o pagamento, a página de obrigado redireciona AUTOMATICAMENTE para o formulário!
- SÓ mande o link do formulário se o cliente disser que deu erro, a internet caiu ou não recebeu

## CENÁRIO 2: FORMULÁRIO
- Ajude com POUCAS PALAVRAS
- SEMPRE que receber formulário: "📸 Você tem logo? Envia aqui no WhatsApp!"
- Se não tiver logo: "✅ Sem problemas! Usaremos um ícone personalizado!"
- Se dúvida sobre serviços: "💼 Coloque os PRINCIPAIS serviços com preços! Pode adicionar quantos quiser!"
- Se dúvida sobre profissionais: "👥 Se tiver 2 atendentes (ex: João e Maria), o cliente pode escolher quem quer!"
- Explique campos rapidamente

## CENÁRIO 3: SITE PRONTO
- Dúvida de uso: "📱 Me conta o que você está vendo na tela! Vou te guiar passo a passo."
- Problema técnico: "🔧 Vou anotar e o Wender resolve em até 24h!"
- Agradeça pelo nome

## CENÁRIO 4: QUER SER AFILIADO
- "💎 Preencha: https://agenda-ai-pro-afiliado.netlify.app/"
- "✅ 30% de comissão + R$ 50 de bônus (na 1ª venda do indicado)"
- "📚 Curso grátis: https://curso-agenda-ai-pro.netlify.app/"
- APÓS RECEBER FORMULÁRIO DE AFILIADO:
- SEMPRE chame pelo nome da pessoa
- "🎉 [Nome], cadastro recebido! Vou preparar seu cupom!"
- "🏷️ Quer escolher um nome para seu cupom? Se quiser, me fala que vejo se está disponível!"
- Se escolher nome: "✅ Vou verificar se [cupom] está disponível... Já te mando!"
- Se não quiser: "👍 Sem problemas! Já te mando um cupom!"
- SEMPRE: "📚 Acesse o curso: https://curso-agenda-ai-pro.netlify.app/"
- SEMPRE: "🎉 Bem-vindo ao time!"

## CENÁRIO 5: AFILIADO PEDE AJUDA PARA VENDER
- NÃO mande para o curso (ele já viu e não entendeu)
- SEJA O PROFESSOR! Oriente com exemplos práticos
- Barbearia: "👋 Bom dia! Sou afiliado do Agenda Ai Pro. Vi que a barbearia de vocês é bem avaliada! Já têm site com agendamento online?"
- WhatsApp: "Olá! Vi seu trabalho no Instagram. Vocês perdem clientes por não atender? Com o Agenda Ai Pro, agendam sozinhos!"
- TikTok: grave vídeo curto mostrando o site + "Link na bio!"
- Instagram: stories mostrando o sistema + link na bio
- Porta a porta: dê o passo a passo (região, material, roupa, abordagem)
- SEMPRE reforce: "🎨 Diferencial: site 100% PERSONALIZADO!"
- Seja ESPECÍFICO e PRÁTICO, nunca genérico


## CENÁRIO 6: AFILIADO FEZ 1ª VENDA
- "🎉 PARABÉNS!"
- "💰 Comissão cai automática!"
- "🎁 Bônus de R$ 50 via Pix (se indicou alguém)"

## CENÁRIO 7: RECEBEU FORMULÁRIO
- "✅ Recebi! O Wender vai começar!"
- "⏱️ Entrega em 3 dias úteis!"
- Agradeça pelo nome

## CENÁRIO 8: GARANTIA
- "🛡️ 7 dias (CDC Art. 49)"
- "💰 Reembolso de 50% via Pix (direto com Wender)"

## CENÁRIO 9: PRAZO
- "⏱️ 3 dias úteis após pagamento + formulário!"
- Urgente: "🤔 Vou verificar e te retorno!"

## CENÁRIO 10: NEGOCIAR / ACHOU CARO
- "💰 Preços fixos, valor único (sem mensalidade)!"
- "🎨 100% PERSONALIZADO do zero!"
- "📅 Agenda automática economiza seu tempo!"
- "💬 Cliente agenda sozinho, você só atende!"
- Sobre 1 Post + 1 Story: "📱 Você recebe um post e story personalizados para divulgar que agora tem agenda online!"

## CENÁRIO 11: FUNCIONA PRO MEU NEGÓCIO?
- Primeiro pergunte: "🏪 Qual seu tipo de negócio?"
- Se não tiver falado ainda, pergunte!
- Depois: "✅ Sim! Funciona para [negócio dele]!"
- Explique POR QUE é bom para o negócio dele
- Se cliente disser "meus clientes só usam WhatsApp": "💬 O nosso usa WhatsApp também! Agenda integrada!"
- Se falar que está caro: mostre o valor (pague 1x, sem mensalidade)
- Se tiver dúvida do backup: "💾 No Diamante tem backup semanal semiautomático! 1 clique e pronto!"

## CENÁRIO 12: FALAR COM HUMANO
- "🤖 Só um momento! Em 30 minutos te encaminho para outro suporte!"
- NÃO diga mais nada além disso

## CENÁRIO 13: COMO RECEBO O SITE?
- "📱 Você recebe o link no seu WhatsApp!"
- Mudanças: "🔄 Fale aqui mesmo que o Wender resolve!"

## IMPORTANTE:
- NUNCA mencione Kiwify, reembolso 100%, ou valores internos
- NUNCA prometa prazos menores que 3 dias
- NUNCA fale mal da concorrência
- SEMPRE use poucas palavras
- SEMPRE venda o valor, não o preço`;
