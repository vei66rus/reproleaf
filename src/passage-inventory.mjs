import {z} from 'zod';

const integer=z.number().int().nonnegative().max(4194304);
const wellFormed=value=>{for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=value.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;};
const literal=z.string().max(800).refine(wellFormed,'Well-formed Unicode required').refine(v=>[...v].length<=400,'At most 400 codepoints');
export const passageInventorySchema=z.object({
 schemaVersion:z.literal(1),method:z.literal('filtered-dom-paragraphs-v1'),offsetUnit:z.literal('unicode-code-points'),offsetBase:z.literal(0),endExclusive:z.literal(true),ordinalBase:z.literal(1),offsetReference:z.literal('filtered-body-dom-text-content'),
 documentCharacters:integer,documentTextSha256:z.string().regex(/^[a-f0-9]{64}$/i),contentLandmarkDetected:z.boolean(),eligibleParagraphs:integer,
 passages:z.array(z.object({ordinal:integer.min(1),start:integer,end:integer,text:literal,originalCharacters:integer,truncated:z.boolean()}).strict()).max(24),
 limits:z.object({passages:z.literal(24),charactersPerPassage:z.literal(400),textCharacters:z.literal(9600),serializedBytes:integer.max(70000)}).strict(),
 coverage:z.object({scope:z.literal('eligible-content-paragraphs-only'),eligibleCharacters:integer,paragraphsCaptured:integer,paragraphsOmitted:integer,charactersCaptured:integer,charactersOmitted:integer,complete:z.boolean(),truncated:z.boolean(),reasons:z.array(z.string().max(300)).max(24)}).strict(),
 visibilityScope:z.string().max(1000),collectionScope:z.string().max(1000)
}).strict().superRefine((value,context)=>{
 const fail=message=>context.addIssue({code:'custom',message});
 let characters=0,lastEnd=0,lastOrdinal=0;
 for(const p of value.passages){const length=[...p.text].length;characters+=length;if(p.end-p.start!==length||p.end>value.documentCharacters||p.start<lastEnd||p.ordinal<=lastOrdinal||p.ordinal>value.eligibleParagraphs||p.originalCharacters<length||p.truncated!==(p.originalCharacters>length))fail('Inconsistent passage coordinates or truncation');lastEnd=p.end;lastOrdinal=p.ordinal;}
 const c=value.coverage;
 if(c.paragraphsCaptured!==value.passages.length||c.charactersCaptured!==characters||c.paragraphsCaptured+c.paragraphsOmitted!==value.eligibleParagraphs||c.charactersCaptured+c.charactersOmitted!==c.eligibleCharacters||c.eligibleCharacters>value.documentCharacters||c.complete!==(value.contentLandmarkDetected&&c.eligibleCharacters>0&&c.paragraphsOmitted===0&&c.charactersOmitted===0)||c.truncated!==(c.paragraphsOmitted>0||c.charactersOmitted>0))fail('Inconsistent passage coverage');
 if(new TextEncoder().encode(JSON.stringify(value)).length>value.limits.serializedBytes)fail('Passage inventory exceeds serialized byte limit');
});

