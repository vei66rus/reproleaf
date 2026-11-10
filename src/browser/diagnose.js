import catalog from '../../cases/catalog.json' with {type:'json'};
import {diagnoseProjectWithCatalog} from '../diagnose-core.mjs';
export const diagnoseProject=input=>diagnoseProjectWithCatalog(input,catalog);

export {russianCases} from '../public-case-copy.mjs';
