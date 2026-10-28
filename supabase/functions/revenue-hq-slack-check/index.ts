import {handleRequest} from './handler.mjs';
Deno.serve(req=>handleRequest(req,name=>Deno.env.get(name),fetch));
