#!/usr/bin/env node
import {main} from '../cli/main.mjs';
main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});
