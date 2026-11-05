import {handleRequest} from './handler.mjs';
import {createDependencies} from './adapters.mjs';
Deno.serve((req:Request)=>handleRequest(req,createDependencies((name:string)=>Deno.env.get(name))));
