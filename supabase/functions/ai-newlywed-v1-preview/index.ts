// Compatibility entrypoint for previously shared preview builds.
import { handleNewlywedAi } from '../ai-newlywed/handler.ts';

Deno.serve((req: Request) => handleNewlywedAi(req, Deno.env.get('GEMINI_API_KEY')));
