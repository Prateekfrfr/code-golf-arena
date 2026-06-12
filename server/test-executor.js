import {runCode} from './executor.js';


const test = async () => {
  const result = await runCode('print("Hello, World!")');
  console.log(result);
};

test();