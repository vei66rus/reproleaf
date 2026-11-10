import {catalog} from './catalog.mjs';
import {diagnoseProjectWithCatalog,diagnoseFromPackageJsonWithCatalog} from './diagnose-core.mjs';
export {diagnoseSchema} from './diagnose-core.mjs';
export const diagnoseProject=(input={})=>diagnoseProjectWithCatalog(input,catalog);
export const diagnoseFromPackageJson=(content,options={})=>diagnoseFromPackageJsonWithCatalog(content,options,catalog);
