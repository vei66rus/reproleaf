import {readRecommendationEvidence} from './recommendation-evidence.mjs';
export {readRecommendationEvidence} from './recommendation-evidence.mjs';
export function recommendationEvidenceText(candidate,language='en'){
 const evidence=readRecommendationEvidence(candidate),ru=language==='ru';
 if(evidence.status==='literal-span')return ru?'Строка анкора найдена в переданном фрагменте. Проверьте её границы и уместность ссылки.':'Anchor text occurs in the supplied excerpt. Review its boundaries and the link relevance.';
 if(evidence.status==='text-edit-required')return ru?'Такой строки нет в переданном фрагменте: этот вариант требует правки текста. Остальная страница не проверялась.':'Anchor text is absent from the supplied excerpt: this proposal requires a text edit there. The rest of the page was not checked.';
 return ru?'Положение анкора не подтверждено. Проверьте исходный фрагмент и смысл ссылки.':'Anchor location is unconfirmed. Review the source excerpt and link meaning.';
}
