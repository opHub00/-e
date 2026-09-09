import { handleNewlywedAi } from './handler.ts';

Deno.serve((req: Request) => handleNewlywedAi(req, Deno.env.get('GEMINI_API_KEY')));
