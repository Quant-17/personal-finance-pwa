// Retirement tombstone for deployed clients. No credentials, OAuth, or mailbox access.
Deno.serve(() => new Response(JSON.stringify({error:"Email integration has been removed. Use statement upload in Folio."}), {status:410,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}));
