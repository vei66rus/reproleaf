import {writeFile} from 'node:fs/promises';
import {runBatchAudit,formatBatchCsv} from '../../src/batch-audit.mjs';
import {toSarifReport} from '../../src/sarif-export.mjs';

const dir=process.env.INPUT_DIR||'dist';
const format=(process.env.INPUT_FORMAT||'sarif').toLowerCase();
const output=process.env.INPUT_OUTPUT||'reproleaf-results.sarif';

const report=await runBatchAudit({dir});
let payload;
if(format==='csv')payload=formatBatchCsv(report);
else if(format==='sarif')payload=JSON.stringify(toSarifReport(report),null,2);
else payload=JSON.stringify(report,null,2);

await writeFile(output,payload,'utf8');
if(!report.ok)process.exitCode=1;
