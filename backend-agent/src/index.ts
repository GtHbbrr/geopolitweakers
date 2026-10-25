export interface Env {
  DB: D1Database;
  AI: Ai;
}

export default {
  // Deze functie draait automatisch elk uur via de Cron Trigger uit wrangler.toml
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleAgentExecution(env));
  },

  // Dit zorgt ervoor dat je de agent ook handmatig kunt testen via je browser
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    await handleAgentExecution(env);
    return new Response("AI-agent succesvol gedraaid! Data is verwerkt en opgeslagen in D1.");
  }
};

async function handleAgentExecution(env: Env) {
  // 1. Target de materiële bron (Voorbeeld: RSS feed van The New Atlas / Brian Berletic)
  const sourceUrl = "https://landdestroyer.blogspot.com/";
  
  try {
    const response = await fetch(sourceUrl);
    const xmlText = await response.text();

    // Een superlichte parser om de nieuwste artikeldata te extraheren
    const titleMatch = xmlText.match(/<title type='text'>(.*?)<\/title>/);
    const contentMatch = xmlText.match(/<content type='html'>(.*?)<\/content>/);
    
    if (!titleMatch || !contentMatch) return;

    const rawTitle = titleMatch[1];
    const rawContent = contentMatch[1].replace(/<[^>]*>/g, '').substring(0, 4000); // Strip HTML en pak de kern

    // 2. Formuleer de loepzuivere anti-hegemoniale prompt voor Llama-3
    const systemPrompt = `Je bent de hoofdredacteur van Geopolitweakers.nl, een platform dat geopolitiek puur benadert als logistiek, industriële productiecapaciteit en monetaire systemen. 
Vertaal en herstructureer de aangeleverde informatie naar een strak, objectief Nederlands nieuwsartikel in de stijl van een kwaliteitskrant (mix van DPG en The Guardian).
STRICTE REGELS:
- Focus ALLES op materiële data: munitie-aantallen, logistieke knelpunten, grondstoffen en handelsstromen.
- Verwijder morele oordelen, emotionele retoriek en Amerikaanse partijpolitieke praatjes.
- Genereer een korte samenvatting (summary).
- Genereer een specifieke 'spec-box' met harde cijfers en technische specificaties (wetsin, capaciteit, bereik).
- Lever het resultaat aan in een puur JSON-formaat met de velden: title, summary, content, spec_box, category. Noem de categorie 'Industriële Capaciteit', 'Logistieke Ketens' of 'Monetaire Systemen'.`;

    // 3. Roep de gratis Cloudflare Llama-3 AI aan
    const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Titel: ${rawTitle}\n\nInhoud: ${rawContent}` }
      ],
      response_format: { type: "json_object" }
    });

    // @ts-ignore
    const result = JSON.parse(aiResponse.response);

    // 4. Sla de geanalyseerde materiële realiteit direct op in je Cloudflare D1 SQL database
    const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await env.DB.prepare(`
      INSERT INTO articles (title, slug, category, summary, content, spec_box, source_name, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO NOTHING
    `).bind(
      result.title,
      slug,
      result.category,
      result.summary,
      result.content,
      result.spec_box,
      "The New Atlas",
      sourceUrl
    ).run();

    // 5. Update direct de Live Ticker bovenin de balk met een hard cijfer
    const tickerMessage = `++ CAPACITEIT UPDATE: ${result.title.substring(0, 50)}... ++`;
    await env.DB.prepare(`INSERT INTO ticker_updates (message) VALUES (?)`).bind(tickerMessage).run();

  } catch (error) {
    console.error("Agent foutsituatie:", error);
  }
}
